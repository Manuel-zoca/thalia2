// bot-thalia.js
require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const path = require("path");
const fs = require("fs");

// ===== VERIFICAÇÃO =====
if (!process.env.BOT_TOKEN) {
  console.error("ERRO: BOT_TOKEN não encontrado no .env");
  process.exit(1);
}

// ===== INICIALIZAÇÃO DO BOT =====
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// ===== CONFIGURAÇÕES =====
const ADMIN_ID = 7398050896; // Thaila
const DATA_FILE = path.join(__dirname, "contatos.json");
const fotos = [
  path.join(__dirname, "fotos", "thalia.jpg"),
  path.join(__dirname, "fotos", "thalia2.png")
];
const gifPath = path.join(__dirname, "fotos", "thalia3.mp4");

if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ users: [] }, null, 2));

// Links de pagamento
const PAYMENT_LINKS = {
  "plano_usd_7d": "https://paypal.me/thaliatopai/6.99",
  "plano_usd_15d": "https://paypal.me/thaliatopai/12.99",
  "plano_usd_vita": "https://paypal.me/thaliatopai/20",
  "plano_brl_7d": "https://paypal.me/thaliatopai/10",
  "plano_brl_15d": "https://paypal.me/thaliatopai/20",
  "plano_brl_vita": "https://paypal.me/thaliatopai/49.9",
  "plano_eur_7d": "https://paypal.me/thaliatopai/6.5",
  "plano_eur_15d": "https://paypal.me/thaliatopai/11.99",
  "plano_eur_vita": "https://paypal.me/thaliatopai/18",
};

// Legível para mensagens
const PRICE_LABELS = {
  "plano_usd_7d": "$6.99 (7 days)",
  "plano_usd_15d": "$12.99 (15 days)",
  "plano_usd_vita": "$20 (Lifetime)",
  "plano_brl_7d": "R$10 (7 dias)",
  "plano_brl_15d": "R$20 (15 dias)",
  "plano_brl_vita": "R$49,90 (Vitalício)",
  "plano_eur_7d": "€6.50 (7 dias)",
  "plano_eur_15d": "€11.99 (15 dias)",
  "plano_eur_vita": "€18 (Vitalício)"
};

// Cache timers
const inactivityTimers = {};
const lastPromoSent = {}; // controle envio para evitar spam

// ===== FUNÇÕES AUXILIARES =====
function readData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE)); }
  catch { return { users: [] }; }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function saveUser(chatId, username = null, message = null) {
  const data = readData();
  let user = data.users.find(u => u.chatId === chatId);

  if (!user) {
    user = {
      chatId,
      username: username ? `@${username}` : `ID_${chatId}`,
      lastContact: new Date().toISOString(),
      paid: false,
      messages: []
    };
    data.users.push(user);
  } else {
    user.lastContact = new Date().toISOString();
    if (username) user.username = `@${username}`;
  }

  if (message) {
    user.messages.push({ text: message, date: new Date().toISOString() });
    const msgResumo = `💌 Nova mensagem de ${user.username} (ID: ${chatId}):\n"${message}"`;
    bot.sendMessage(ADMIN_ID, msgResumo);
  }

  writeData(data);
  resetInactivityTimer(chatId);
}

function resetInactivityTimer(chatId) {
  const hours = parseInt(process.env.INACTIVITY_HOURS || "3", 10);
  if (inactivityTimers[chatId]) clearTimeout(inactivityTimers[chatId]);
  inactivityTimers[chatId] = setTimeout(() => enviarFollowUp(chatId), hours * 60 * 60 * 1000);
}

function enviarFollowUp(chatId) {
  bot.sendMessage(chatId,
    "Oi, tudo bem? 😁 Eu percebi que você deu uma olhadinha nas nossas ofertas, mas ainda não finalizou a sua compra.\n" +
    "Que tal garantir seu acesso e me ver ainda mais pertinho? 💖",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "R$ 10 → 7 dias", callback_data: "plano_brl_7d" }],
          [{ text: "R$ 20 → 15 dias", callback_data: "plano_brl_15d" }],
          [{ text: "R$ 49,90 → Vitalício", callback_data: "plano_brl_vita" }]
        ]
      }
    }
  );
}

