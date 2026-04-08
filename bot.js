const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

const TOKEN = process.env.BOT_TOKEN || "REMPLACE_PAR_TON_TOKEN";
const MAIN_ADMIN = process.env.ADMIN_ID || "REMPLACE_PAR_TON_ID";
const DB_FILE = "./data.json";

const bot = new TelegramBot(TOKEN, { polling: true });

// ─── TEXTES PAR DÉFAUT ────────────────────────────────────
const DEFAULT_TEXTS = {
  bienvenue: `🎁 *Amis Invisibles — DouXeur 💥✨*

Le principe est simple : pendant *4 semaines*, tu vas prendre soin d'une personne que tu ne connais pas encore — ton ami(e) invisible. Tu lui envoies des messages, des attentions, des cadeaux... sans jamais révéler qui tu es.

À la fin des 4 semaines, la révélation : tout le monde découvre qui était son ami invisible. 🎉

Chaque semaine, un *thème* et des *défis* te seront envoyés pour guider tes échanges.`,

  regles: `📋 *Les règles du jeu*

✅ *Ce qu'on fait :*
— Prendre soin de son ami invisible avec sincérité
— Communiquer via ce bot uniquement (anonymat garanti)
— Participer aux défis et thèmes hebdomadaires
— Offrir un cadeau à la révélation

🚫 *Ce qu'on évite absolument :*
— Pas de drague ni propositions déplacées
— Pas de questions pour identifier l'autre
— Pas de rendez-vous avant la révélation
— Pas d'inactivité totale

⚠️ *Sanctions :*
En cas d'infraction, signale via /signal. Une infraction grave = exclusion du jeu.

🗓️ *Durée :* 4 semaines
👫 *Binômes :* toujours 1 homme + 1 femme
🎭 *Anonymat total* jusqu'à la révélation finale`,

  confirmation: `✅ *Inscription confirmée !*

🎭 Ton pseudo anonyme est : *{pseudo}*

Ton vrai nom sera révélé uniquement à la fin du jeu lors de la soirée de révélation. 🎉

📅 Chaque semaine, tu recevras un *thème* et des *défis* pour guider tes échanges avec ton ami invisible.

⏳ Patiente le temps que le tirage soit effectué. Tu seras notifié(e) dès que ton ami invisible t'est attribué. 🎁`,
};

// ─── BASE DE DONNÉES ──────────────────────────────────────
function loadData() {
  if (!fs.existsSync(DB_FILE)) {
    return {
      registered: {}, pairs: {}, pending: {},
      admins: [String(MAIN_ADMIN)],
      reports: [], customChallenges: [],
      texts: { ...DEFAULT_TEXTS },
    };
  }
  const data = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  if (!data.admins) data.admins = [String(MAIN_ADMIN)];
  if (!data.reports) data.reports = [];
  if (!data.customChallenges) data.customChallenges = [];
  if (!data.pending) data.pending = {};
  if (!data.texts) data.texts = { ...DEFAULT_TEXTS };
  // S'assurer que tous les textes par défaut existent
  Object.keys(DEFAULT_TEXTS).forEach(k => {
    if (!data.texts[k]) data.texts[k] = DEFAULT_TEXTS[k];
  });
  return data;
}

