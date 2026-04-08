const TelegramBot = require("node-telegram-bot-api");
const mongoose = require("mongoose");

// ─── CONFIG ───────────────────────────────────────────────
const TOKEN = process.env.BOT_TOKEN || "REMPLACE";
const MAIN_ADMIN = process.env.ADMIN_ID || "REMPLACE";
const MONGODB_URI = process.env.MONGODB_URI || "REMPLACE";

// ─── MONGOOSE SCHEMAS ─────────────────────────────────────
const participantSchema = new mongoose.Schema({
  chatId: { type: String, unique: true },
  pseudo: String,
  realUsername: String,
  genre: String,
  pays: String,
  pairedWith: { type: String, default: null },
  confirmed: { type: Boolean, default: false },
});

const configSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  value: mongoose.Schema.Types.Mixed,
});

const reportSchema = new mongoose.Schema({
  message: String,
  date: { type: Date, default: Date.now },
});

const challengeSchema = new mongoose.Schema({
  text: String,
  submittedBy: String,
  approved: { type: Boolean, default: false },
  date: { type: Date, default: Date.now },
});

const giftSchema = new mongoose.Schema({
  code: { type: String, unique: true },
  fromId: String,
  toId: String,
  description: String,
  photoFileId: { type: String, default: null },
  status: { type: String, default: "pending" }, // pending / received / delivered / problem
  date: { type: Date, default: Date.now },
});

const pendingSchema = new mongoose.Schema({
  chatId: { type: String, unique: true },
  data: mongoose.Schema.Types.Mixed,
});

const Participant = mongoose.model("Participant", participantSchema);
const Config = mongoose.model("Config", configSchema);
const Report = mongoose.model("Report", reportSchema);
const Challenge = mongoose.model("Challenge", challengeSchema);
const Gift = mongoose.model("Gift", giftSchema);
const Pending = mongoose.model("Pending", pendingSchema);

// ─── CONFIG HELPERS ───────────────────────────────────────
async function getConfig(key, defaultValue = null) {
  const doc = await Config.findOne({ key });
  return doc ? doc.value : defaultValue;
}

async function setConfig(key, value) {
  await Config.findOneAndUpdate({ key }, { value }, { upsert: true });
}

async function getPending(chatId) {
  const doc = await Pending.findOne({ chatId });
  return doc ? doc.data : null;
}

async function setPending(chatId, data) {
  await Pending.findOneAndUpdate({ chatId }, { data }, { upsert: true });
}

