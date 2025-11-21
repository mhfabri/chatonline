import express from "express";
import http from "http";
import path from "path";
import { Server } from "socket.io";
import fs from "fs";
import { fileURLToPath } from "url";
import { randomUUID, createHmac } from "crypto";

// Correção para __dirname no ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Caminho do arquivo JSON
const messagesPath = path.join(__dirname, "messages.json");

// Chave secreta para HMAC (defina em variáveis de ambiente em produção)
const IP_HASH_SECRET = process.env.IP_HASH_SECRET || "dev_fallback_secret_do_not_use_in_prod";
if (!process.env.IP_HASH_SECRET) {
  console.warn("⚠️  AVISO: IP_HASH_SECRET não definido. Usando fallback inseguro. Defina a variável de ambiente em produção.");
}

// Função para gerar hash HMAC do IP
function hashIp(ip) {
  try {
    if (!ip) return null;
    return createHmac("sha256", IP_HASH_SECRET).update(String(ip)).digest("hex");
  } catch (e) {
    console.error("Erro ao hash do IP:", e);
    return null;
  }
}

// Função para carregar mensagens
function loadMessages() {
  try {
    if (!fs.existsSync(messagesPath)) {
      // cria arquivo vazio se não existir
      fs.writeFileSync(messagesPath, "[]", "utf8");
    }
    const data = fs.readFileSync(messagesPath, "utf8");
    return JSON.parse(data || "[]");
  } catch (err) {
    console.error("Erro ao carregar messages.json:", err);
    return [];
  }
}

// Função para salvar mensagens
function saveMessages(messages) {
  try {
    fs.writeFileSync(messagesPath, JSON.stringify(messages, null, 2), "utf8");
  } catch (err) {
    console.error("Erro ao salvar messages.json:", err);
  }
}

// Servindo arquivos da pasta public
app.use(express.static(path.join(__dirname, "public")));

io.on("connection", (socket) => {
  // ID único do usuário
  socket.data.userId = randomUUID();

  // Tenta obter o IP real (considerando proxies reversos)
  let ip =
    (socket.handshake.headers && socket.handshake.headers["x-forwarded-for"]) ||
    socket.handshake.address ||
    (socket.conn && socket.conn.remoteAddress) ||
    null;

  // x-forwarded-for pode ter lista "client, proxy1, proxy2" → pegamos o primeiro
  if (typeof ip === "string" && ip.includes(",")) {
    ip = ip.split(",")[0].trim();
  }

  // Armazena apenas o hash do IP
  socket.data.ipHash = hashIp(ip);

  console.log("Novo usuário conectado:", socket.id, "ipHash:", socket.data.ipHash);

  // Envia mensagens antigas para o usuário
  socket.emit("loadMessages", loadMessages());

  socket.on("join", (username) => {
    socket.data.username = username || "Anônimo";
    socket.broadcast.emit("systemMessage", `${socket.data.username} entrou no chat.`);
  });

  socket.on("chatMessage", (msg) => {
    const newMsg = {
      messageId: randomUUID(),         // id da mensagem
      userId: socket.data.userId,      // id do usuário (UUID)
      ipHash: socket.data.ipHash,      // hash do IP (HMAC-SHA256)
      username: socket.data.username || "Anônimo",
      text: String(msg).slice(0, 1000), // limite por segurança
      time: new Date().toISOString()
    };

    // Carrega mensagens antigas
    const messages = loadMessages();

    // Adiciona nova
    messages.push(newMsg);

    // Salva no JSON
    saveMessages(messages);

    // Envia para todos os usuários
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