function saveData(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function isAdmin(chatId) {
  const data = loadData();
  return data.admins.includes(String(chatId));
}

function getText(key) {
  const data = loadData();
  return data.texts[key] || DEFAULT_TEXTS[key] || "";
}

// ─── PSEUDOS ──────────────────────────────────────────────
const NOMS_MASCULINS = [
  "Lorenzo","Matteo","Leonardo","Marco","Luca","Giovanni","Antonio","Francesco","Alessandro","Gabriele",
  "Carlos","Miguel","Diego","Pablo","Alejandro","Javier","Rafael","Andrés","Sergio","Rodrigo",
  "Gabriel","Lucas","Mateus","Felipe","Thiago","Bruno","Eduardo","Ricardo","Henrique","Gustavo",
  "Nico","Dante","Emilio","César","Ivan","Adrián","Tomás","Víctor","Hugo","Simone",
  "Davide","Riccardo","Stefano","Claudio","Cristiano","Jorge","Manuel","Pedro","Álvaro","Fernando"
];
const NOMS_FEMININS = [
  "Sofia","Isabella","Giulia","Valentina","Chiara","Francesca","Alessia","Martina","Aurora","Giorgia",
  "Camila","Valeria","Lucia","Elena","Daniela","Paola","Andrea","Natalia","Gabriela","Mariana",
  "Beatriz","Carolina","Fernanda","Leticia","Bruna","Laura","Ana","Clara","Isabela","Juliana",
  "Carmen","Rosa","Pilar","Nadia","Claudia","Silvia","Marta","Sara","Irene","Monica",
  "Serena","Elisa","Federica","Miriam","Cristina","Paula","Raquel","Teresa","Inês","Catalina"
];

function assignPseudo(genre, username, data) {
  const pool = genre === "F" ? NOMS_FEMININS : NOMS_MASCULINS;
  const used = Object.values(data.registered).map(p => p.pseudo);
  const available = pool.filter(name => {
    if (used.includes(name)) return false;
    if (username) {
      const u = username.toLowerCase(), n = name.toLowerCase();
      if (u.includes(n.slice(0, 3)) || n.includes(u.slice(0, 3))) return false;
    }
    return true;
  });
  if (available.length === 0) return pool[Math.floor(Math.random() * pool.length)];
  return available[Math.floor(Math.random() * available.length)];
}

// ─── THÈMES ───────────────────────────────────────────────
const THEMES = {
  1: "🌱 *Semaine 1 — Découverte*\n\nRestez en surface. Partagez vos goûts, vos habitudes, ce qui vous fait sourire au quotidien.",
  2: "🌿 *Semaine 2 — Affinités*\n\nExplorez vos passions, vos univers, ce qui vous anime vraiment.",
  3: "🌳 *Semaine 3 — Profondeur*\n\nVos valeurs, vos rêves, ce qui vous a construit.",
  4: "🎁 *Semaine 4 — Révélation*\n\nPréparez votre cadeau et votre message de révélation. La soirée approche !",
};

// ─── /start ───────────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  const chatId = String(msg.chat.id);
  const data = loadData();

  if (isAdmin(chatId)) { sendAdminDashboard(chatId); return; }

  if (data.registered[chatId]) {
    const p = data.registered[chatId];
    bot.sendMessage(chatId,
      `Tu es déjà inscrit(e) sous le pseudo *${p.pseudo}*. 🎭\n\n` +
      (p.pairedWith ? `Ton ami invisible t'attend — écris-lui directement ici. 💌` : `Le tirage n'a pas encore eu lieu. Patiente... 🎯`),
      { parse_mode: "Markdown" }
    );
    return;
  }

  data.pending[chatId] = { step: "genre" };
  saveData(data);

  bot.sendMessage(chatId, `${getText("bienvenue")}\n\n---\n\n*Prêt(e) à rejoindre l'aventure ?*\n\n*Quel est ton genre ?*`, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "👨 Homme", callback_data: "genre_H" }, { text: "👩 Femme", callback_data: "genre_F" }],
        [{ text: "🌈 Autre / Non-binaire", callback_data: "genre_T" }],
      ],
    },
  });
});

