const appEl = document.querySelector(".app");
const myUsername = appEl.dataset.username;

const friendInput = document.getElementById("friend-input");
const addFriendBtn = document.getElementById("add-friend-btn");
const addFriendMsg = document.getElementById("add-friend-msg");
const requestsList = document.getElementById("requests-list");
const dmsList = document.getElementById("dms-list");
const friendsList = document.getElementById("friends-list");

const myStatusToggle = document.getElementById("my-status-toggle");
const myStatusDot = document.getElementById("my-status-dot");
const statusMenu = document.getElementById("status-menu");

const noChat = document.getElementById("no-chat");
const chatWindow = document.getElementById("chat-window");
const chatWith = document.getElementById("chat-with");
const messagesEl = document.getElementById("messages");
const textInput = document.getElementById("text-input");
const sendBtn = document.getElementById("send-btn");
const fileBtn = document.getElementById("file-btn");
const fileInput = document.getElementById("file-input");
const voiceBtn = document.getElementById("voice-btn");

let currentFriend = null;
let lastMessageCount = 0;
let hasResumedDm = false;

// ---------- Amis ----------

async function refreshFriends() {
  const res = await fetch("/api/friends");
  const data = await res.json();

  requestsList.innerHTML = "";
  (data.requests_received || []).forEach(user => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${user}</span>
      <span class="req-actions">
        <button class="accept">✓</button>
        <button class="decline">✕</button>
      </span>`;
    li.querySelector(".accept").onclick = () => respondRequest(user, "accept");
    li.querySelector(".decline").onclick = () => respondRequest(user, "decline");
    requestsList.appendChild(li);
  });

  const statusByUser = {};
  (data.friends || []).forEach(f => { statusByUser[f.username] = f.status; });

  dmsList.innerHTML = "";
  (data.open_dms || []).forEach(user => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="friend-row">
        <span class="status-dot ${statusByUser[user] || "offline"}"></span>
        <span>${user}</span>
      </span>`;
    if (user === currentFriend) li.classList.add("active");
    li.onclick = () => openChat(user);
    dmsList.appendChild(li);
  });

  friendsList.innerHTML = "";
  (data.friends || []).forEach(friend => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="friend-row">
        <span class="status-dot ${friend.status}"></span>
        <span>${friend.username}</span>
      </span>`;
    if (friend.username === currentFriend) li.classList.add("active");
    li.onclick = () => openChat(friend.username);
    friendsList.appendChild(li);
  });

  if (data.my_status) {
    myStatusDot.className = "status-dot " + data.my_status;
  }

  // à la toute première synchro, on rouvre automatiquement le dernier DM
  if (!hasResumedDm && !currentFriend && (data.open_dms || []).length > 0) {
    hasResumedDm = true;
    openChat(data.open_dms[0]);
  }
  hasResumedDm = true;
}

// ---------- Mon statut ----------

myStatusToggle.onclick = (e) => {
  e.stopPropagation();
  statusMenu.classList.toggle("hidden");
};

document.querySelectorAll(".status-option").forEach(opt => {
  opt.onclick = async () => {
    const status = opt.dataset.status;
    myStatusDot.className = "status-dot " + status;
    statusMenu.classList.add("hidden");
    await fetch("/api/set_status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  };
});

document.addEventListener("click", () => statusMenu.classList.add("hidden"));

async function respondRequest(user, action) {
  await fetch(`/api/friend_${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: user }),
  });
  refreshFriends();
}

addFriendBtn.onclick = async () => {
  const username = friendInput.value.trim();
  if (!username) return;
  const res = await fetch("/api/friend_request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  const data = await res.json();
  addFriendMsg.textContent = data.error ? data.error : "Demande envoyée !";
  addFriendMsg.style.color = data.error ? "#fa777c" : "#23a55a";
  if (!data.error) friendInput.value = "";
};

// ---------- Chat ----------

function openChat(friend) {
  currentFriend = friend;
  lastMessageCount = 0;
  noChat.classList.add("hidden");
  chatWindow.classList.remove("hidden");
  chatWith.textContent = friend;
  messagesEl.innerHTML = "";
  fetch("/api/open_dm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: friend }),
  }).then(refreshFriends);
  loadMessages();
}