async function clearPending(chatId) {
  await Pending.deleteOne({ chatId });
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

async function assignPseudo(genre, username) {
  const pool = genre === "F" ? NOMS_FEMININS : NOMS_MASCULINS;
  const existing = await Participant.find({}, "pseudo");
  const used = existing.map(p => p.pseudo);
  const available = pool.filter(name => {
    if (used.includes(name)) return false;
    if (username) {
      const u = username.toLowerCase();
      const n = name.toLowerCase();
      if (u.includes(n.slice(0,3)) || n.includes(u.slice(0,3))) return false;
    }
    return true;
  });
  if (available.length === 0) return pool[Math.floor(Math.random() * pool.length)];
  return available[Math.floor(Math.random() * available.length)];
}

function generateGiftCode() {
  const animals = ["LION","TIGRE","AIGLE","LOUP","PANDA","COBRA","BISON","CERF","LYNX","OURS"];
  const colors = ["BLEU","ROUGE","VERT","GOLD","NOIR","ROSE","GRIS","JADE","RUBY","AZUR"];
  const num = Math.floor(Math.random() * 90) + 10;
  return `${animals[Math.floor(Math.random()*animals.length)]}-${num}-${colors[Math.floor(Math.random()*colors.length)]}`;
}

// ─── TEXTES ───────────────────────────────────────────────
const PRINCIPE = `🎁 *Amis Invisibles — DouXeur 💥✨*

Le principe est simple : pendant *4 semaines*, tu vas prendre soin d'une personne que tu ne connais pas encore — ton ami(e) invisible. Tu lui envoies des messages, des attentions, des cadeaux... sans jamais révéler qui tu es.

À la fin des 4 semaines, la révélation : tout le monde découvre qui était son ami invisible. 🎉

Chaque semaine, un *thème* et des *défis* te seront envoyés pour guider tes échanges.`;

const REGLES = `📋 *Les règles du jeu*

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
🎭 *Anonymat total* jusqu'à la révélation finale`;

const DEFAULT_THEMES = {
  1: "🌱 *Semaine 1 — Découverte*\n\nRestez en surface. Partagez vos goûts, vos habitudes, ce qui vous fait sourire.",
  2: "🌿 *Semaine 2 — Affinités*\n\nExplorez vos passions, vos univers, ce qui vous anime vraiment.",
  3: "🌳 *Semaine 3 — Profondeur*\n\nVos valeurs, vos rêves, ce qui vous a construit.",
  4: "🎁 *Semaine 4 — Révélation*\n\nPréparez votre cadeau et votre message de révélation. La soirée approche !"
};

// ─── BOT INIT ─────────────────────────────────────────────
const bot = new TelegramBot(TOKEN, { polling: true });

bot.setMyCommands([
  { command: "start", description: "Démarrer / Voir mon statut" },
  { command: "cadeau", description: "Envoyer un cadeau à ton ami invisible" },
  { command: "signal", description: "Signaler une infraction anonymement" },
  { command: "help", description: "Aide et informations" },
]);

// ─── REPLY KEYBOARDS ──────────────────────────────────────
const participantKeyboard = {
  keyboard: [
    [{ text: "📊 Mon statut" }, { text: "🎁 Envoyer cadeau" }, { text: "🚨 Signaler" }],
    [{ text: "❓ Aide" }],
  ],
  resize_keyboard: true,
  persistent: true,
};

const adminKeyboard = {
  keyboard: [
    [{ text: "👥 Inscrits" }, { text: "👫 Binômes" }, { text: "📅 Thèmes" }],
    [{ text: "🎯 Défi" }, { text: "🚨 Signalements" }, { text: "🎉 Révélation" }],
    [{ text: "🎮 Lancer jeu" }],
  ],
  resize_keyboard: true,
  persistent: true,
};

const douxeurKeyboard = {
  keyboard: [
    [{ text: "📦 Cadeaux en attente" }, { text: "✅ Cadeau reçu" }, { text: "🎁 Cadeau remis" }],
    [{ text: "⚠️ Problème cadeau" }],
  ],
  resize_keyboard: true,
  persistent: true,
};

// ─── HELPERS ──────────────────────────────────────────────
async function isAdmin(chatId) {
  const admins = await getConfig("admins", [String(MAIN_ADMIN)]);
  return admins.includes(String(chatId));
}

async function isDouxeur(chatId) {
  const douxeurId = await getConfig("douxeurId", null);
  return douxeurId && String(douxeurId) === String(chatId);
}

async function getAdmins() {
  return await getConfig("admins", [String(MAIN_ADMIN)]);
}

async function notifyAdmins(text, options = {}) {
  const admins = await getAdmins();
  for (const adminId of admins) {
    await bot.sendMessage(adminId, text, options);
  }
}

// ─── /help ────────────────────────────────────────────────
bot.onText(/\/help|❓ Aide/, async (msg) => {
  const chatId = String(msg.chat.id);
  if (await isAdmin(chatId)) { await sendAdminDashboard(chatId); return; }
  if (await isDouxeur(chatId)) { await sendDouxeurDashboard(chatId); return; }
  bot.sendMessage(chatId,
    `ℹ️ *Aide — Amis Invisibles*\n\n` +
    `• /start — Démarrer ou voir ton statut\n` +
    `• /cadeau — Envoyer un cadeau à ton ami invisible\n` +
    `• /signal — Signaler une infraction anonymement\n` +
    `• /help — Afficher cette aide\n\n` +
    `💌 Pour écrire à ton ami invisible, envoie simplement un message ici.\n` +
    `📸 Tu peux aussi envoyer photos, vocaux, vidéos et stickers.`,
    { parse_mode: "Markdown", reply_markup: participantKeyboard }
  );
});

// ─── /start ───────────────────────────────────────────────
bot.onText(/\/start|📊 Mon statut/, async (msg) => {
  const chatId = String(msg.chat.id);

  if (await isAdmin(chatId)) { await sendAdminDashboard(chatId); return; }
  if (await isDouxeur(chatId)) { await sendDouxeurDashboard(chatId); return; }

  const participant = await Participant.findOne({ chatId });
  if (participant) {
    bot.sendMessage(chatId,
      `Tu es inscrit(e) sous le pseudo *${participant.pseudo}*. 🎭\n\n` +
      (participant.pairedWith ? `Ton ami invisible t'attend — écris-lui directement ici. 💌` : `Le tirage n'a pas encore eu lieu. Patiente... 🎯`),
      { parse_mode: "Markdown", reply_markup: participantKeyboard }
    );
    return;
  }

  await setPending(chatId, { step: "genre" });
  bot.sendMessage(chatId, `${PRINCIPE}\n\n---\n\n*Prêt(e) à rejoindre l'aventure ?*\n\n*Quel est ton genre ?*`, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "👨 Homme", callback_data: "genre_H" }, { text: "👩 Femme", callback_data: "genre_F" }],
        [{ text: "🌈 Autre / Non-binaire", callback_data: "genre_T" }],
      ],
    },
  });
});

// ─── /cadeau ──────────────────────────────────────────────
bot.onText(/\/cadeau|🎁 Envoyer cadeau/, async (msg) => {
  const chatId = String(msg.chat.id);
  const participant = await Participant.findOne({ chatId });
  if (!participant) { bot.sendMessage(chatId, "👉 Tape /start pour t'inscrire."); return; }
  if (!participant.pairedWith) { bot.sendMessage(chatId, "⏳ Le tirage n'a pas encore eu lieu."); return; }
  await setPending(chatId, { step: "cadeau_description" });
  bot.sendMessage(chatId,
    `🎁 *Envoyer un cadeau à ton ami invisible*\n\nCommençons ! Décris ton cadeau en quelques mots.\n_(ex: un livre, un parfum, une box surprise...)_`,
    { parse_mode: "Markdown" }
  );
});