// ─── CALLBACKS ────────────────────────────────────────────
bot.on("callback_query", (query) => {
  const chatId = String(query.message.chat.id);
  const data = loadData();
  const cb = query.data;
  bot.answerCallbackQuery(query.id);

  // Inscription : genre
  if (cb.startsWith("genre_")) {
    const genre = cb.split("_")[1];
    if (!data.pending[chatId]) data.pending[chatId] = {};
    data.pending[chatId].genre = genre;
    data.pending[chatId].step = "pays";
    saveData(data);
    bot.sendMessage(chatId, `🌍 *Dans quel pays vis-tu ?*\n\n_(Tape simplement le nom de ton pays)_`, { parse_mode: "Markdown" });
    return;
  }

  // Inscription : accepter règles
  if (cb === "rules_ok") {
    const pending = data.pending[chatId];
    if (!pending || pending.step !== "rules") return;
    const username = query.from.username || null;
    const pseudo = assignPseudo(pending.genre, username, data);
    data.registered[chatId] = { chatId, pseudo, realUsername: username, genre: pending.genre, pays: pending.pays, pairedWith: null, confirmed: true };
    delete data.pending[chatId];
    saveData(data);
    data.admins.forEach(adminId => {
      bot.sendMessage(adminId, `📥 *Nouvel inscrit !*\nPseudo : *${pseudo}* | Genre : ${pending.genre} | Pays : ${pending.pays}\nTotal : ${Object.keys(data.registered).length}`, { parse_mode: "Markdown" });
    });
    const confirmMsg = getText("confirmation").replace("{pseudo}", pseudo);
    bot.sendMessage(chatId, confirmMsg, { parse_mode: "Markdown" });
    return;
  }

  if (cb === "rules_refuse") {
    delete data.pending[chatId];
    saveData(data);
    bot.sendMessage(chatId, "Tu peux revenir quand tu veux en tapant /start. 🙂");
    return;
  }

  // Admin uniquement
  if (!isAdmin(chatId)) return;

  if (cb === "admin_list") { sendAdminList(chatId); return; }
  if (cb === "admin_pairs") { sendAdminPairs(chatId); return; }
  if (cb === "admin_autopair") { autoCreatePairs(chatId); return; }
  if (cb === "admin_reports") { sendAdminReports(chatId); return; }
  if (cb === "admin_back") { sendAdminDashboard(chatId); return; }

  if (cb === "admin_theme_menu") {
    bot.sendMessage(chatId, "📅 *Quel thème envoyer ?*", {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "Semaine 1 🌱", callback_data: "admin_theme_1" }, { text: "Semaine 2 🌿", callback_data: "admin_theme_2" }],
          [{ text: "Semaine 3 🌳", callback_data: "admin_theme_3" }, { text: "Semaine 4 🎁", callback_data: "admin_theme_4" }],
          [{ text: "⬅️ Retour", callback_data: "admin_back" }],
        ],
      },
    });
    return;
  }
  if (cb.startsWith("admin_theme_")) { sendThemeToAll(chatId, cb.split("_")[2]); return; }

  if (cb === "admin_challenge") {
    data.pending[chatId] = { step: "admin_challenge" };
    saveData(data);
    bot.sendMessage(chatId, "🎯 *Envoie le texte du défi à diffuser à tous :*", { parse_mode: "Markdown" });
    return;
  }

  // Édition des textes
  if (cb === "admin_edit_texts") {
    bot.sendMessage(chatId, "✏️ *Quel message modifier ?*", {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🎁 Message de bienvenue", callback_data: "edit_bienvenue" }],
          [{ text: "📋 Règles du jeu", callback_data: "edit_regles" }],
          [{ text: "✅ Message de confirmation", callback_data: "edit_confirmation" }],
          [{ text: "⬅️ Retour", callback_data: "admin_back" }],
        ],
      },
    });
    return;
  }
  if (cb.startsWith("edit_")) {
    const key = cb.replace("edit_", "");
    data.pending[chatId] = { step: "edit_text", key };
    saveData(data);
    const current = getText(key);
    const hint = key === "confirmation" ? "\n\n💡 Utilise `{pseudo}` pour insérer le pseudo attribué." : "";
    bot.sendMessage(chatId,
      `✏️ *Modifier : ${key}*\n\nTexte actuel :\n\n${current}\n\n---\nEnvoie le nouveau texte.${hint}`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  if (cb === "admin_reveal") {
    bot.sendMessage(chatId, "⚠️ *Confirmes-tu la révélation finale ?*\n\nCette action est irréversible.", {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "✅ Confirmer", callback_data: "admin_reveal_confirm" }, { text: "❌ Annuler", callback_data: "admin_back" }]] },
    });
    return;
  }
  if (cb === "admin_reveal_confirm") { revealAll(chatId); return; }
});

