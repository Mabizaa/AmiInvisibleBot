const TelegramBot = require("node-telegram-bot-api");

// ─── CONFIG ───────────────────────────────────────────────
const TOKEN = process.env.BOT_TOKEN || "REMPLACE_PAR_TON_TOKEN";
const ADMIN_ID = process.env.ADMIN_ID || "REMPLACE_PAR_TON_TELEGRAM_ID";

const bot = new TelegramBot(TOKEN, { polling: true });

// ─── BASE DE DONNÉES (en mémoire, remplacée par fichier JSON) ───
const fs = require("fs");
const DB_FILE = "./data.json";

function loadData() {
  if (!fs.existsSync(DB_FILE)) {
    return { pairs: {}, registered: {}, phase: "registration" };
  }
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function saveData(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ─── THÈMES PAR SEMAINE ───────────────────────────────────
const THEMES = {
  1: "🌱 Semaine 1 — *Découverte* : restez en surface. Partagez vos goûts, vos habitudes, ce qui vous fait sourire.",
  2: "🌿 Semaine 2 — *Affinités* : explorez vos passions, vos univers, ce qui vous anime vraiment.",
  3: "🌳 Semaine 3 — *Profondeur* : vos valeurs, vos rêves, ce qui vous a construit.",
  4: "🎁 Semaine 4 — *Révélation* : préparez votre cadeau et votre message de révélation. La soirée approche !",
};

// ─── COMMANDES ADMIN ──────────────────────────────────────

// /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const data = loadData();

  if (data.registered[chatId]) {
    bot.sendMessage(chatId, `Tu es déjà enregistré(e) dans le jeu. 🎯\nTu peux écrire à ton ami invisible directement ici.`);
    return;
  }

  bot.sendMessage(
    chatId,
    `🎁 *Bienvenue dans Amis Invisibles — DouXeur 💥✨*\n\nCe bot te permet de communiquer anonymement avec ton ami invisible pendant 4 semaines.\n\n👉 Tape /register pour t'enregistrer dans le jeu.`,
    { parse_mode: "Markdown" }
  );
});

// /register
bot.onText(/\/register (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const name = match[1].trim();
  const data = loadData();

  if (data.registered[chatId]) {
    bot.sendMessage(chatId, "Tu es déjà enregistré(e). 😊");
    return;
  }

  data.registered[chatId] = { name, chatId, pairedWith: null };
  saveData(data);

  bot.sendMessage(chatId, `✅ Enregistré(e) sous le nom *${name}* !\n\nAttends que l'organisateur lance le tirage au sort. Tu seras notifié(e) dès que ton ami invisible est assigné.`, { parse_mode: "Markdown" });
  bot.sendMessage(ADMIN_ID, `📥 Nouvel inscrit : *${name}* (ID: ${chatId})`, { parse_mode: "Markdown" });
});

// /register sans argument
bot.onText(/^\/register$/, (msg) => {
  bot.sendMessage(msg.chat.id, "👉 Utilise la commande comme ceci :\n`/register TonPrénom`", { parse_mode: "Markdown" });
});

// /pair (ADMIN uniquement) — définir les binômes manuellement
// Usage: /pair ID1 ID2
bot.onText(/\/pair (\d+) (\d+)/, (msg, match) => {
  if (String(msg.chat.id) !== String(ADMIN_ID)) {
    bot.sendMessage(msg.chat.id, "❌ Commande réservée à l'organisateur.");
    return;
  }

  const id1 = match[1];
  const id2 = match[2];
  const data = loadData();

  if (!data.registered[id1] || !data.registered[id2]) {
    bot.sendMessage(ADMIN_ID, "❌ Un des deux IDs n'est pas enregistré.");
    return;
  }

  data.registered[id1].pairedWith = id2;
  data.registered[id2].pairedWith = id1;
  data.pairs[id1] = id2;
  data.pairs[id2] = id1;
  saveData(data);

  bot.sendMessage(ADMIN_ID, `✅ Binôme créé : *${data.registered[id1].name}* ↔ *${data.registered[id2].name}*`, { parse_mode: "Markdown" });

  // Notifier les deux participants
  bot.sendMessage(id1, `🎉 Le jeu commence ! Ton ami invisible t'attend.\nTu peux lui écrire directement ici. Il/elle ne saura pas qui tu es jusqu'à la révélation. 🤫\n\n${THEMES[1]}`, { parse_mode: "Markdown" });
  bot.sendMessage(id2, `🎉 Le jeu commence ! Ton ami invisible t'attend.\nTu peux lui écrire directement ici. Il/elle ne saura pas qui tu es jusqu'à la révélation. 🤫\n\n${THEMES[1]}`, { parse_mode: "Markdown" });
});