// ─── CALLBACKS ────────────────────────────────────────────
bot.on("callback_query", async (query) => {
  const chatId = String(query.message.chat.id);
  const cb = query.data;
  bot.answerCallbackQuery(query.id);

  // Inscription genre
  if (cb.startsWith("genre_")) {
    const genre = cb.split("_")[1];
    await setPending(chatId, { step: "pays", genre });
    bot.sendMessage(chatId, `🌍 *Dans quel pays vis-tu ?*\n_(Tape simplement le nom de ton pays)_`, { parse_mode: "Markdown" });
    return;
  }

  // Acceptation règles
  if (cb === "rules_ok") {
    const pending = await getPending(chatId);
    if (!pending || pending.step !== "rules") return;
    const username = query.from.username || null;
    const pseudo = await assignPseudo(pending.genre, username);
    await Participant.create({ chatId, pseudo, realUsername: username, genre: pending.genre, pays: pending.pays, confirmed: true });
    await clearPending(chatId);
    const total = await Participant.countDocuments();
    await notifyAdmins(`📥 *Nouvel inscrit !*\nPseudo : *${pseudo}* | Genre : ${pending.genre} | Pays : ${pending.pays}\nTotal : ${total}`, { parse_mode: "Markdown" });
    bot.sendMessage(chatId,
      `✅ *Inscription confirmée !*\n\n🎭 Ton pseudo anonyme est : *${pseudo}*\n\nTon vrai nom sera révélé uniquement à la fin du jeu. 🎉\n\n📅 Chaque semaine tu recevras un *thème* et des *défis*.\n\n⏳ Patiente le temps que le tirage soit effectué. 🎁`,
      { parse_mode: "Markdown", reply_markup: participantKeyboard }
    );
    return;
  }

  if (cb === "rules_refuse") {
    await clearPending(chatId);
    bot.sendMessage(chatId, "Tu peux revenir quand tu veux en tapant /start. 🙂");
    return;
  }

  // Validation défi
  if (cb.startsWith("challenge_approve_")) {
    if (!await isAdmin(chatId)) return;
    const challengeId = cb.split("_")[2];
    const challenge = await Challenge.findById(challengeId);
    if (!challenge) { bot.sendMessage(chatId, "❌ Ce défi n'existe plus."); return; }
    if (String(challenge.submittedBy) === String(chatId)) {
      bot.sendMessage(chatId, "⚠️ Tu ne peux pas approuver ton propre défi.");
      return;
    }
    const participants = await Participant.find();
    for (const p of participants) {
      bot.sendMessage(p.chatId, `🎯 *Défi de la semaine !*\n\n${challenge.text}`, { parse_mode: "Markdown" });
    }
    challenge.approved = true;
    await challenge.save();
    bot.sendMessage(chatId, `✅ Défi approuvé et envoyé à ${participants.length} participant(s).`);
    bot.sendMessage(challenge.submittedBy, `✅ Ton défi a été approuvé et envoyé à tous !`);
    return;
  }

  if (cb.startsWith("challenge_reject_")) {
    if (!await isAdmin(chatId)) return;
    const challengeId = cb.split("_")[2];
    const challenge = await Challenge.findById(challengeId);
    if (!challenge) return;
    await Challenge.deleteOne({ _id: challengeId });
    bot.sendMessage(chatId, "❌ Défi refusé.");
    bot.sendMessage(challenge.submittedBy, `❌ Ton défi a été refusé.`);
    return;
  }

  // Zone admin
  if (!await isAdmin(chatId)) return;

  if (cb === "admin_list") { await sendAdminList(chatId); return; }
  if (cb === "admin_pairs") { await sendAdminPairs(chatId); return; }
  if (cb === "admin_autopair") { await autoCreatePairs(chatId); return; }
  if (cb === "admin_reports") { await sendAdminReports(chatId); return; }
  if (cb === "admin_back") { await sendAdminDashboard(chatId); return; }

  if (cb === "admin_challenge") {
    await setPending(chatId, { step: "admin_challenge" });
    bot.sendMessage(chatId, "🎯 *Envoie le texte du défi :*\n\n_(Il sera soumis à validation par un autre admin)_", { parse_mode: "Markdown" });
    return;
  }

  if (cb === "admin_theme_menu") {
    const themes = await getConfig("themes", DEFAULT_THEMES);
    bot.sendMessage(chatId, "📅 *Gérer les thèmes*\n\nEnvoyer ou modifier :", {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📤 S1", callback_data: "admin_theme_send_1" }, { text: "✏️ S1", callback_data: "admin_theme_edit_1" }],
          [{ text: "📤 S2", callback_data: "admin_theme_send_2" }, { text: "✏️ S2", callback_data: "admin_theme_edit_2" }],
          [{ text: "📤 S3", callback_data: "admin_theme_send_3" }, { text: "✏️ S3", callback_data: "admin_theme_edit_3" }],
          [{ text: "📤 S4", callback_data: "admin_theme_send_4" }, { text: "✏️ S4", callback_data: "admin_theme_edit_4" }],
          [{ text: "📝 Thème semaine prochaine", callback_data: "admin_theme_next" }],
          [{ text: "⬅️ Retour", callback_data: "admin_back" }],
        ],
      },
    });
    return;
  }

  if (cb.startsWith("admin_theme_send_")) {
    await sendThemeToAll(chatId, cb.split("_")[3]);
    return;
  }

  if (cb.startsWith("admin_theme_edit_")) {
    const week = cb.split("_")[3];
    const themes = await getConfig("themes", DEFAULT_THEMES);
    await setPending(chatId, { step: "admin_theme_edit", week });
    bot.sendMessage(chatId, `✏️ *Modifier thème Semaine ${week}*\n\nActuel :\n${themes[week]}\n\n_Envoie le nouveau texte :_`, { parse_mode: "Markdown" });
    return;
  }

  if (cb === "admin_theme_next") {
    const next = await getConfig("nextWeekTheme", null);
    await setPending(chatId, { step: "admin_theme_next" });
    bot.sendMessage(chatId, `📝 *Thème semaine prochaine*\n\nActuel : ${next || "_Non défini_"}\n\n_Envoie le nouveau thème :_`, { parse_mode: "Markdown" });
    return;
  }

  if (cb === "admin_reveal") {
    bot.sendMessage(chatId, "⚠️ *Confirmes-tu la révélation finale ?*\n\nIrréversible.", {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "✅ Confirmer", callback_data: "admin_reveal_confirm" }, { text: "❌ Annuler", callback_data: "admin_back" }]] },
    });
    return;
  }

  if (cb === "admin_reveal_confirm") { await revealAll(chatId); return; }

  if (cb === "admin_start_game") {
    await setConfig("gameStartDate", new Date().toISOString());
    await setConfig("currentWeek", 1);
    bot.sendMessage(chatId, `✅ *Jeu lancé !* Semaine 1 démarrée.\n\nLes rappels quotidiens sont actifs.`, { parse_mode: "Markdown" });
    await sendAdminDashboard(chatId);
    return;
  }

  if (cb === "admin_gifts") { await sendAdminGifts(chatId); return; }
});