// ─── MESSAGES TEXTE ───────────────────────────────────────
bot.on("message", (msg) => {
  const chatId = String(msg.chat.id);
  if (!msg.text || msg.text.startsWith("/")) return;
  const data = loadData();
  const pending = data.pending[chatId];

  // Inscription : pays
  if (pending && pending.step === "pays") {
    pending.pays = msg.text.trim();
    pending.step = "rules";
    saveData(data);
    bot.sendMessage(chatId, `${getText("regles")}\n\n---\n\n*Tu as bien lu et compris les règles ?*`, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "✅ J'ai compris et j'accepte", callback_data: "rules_ok" }, { text: "❌ Je refuse", callback_data: "rules_refuse" }]] },
    });
    return;
  }

  // Admin : défi
  if (pending && pending.step === "admin_challenge" && isAdmin(chatId)) {
    const challenge = msg.text.trim();
    const registered = Object.values(data.registered);
    registered.forEach(p => bot.sendMessage(p.chatId, `🎯 *Défi de la semaine !*\n\n${challenge}`, { parse_mode: "Markdown" }));
    delete data.pending[chatId];
    data.customChallenges.push({ text: challenge, date: new Date().toISOString() });
    saveData(data);
    bot.sendMessage(chatId, `✅ Défi envoyé à ${registered.length} participant(s).`);
    sendAdminDashboard(chatId);
    return;
  }

  // Admin : édition texte
  if (pending && pending.step === "edit_text" && isAdmin(chatId)) {
    const key = pending.key;
    data.texts[key] = msg.text.trim();
    delete data.pending[chatId];
    saveData(data);
    bot.sendMessage(chatId, `✅ *Message "${key}" mis à jour avec succès !*`, { parse_mode: "Markdown" });
    sendAdminDashboard(chatId);
    return;
  }

  // Relais messages
  const participant = data.registered[chatId];
  if (!participant) { bot.sendMessage(chatId, "👉 Tape /start pour t'inscrire au jeu."); return; }
  if (!participant.pairedWith) { bot.sendMessage(chatId, "⏳ Le tirage n'a pas encore eu lieu. Patiente... 🎯"); return; }
  bot.sendMessage(participant.pairedWith, `📨\n\n${msg.text}`);
  bot.sendMessage(chatId, "✅");
});

// ─── RELAIS MEDIA ─────────────────────────────────────────
function relayMedia(msg, type) {
  const chatId = String(msg.chat.id);
  const data = loadData();
  const p = data.registered[chatId];
  if (!p || !p.pairedWith) return;
  try {
    if (type === "photo") bot.sendPhoto(p.pairedWith, msg.photo[msg.photo.length - 1].file_id, { caption: "📨" });
    else if (type === "voice") bot.sendVoice(p.pairedWith, msg.voice.file_id, { caption: "📨" });
    else if (type === "sticker") bot.sendSticker(p.pairedWith, msg.sticker.file_id);
    else if (type === "video") bot.sendVideo(p.pairedWith, msg.video.file_id, { caption: "📨" });
    bot.sendMessage(chatId, "✅");
  } catch (e) { bot.sendMessage(chatId, "⚠️ Erreur lors de l'envoi. Réessaie."); }
}

bot.on("photo", (msg) => relayMedia(msg, "photo"));
bot.on("voice", (msg) => relayMedia(msg, "voice"));
bot.on("sticker", (msg) => relayMedia(msg, "sticker"));
bot.on("video", (msg) => relayMedia(msg, "video"));

