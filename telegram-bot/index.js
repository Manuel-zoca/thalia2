// bot-thalia.js (VERSÃO ATUALIZADA, ÚNICA, COMPLETA)
require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const path = require("path");
const fs = require("fs");

// ======= CONFIG =======
if (!process.env.BOT_TOKEN) {
  console.error("ERRO: BOT_TOKEN não encontrado no .env");
  process.exit(1);
}

const BOT_TOKEN = process.env.BOT_TOKEN;
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const ADMIN_ID = 7398050896; // Thaila
const DATA_FILE = path.join(__dirname, "contatos.json");
const fotos = [
  path.join(__dirname, "fotos", "thalia.jpg"),
  path.join(__dirname, "fotos", "thalia2.png")
];
const gifPath = path.join(__dirname, "fotos", "thalia3.mp4");

// cria arquivo se não existir
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ users: [], promos: [] }, null, 2));

// Pagamentos
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

// rótulos
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

// timers e caches
const inactivityTimers = {};
const lastPromoSent = {}; // chatId -> timestamp ms
const SEND_RETRY_LIMIT = 2;
const PROMO_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h

// ======= UTILIDADES DE ARQUIVO =======
function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (err) {
    console.error("Erro lendo contatos.json:", err);
    return { users: [], promos: [] };
  }
}
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

// ======= TRADUÇÕES (PT / EN) =======
const LANG = {
  pt: {
    welcome: "✨ Bem-vindo(a) ao meu cantinho exclusivo ✨\nAqui você terá acesso a conteúdos especiais só para você 😘🔥",
    choose_lang: "🌍 Escolha o idioma:",
    choose_currency: "💵 Escolha a moeda:",
    followup_text: "Oi, tudo bem? 😁 Eu percebi que você deu uma olhadinha nas nossas ofertas, mas ainda não finalizou a sua compra.\nQue tal garantir seu acesso e me ver ainda mais pertinho? 💖",
    awaiting_reply: "💖 Que delícia receber sua mensagem... já te respondo em um instante! ✨",
    payment_after_choice: "🔥 Você está a um passo de entrar no meu grupo *EXCLUSIVO VIP* 😍\n💳 Pagamento aqui:\n👉 {link}\n📸 Depois envie o comprovante para eu liberar você 😘",
    promo_sent_admin: (count) => `✅ Promoção enviada para ${count} usuários.`,
    err_user_not_found: "⚠️ Usuário não encontrado.",
    admin_menu: (total, paid, recent) => `📋 Menu Admin:\nTotal usuários: ${total}\nPagantes: ${paid}\n\nÚltimos contatos:\n${recent}`,
    marcarpago_ok: (id) => `✅ Usuário ${id} marcado como pagante.`,
    marcarpago_fail: "⚠️ Uso: /marcarpago <chatId>",
  },
  en: {
    welcome: "✨ Welcome to my exclusive corner ✨\nHere you'll get special content just for you 😘🔥",
    choose_lang: "🌍 Choose a language:",
    choose_currency: "💵 Choose a currency:",
    followup_text: "Hi! 😁 I noticed you checked our offers but didn't finish your purchase.\nWhy not secure your access and see me even closer? 💖",
    awaiting_reply: "💖 I loved your message... I'll reply in a moment! ✨",
    payment_after_choice: "🔥 You're one step away from our *EXCLUSIVE VIP* group 😍\n💳 Payment here:\n👉 {link}\n📸 Then send the receipt so I can give you access 😘",
    promo_sent_admin: (count) => `✅ Promo sent to ${count} users.`,
    err_user_not_found: "⚠️ User not found.",
    admin_menu: (total, paid, recent) => `📋 Admin Menu:\nTotal users: ${total}\nPaying users: ${paid}\n\nRecent contacts:\n${recent}`,
    marcarpago_ok: (id) => `✅ User ${id} marked as paid.`,
    marcarpago_fail: "⚠️ Use: /marcarpago <chatId>",
  }
};

// default language for each user stored in user.lang (pt/en)
function t(userLang = "pt", key, ...args) {
  const dict = LANG[userLang] || LANG.pt;
  const v = dict[key];
  if (typeof v === "function") return v(...args);
  return v || "";
}

// ======= HELPERS DE TECLADO =======
function makeLangKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🇧🇷 Português", callback_data: "lang_pt" }],
        [{ text: "🇬🇧 English", callback_data: "lang_en" }]
      ]
    }
  };
}