// /list (ADMIN) — voir tous les inscrits
bot.onText(/\/list/, (msg) => {
  if (String(msg.chat.id) !== String(ADMIN_ID)) return;

  const data = loadData();
  const registered = Object.values(data.registered);

  if (registered.length === 0) {
    bot.sendMessage(ADMIN_ID, "Aucun inscrit pour l'instant.");
    return;
  }

  const list = registered
    .map((p, i) => `${i + 1}. ${p.name} — ID: ${p.chatId} — Binôme: ${p.pairedWith ? data.registered[p.pairedWith]?.name : "non assigné"}`)
    .join("\n");

  bot.sendMessage(ADMIN_ID, `📋 *Participants inscrits :*\n\n${list}`, { parse_mode: "Markdown" });
});

// /theme N (ADMIN) — envoyer le thème de la semaine à tous
bot.onText(/\/theme (\d)/, (msg, match) => {
  if (String(msg.chat.id) !== String(ADMIN_ID)) return;

  const week = match[1];
  const theme = THEMES[week];

  if (!theme) {
    bot.sendMessage(ADMIN_ID, "Semaine invalide. Utilise /theme 1, /theme 2, /theme 3 ou /theme 4");
    return;
  }

  const data = loadData();
  const participants = Object.values(data.registered);

  participants.forEach((p) => {
    bot.sendMessage(p.chatId, `📅 *Nouveau thème de la semaine :*\n\n${theme}`, { parse_mode: "Markdown" });
  });

  bot.sendMessage(ADMIN_ID, `✅ Thème semaine ${week} envoyé à ${participants.length} participants.`);
});

// /signal — signaler une infraction
bot.onText(/\/signal (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const data = loadData();
  const participant = data.registered[chatId];
  const message = match[1].trim();

  if (!participant) {
    bot.sendMessage(chatId, "Tu n'es pas enregistré(e) dans le jeu.");
    return;
  }

  bot.sendMessage(
    ADMIN_ID,
    `🚨 *Signalement reçu*\n\nDe : Participant anonyme\nMessage : ${message}`,
    { parse_mode: "Markdown" }
  );

  bot.sendMessage(chatId, "✅ Ton signalement a été transmis à l'organisateur de manière anonyme. Merci.");
});

// /reveal (ADMIN) — révéler tous les binômes
bot.onText(/\/reveal/, (msg) => {
  if (String(msg.chat.id) !== String(ADMIN_ID)) return;

  const data = loadData();
  const done = new Set();

  Object.entries(data.pairs).forEach(([id1, id2]) => {
    if (done.has(id1) || done.has(id2)) return;
    done.add(id1);
    done.add(id2);

    const name1 = data.registered[id1]?.name || "Inconnu";
    const name2 = data.registered[id2]?.name || "Inconnu";

    bot.sendMessage(id1, `🎉 *La révélation est arrivée !*\n\nTon ami invisible était... *${name2}* ! 🎁\n\nMerci d'avoir joué. On espère que ce mois a été beau. 🖤`, { parse_mode: "Markdown" });
    bot.sendMessage(id2, `🎉 *La révélation est arrivée !*\n\nTon ami invisible était... *${name1}* ! 🎁\n\nMerci d'avoir joué. On espère que ce mois a été beau. 🖤`, { parse_mode: "Markdown" });
  });

  bot.sendMessage(ADMIN_ID, "✅ Révélation envoyée à tous les binômes.");
});

// ─── RELAIS DE MESSAGES ───────────────────────────────────
bot.on("message", (msg) => {
  const chatId = msg.chat.id;

  // Ignorer les commandes
  if (msg.text && msg.text.startsWith("/")) return;

  const data = loadData();
  const participant = data.registered[chatId];

  if (!participant) {
    bot.sendMessage(chatId, "👉 Tape /start pour commencer.");
    return;
  }

  if (!participant.pairedWith) {
    bot.sendMessage(chatId, "⏳ Le tirage n'a pas encore eu lieu. Patiente encore un peu... 🎯");
    return;
  }

  const partnerId = participant.pairedWith;

  // Relais texte
  if (msg.text) {
    bot.sendMessage(partnerId, `💌 *Message de ton ami invisible :*\n\n${msg.text}`, { parse_mode: "Markdown" });
    bot.sendMessage(chatId, "✅ Message transmis anonymement. 🤫");
    return;
  }

  // Relais photo
  if (msg.photo) {
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    bot.sendPhoto(partnerId, fileId, { caption: "📸 Photo de ton ami invisible 🤫" });
    bot.sendMessage(chatId, "✅ Photo transmise anonymement. 🤫");
    return;
  }

  // Relais vocal
  if (msg.voice) {
    bot.sendVoice(partnerId, msg.voice.file_id, { caption: "🎙️ Vocal de ton ami invisible 🤫" });
    bot.sendMessage(chatId, "✅ Vocal transmis anonymement. 🤫");
    return;
  }

  // Relais sticker
  if (msg.sticker) {
    bot.sendSticker(partnerId, msg.sticker.file_id);
    bot.sendMessage(chatId, "✅ Sticker transmis. 🤫");
    return;
  }

  bot.sendMessage(chatId, "⚠️ Type de message non supporté pour l'instant. Envoie du texte, une photo ou un vocal.");
});

console.log("🤖 AmiInvisibleBot is running...");
