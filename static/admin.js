const usersListEl = document.getElementById("admin-users-list");
const convListEl = document.getElementById("admin-conv-list");
const selectedUserEl = document.getElementById("admin-selected-user");
const convTitleEl = document.getElementById("admin-conv-title");
const adminMessagesEl = document.getElementById("admin-messages");

let selectedUser = null;
let selectedPartner = null;

function escapeHtml(str) {
  const d = document.createElement("div");
  d.innerText = str;
  return d.innerHTML;
}

async function loadUsers() {
  const res = await fetch("/api/admin/users");
  const data = await res.json();
  usersListEl.innerHTML = "";
  (data.users || []).forEach(u => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="friend-row">
        <span class="status-dot ${u.status}"></span>
        <span>${escapeHtml(u.username)}</span>
        ${u.is_admin ? '<span class="admin-badge">admin</span>' : ""}
      </span>
      <button class="admin-toggle-btn" type="button">${u.is_admin ? "Retirer" : "Promouvoir"}</button>`;
    li.querySelector("span").parentElement; // no-op, keeps structure clear
    li.querySelector(".admin-toggle-btn").onclick = (e) => {
      e.stopPropagation();
      toggleAdmin(u.username);
    };
    li.onclick = () => selectUser(u.username);
    if (u.username === selectedUser) li.classList.add("active");
    usersListEl.appendChild(li);
  });
}

async function toggleAdmin(username) {
  await fetch("/api/admin/toggle_admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  loadUsers();
}

async function selectUser(username) {
  selectedUser = username;
  selectedPartner = null;
  selectedUserEl.textContent = "Conversations de " + username;
  convTitleEl.textContent = "Aucune conversation sélectionnée";
  adminMessagesEl.innerHTML = "";

  const res = await fetch(`/api/admin/conversations/${encodeURIComponent(username)}`);
  const data = await res.json();
  convListEl.innerHTML = "";
  const partners = data.conversations || [];
  if (partners.length === 0) {
    convListEl.innerHTML = "<li style='opacity:.6;cursor:default;'>Aucune conversation</li>";
  }
  partners.forEach(partner => {
    const li = document.createElement("li");
    li.textContent = `${username} ↔ ${partner}`;
    li.onclick = () => loadConversation(username, partner);
    convListEl.appendChild(li);
  });
  loadUsers();
}

async function loadConversation(user1, user2) {
  selectedPartner = user2;
  convTitleEl.textContent = `Conversation : ${user1} ↔ ${user2}`;
  const res = await fetch(`/api/admin/messages/${encodeURIComponent(user1)}/${encodeURIComponent(user2)}`);
  const data = await res.json();
  adminMessagesEl.innerHTML = "";
  (data.messages || []).forEach(renderAdminMessage);
  adminMessagesEl.scrollTop = adminMessagesEl.scrollHeight;
}

function renderAdminMessage(msg) {
  const div = document.createElement("div");
  div.className = "msg theirs";
  const time = new Date(msg.timestamp).toLocaleString();
  let body = "";
  if (msg.type === "text") {
    body = escapeHtml(msg.content);
  } else if (msg.type === "voice") {
    body = `🎤 <audio controls src="/uploads/${msg.filename}"></audio>`;
  } else if (msg.type === "file") {
    body = `📎 <a class="filelink" href="/uploads/${msg.filename}" target="_blank">${escapeHtml(msg.original_name || "Fichier")}</a>`;
  }
  div.innerHTML = `<div><strong>${escapeHtml(msg.from)}</strong> : ${body}</div><div class="meta">${time}</div>`;
  adminMessagesEl.appendChild(div);
}

setInterval(() => {
  loadUsers();
  if (selectedUser && selectedPartner) loadConversation(selectedUser, selectedPartner);
}, 4000);

loadUsers();