function makeCurrencyKeyboard(lang = "pt") {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🇧🇷 BRL", callback_data: "moeda_brl" }],
        [{ text: "🇺🇸 USD", callback_data: "moeda_usd" }],
        [{ text: "🇪🇺 EUR", callback_data: "moeda_eur" }],
        [{ text: "🔙 Voltar", callback_data: "voltar" }]
      ]
    }
  };
}

function makePlansKeyboardForCurrency(currencyKey) {
  const map = {
    "moeda_brl": [
      [{ text: "R$ 10 → 7 dias", url: PAYMENT_LINKS["plano_brl_7d"] }],
      [{ text: "R$ 20 → 15 dias", url: PAYMENT_LINKS["plano_brl_15d"] }],
      [{ text: "R$ 49,90 → Vitalício", url: PAYMENT_LINKS["plano_brl_vita"] }],
    ],
    "moeda_usd": [
      [{ text: "$6.99 → 7 days", url: PAYMENT_LINKS["plano_usd_7d"] }],
      [{ text: "$12.99 → 15 days", url: PAYMENT_LINKS["plano_usd_15d"] }],
      [{ text: "$20 → Lifetime", url: PAYMENT_LINKS["plano_usd_vita"] }],
    ],
    "moeda_eur": [
      [{ text: "€6.50 → 7 dias", url: PAYMENT_LINKS["plano_eur_7d"] }],
      [{ text: "€11.99 → 15 dias", url: PAYMENT_LINKS["plano_eur_15d"] }],
      [{ text: "€18 → Vitalício", url: PAYMENT_LINKS["plano_eur_vita"] }],
    ]
  };
  // append voltar
  const arr = map[currencyKey] || [];
  arr.push([{ text: "🔙 Voltar", callback_data: "voltar" }]);
  return { reply_markup: { inline_keyboard: arr } };
}

// Keyboard to "namorar" (abre o telegram da Thalia)
function getNamorarKeyboard() {
  const preText = encodeURIComponent("Oi Thalia ✨, quero te conhecer melhor... posso te namorar? 😍");
  const url = `https://t.me/Thalia_Ember?text=${preText}`;
  return { reply_markup: { inline_keyboard: [[{ text: "💘 Namorar a Thaila", url }]] } };
}

// ======= FUNÇÕES PRINCIPAIS =======
function ensureUserStructure(u) {
  if (!u.messages) u.messages = [];
  if (!u.lang) u.lang = "pt";
  if (typeof u.paid === "undefined") u.paid = false;
  if (!u.username) u.username = `ID_${u.chatId}`;
}

// salva ou atualiza usuário
function saveUser(chatId, username = null, message = null) {
  const data = readData();
  let user = data.users.find(u => u.chatId === chatId);

  if (!user) {
    user = {
      chatId,
      username: username ? `@${username}` : `ID_${chatId}`,
      lastContact: new Date().toISOString(),
      paid: false,
      messages: [],
      lang: "pt"
    };
    data.users.push(user);
    console.log(`[SAVEUSER] novo usuário ${user.username} (${chatId})`);
  } else {
    user.lastContact = new Date().toISOString();
    if (username) user.username = `@${username}`;
  }

  ensureUserStructure(user);

  if (message) {
    user.messages.push({ text: message, date: new Date().toISOString() });
    // notifica admin
    const msgResumo = `💌 Nova mensagem de ${user.username} (ID: ${chatId}):\n"${message}"`;
    safeSendMessage(ADMIN_ID, msgResumo).catch(() => { /* não bloquear */ });
  }

  writeData(data);
  resetInactivityTimer(chatId);
}

// envia mensagem com retry e auto-clean (remove usuário se bloqueou)
async function safeSendMessage(chatId, text, options = {}, attempt = 1) {
  try {
    await bot.sendMessage(chatId, text, options);
    // sucesso
    return true;
  } catch (err) {
    const code = err && err.response && err.response.statusCode;
    const description = err && err.response && err.response.body && err.response.body.description;
    console.error(`[SEND][${chatId}] tentativa ${attempt} falhou`, code || "", description || err.message || err);

    // se usuário bloqueou o bot ou chat não existe (403 ou 400), remove do arquivo
    if (code === 403 || code === 400) {
      console.warn(`[CLEAN] Removendo usuário ${chatId} por erro ${code}`);
      removeUserById(chatId);
      return false;
    }

    // retry simples
    if (attempt < SEND_RETRY_LIMIT) {
      await new Promise(r => setTimeout(r, 1000 * attempt)); // backoff
      return safeSendMessage(chatId, text, options, attempt + 1);
    }

    return false;
  }
}