// ─── /signal ──────────────────────────────────────────────
bot.onText(/\/signal (.+)/, (msg, match) => {
  const chatId = String(msg.chat.id);
  const data = loadData();
  if (!data.registered[chatId]) { bot.sendMessage(chatId, "Tu n'es pas inscrit(e) dans le jeu."); return; }
  const message = match[1].trim();
  data.reports.push({ message, date: new Date().toISOString() });
  saveData(data);
  data.admins.forEach(adminId => bot.sendMessage(adminId, `🚨 *Signalement*\n\n${message}`, { parse_mode: "Markdown" }));
  bot.sendMessage(chatId, "✅ Signalement transmis anonymement.");
});

// ─── /addadmin ────────────────────────────────────────────
bot.onText(/\/addadmin (\d+)/, (msg, match) => {
  const chatId = String(msg.chat.id);
  if (chatId !== String(MAIN_ADMIN)) { bot.sendMessage(chatId, "❌ Réservé à l'admin principal."); return; }
  const newAdmin = match[1];
  const data = loadData();
  if (!data.admins.includes(newAdmin)) {
    data.admins.push(newAdmin);
    saveData(data);
    bot.sendMessage(chatId, `✅ Admin ajouté : ${newAdmin}`);
    bot.sendMessage(newAdmin, `🎉 Tu as été ajouté(e) comme admin du bot Amis Invisibles !\n\nTape /start pour accéder au dashboard.`);
  } else {
    bot.sendMessage(chatId, "Cet ID est déjà admin.");
  }
});

// ─── FONCTIONS ADMIN ──────────────────────────────────────
function sendAdminDashboard(chatId) {
  const data = loadData();
  const total = Object.keys(data.registered).length;
  const h = Object.values(data.registered).filter(p => p.genre === "H").length;
  const f = Object.values(data.registered).filter(p => p.genre === "F").length;
  const paires = Math.floor(Object.keys(data.pairs).length / 2);
  bot.sendMessage(chatId,
    `🎛️ *Dashboard Admin*\n\n👥 Inscrits : *${total}* (${h}H / ${f}F)\n👫 Binômes : *${paires}*\n🚨 Signalements : *${data.reports.length}*`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "👥 Inscrits", callback_data: "admin_list" }, { text: "👫 Binômes", callback_data: "admin_pairs" }],
          [{ text: "📅 Thème", callback_data: "admin_theme_menu" }, { text: "🎯 Défi", callback_data: "admin_challenge" }],
          [{ text: "✏️ Modifier les messages", callback_data: "admin_edit_texts" }],
          [{ text: "🚨 Signalements", callback_data: "admin_reports" }, { text: "🎉 Révélation", callback_data: "admin_reveal" }],
        ],
      },
    }
  );
}

function sendAdminList(chatId) {
  const data = loadData();
  const list = Object.values(data.registered);
  if (list.length === 0) { bot.sendMessage(chatId, "Aucun inscrit pour l'instant."); return; }
  const text = list.map((p, i) => `${i + 1}. *${p.pseudo}* — ${p.genre} — ${p.pays} — ${p.pairedWith ? "✅" : "⏳"}`).join("\n");
  bot.sendMessage(chatId, `📋 *Participants (${list.length}) :*\n\n${text}`, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "admin_back" }]] }
  });
}

function sendAdminPairs(chatId) {
  const data = loadData();
  const unpaired = Object.values(data.registered).filter(p => !p.pairedWith);
  const h = unpaired.filter(p => p.genre === "H").length;
  const f = unpaired.filter(p => p.genre === "F").length;
  const paires = Math.floor(Object.keys(data.pairs).length / 2);
  const canPair = h > 0 && f > 0;
  bot.sendMessage(chatId,
    `👫 *Binômes*\n\nSans binôme : *${unpaired.length}* (${h}H / ${f}F)\nActifs : *${paires}*\n\n${canPair ? `✅ Tirage possible : ${Math.min(h, f)} binôme(s)` : "⚠️ Besoin d'au moins 1H + 1F"}`,
    {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "🎲 Lancer le tirage", callback_data: "admin_autopair" }], [{ text: "⬅️ Retour", callback_data: "admin_back" }]] },
    }
  );
}

