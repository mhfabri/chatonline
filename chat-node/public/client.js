const socket = io();

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const usernameInput = document.getElementById('username');

// Mensagens antigas
socket.on("loadMessages", (msgs) => {
  msgs.forEach(m => {
    addMessage(`${formatTime(m.time)} <strong>${escapeHtml(m.username)}:</strong> ${escapeHtml(m.text)}`);
  });
});

// Mensagens novas
socket.on("chatMessage", (payload) => {
  addMessage(`${formatTime(payload.time)} <strong>${escapeHtml(payload.username)}:</strong> ${escapeHtml(payload.text)}`);
});

// Mensagens do sistema
socket.on("systemMessage", (text) => {
  addSystemMessage(text);
});

function joinChatIfNeeded() {
  const name = usernameInput.value.trim();
  socket.emit("join", name || "Anônimo");
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const message = input.value.trim();
  if (!message) return;

  joinChatIfNeeded();
  socket.emit("chatMessage", message);

  input.value = "";
  input.focus();
});

function addMessage(html) {
  const li = document.createElement("li");
  li.className = "message";
  li.innerHTML = html;
  messages.appendChild(li);
  messages.scrollTop = messages.scrollHeight;
}

function addSystemMessage(text) {
  const li = document.createElement("li");
  li.className = "system";
  li.textContent = text;
  messages.appendChild(li);
  messages.scrollTop = messages.scrollHeight;
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString();
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
}