// remove usuário do contatos.json por chatId
function removeUserById(chatId) {
  const data = readData();
  const before = data.users.length;
  data.users = data.users.filter(u => u.chatId !== chatId);
  writeData(data);
  if (inactivityTimers[chatId]) { clearTimeout(inactivityTimers[chatId]); delete inactivityTimers[chatId]; }
  if (lastPromoSent[chatId]) delete lastPromoSent[chatId];
  console.log(`[REMOVE] usuário ${chatId} removido. Antes: ${before}, Depois: ${data.users.length}`);
}

// reinicia timer de follow-up
function resetInactivityTimer(chatId) {
  const hours = parseInt(process.env.INACTIVITY_HOURS || "3", 10);
  if (inactivityTimers[chatId]) clearTimeout(inactivityTimers[chatId]);
  inactivityTimers[chatId] = setTimeout(() => enviarFollowUp(chatId), hours * 60 * 60 * 1000);
}

// follow up com botões que abrem links de pagamento
function enviarFollowUp(chatId) {
  const data = readData();
  const user = data.users.find(u => u.chatId === chatId) || { lang: "pt" };
  const lang = user.lang || "pt";
  const text = t(lang, "followup_text");
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "R$ 10 → 7 dias", url: PAYMENT_LINKS["plano_brl_7d"] }],
        [{ text: "R$ 20 → 15 dias", url: PAYMENT_LINKS["plano_brl_15d"] }],
        [{ text: "R$ 49,90 → Vitalício", url: PAYMENT_LINKS["plano_brl_vita"] }]
      ]
    }
  };
  safeSendMessage(chatId, text, keyboard);
}

// reconquista (mensagem leve)
function reconquista(chatId) {
  safeSendMessage(chatId, "Oi amorzinho 💖, tô esperando você no meu grupo VIP 😘🔥. Não vai perder essa chance de me ver ainda mais pertinho? 💦✨");
}

// texto amigável para plano
function getPlanHumanText(planKey) {
  if (PRICE_LABELS[planKey]) return `Você escolheu o pacote de ${PRICE_LABELS[planKey]} ✅`;
  const m = (planKey || "").match(/(\d+(\.\d+)?)/);
  if (m) return `Você escolheu o pacote de ${m[1]} ✅`;
  return "Você escolheu um pacote ✅";
}

// ordena usuários e envia relatório diário ao admin
function dailyOrganizeAndNotify() {
  const data = readData();
  data.users.sort((a, b) => new Date(b.lastContact) - new Date(a.lastContact));
  writeData(data);
  const total = data.users.length;
  const paid = data.users.filter(u => u.paid).length;
  const last10 = data.users.slice(0, 10).map(u => `${u.username} — last: ${u.lastContact}`).join("\n") || "Nenhum";
  const msg = `📊 Resumo diário de usuários:\nTotal: ${total}\nPagantes: ${paid}\nÚltimos contatos:\n${last10}`;
  safeSendMessage(ADMIN_ID, msg);
}

// ====== PROMOÇÃO E BROADCAST ======
async function broadcastPromo(priceAmount, promoTitle, promoDetails) {
  const data = readData();
  const users = data.users || [];
  const amount = priceAmount;
  const paypalLink = `https://paypal.me/thaliatopai/${amount}`;
  const promoText = `🔥 Promoção quente, meu amor! 🔥\n📸 ${promoTitle}\n💵 Preço: ${amount}\n✨ ${promoDetails} 😍`;

  let sentCount = 0;
  const now = Date.now();

  // registra promo no arquivo
  data.promos = data.promos || [];
  data.promos.push({ title: promoTitle, amount, details: promoDetails, date: new Date().toISOString() });
  writeData(data);

  for (const u of users) {
    try {
      // pular pagantes
      if (u.paid) continue;

      // cooldown por usuário
      const lastSent = lastPromoSent[u.chatId];
      if (lastSent && now - lastSent < PROMO_COOLDOWN_MS) continue;

      // envia fotos (se existirem)
      if (fotos.length > 0) {
        const mediaGroup = fotos.filter(f => fs.existsSync(f)).map(f => ({ type: "photo", media: f }));
        if (mediaGroup.length > 0) {
          // nota: node-telegram-bot-api aceita file path strings directly in mediaGroup
          await bot.sendMediaGroup(u.chatId, mediaGroup).catch(e => console.warn(`[PROMO][media] erro:`, e && e.message));
        }
      }

      // keyboard com link
      const keyboard = {
        reply_markup: { inline_keyboard: [[{ text: `Comprar — ${promoTitle} — ${amount}`, url: paypalLink }]] }
      };

      const ok = await safeSendMessage(u.chatId, promoText, keyboard);
      if (ok) {
        sentCount++;
        lastPromoSent[u.chatId] = now;
        resetInactivityTimer(u.chatId);
      }
    } catch (e) {
      console.error("[PROMO] erro enviando para", u.chatId, e && e.message);
    }
  }

  safeSendMessage(ADMIN_ID, (LANG.pt.promo_sent_admin)(sentCount)); // admin em pt por padrão
}

