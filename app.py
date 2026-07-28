import os
import json
import uuid
import threading
from functools import wraps
from datetime import datetime

from flask import Flask, request, redirect, url_for, session, jsonify, render_template, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
ACCOUNTS_FILE = os.path.join(DATA_DIR, "accounts.json")
MESSAGES_FILE = os.path.join(DATA_DIR, "messages.json")
SECRET_KEY_FILE = os.path.join(DATA_DIR, "secret_key.txt")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)


def get_or_create_secret_key():
    if os.path.exists(SECRET_KEY_FILE):
        with open(SECRET_KEY_FILE, "r", encoding="utf-8") as f:
            key = f.read().strip()
            if key:
                return key
    key = uuid.uuid4().hex + uuid.uuid4().hex
    with open(SECRET_KEY_FILE, "w", encoding="utf-8") as f:
        f.write(key)
    return key


app = Flask(__name__)
# Clé fixe (stockée dans data/secret_key.txt) : une clé qui change à chaque
# redémarrage invaliderait toutes les sessions de connexion en cours.
app.secret_key = get_or_create_secret_key()
app.config["MAX_CONTENT_LENGTH"] = None  # pas de limite de taille d'upload

lock = threading.Lock()


# ---------- Utilitaires JSON ----------

def load_json(path):
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return {}


def save_json(path, data):
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, path)  # renommage atomique, pas de fichier à moitié écrit


def conv_key(u1, u2):
    return "__".join(sorted([u1, u2]))


def current_user():
    return session.get("username")


# Seuil au-delà duquel on considère quelqu'un hors ligne s'il n'a pas donné
# signe de vie (le front-end fait un heartbeat via /api/friends toutes les 2s)
OFFLINE_THRESHOLD_SECONDS = 8
VALID_STATUSES = ("online", "afk", "dnd", "offline")


def compute_effective_status(user_data):
    status = user_data.get("status", "online")
    if status == "offline":
        return "offline"
    last_seen_str = user_data.get("last_seen")
    if not last_seen_str:
        return "offline"
    try:
        last_seen = datetime.fromisoformat(last_seen_str)
    except ValueError:
        return "offline"
    delta = (datetime.utcnow() - last_seen).total_seconds()
    if delta > OFFLINE_THRESHOLD_SECONDS:
        return "offline"
    return status if status in VALID_STATUSES else "online"


def login_required(view):
    @wraps(view)
    def wrapped(*a, **kw):
        if not current_user():
            return redirect(url_for("login"))
        return view(*a, **kw)
    return wrapped


def admin_required(view):
    @wraps(view)
    def wrapped(*a, **kw):
        accounts = load_json(ACCOUNTS_FILE)
        me = accounts.get(current_user() or "", {})
        if not me.get("is_admin"):
            if request.path.startswith("/api/"):
                return jsonify({"error": "Accès réservé aux administrateurs."}), 403
            return "Accès refusé : réservé aux administrateurs.", 403
        return view(*a, **kw)
    return wrapped


# ---------- Pages ----------