function reconquista(chatId) {
  bot.sendMessage(chatId,
    "Oi amorzinho 💖, tô esperando você no meu grupo VIP 😘🔥. Não vai perder essa chance de me ver ainda mais pertinho? 💦✨"
  );
}

function getNamorarKeyboard() {
  const preText = encodeURIComponent("Oi Thalia ✨, quero te conhecer melhor... posso te namorar? 😍");
  const url = `https://t.me/Thalia_Ember?text=${preText}`;
  return { reply_markup: { inline_keyboard: [[{ text: "💘 Namorar a Thaila", url }]] } };
}

function sendWelcomeAndNamorar(chatId) {
  try {
    for (const f of fotos) if (fs.existsSync(f)) bot.sendPhoto(chatId, fs.createReadStream(f));
    if (fs.existsSync(gifPath)) bot.sendAnimation(chatId, fs.createReadStream(gifPath));
  } catch { }

  bot.sendMessage(chatId, "✨ Bem-vindo(a) ao meu cantinho exclusivo ✨\nAqui você terá acesso a conteúdos especiais só para você 😘🔥");
  bot.sendMessage(chatId, "🌍 Escolha o idioma:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🇧🇷 Português", callback_data: "lang_pt" }],
        [{ text: "🇬🇧 English", callback_data: "lang_en" }]
      ]
    }
  });
  bot.sendMessage(chatId, "Quer algo mais íntimo? 💘", getNamorarKeyboard());
}

function getPlanHumanText(planKey) {
  if (PRICE_LABELS[planKey]) return `Você escolheu o pacote de ${PRICE_LABELS[planKey]} ✅`;
  const m = planKey.match(/(\d+(\.\d+)?)/);
  if (m) return `Você escolheu o pacote de ${m[1]} ✅`;
  return "Você escolheu um pacote ✅";
}

function dailyOrganizeAndNotify() {
  const data = readData();
  data.users.sort((a, b) => new Date(b.lastContact) - new Date(a.lastContact));
  writeData(data);
  const total = data.users.length;
  const paid = data.users.filter(u => u.paid).length;
  const last10 = data.users.slice(0, 10).map(u => `${u.username} — last: ${u.lastContact}`).join("\n") || "Nenhum";
  const msg = `📊 Resumo diário de usuários:\nTotal: ${total}\nPagantes: ${paid}\nÚltimos contatos:\n${last10}`;
  bot.sendMessage(ADMIN_ID, msg);
}

// ===== BROADCAST PROMOÇÃO =====
async function broadcastPromo(priceAmount, promoTitle, promoDetails) {
  const data = readData();
  const users = data.users;
  const amount = priceAmount;
  const paypalLink = `https://paypal.me/thaliatopai/${amount}`;
  const promoText = `🔥 Promoção quente, meu amor! 🔥\n📸 ${promoTitle}\n💵 Preço: ${amount}\n✨ ${promoDetails} 😍`;
  const keyboard = {
    reply_markup: { inline_keyboard: [[{ text: `Comprar — ${promoTitle} — ${amount}`, url: paypalLink }]] }
  };

  for (const u of users) {
    try {
      // Evita enviar promo repetida se já enviou nas últimas 6 horas
      const lastSent = lastPromoSent[u.chatId];
      const now = Date.now();
      if (lastSent && now - lastSent < 6 * 60 * 60 * 1000) continue;

      if (fotos.length > 0) {
        const mediaGroup = fotos.filter(f => fs.existsSync(f)).map(f => ({ type: "photo", media: f }));
        if (mediaGroup.length > 0) await bot.sendMediaGroup(u.chatId, mediaGroup);
      }
      await bot.sendMessage(u.chatId, promoText, keyboard);
      resetInactivityTimer(u.chatId);
      lastPromoSent[u.chatId] = now; // marca como enviado
    } catch (e) {
      console.error(`Erro ao enviar promo para ${u.chatId}:`, e.message || e);
    }
  }

  bot.sendMessage(ADMIN_ID, `✅ Promoção enviada para ${users.length} usuários.`);
}