// ─── MESSAGES TEXTE ───────────────────────────────────────
bot.on("message", async (msg) => {
  const chatId = String(msg.chat.id);
  if (msg.text && msg.text.startsWith("/")) return;

  const pending = await getPending(chatId);

  // ── Douxeur actions texte ──
  if (await isDouxeur(chatId)) {
    await handleDouxeurMessage(chatId, msg, pending);
    return;
  }

  // ── Inscription : pays ──
  if (pending && pending.step === "pays" && msg.text) {
    const p = { ...pending, pays: msg.text.trim(), step: "rules" };
    await setPending(chatId, p);
    bot.sendMessage(chatId, `${REGLES}\n\n---\n\n*Tu as bien lu et compris les règles ?*`, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "✅ J'ai compris et j'accepte", callback_data: "rules_ok" }, { text: "❌ Je refuse", callback_data: "rules_refuse" }]] },
    });
    return;
  }

  // ── Admin : défi ──
  if (pending && pending.step === "admin_challenge" && await isAdmin(chatId) && msg.text) {
    const text = msg.text.trim();
    const admins = await getAdmins();
    const challenge = await Challenge.create({ text, submittedBy: chatId });
    await clearPending(chatId);
    bot.sendMessage(chatId, `✅ Défi soumis ! En attente de validation par un autre admin.`);
    const otherAdmins = admins.filter(a => a !== chatId);
    if (otherAdmins.length === 0) {
      const participants = await Participant.find();
      for (const p of participants) bot.sendMessage(p.chatId, `🎯 *Défi de la semaine !*\n\n${text}`, { parse_mode: "Markdown" });
      challenge.approved = true;
      await challenge.save();
      bot.sendMessage(chatId, `✅ Tu es le seul admin — défi envoyé directement à ${participants.length} participant(s).`);
    } else {
      for (const adminId of otherAdmins) {
        bot.sendMessage(adminId, `🎯 *Nouveau défi à valider*\n\n"${text}"`, {
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [[{ text: "✅ Approuver", callback_data: `challenge_approve_${challenge._id}` }, { text: "❌ Refuser", callback_data: `challenge_reject_${challenge._id}` }]] },
        });
      }
    }
    await sendAdminDashboard(chatId);
    return;
  }

  // ── Admin : modifier thème ──
  if (pending && pending.step === "admin_theme_edit" && await isAdmin(chatId) && msg.text) {
    const themes = await getConfig("themes", DEFAULT_THEMES);
    themes[pending.week] = msg.text.trim();
    await setConfig("themes", themes);
    await clearPending(chatId);
    bot.sendMessage(chatId, `✅ Thème S${pending.week} mis à jour !`);
    await sendAdminDashboard(chatId);
    return;
  }

  // ── Admin : thème semaine prochaine ──
  if (pending && pending.step === "admin_theme_next" && await isAdmin(chatId) && msg.text) {
    await setConfig("nextWeekTheme", msg.text.trim());
    await clearPending(chatId);
    bot.sendMessage(chatId, `✅ Thème semaine prochaine enregistré !`);
    await sendAdminDashboard(chatId);
    return;
  }

  // ── Cadeau : description ──
  if (pending && pending.step === "cadeau_description" && msg.text) {
    await setPending(chatId, { ...pending, step: "cadeau_photo", description: msg.text.trim() });
    bot.sendMessage(chatId, `📸 *Envoie maintenant une photo de ton cadeau*\n\n_(Cette photo sera transmise à Douxeur pour vérification à la réception)_\n\nOu tape /skip pour ignorer la photo.`, { parse_mode: "Markdown" });
    return;
  }

  // ── Cadeau : skip photo ──
  if (msg.text === "/skip" && pending && pending.step === "cadeau_photo") {
    await finalizeCadeau(chatId, pending, null);
    return;
  }

  // ── Keyboard buttons admin ──
  if (await isAdmin(chatId) && msg.text) {
    await handleAdminKeyboard(chatId, msg.text);
    return;
  }

  // ── Relais messages ──
  const participant = await Participant.findOne({ chatId });
  if (!participant) { bot.sendMessage(chatId, "👉 Tape /start pour t'inscrire."); return; }
  if (!participant.pairedWith) { bot.sendMessage(chatId, "⏳ Le tirage n'a pas encore eu lieu. 🎯"); return; }

  if (msg.text) {
    bot.sendMessage(participant.pairedWith, `💌 *Message de ton ami invisible :*\n\n${msg.text}`, { parse_mode: "Markdown" });
    bot.sendMessage(chatId, "✅ Transmis anonymement. 🤫");
  }
});

// ─── HANDLER ADMIN KEYBOARD ───────────────────────────────
async function handleAdminKeyboard(chatId, text) {
  if (text === "👥 Inscrits") { await sendAdminList(chatId); return; }
  if (text === "👫 Binômes") { await sendAdminPairs(chatId); return; }
  if (text === "📅 Thèmes") {
    bot.emit("callback_query", { message: { chat: { id: chatId } }, data: "admin_theme_menu", id: "0", from: { username: null } });
    return;
  }
  if (text === "🎯 Défi") {
    await setPending(chatId, { step: "admin_challenge" });
    bot.sendMessage(chatId, "🎯 *Envoie le texte du défi :*", { parse_mode: "Markdown" });
    return;
  }
  if (text === "🚨 Signalements") { await sendAdminReports(chatId); return; }
  if (text === "🎉 Révélation") {
    bot.sendMessage(chatId, "⚠️ *Confirmes-tu la révélation finale ?*", {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "✅ Confirmer", callback_data: "admin_reveal_confirm" }, { text: "❌ Annuler", callback_data: "admin_back" }]] },
    });
    return;
  }
  if (text === "🎮 Lancer jeu") {
    await setConfig("gameStartDate", new Date().toISOString());
    await setConfig("currentWeek", 1);
    bot.sendMessage(chatId, `✅ *Jeu lancé !*`, { parse_mode: "Markdown", reply_markup: adminKeyboard });
    return;
  }
}