@app.route("/")
def index():
    if current_user():
        return redirect(url_for("chat"))
    return redirect(url_for("login"))


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        if not username or not password:
            return render_template("register.html", error="Remplis tous les champs.")
        with lock:
            accounts = load_json(ACCOUNTS_FILE)
            if username in accounts:
                return render_template("register.html", error="Ce pseudo est déjà pris.")
            is_first_account = len(accounts) == 0
            accounts[username] = {
                "password_hash": generate_password_hash(password),
                "friends": [],
                "friend_requests": [],
                "open_dms": [],
                "status": "online",
                "last_seen": datetime.utcnow().isoformat(),
                "created_at": datetime.utcnow().isoformat(),
                "is_admin": is_first_account,
            }
            save_json(ACCOUNTS_FILE, accounts)
        session["username"] = username
        return redirect(url_for("chat"))
    return render_template("register.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        accounts = load_json(ACCOUNTS_FILE)
        user = accounts.get(username)
        if not user or not check_password_hash(user["password_hash"], password):
            return render_template("login.html", error="Identifiants incorrects.")
        session["username"] = username
        with lock:
            accounts[username]["status"] = "online"
            accounts[username]["last_seen"] = datetime.utcnow().isoformat()
            save_json(ACCOUNTS_FILE, accounts)
        return redirect(url_for("chat"))
    return render_template("login.html")


@app.route("/logout")
def logout():
    me = current_user()
    if me:
        with lock:
            accounts = load_json(ACCOUNTS_FILE)
            if me in accounts:
                accounts[me]["status"] = "offline"
                save_json(ACCOUNTS_FILE, accounts)
    session.clear()
    return redirect(url_for("login"))


@app.route("/chat")
@login_required
def chat():
    return render_template("chat.html", username=current_user())


# ---------- API amis ----------

@app.route("/api/me")
@login_required
def api_me():
    accounts = load_json(ACCOUNTS_FILE)
    me = accounts.get(current_user(), {})
    return jsonify({"username": current_user(), "is_admin": me.get("is_admin", False)})


@app.route("/api/friends")
@login_required
def api_friends():
    me_name = current_user()
    with lock:
        accounts = load_json(ACCOUNTS_FILE)
        if me_name in accounts:
            # chaque appel sert de heartbeat de présence
            accounts[me_name]["last_seen"] = datetime.utcnow().isoformat()
            accounts[me_name].setdefault("status", "online")
            save_json(ACCOUNTS_FILE, accounts)

    me = accounts.get(me_name, {})
    friends = []
    for f in me.get("friends", []):
        fdata = accounts.get(f, {})
        friends.append({
            "username": f,
            "status": compute_effective_status(fdata),
        })
    # ne garder dans les DM ouverts que des gens toujours amis
    open_dms = [u for u in me.get("open_dms", []) if u in me.get("friends", [])]
    return jsonify({
        "friends": friends,
        "requests_received": me.get("friend_requests", []),
        "my_status": me.get("status", "online"),
        "open_dms": open_dms,
    })


@app.route("/api/open_dm", methods=["POST"])
@login_required
def api_open_dm():
    friend = (request.json or {}).get("username", "").strip()
    me = current_user()
    with lock:
        accounts = load_json(ACCOUNTS_FILE)
        if friend not in accounts.get(me, {}).get("friends", []):
            return jsonify({"error": "Vous n'êtes pas amis."}), 403
        open_dms = accounts[me].setdefault("open_dms", [])
        if friend in open_dms:
            open_dms.remove(friend)
        open_dms.insert(0, friend)  # le plus récent en premier
        save_json(ACCOUNTS_FILE, accounts)
    return jsonify({"ok": True})


@app.route("/api/set_status", methods=["POST"])
@login_required
def api_set_status():
    status = (request.json or {}).get("status", "")
    if status not in VALID_STATUSES:
        return jsonify({"error": "Statut invalide."}), 400
    me = current_user()
    with lock:
        accounts = load_json(ACCOUNTS_FILE)
        accounts[me]["status"] = status
        accounts[me]["last_seen"] = datetime.utcnow().isoformat()
        save_json(ACCOUNTS_FILE, accounts)
    return jsonify({"ok": True, "status": status})


@app.route("/api/friend_request", methods=["POST"])
@login_required
def api_friend_request():
    target = (request.json or {}).get("username", "").strip()
    me = current_user()
    if target == me:
        return jsonify({"error": "Impossible de s'ajouter soi-même."}), 400
    with lock:
        accounts = load_json(ACCOUNTS_FILE)
        if target not in accounts:
            return jsonify({"error": "Utilisateur introuvable."}), 404
        if target in accounts[me].get("friends", []):
            return jsonify({"error": "Vous êtes déjà amis."}), 400
        if me in accounts[target].get("friend_requests", []):
            return jsonify({"error": "Demande déjà envoyée."}), 400
        accounts[target].setdefault("friend_requests", []).append(me)
        save_json(ACCOUNTS_FILE, accounts)
    return jsonify({"ok": True})


@app.route("/api/friend_accept", methods=["POST"])
@login_required
def api_friend_accept():
    target = (request.json or {}).get("username", "").strip()
    me = current_user()
    with lock:
        accounts = load_json(ACCOUNTS_FILE)
        reqs = accounts.get(me, {}).get("friend_requests", [])
        if target not in reqs:
            return jsonify({"error": "Aucune demande de cet utilisateur."}), 400
        reqs.remove(target)
        accounts[me].setdefault("friends", [])
        accounts[target].setdefault("friends", [])
        if target not in accounts[me]["friends"]:
            accounts[me]["friends"].append(target)
        if me not in accounts[target]["friends"]:
            accounts[target]["friends"].append(me)
        save_json(ACCOUNTS_FILE, accounts)
    return jsonify({"ok": True})


@app.route("/api/friend_decline", methods=["POST"])
@login_required
def api_friend_decline():
    target = (request.json or {}).get("username", "").strip()
    me = current_user()
    with lock:
        accounts = load_json(ACCOUNTS_FILE)
        reqs = accounts.get(me, {}).get("friend_requests", [])
        if target in reqs:
            reqs.remove(target)
            save_json(ACCOUNTS_FILE, accounts)
    return jsonify({"ok": True})


# ---------- API messages ----------

@app.route("/api/messages/<friend>")
@login_required
def api_messages(friend):
    me = current_user()
    accounts = load_json(ACCOUNTS_FILE)
    if friend not in accounts.get(me, {}).get("friends", []):
        return jsonify({"error": "Vous n'êtes pas amis."}), 403
    messages = load_json(MESSAGES_FILE)
    key = conv_key(me, friend)
    return jsonify({"messages": messages.get(key, [])})


@app.route("/api/send_message", methods=["POST"])
@login_required
def api_send_message():
    me = current_user()
    data = request.json or {}
    friend = data.get("to", "").strip()
    text = data.get("content", "")
    accounts = load_json(ACCOUNTS_FILE)
    if friend not in accounts.get(me, {}).get("friends", []):
        return jsonify({"error": "Vous n'êtes pas amis."}), 403
    if not text.strip():
        return jsonify({"error": "Message vide."}), 400
    msg = {
        "id": uuid.uuid4().hex,
        "from": me,
        "to": friend,
        "type": "text",
        "content": text,
        "timestamp": datetime.utcnow().isoformat(),
    }
    with lock:
        messages = load_json(MESSAGES_FILE)
        key = conv_key(me, friend)
        messages.setdefault(key, []).append(msg)
        save_json(MESSAGES_FILE, messages)
    return jsonify({"ok": True, "message": msg})


@app.route("/api/upload", methods=["POST"])
@login_required
def api_upload():
    me = current_user()
    friend = request.form.get("to", "").strip()
    msg_type = request.form.get("type", "file")  # "file" ou "voice"
    file = request.files.get("file")
    accounts = load_json(ACCOUNTS_FILE)
    if friend not in accounts.get(me, {}).get("friends", []):
        return jsonify({"error": "Vous n'êtes pas amis."}), 403
    if not file or file.filename == "":
        return jsonify({"error": "Aucun fichier reçu."}), 400

    ext = os.path.splitext(file.filename)[1]
    filename = uuid.uuid4().hex + ext
    filepath = os.path.join(UPLOAD_DIR, filename)
    file.save(filepath)

    msg = {
        "id": uuid.uuid4().hex,
        "from": me,
        "to": friend,
        "type": msg_type,  # "file" ou "voice"
        "filename": filename,
        "original_name": secure_filename(file.filename),
        "timestamp": datetime.utcnow().isoformat(),
    }
    with lock:
        messages = load_json(MESSAGES_FILE)
        key = conv_key(me, friend)
        messages.setdefault(key, []).append(msg)
        save_json(MESSAGES_FILE, messages)
    return jsonify({"ok": True, "message": msg})


@app.route("/uploads/<path:filename>")
@login_required
def uploaded_file(filename):
    return send_from_directory(UPLOAD_DIR, filename)


# ---------- Admin ----------

@app.route("/admin")
@login_required
@admin_required
def admin_page():
    return render_template("admin.html", username=current_user())


@app.route("/api/admin/users")
@login_required
@admin_required
def api_admin_users():
    accounts = load_json(ACCOUNTS_FILE)
    users = []
    for uname, udata in accounts.items():
        users.append({
            "username": uname,
            "status": compute_effective_status(udata),
            "is_admin": udata.get("is_admin", False),
            "friends_count": len(udata.get("friends", [])),
            "created_at": udata.get("created_at"),
        })
    users.sort(key=lambda u: u["username"].lower())
    return jsonify({"users": users})


@app.route("/api/admin/toggle_admin", methods=["POST"])
@login_required
@admin_required
def api_admin_toggle_admin():
    target = (request.json or {}).get("username", "").strip()
    if target == current_user():
        return jsonify({"error": "Tu ne peux pas te retirer toi-même."}), 400
    with lock:
        accounts = load_json(ACCOUNTS_FILE)
        if target not in accounts:
            return jsonify({"error": "Utilisateur introuvable."}), 404
        accounts[target]["is_admin"] = not accounts[target].get("is_admin", False)
        save_json(ACCOUNTS_FILE, accounts)
    return jsonify({"ok": True})


@app.route("/api/admin/conversations/<username>")
@login_required
@admin_required
def api_admin_conversations(username):
    accounts = load_json(ACCOUNTS_FILE)
    if username not in accounts:
        return jsonify({"error": "Utilisateur introuvable."}), 404
    messages = load_json(MESSAGES_FILE)
    partners = set()
    for key in messages.keys():
        parts = key.split("__")
        if len(parts) == 2 and username in parts:
            other = parts[0] if parts[1] == username else parts[1]
            partners.add(other)
    return jsonify({"conversations": sorted(partners)})


@app.route("/api/admin/messages/<user1>/<user2>")
@login_required
@admin_required
def api_admin_messages(user1, user2):
    messages = load_json(MESSAGES_FILE)
    key = conv_key(user1, user2)
    return jsonify({"messages": messages.get(key, [])})


if __name__ == "__main__":
    print("Serveur lancé sur http://127.0.0.1:5000")
    # use_reloader=False : sinon Flask redémarre le serveur à chaque écriture
    # dans data/*.json (accounts, messages), ce qui coupait les sessions.
    app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False)