// ===== HANDLERS =====
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || "SemUsername";
  saveUser(chatId, username);
  sendWelcomeAndNamorar(chatId);
});

bot.on("message", async (msg) => {
  if (!msg || !msg.chat) return;
  const chatId = msg.chat.id;
  const text = msg.text || "";
  if (!text) return;

  // COMANDOS ADMIN
  if (chatId === ADMIN_ID) {
    if (text.startsWith("/menu")) {
      const data = readData();
      const total = data.users.length;
      const paid = data.users.filter(u => u.paid).length;
      const recent = data.users.slice(-20).reverse().map(u => `${u.username} — ${u.chatId} — last: ${u.lastContact}`).join("\n") || "Nenhum";
      return bot.sendMessage(ADMIN_ID, `📋 Menu Admin:\nTotal usuários: ${total}\nPagantes: ${paid}\n\nÚltimos contatos:\n${recent}`);
    }

    if (text.startsWith("/promo")) {
      const parts = text.split(/\s+/).slice(1);
      if (!parts.length) return bot.sendMessage(ADMIN_ID, "Use: /promo <valor> <titulo> <detalhes...>");
      const m = parts[0].match(/(\d+(\.\d+)?)/);
      if (!m) return bot.sendMessage(ADMIN_ID, "Não encontrei valor no comando.");
      const amount = m[1];
      const title = parts[1] || `${amount} reais`;
      const details = parts.slice(2).join(" ") || "";
      return broadcastPromo(amount, title, details);
    }

    const regex = /@(\w+)\s+([\s\S]*)/;
    const match = text.match(regex);
    if (match) {
      const username = `@${match[1]}`;
      const resposta = match[2].trim();
      const data = readData();
      const user = data.users.find(u => u.username && u.username.toLowerCase() === username.toLowerCase());
      if (user) {
        try {
          await bot.sendMessage(user.chatId, resposta);
          return bot.sendMessage(ADMIN_ID, `✅ Mensagem enviada para ${username}: "${resposta}"`);
        } catch { return bot.sendMessage(ADMIN_ID, "⚠️ Erro ao enviar mensagem."); }
      } else return bot.sendMessage(ADMIN_ID, "⚠️ Usuário não encontrado.");
    }

    return;
  }

  // MENSAGENS DE USUÁRIO
  if (text.startsWith("/")) return;
  const username = msg.from.username || "SemUsername";
  saveUser(chatId, username, text);
  bot.sendMessage(chatId, "💖 Que delícia receber sua mensagem... já te respondo em um instante! ✨");
});

