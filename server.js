import express from "express";
import http from "http";
import path from "path";
import { Server } from "socket.io";
import fs from "fs/promises";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { randomUUID, createHmac } from "crypto";

// Corrigir __dirname em ESModules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Permitir obter IP real no Railway/Nginx
app.set("trust proxy", true);

// Caminho para o JSON
const messagesPath = path.join(__dirname, "messages.json");

// Chave secreta segura
const IP_HASH_SECRET = process.env.IP_HASH_SECRET || "dev_fallback_secret_do_not_use_in_prod";
if (!process.env.IP_HASH_SECRET) {
  console.warn("⚠️ AVISO: usando IP_HASH_SECRET inseguro. Defina no Railway!");
}

// Hash seguro para IP
function hashIp(ip) {
  try {
    if (!ip) return null;
    return createHmac("sha256", IP_HASH_SECRET).update(String(ip)).digest("hex");
  } catch (err) {
    console.error("Erro ao gerar hash:", err);
    return null;
  }
}

// Carregar mensagens de forma segura
async function loadMessages() {
  try {
    if (!existsSync(messagesPath)) {
      await fs.writeFile(messagesPath, "[]", "utf8");
      return [];
    }

    const data = await fs.readFile(messagesPath, "utf8");

    try {
      return JSON.parse(data || "[]");
    } catch {
      console.error("⚠️ Arquivo messages.json corrompido! Gerando novo arquivo.");
      await fs.writeFile(messagesPath, "[]", "utf8");
      return [];
    }

  } catch (err) {
    console.error("Erro ao carregar messages.json:", err);
    return [];
  }
}

// Salvar mensagens (não bloquear o Node)
async function saveMessages(messages) {
  try {
    // Se chegar a mais de 5MB, zera o arquivo
    if (JSON.stringify(messages).length > 5 * 1024 * 1024) {
      console.warn("⚠️ messages.json muito grande → resetando arquivo.");
      messages = [];
    }

    await fs.writeFile(messagesPath, JSON.stringify(messages, null, 2), "utf8");
  } catch (err) {
    console.error("Erro ao salvar messages.json:", err);
  }
}

// Servir diretório public/
app.use(express.static(path.join(__dirname, "public")));

// 🚀 Controle de Spam (1 msg / 0.5s)
const rateLimit = new Map();

io.on("connection", async (socket) => {
  socket.data.userId = randomUUID();

  // Obter IP real
  let ip = socket.handshake.headers["x-forwarded-for"] || socket.handshake.address;

  // Pode vir como array ou com vírgulas
  if (Array.isArray(ip)) ip = ip[0];
  if (typeof ip === "string" && ip.includes(",")) ip = ip.split(",")[0].trim();

  // Normalizar IPv6 "::ffff:1.2.3.4"
  if (typeof ip === "string" && ip.startsWith("::ffff:")) {
    ip = ip.replace("::ffff:", "");
  }

  socket.data.ipHash = hashIp(ip);

  console.log("Usuário conectado:", socket.id, "IP Hash:", socket.data.ipHash);

  // Enviar histórico
  socket.emit("loadMessages", await loadMessages());

  socket.on("join", (username) => {
    socket.data.username = username || "Anônimo";
    socket.broadcast.emit("systemMessage", `${socket.data.username} entrou no chat.`);
  });

  socket.on("chatMessage", async (msg) => {

    // Proteção anti-spam
    const last = rateLimit.get(socket.id);
    if (last && Date.now() - last < 500) return;
    rateLimit.set(socket.id, Date.now());

    const newMsg = {
      messageId: randomUUID(),
      userId: socket.data.userId,
      ipHash: socket.data.ipHash,
      username: socket.data.username || "Anônimo",
      text: String(msg).slice(0, 1000),
      time: new Date().toISOString()
    };

    const messages = await loadMessages();
    messages.push(newMsg);
    await saveMessages(messages);

    io.emit("chatMessage", newMsg);
  });

  socket.on("disconnect", () => {
    if (socket.data.username) {
      socket.broadcast.emit("systemMessage", `${socket.data.username} saiu do chat.`);
    }
  });
});

// Porta do Railway
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor ativo na porta ${PORT}`));