// ─── HANDLER DOUXEUR ──────────────────────────────────────
async function handleDouxeurMessage(chatId, msg, pending) {
  const text = msg.text || "";

  if (text === "📦 Cadeaux en attente") { await sendDouxeurPendingGifts(chatId); return; }

  if (text === "✅ Cadeau reçu" || (pending && pending.step === "douxeur_confirm_received")) {
    if (text === "✅ Cadeau reçu") {
      await setPending(chatId, { step: "douxeur_confirm_received" });
      bot.sendMessage(chatId, "📦 *Confirmer réception*\n\nEntre le code du cadeau reçu :", { parse_mode: "Markdown" });
      return;
    }
    if (pending && pending.step === "douxeur_confirm_received" && msg.text) {
      await confirmGiftReceived(chatId, msg.text.trim().toUpperCase());
      return;
    }
  }

  if (text === "🎁 Cadeau remis" || (pending && pending.step === "douxeur_confirm_delivered")) {
    if (text === "🎁 Cadeau remis") {
      await setPending(chatId, { step: "douxeur_confirm_delivered" });
      bot.sendMessage(chatId, "🎁 *Confirmer remise*\n\nEntre le code du cadeau remis :", { parse_mode: "Markdown" });
      return;
    }
    if (pending && pending.step === "douxeur_confirm_delivered" && msg.text) {
      await confirmGiftDelivered(chatId, msg.text.trim().toUpperCase());
      return;
    }
  }

  if (text === "⚠️ Problème cadeau" || (pending && pending.step === "douxeur_problem_code")) {
    if (text === "⚠️ Problème cadeau") {
      await setPending(chatId, { step: "douxeur_problem_code" });
      bot.sendMessage(chatId, "⚠️ *Signaler un problème*\n\nEntre le code du cadeau concerné :", { parse_mode: "Markdown" });
      return;
    }
    if (pending && pending.step === "douxeur_problem_code" && msg.text) {
      await setPending(chatId, { step: "douxeur_problem_message", code: msg.text.trim().toUpperCase() });
      bot.sendMessage(chatId, "📝 Décris le problème :");
      return;
    }
    if (pending && pending.step === "douxeur_problem_message" && msg.text) {
      await reportGiftProblem(chatId, pending.code, msg.text.trim());
      return;
    }
  }

  await sendDouxeurDashboard(chatId);
}

// ─── PHOTOS ───────────────────────────────────────────────
bot.on("photo", async (msg) => {
  const chatId = String(msg.chat.id);
  const pending = await getPending(chatId);

  // Photo cadeau
  if (pending && pending.step === "cadeau_photo") {
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    await finalizeCadeau(chatId, pending, fileId);
    return;
  }

  // Relais photo
  const participant = await Participant.findOne({ chatId });
  if (!participant || !participant.pairedWith) return;
  bot.sendPhoto(participant.pairedWith, msg.photo[msg.photo.length - 1].file_id, { caption: "📸 *Photo de ton ami invisible* 🤫", parse_mode: "Markdown" });
  bot.sendMessage(chatId, "✅ Transmis anonymement. 🤫");
});

async function finalizeCadeau(chatId, pending, photoFileId) {
  const participant = await Participant.findOne({ chatId });
  if (!participant || !participant.pairedWith) return;

  const code = generateGiftCode();
  const gift = await Gift.create({
    code,
    fromId: chatId,
    toId: participant.pairedWith,
    description: pending.description,
    photoFileId,
    status: "pending",
  });

  await clearPending(chatId);

  // Notifier Douxeur
  const douxeurId = await getConfig("douxeurId", null);
  if (douxeurId) {
    const douxeurMsg = `📦 *Nouveau cadeau en route !*\n\n🔑 Code : \`${code}\`\n📝 Description : ${pending.description}`;
    if (photoFileId) {
      bot.sendPhoto(douxeurId, photoFileId, { caption: douxeurMsg, parse_mode: "Markdown" });
    } else {
      bot.sendMessage(douxeurId, douxeurMsg, { parse_mode: "Markdown" });
    }
  }

  // Notifier admins
  await notifyAdmins(`📦 *Cadeau en route*\n\n🔑 Code : \`${code}\`\n📝 ${pending.description}`, { parse_mode: "Markdown" });

  // Notifier le destinataire
  const toParticipant = await Participant.findOne({ chatId: participant.pairedWith });
  const boutique = await getConfig("boutiqueAddress", "la boutique Douxeur");
  bot.sendMessage(participant.pairedWith,
    `🎁 *Surprise ! Un cadeau arrive pour toi !*\n\nTon ami invisible t'envoie quelque chose. 🤫\n\nRends-toi *demain* à ${boutique} et donne ce code :\n\n🔑 \`${code}\`\n\n_(Garde ce code précieusement — tu en auras besoin pour récupérer ton cadeau)_`,
    { parse_mode: "Markdown" }
  );

  bot.sendMessage(chatId,
    `✅ *Cadeau enregistré !*\n\n🔑 Code : \`${code}\`\n\nDouxeur a été notifiée. Ton ami invisible recevra son cadeau demain. 🎁`,
    { parse_mode: "Markdown" }
  );
}