function renderMessage(msg) {
  const div = document.createElement("div");
  div.className = "msg " + (msg.from === myUsername ? "mine" : "theirs");
  const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (msg.type === "text") {
    div.innerHTML = `<div>${escapeHtml(msg.content)}</div><div class="meta">${time}</div>`;
  } else if (msg.type === "voice") {
    div.innerHTML = `<div>🎤 Message vocal</div>
      <audio controls src="/uploads/${msg.filename}"></audio>
      <div class="meta">${time}</div>`;
  } else if (msg.type === "file") {
    const isImage = /\.(png|jpe?g|gif|webp)$/i.test(msg.original_name || "");
    if (isImage) {
      div.innerHTML = `<img src="/uploads/${msg.filename}" alt="${escapeHtml(msg.original_name)}">
        <div class="meta">${time}</div>`;
    } else {
      div.innerHTML = `<a class="filelink" href="/uploads/${msg.filename}" target="_blank">📎 ${escapeHtml(msg.original_name || "Fichier")}</a>
        <div class="meta">${time}</div>`;
    }
  }
  messagesEl.appendChild(div);
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.innerText = str;
  return d.innerHTML;
}

async function loadMessages() {
  if (!currentFriend) return;
  const res = await fetch(`/api/messages/${encodeURIComponent(currentFriend)}`);
  const data = await res.json();
  const msgs = data.messages || [];
  if (msgs.length !== lastMessageCount) {
    messagesEl.innerHTML = "";
    msgs.forEach(renderMessage);
    lastMessageCount = msgs.length;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

sendBtn.onclick = sendTextMessage;
textInput.addEventListener("keydown", e => {
  if (e.key === "Enter") sendTextMessage();
});

async function sendTextMessage() {
  const content = textInput.value.trim();
  if (!content || !currentFriend) return;
  textInput.value = "";
  await fetch("/api/send_message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: currentFriend, content }),
  });
  loadMessages();
}

// ---------- Fichiers ----------

fileBtn.onclick = () => fileInput.click();
fileInput.onchange = async () => {
  if (!fileInput.files.length || !currentFriend) return;
  const file = fileInput.files[0];
  await uploadFile(file, "file");
  fileInput.value = "";
};

async function uploadFile(blobOrFile, type) {
  const formData = new FormData();
  formData.append("to", currentFriend);
  formData.append("type", type);
  const filename = blobOrFile.name || (type === "voice" ? "voice.webm" : "fichier");
  formData.append("file", blobOrFile, filename);
  await fetch("/api/upload", { method: "POST", body: formData });
  loadMessages();
}

// ---------- Messages vocaux ----------

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

voiceBtn.onclick = async () => {
  if (!currentFriend) return;
  if (!isRecording) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: false,
          echoCancellation: false,
          autoGainControl: false,
        },
      });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunks, { type: "audio/webm" });
        await uploadFile(blob, "voice");
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorder.start();
      isRecording = true;
      voiceBtn.classList.add("recording");
    } catch (err) {
      alert("Impossible d'accéder au micro : " + err.message);
    }
  } else {
    mediaRecorder.stop();
    isRecording = false;
    voiceBtn.classList.remove("recording");
  }
};

// ---------- Polling ----------

async function checkAdmin() {
  const res = await fetch("/api/me");
  const data = await res.json();
  if (data.is_admin) {
    document.getElementById("admin-link").classList.remove("hidden");
  }
}
checkAdmin();

setInterval(() => {
  refreshFriends();
  if (currentFriend) loadMessages();
}, 2000);

refreshFriends();