// ===== CALLBACK QUERY =====
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const fromUsername = query.from.username || "SemUsername";
  const data = query.data;

  try { await bot.answerCallbackQuery(query.id); } catch { }

  saveUser(chatId, fromUsername, `Clicou no botão: ${data}`);

  const voltar = [{ text: "🔙 Voltar", callback_data: "voltar" }];

  // IDIOMAS
  if (data === "voltar") return bot.sendMessage(chatId, "🌍 Escolha o idioma:", { reply_markup: { inline_keyboard: [[{ text: "🇧🇷 Português", callback_data: "lang_pt" }],[{ text: "🇬🇧 English", callback_data: "lang_en" }]] }});
  if (data === "lang_pt") return bot.sendMessage(chatId, "💵 Escolha a moeda:", { reply_markup: { inline_keyboard: [[{ text: "🇧🇷 BRL", callback_data: "moeda_brl" }],[{ text: "🇺🇸 USD", callback_data: "moeda_usd" }],[{ text: "🇪🇺 EUR", callback_data: "moeda_eur" }], voltar] }});
  if (data === "lang_en") return bot.sendMessage(chatId, "💵 Choose a currency:", { reply_markup: { inline_keyboard: [[{ text: "🇧🇷 BRL", callback_data: "moeda_brl" }],[{ text: "🇺🇸 USD", callback_data: "moeda_usd" }],[{ text: "🇪🇺 EUR", callback_data: "moeda_eur" }], voltar] }});

  // PLANOS
  const planosMap = {
    "moeda_brl": [[{ text: "R$ 10 → 7 dias", callback_data: "plano_brl_7d" }],[{ text: "R$ 20 → 15 dias", callback_data: "plano_brl_15d" }],[{ text: "R$ 49,90 → Vitalício", callback_data: "plano_brl_vita" }]],
    "moeda_usd": [[{ text: "$6.99 → 7 days", callback_data: "plano_usd_7d" }],[{ text: "$12.99 → 15 days", callback_data: "plano_usd_15d" }],[{ text: "$20 → Lifetime", callback_data: "plano_usd_vita" }]],
    "moeda_eur": [[{ text: "€6.50 → 7 dias", callback_data: "plano_eur_7d" }],[{ text: "€11.99 → 15 dias", callback_data: "plano_eur_15d" }],[{ text: "€18 → Vitalício", callback_data: "plano_eur_vita" }]],
  };
  if (planosMap[data]) return bot.sendMessage(chatId, "📌 Escolha seu plano 💖:", { reply_markup: { inline_keyboard: [...planosMap[data], voltar] } });

  // SELEÇÃO DE PLANO
  if (data.startsWith("plano_")) {
    const link = PAYMENT_LINKS[data];
    const confirmText = getPlanHumanText(data);
    if (link) {
      await bot.sendMessage(chatId, `${confirmText}\n🔥 Você está a um passo de entrar no meu grupo *EXCLUSIVO VIP* 😍`);
      await bot.sendMessage(chatId, `💳 Pagamento aqui:\n👉 ${link}\n📸 Depois envie o comprovante para eu liberar você 😘`);
    } else {
      const num = (data.match(/(\d+(\.\d+)?)/) || [null, ""])[1];
      const paypal = num ? `https://paypal.me/thaliatopai/${num}` : "https://paypal.me/thaliatopai";
      await bot.sendMessage(chatId, `${confirmText}\n💳 Pagamento: ${paypal}`);
    }
    bot.sendMessage(ADMIN_ID, `💌 ${fromUsername} (ID: ${chatId}) escolheu: ${data}`);
    setTimeout(() => reconquista(chatId), 5 * 60 * 1000);
    return;
  }

  await bot.sendMessage(chatId, "Recebi sua ação 😘");
});

// ===== PROMOÇÃO AUTOMÁTICA =====    6730
async function enviarPromocao() {
  const data = readData();
  const now = Date.now();

  for (const u of data.users) {
    try {
      if (u.paid) continue; // não enviar para pagantes
      const lastSent = lastPromoSent[u.chatId];
      if (lastSent && now - lastSent < 6 * 60 * 60 * 1000) continue; // 6h de cooldown

      if (fotos.length > 0) {
        const mediaGroup = fotos.filter(f => fs.existsSync(f)).map(f => ({ type: "photo", media: f }));
        if (mediaGroup.length > 0) await bot.sendMediaGroup(u.chatId, mediaGroup);
      }

      await bot.sendMessage(u.chatId, "💖 Olá amorzinho! Tem novidades quentes no meu VIP 🔥😏. Aproveita para garantir seu acesso agora 💕");
      lastPromoSent[u.chatId] = now;
    } catch { }
  }
}

bot.onText(/\/promo$/, () => enviarPromocao());

// ===== INTERVALOS =====
setInterval(() => dailyOrganizeAndNotify(), 24 * 60 * 60 * 1000);
setInterval(() => enviarPromocao(), 6 * 60 * 60 * 1000);
// Inicializa o server para manter o Render ativo
require("./server");

console.log("Bot iniciado com sucesso!");