// ─── FONCTIONS CADEAU DOUXEUR ─────────────────────────────
async function confirmGiftReceived(chatId, code) {
  const gift = await Gift.findOne({ code });
  if (!gift) { bot.sendMessage(chatId, `❌ Code introuvable : ${code}`); return; }
  if (gift.status !== "pending") { bot.sendMessage(chatId, `⚠️ Ce cadeau est déjà en statut : ${gift.status}`); return; }
  gift.status = "received";
  await gift.save();
  await clearPending(chatId);
  bot.sendMessage(chatId, `✅ Cadeau *${code}* marqué comme reçu en boutique.`, { parse_mode: "Markdown", reply_markup: douxeurKeyboard });
  bot.sendMessage(gift.toId, `✅ *Ton cadeau est arrivé chez Douxeur !*\n\nTu peux passer le récupérer. N'oublie pas ton code : \`${code}\``, { parse_mode: "Markdown" });
}

async function confirmGiftDelivered(chatId, code) {
  const gift = await Gift.findOne({ code });
  if (!gift) { bot.sendMessage(chatId, `❌ Code introuvable : ${code}`); return; }
  if (gift.status === "delivered") { bot.sendMessage(chatId, `⚠️ Ce cadeau a déjà été remis.`); return; }
  gift.status = "delivered";
  await gift.save();
  await clearPending(chatId);
  bot.sendMessage(chatId, `✅ Cadeau *${code}* marqué comme remis.`, { parse_mode: "Markdown", reply_markup: douxeurKeyboard });
  bot.sendMessage(gift.fromId, `🎉 *Bonne nouvelle !*\n\nTon cadeau a été remis à ton ami invisible. 🎁\n\nOn espère qu'il/elle va adorer !`, { parse_mode: "Markdown" });
}

async function reportGiftProblem(chatId, code, message) {
  const gift = await Gift.findOne({ code });
  if (!gift) { bot.sendMessage(chatId, `❌ Code introuvable : ${code}`); await clearPending(chatId); return; }
  gift.status = "problem";
  await gift.save();
  await clearPending(chatId);
  bot.sendMessage(chatId, `✅ Problème signalé pour le cadeau *${code}*.`, { parse_mode: "Markdown", reply_markup: douxeurKeyboard });
  bot.sendMessage(gift.fromId, `⚠️ *Problème avec ton cadeau*\n\nDouxeur a signalé un problème concernant ton cadeau :\n\n_"${message}"_\n\nContacte l'organisateur pour plus d'informations.`, { parse_mode: "Markdown" });
  await notifyAdmins(`⚠️ *Problème cadeau*\n\nCode : \`${code}\`\nMessage : ${message}`, { parse_mode: "Markdown" });
}

// ─── RELAIS MEDIA ─────────────────────────────────────────
async function relayMedia(msg, type) {
  const chatId = String(msg.chat.id);
  const p = await Participant.findOne({ chatId });
  if (!p || !p.pairedWith) return;
  try {
    if (type === "voice") bot.sendVoice(p.pairedWith, msg.voice.file_id, { caption: "🎙️ *Vocal de ton ami invisible* 🤫", parse_mode: "Markdown" });
    else if (type === "sticker") bot.sendSticker(p.pairedWith, msg.sticker.file_id);
    else if (type === "video") bot.sendVideo(p.pairedWith, msg.video.file_id, { caption: "🎥 *Vidéo de ton ami invisible* 🤫", parse_mode: "Markdown" });
    bot.sendMessage(chatId, "✅ Transmis anonymement. 🤫");
  } catch (e) { bot.sendMessage(chatId, "⚠️ Erreur lors de l'envoi."); }
}
bot.on("voice", (msg) => relayMedia(msg, "voice"));
bot.on("sticker", (msg) => relayMedia(msg, "sticker"));
bot.on("video", (msg) => relayMedia(msg, "video"));

// ─── /signal ──────────────────────────────────────────────
bot.onText(/\/signal (.+)|🚨 Signaler/, async (msg, match) => {
  const chatId = String(msg.chat.id);
  const participant = await Participant.findOne({ chatId });
  if (!participant) { bot.sendMessage(chatId, "Tu n'es pas inscrit(e)."); return; }
  if (match && match[1]) {
    await Report.create({ message: match[1].trim() });
    await notifyAdmins(`🚨 *Nouveau signalement*\n\n${match[1].trim()}`, { parse_mode: "Markdown" });
    bot.sendMessage(chatId, "✅ Signalement transmis anonymement.");
  } else {
    await setPending(chatId, { step: "signal" });
    bot.sendMessage(chatId, "🚨 *Signaler une infraction*\n\nDécris le problème :", { parse_mode: "Markdown" });
  }
});

// ─── /addadmin & /removeadmin ─────────────────────────────
bot.onText(/\/addadmin (\d+)/, async (msg, match) => {
  const chatId = String(msg.chat.id);
  if (chatId !== String(MAIN_ADMIN)) { bot.sendMessage(chatId, "❌ Réservé à l'admin principal."); return; }
  const newAdmin = match[1];
  const admins = await getAdmins();
  if (!admins.includes(newAdmin)) {
    admins.push(newAdmin);
    await setConfig("admins", admins);
    bot.sendMessage(chatId, `✅ Admin ajouté : ${newAdmin}`);
    bot.sendMessage(newAdmin, `🎉 Tu as été ajouté(e) comme admin !\n\nTape /start pour accéder au dashboard.`, { reply_markup: adminKeyboard });
  } else { bot.sendMessage(chatId, "Cet ID est déjà admin."); }
});

bot.onText(/\/removeadmin (\d+)/, async (msg, match) => {
  const chatId = String(msg.chat.id);
  if (chatId !== String(MAIN_ADMIN)) { bot.sendMessage(chatId, "❌ Réservé à l'admin principal."); return; }
  const targetId = match[1];
  if (targetId === String(MAIN_ADMIN)) { bot.sendMessage(chatId, "❌ Tu ne peux pas te retirer toi-même."); return; }
  const admins = await getAdmins();
  if (!admins.includes(targetId)) { bot.sendMessage(chatId, "Cet ID n'est pas admin."); return; }
  await setConfig("admins", admins.filter(a => a !== targetId));
  bot.sendMessage(chatId, `✅ Admin supprimé : ${targetId}`);
  try { bot.sendMessage(targetId, `ℹ️ Tu n'es plus admin du bot.`); } catch (e) {}
});