// versão que tenta enviar promo e faz retry básico
async function enviarPromocao() {
  try {
    // envia uma mensagem simples para quem não pagou (ex: "tem novidades")
    const data = readData();
    const now = Date.now();
    for (const u of data.users) {
      try {
        if (u.paid) continue;
        const lastSent = lastPromoSent[u.chatId];
        if (lastSent && now - lastSent < PROMO_COOLDOWN_MS) continue;

        if (fotos.length > 0) {
          const mediaGroup = fotos.filter(f => fs.existsSync(f)).map(f => ({ type: "photo", media: f }));
          if (mediaGroup.length > 0) await bot.sendMediaGroup(u.chatId, mediaGroup).catch(() => { /* ignore */ });
        }

        const ok = await safeSendMessage(u.chatId, "💖 Olá amorzinho! Tem novidades quentes no meu VIP 🔥😏. Aproveita para garantir seu acesso agora 💕");
        if (ok) {
          lastPromoSent[u.chatId] = now;
        }
      } catch (e) {
        // se falhar para esse usuário, tenta novamente uma vez (safeSendMessage já faz retry)
        console.warn("[PROMO_SEND] erro para", u.chatId, e && e.message);
      }
    }
  } catch (e) {
    console.error("[ENVIAR_PROMO] erro geral:", e && e.message);
  }
}

// ======= HANDLERS DO BOT =======

// /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || "SemUsername";
  saveUser(chatId, username);
  // envia fotos e GIF
  try {
    for (const f of fotos) if (fs.existsSync(f)) bot.sendPhoto(chatId, fs.createReadStream(f));
    if (fs.existsSync(gifPath)) bot.sendAnimation(chatId, fs.createReadStream(gifPath));
  } catch (e) { /* ignore */ }

  // mensagem de boas-vindas + escolha de idioma + botão namorar
  const user = readData().users.find(u => u.chatId === chatId) || { lang: "pt" };
  safeSendMessage(chatId, t(user.lang, "welcome"));
  safeSendMessage(chatId, t(user.lang, "choose_lang"), makeLangKeyboard());
  safeSendMessage(chatId, "Quer algo mais íntimo? 💘", getNamorarKeyboard());
});

// mensagens livres
bot.on("message", async (msg) => {
  if (!msg || !msg.chat) return;
  const chatId = msg.chat.id;
  const text = msg.text || "";
  if (!text) return;

  // ADMIN commands (apenas pelo ADMIN_ID)
  if (chatId === ADMIN_ID) {
    // /menu
    if (text.startsWith("/menu")) {
      const data = readData();
      const total = data.users.length;
      const paid = data.users.filter(u => u.paid).length;
      const recent = data.users.slice(-20).reverse().map(u => `${u.username} — ${u.chatId} — last: ${u.lastContact}`).join("\n") || "Nenhum";
      return safeSendMessage(ADMIN_ID, LANG.pt.admin_menu(total, paid, recent));
    }

    // /promo <valor> <titulo> <detalhes...>
    if (text.startsWith("/promo ")) {
      const parts = text.split(/\s+/).slice(1);
      if (!parts.length) return safeSendMessage(ADMIN_ID, "Use: /promo <valor> <titulo> <detalhes...>");
      const m = parts[0].match(/(\d+(\.\d+)?)/);
      if (!m) return safeSendMessage(ADMIN_ID, "Não encontrei valor no comando.");
      const amount = m[1];
      const title = parts[1] || `${amount} reais`;
      const details = parts.slice(2).join(" ") || "";
      return broadcastPromo(amount, title, details);
    }

    // /marcarpago <chatId>
    if (text.startsWith("/marcarpago")) {
      const parts = text.split(/\s+/).slice(1);
      if (!parts.length) return safeSendMessage(ADMIN_ID, LANG.pt.marcarpago_fail);
      const id = parts[0];
      const data = readData();
      const user = data.users.find(u => String(u.chatId) === String(id));
      if (!user) return safeSendMessage(ADMIN_ID, LANG.pt.err_user_not_found);
      user.paid = true;
      writeData(data);
      return safeSendMessage(ADMIN_ID, LANG.pt.marcarpago_ok(id));
    }

    // enviar mensagem manual a um usuário: @username mensagem...
    const regex = /@(\w+)\s+([\s\S]*)/;
    const match = text.match(regex);
    if (match) {
      const username = `@${match[1]}`;
      const resposta = match[2].trim();
      const data = readData();
      const user = data.users.find(u => u.username && u.username.toLowerCase() === username.toLowerCase());
      if (user) {
        try {
          await safeSendMessage(user.chatId, resposta);
          return safeSendMessage(ADMIN_ID, `✅ Mensagem enviada para ${username}: "${resposta}"`);
        } catch {
          return safeSendMessage(ADMIN_ID, "⚠️ Erro ao enviar mensagem.");
        }
      } else return safeSendMessage(ADMIN_ID, "⚠️ Usuário não encontrado.");
    }

    // se nenhum comando, apenas ignora (ou log)
    return;
  }

  // mensagens de usuário comum
  if (text.startsWith("/")) return; // ignora comandos de usuário
  const username = msg.from.username || "SemUsername";
  saveUser(chatId, username, text);

  // resposta curta ao usuário
  safeSendMessage(chatId, t("pt", "awaiting_reply")); // usando pt por padrão — armazenamos preferência de idioma via callbacks
});

