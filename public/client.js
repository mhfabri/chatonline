const socket = io();

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const usernameInput = document.getElementById('username');

let username = null;

// Mensagens antigas
socket.on("loadMessages", (msgs) => {
  msgs.forEach(m => {
    addMessage(m.username, m.text, m.time);
  });
});

// Mensagens do chat
socket.on("chatMessage", (payload) => {
  addMessage(payload.username, payload.text, payload.time);
});

// Mensagens do sistema
socket.on("systemMessage", (text) => {
  addSystemMessage(text);
});

function joinChatIfNeeded() {
  if (!username) {
    username = usernameInput.value.trim() || "Anônimo";
    socket.emit("join", username);
  }
}

form.addEventListener("submit", e => {
  e.preventDefault();

  const msg = input.value.trim();
  if (!msg) return;

  joinChatIfNeeded();
  socket.emit("chatMessage", msg);

  input.value = "";
  input.focus();
});

function addMessage(user, text, time) {
  const li = document.createElement("li");

  const isMe = (user === username);
  li.className = "message " + (isMe ? "me" : "other");

  li.innerHTML = `
    <small style="opacity:.7; font-size:12px;">
      ${formatTime(time)} • ${escapeHtml(user)}
    </small><br>
    ${escapeHtml(text)}
  `;

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
  return new Date(iso).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
}

let typing = false;
let typingTimeout;

input.addEventListener("input", () => {
  if (!typing) {
    typing = true;
    socket.emit("typing");
  }

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    typing = false;
    socket.emit("stopTyping");
  }, 800);
});
