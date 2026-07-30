#!/usr/bin/env python3
"""
Serveur Flask servant des fichiers statiques (index.html + ressources),
prêt pour un déploiement sur Render.com avec Gunicorn.

Structure attendue (app.py au même niveau qu'index.html) :

    src/  (ou le nom de votre dépôt, peu importe)
    ├── app.py
    ├── requirements.txt
    ├── index.html
    └── ... (css, js, images, etc.)

Démarrage local (test) :
    python app.py

Démarrage en production (Render, via Gunicorn) :
    gunicorn app:app
"""

import os
from flask import Flask, send_from_directory

# Dossier contenant index.html : le même dossier que ce script
DOSSIER = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__, static_folder=None)


@app.route("/")
def index():
    return send_from_directory(DOSSIER, "index.html")


@app.route("/<path:chemin>")
def fichiers_statiques(chemin):
    return send_from_directory(DOSSIER, chemin)


if __name__ == "__main__":
    # Utilisé uniquement pour tester en local.
    # En production sur Render, c'est Gunicorn qui démarre l'app (voir Start Command).
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