function autoCreatePairs(chatId) {
  const data = loadData();
  const hommes = Object.values(data.registered).filter(p => p.genre === "H" && !p.pairedWith);
  const femmes = Object.values(data.registered).filter(p => p.genre === "F" && !p.pairedWith);
  if (!hommes.length || !femmes.length) { bot.sendMessage(chatId, "❌ Pas assez de participants."); return; }
  const shuffle = arr => arr.sort(() => Math.random() - 0.5);
  shuffle(hommes); shuffle(femmes);
  const count = Math.min(hommes.length, femmes.length);
  for (let i = 0; i < count; i++) {
    const h = hommes[i], f = femmes[i];
    data.registered[h.chatId].pairedWith = f.chatId;
    data.registered[f.chatId].pairedWith = h.chatId;
    data.pairs[h.chatId] = f.chatId;
    data.pairs[f.chatId] = h.chatId;
    const notif = `🎉 *Le jeu commence !*\n\nTon ami invisible t'attend. Écris-lui directement ici — ton identité restera secrète jusqu'à la révélation. 🤫\n\n${THEMES[1]}`;
    bot.sendMessage(h.chatId, notif, { parse_mode: "Markdown" });
    bot.sendMessage(f.chatId, notif, { parse_mode: "Markdown" });
  }
  saveData(data);
  bot.sendMessage(chatId, `✅ *${count} binôme(s) créé(s) !*`, { parse_mode: "Markdown" });
  sendAdminDashboard(chatId);
}

function sendThemeToAll(chatId, week) {
  const theme = THEMES[week]; if (!theme) return;
  const data = loadData();
  Object.values(data.registered).forEach(p => bot.sendMessage(p.chatId, `📅 *Thème de la semaine :*\n\n${theme}`, { parse_mode: "Markdown" }));
  bot.sendMessage(chatId, `✅ Thème S${week} envoyé.`);
  sendAdminDashboard(chatId);
}

function sendAdminReports(chatId) {
  const data = loadData();
  if (!data.reports.length) { bot.sendMessage(chatId, "Aucun signalement. ✅"); return; }
  const text = data.reports.map((r, i) => `${i + 1}. ${r.message}\n_${new Date(r.date).toLocaleString("fr-FR")}_`).join("\n\n");
  bot.sendMessage(chatId, `🚨 *Signalements :*\n\n${text}`, { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour", callback_data: "admin_back" }]] } });
}

function revealAll(chatId) {
  const data = loadData();
  const done = new Set(); let count = 0;
  Object.entries(data.pairs).forEach(([id1, id2]) => {
    if (done.has(id1) || done.has(id2)) return;
    done.add(id1); done.add(id2);
    const p1 = data.registered[id1], p2 = data.registered[id2];
    if (!p1 || !p2) return;
    const r1 = p2.realUsername ? `@${p2.realUsername}` : p2.pseudo;
    const r2 = p1.realUsername ? `@${p1.realUsername}` : p1.pseudo;
    bot.sendMessage(id1, `🎉 *La révélation est arrivée !*\n\nTon ami invisible était... *${r1}* ! 🎁\n\nMerci d'avoir joué. 🖤`, { parse_mode: "Markdown" });
    bot.sendMessage(id2, `🎉 *La révélation est arrivée !*\n\nTon ami invisible était... *${r2}* ! 🎁\n\nMerci d'avoir joué. 🖤`, { parse_mode: "Markdown" });
    count++;
  });
  bot.sendMessage(chatId, `✅ Révélation envoyée à ${count} binôme(s). 🎊`);
}

console.log("🤖 AmiInvisibleBot v3 is running...");