// ─── /setdouxeur ──────────────────────────────────────────
bot.onText(/\/setdouxeur (\d+)/, async (msg, match) => {
  const chatId = String(msg.chat.id);
  if (chatId !== String(MAIN_ADMIN)) { bot.sendMessage(chatId, "❌ Réservé à l'admin principal."); return; }
  const douxeurId = match[1];
  await setConfig("douxeurId", douxeurId);
  bot.sendMessage(chatId, `✅ Compte Douxeur (Host) configuré : ${douxeurId}`);
  bot.sendMessage(douxeurId,
    `🏪 *Bienvenue sur le bot Amis Invisibles — Compte Host Douxeur*\n\nTu as accès aux fonctions de gestion des cadeaux.\n\nUtilise les boutons ci-dessous pour gérer les cadeaux. 🎁`,
    { parse_mode: "Markdown", reply_markup: douxeurKeyboard }
  );
});

// ─── /setboutique ─────────────────────────────────────────
bot.onText(/\/setboutique (.+)/, async (msg, match) => {
  const chatId = String(msg.chat.id);
  if (!await isAdmin(chatId)) return;
  await setConfig("boutiqueAddress", match[1].trim());
  bot.sendMessage(chatId, `✅ Adresse boutique enregistrée : ${match[1].trim()}`);
});

// ─── FONCTIONS ADMIN ──────────────────────────────────────
async function sendAdminDashboard(chatId) {
  const total = await Participant.countDocuments();
  const h = await Participant.countDocuments({ genre: "H" });
  const f = await Participant.countDocuments({ genre: "F" });
  const paired = await Participant.countDocuments({ pairedWith: { $ne: null } });
  const reports = await Report.countDocuments();
  const pendingChallenges = await Challenge.countDocuments({ approved: false });
  const nextTheme = await getConfig("nextWeekTheme", null);
  const gameStart = await getConfig("gameStartDate", null);
  const currentWeek = await getConfig("currentWeek", 0);
  const pendingGifts = await Gift.countDocuments({ status: "pending" });

  bot.sendMessage(chatId,
    `🎛️ *Dashboard Admin — Amis Invisibles*\n\n` +
    `👥 Inscrits : *${total}* (${h}H / ${f}F)\n` +
    `👫 En binôme : *${Math.floor(paired/2)}*\n` +
    `🎮 Jeu : *${gameStart ? `Semaine ${currentWeek} en cours` : "Non lancé"}*\n` +
    `📅 Thème S. prochaine : *${nextTheme ? "✅ Défini" : "⚠️ Non défini"}*\n` +
    `🎁 Cadeaux en cours : *${pendingGifts}*\n` +
    `🚨 Signalements : *${reports}*\n` +
    `⏳ Défis en attente : *${pendingChallenges}*`,
    { parse_mode: "Markdown", reply_markup: adminKeyboard }
  );
}

async function sendAdminList(chatId) {
  const list = await Participant.find();
  if (list.length === 0) { bot.sendMessage(chatId, "Aucun inscrit.", { reply_markup: adminKeyboard }); return; }
  const text = list.map((p, i) => `${i+1}. *${p.pseudo}* — ${p.genre} — ${p.pays} — ${p.pairedWith ? "✅" : "⏳"}`).join("\n");
  bot.sendMessage(chatId, `📋 *Participants (${list.length}) :*\n\n${text}`, { parse_mode: "Markdown", reply_markup: adminKeyboard });
}

async function sendAdminPairs(chatId) {
  const unpaired = await Participant.find({ pairedWith: null });
  const h = unpaired.filter(p => p.genre === "H").length;
  const f = unpaired.filter(p => p.genre === "F").length;
  const paired = await Participant.countDocuments({ pairedWith: { $ne: null } });
  let text = `👫 *Gestion des binômes*\n\nSans binôme : *${unpaired.length}* (${h}H / ${f}F)\nEn binôme : *${Math.floor(paired/2)}*\n\n`;
  text += (h > 0 && f > 0) ? `✅ Tirage possible : ${Math.min(h,f)} binôme(s)` : `⚠️ Besoin d'au moins 1H + 1F sans binôme`;
  bot.sendMessage(chatId, text, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [[{ text: "🎲 Tirage automatique", callback_data: "admin_autopair" }], [{ text: "⬅️ Retour", callback_data: "admin_back" }]],
    },
  });
}

async function autoCreatePairs(chatId) {
  const hommes = await Participant.find({ genre: "H", pairedWith: null });
  const femmes = await Participant.find({ genre: "F", pairedWith: null });
  if (hommes.length === 0 || femmes.length === 0) { bot.sendMessage(chatId, "❌ Pas assez de participants."); return; }
  const shuffle = arr => arr.sort(() => Math.random() - 0.5);
  shuffle(hommes); shuffle(femmes);
  const count = Math.min(hommes.length, femmes.length);
  const themes = await getConfig("themes", DEFAULT_THEMES);
  for (let i = 0; i < count; i++) {
    const h = hommes[i]; const f = femmes[i];
    await Participant.updateOne({ chatId: h.chatId }, { pairedWith: f.chatId });
    await Participant.updateOne({ chatId: f.chatId }, { pairedWith: h.chatId });
    const notif = `🎉 *Le jeu commence !*\n\nTon ami invisible t'attend. Écris-lui directement ici — ton identité restera secrète jusqu'à la révélation. 🤫\n\n${themes[1]}`;
    bot.sendMessage(h.chatId, notif, { parse_mode: "Markdown", reply_markup: participantKeyboard });
    bot.sendMessage(f.chatId, notif, { parse_mode: "Markdown", reply_markup: participantKeyboard });
  }
  bot.sendMessage(chatId, `✅ *${count} binôme(s) créé(s) !*`, { parse_mode: "Markdown", reply_markup: adminKeyboard });
}

