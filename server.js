import express from "express";
import http from "http";
import path from "path";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import { randomUUID, createHmac } from "crypto";
import { createClient } from "@supabase/supabase-js";

// Corrigir __dirname em ESModules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Permitir IP real no Railway
app.set("trust proxy", true);

// ================================
// SUPABASE
// ================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ ERRO: Defina SUPABASE_URL e SUPABASE_SERVICE_KEY no Railway.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ================================
// IP HASH SEGURO (não reversível)
// ================================
const IP_HASH_SECRET = process.env.IP_HASH_SECRET || "dev_fallback_secret";

function hashIp(ip) {
  return createHmac("sha256", IP_HASH_SECRET)
    .update(String(ip))
    .digest("hex");
}

// ================================
// CARREGAR LOGS (somente dados públicos)
// ================================
async function loadMessages() {
  const { data, error } = await supabase
    .from("chat_logs")
    .select("*")
    .order("time", { ascending: true })
    .limit(200);

  if (error) {
    console.error("Erro ao carregar mensagens:", error);
    return [];
  }

  // Envia ao front SOMENTE dados não sensíveis
  return data.map(m => ({
    messageId: m.message_id,
    username: m.username,
    text: m.text,
    time: m.time
  }));
}

// ================================
// SALVAR LOG NO SUPABASE (com IP seguro)
// ================================
async function saveMessage(msg) {
  const { error } = await supabase
    .from("chat_logs")
    .insert({
      message_id: msg.messageId,
      username: msg.username,
      text: msg.text,
      time: msg.time,
      ip_hash: msg.ipHash, // 🔒 seguro
      user_id: msg.userId,
      raw: msg              // 🔒 somente servidor acessa
    });

  if (error) console.error("Erro ao salvar log:", error);
}

// ================================
// Servir public/
// ================================
app.use(express.static(path.join(__dirname, "public")));

// ================================
// Anti-spam
// ================================
const rateLimit = new Map();

// ================================
// SOCKET.IO
// ================================
io.on("connection", async (socket) => {
  socket.data.userId = randomUUID();

  socket.on("typing", () => {
  socket.broadcast.emit("userTyping", socket.data.username || "Anônimo");
  });

  socket.on("stopTyping", () => {
  socket.broadcast.emit("userStoppedTyping", socket.data.username || "Anônimo");
  });


  // Obter IP real
  let ip = socket.handshake.headers["x-forwarded-for"] || socket.handshake.address;
  if (Array.isArray(ip)) ip = ip[0];
  if (typeof ip === "string" && ip.includes(",")) ip = ip.split(",")[0].trim();
  if (typeof ip === "string" && ip.startsWith("::ffff:")) ip = ip.replace("::ffff:", "");

  socket.data.ipHash = hashIp(ip);

  console.log("Usuário conectado:", socket.id);

  // Enviar histórico público
  socket.emit("loadMessages", await loadMessages());

  socket.on("join", (username) => {
    socket.data.username = username || "Anônimo";
    socket.broadcast.emit("systemMessage", `${socket.data.username} entrou no chat.`);
  });

  socket.on("chatMessage", async (msg) => {
    const last = rateLimit.get(socket.id);
    if (last && Date.now() - last < 500) return;
    rateLimit.set(socket.id, Date.now());

    const newMsg = {
      messageId: randomUUID(),
      userId: socket.data.userId,
      ipHash: socket.data.ipHash,   // salvo apenas no servidor
      username: socket.data.username || "Anônimo",
      text: String(msg).slice(0, 1000),
      time: new Date().toISOString()
    };

    await saveMessage(newMsg);

    // Enviar ao front APENAS dados públicos
    io.emit("chatMessage", {
      messageId: newMsg.messageId,
      username: newMsg.username,
      text: newMsg.text,
      time: newMsg.time
    });
  });



  socket.on("disconnect", () => {
    if (socket.data.username) {
      socket.broadcast.emit("systemMessage", `${socket.data.username} saiu do chat.`);
    }
  });
});



// ================================
// Iniciar servidor
// ================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor ativo na porta ${PORT}`));

