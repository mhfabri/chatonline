import express from "express";
import http from "http";
import path from "path";
import { Server } from "socket.io";
import fs from "fs";
import { fileURLToPath } from "url";

// Correção para __dirname no ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Caminho do arquivo JSON
const messagesPath = path.join(__dirname, "messages.json");

// Função para carregar mensagens
function loadMessages() {
  try {
    const data = fs.readFileSync(messagesPath, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Erro ao carregar messages.json:", err);
    return [];
  }
}

// Função para salvar mensagens
function saveMessages(messages) {
  try {
    fs.writeFileSync(messagesPath, JSON.stringify(messages, null, 2));
  } catch (err) {
    console.error("Erro ao salvar messages.json:", err);
  }
}

// Servindo arquivos da pasta public
app.use(express.static(path.join(__dirname, "public")));

io.on("connection", (socket) => {
  console.log("Novo usuário conectado:", socket.id);

  // Envia mensagens antigas para o usuário
  socket.emit("loadMessages", loadMessages());

  socket.on("join", (username) => {
    socket.data.username = username || "Anônimo";
    socket.broadcast.emit("systemMessage", `${socket.data.username} entrou no chat.`);
  });

  socket.on("chatMessage", (msg) => {
    const newMsg = {
      username: socket.data.username || "Anônimo",
      text: msg,
      time: new Date().toISOString()
    };

    // Carrega mensagens antigas
    const messages = loadMessages();

    // Adiciona nova
    messages.push(newMsg);

    // Salva no JSON
    saveMessages(messages);

    // Envia para todos
    io.emit("chatMessage", newMsg);
  });

  socket.on("disconnect", () => {
    if (socket.data.username) {
      socket.broadcast.emit("systemMessage", `${socket.data.username} saiu do chat.`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));