async function sendThemeToAll(chatId, week) {
  const themes = await getConfig("themes", DEFAULT_THEMES);
  const theme = themes[week]; if (!theme) return;
  const participants = await Participant.find();
  for (const p of participants) bot.sendMessage(p.chatId, `📅 *Thème de la semaine :*\n\n${theme}`, { parse_mode: "Markdown" });
  bot.sendMessage(chatId, `✅ Thème S${week} envoyé à ${participants.length} participant(s).`, { reply_markup: adminKeyboard });
}

async function sendAdminReports(chatId) {
  const reports = await Report.find().sort({ date: -1 }).limit(20);
  if (reports.length === 0) { bot.sendMessage(chatId, "Aucun signalement. ✅", { reply_markup: adminKeyboard }); return; }
  const text = reports.map((r, i) => `${i+1}. ${r.message}\n_${new Date(r.date).toLocaleString("fr-FR")}_`).join("\n\n");
  bot.sendMessage(chatId, `🚨 *Signalements :*\n\n${text}`, { parse_mode: "Markdown", reply_markup: adminKeyboard });
}

async function sendAdminGifts(chatId) {
  const gifts = await Gift.find({ status: { $ne: "delivered" } }).sort({ date: -1 });
  if (gifts.length === 0) { bot.sendMessage(chatId, "Aucun cadeau en cours. ✅"); return; }
  const text = gifts.map((g, i) => `${i+1}. \`${g.code}\` — ${g.status} — ${g.description.substring(0,30)}`).join("\n");
  bot.sendMessage(chatId, `🎁 *Cadeaux en cours :*\n\n${text}`, { parse_mode: "Markdown", reply_markup: adminKeyboard });
}

async function sendDouxeurDashboard(chatId) {
  const pending = await Gift.countDocuments({ status: "pending" });
  const received = await Gift.countDocuments({ status: "received" });
  const delivered = await Gift.countDocuments({ status: "delivered" });
  const problems = await Gift.countDocuments({ status: "problem" });
  bot.sendMessage(chatId,
    `🏪 *Dashboard Douxeur — Host*\n\n` +
    `📦 En attente de réception : *${pending}*\n` +
    `✅ Reçus en boutique : *${received}*\n` +
    `🎁 Remis au destinataire : *${delivered}*\n` +
    `⚠️ Problèmes : *${problems}*`,
    { parse_mode: "Markdown", reply_markup: douxeurKeyboard }
  );
}

async function sendDouxeurPendingGifts(chatId) {
  const gifts = await Gift.find({ status: { $in: ["pending", "received"] } }).sort({ date: -1 });
  if (gifts.length === 0) { bot.sendMessage(chatId, "Aucun cadeau en attente. ✅", { reply_markup: douxeurKeyboard }); return; }
  const text = gifts.map((g, i) => `${i+1}. 🔑 \`${g.code}\`\n   📝 ${g.description}\n   📌 Statut : ${g.status}`).join("\n\n");
  bot.sendMessage(chatId, `📦 *Cadeaux en cours :*\n\n${text}`, { parse_mode: "Markdown", reply_markup: douxeurKeyboard });
}

async function revealAll(chatId) {
  const participants = await Participant.find({ pairedWith: { $ne: null } });
  const done = new Set(); let count = 0;
  for (const p of participants) {
    if (done.has(p.chatId) || done.has(p.pairedWith)) continue;
    done.add(p.chatId); done.add(p.pairedWith);
    const partner = await Participant.findOne({ chatId: p.pairedWith });
    if (!partner) continue;
    const r1 = partner.realUsername ? `@${partner.realUsername}` : partner.pseudo;
    const r2 = p.realUsername ? `@${p.realUsername}` : p.pseudo;
    bot.sendMessage(p.chatId, `🎉 *La révélation est arrivée !*\n\nTon ami invisible était... *${r1}* ! 🎁\n\nMerci d'avoir joué. 🖤`, { parse_mode: "Markdown" });
    bot.sendMessage(p.pairedWith, `🎉 *La révélation est arrivée !*\n\nTon ami invisible était... *${r2}* ! 🎁\n\nMerci d'avoir joué. 🖤`, { parse_mode: "Markdown" });
    count++;
  }
  bot.sendMessage(chatId, `✅ Révélation envoyée à ${count} binôme(s). Le jeu est terminé. 🎊`, { reply_markup: adminKeyboard });
}

// ─── RAPPELS QUOTIDIENS ───────────────────────────────────
async function checkDailyReminder() {
  const gameStart = await getConfig("gameStartDate", null);
  if (!gameStart) return;
  const today = new Date().toDateString();
  const lastReminder = await getConfig("lastReminderDate", null);
  if (lastReminder === today) return;
  const nextTheme = await getConfig("nextWeekTheme", null);
  if (!nextTheme) {
    await notifyAdmins(
      `⏰ *Rappel quotidien*\n\n📅 Le thème de la semaine prochaine n'est pas encore défini !\n\nVa dans Thèmes → "Thème semaine prochaine" pour l'enregistrer. 🎯`,
      { parse_mode: "Markdown" }
    );
    await setConfig("lastReminderDate", today);
  }
}

setInterval(checkDailyReminder, 60 * 60 * 1000);
setTimeout(checkDailyReminder, 5000);

// ─── CONNEXION MONGODB ────────────────────────────────────
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log("✅ MongoDB connecté");
    console.log("🤖 AmiInvisibleBot v4 is running...");
  })
  .catch(err => {
    console.error("❌ Erreur MongoDB :", err.message);
    process.exit(1);
  });