// CALLBACK QUERIES (botoes inline)
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const fromUsername = query.from.username || "SemUsername";
  const data = query.data;

  try { await bot.answerCallbackQuery(query.id); } catch { /* ignore */ }

  saveUser(chatId, fromUsername, `Clicou no botão: ${data}`);

  const voltarButton = [{ text: "🔙 Voltar", callback_data: "voltar" }];

  // voltar
  if (data === "voltar") {
    return safeSendMessage(chatId, "🌍 Escolha o idioma:", makeLangKeyboard());
  }

  // idiomas
  if (data === "lang_pt" || data === "lang_en") {
    const lang = data === "lang_pt" ? "pt" : "en";
    // setamos a preferência de idioma no usuário
    const d = readData();
    const user = d.users.find(u => u.chatId === chatId);
    if (user) {
      user.lang = lang;
      writeData(d);
    }
    // enviar mensagem com escolha de moeda na língua escolhida
    return safeSendMessage(chatId, t(lang, "choose_currency"), makeCurrencyKeyboard(lang));
  }

  // moedas
  if (data === "moeda_brl" || data === "moeda_usd" || data === "moeda_eur") {
    // mostrar planos com URLs diretas para pagamento
    return safeSendMessage(chatId, "📌 Escolha seu plano 💖:", makePlansKeyboardForCurrency(data));
  }

  // seleção de plano via callback (se alguma lógica extra fosse usada)
  if (data && data.startsWith("plano_")) {
    const link = PAYMENT_LINKS[data];
    const confirmText = getPlanHumanText(data);
    if (link) {
      // enviar texto resumo + link direto
      const formatted = (LANG.pt.payment_after_choice).replace("{link}", link);
      await safeSendMessage(chatId, `${confirmText}\n${formatted}`);
    } else {
      const num = (data.match(/(\d+(\.\d+)?)/) || [null, ""])[1];
      const paypal = num ? `https://paypal.me/thaliatopai/${num}` : "https://paypal.me/thaliatopai";
      await safeSendMessage(chatId, `${confirmText}\n💳 Pagamento: ${paypal}`);
    }
    safeSendMessage(ADMIN_ID, `💌 ${fromUsername} (ID: ${chatId}) escolheu: ${data}`);
    setTimeout(() => reconquista(chatId), 5 * 60 * 1000);
    return;
  }

  // fallback
  return safeSendMessage(chatId, "Recebi sua ação 😘");
});

// comando admin para enviar promo rápido via /promo <valor>
bot.onText(/\/promo$/, () => enviarPromocao());

// ======= INTERVALOS E SERVER =======
setInterval(() => dailyOrganizeAndNotify(), 24 * 60 * 60 * 1000); // diário
setInterval(() => enviarPromocao(), 6 * 60 * 60 * 1000); // 6h

// mantém o server caso tenha o arquivo server.js
try {
  require("./server");
} catch (e) {
  console.log("[INFO] server.js não encontrado ou falha ao require — se estiver no Render, verifique se existe ./server.js");
}

console.log("Bot iniciado com sucesso!");

// ======= FIM DO ARQUIVO =======
