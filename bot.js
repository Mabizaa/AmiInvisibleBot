const TelegramBot = require("node-telegram-bot-api");
const mongoose = require("mongoose");

// ─── CONFIG ───────────────────────────────────────────────
const TOKEN = process.env.BOT_TOKEN || "REMPLACE";
const MAIN_ADMIN = process.env.ADMIN_ID || "REMPLACE";
const MONGODB_URI = process.env.MONGODB_URI || "REMPLACE";

// ─── SCHEMAS ──────────────────────────────────────────────
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
  status: { type: String, default: "pending" },
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

// ─── TEXTES PAR DÉFAUT ────────────────────────────────────
const DEFAULTS = {
  txt_bienvenue: `🎁 *Amis Invisibles — DouXeur 💥✨*

Le principe est simple : pendant *4 semaines*, tu vas prendre soin d'une personne que tu ne connais pas encore — ton ami(e) invisible. Tu lui envoies des messages, des attentions, des cadeaux... sans jamais révéler qui tu es.

À la fin des 4 semaines, la révélation : tout le monde découvre qui était son ami invisible. 🎉

Chaque semaine, un *thème* et des *défis* te seront envoyés pour guider tes échanges.`,

  txt_regles: `📋 *Les règles du jeu*

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

  txt_confirmation_inscription: `✅ *Inscription confirmée !*

🎭 Ton pseudo anonyme est : *{pseudo}*

Ton vrai nom sera révélé uniquement à la fin du jeu. 🎉

📅 Chaque semaine tu recevras un *thème* et des *défis* pour guider tes échanges.

⏳ Patiente le temps que le tirage soit effectué. Tu seras notifié(e) dès que ton ami invisible t'est attribué. 🎁`,

  txt_debut_jeu: `🎉 *Le jeu commence !*

Ton ami invisible t'attend. Écris-lui directement ici — ton identité restera secrète jusqu'à la révélation. 🤫

{theme1}`,

  txt_revelation: `🎉 *La révélation est arrivée !*

Ton ami invisible était... *{partenaire}* ! 🎁

Merci d'avoir joué. On espère que ce mois a été beau. 🖤`,

  txt_erreur_tirage: `⏳ Le tirage n'a pas encore eu lieu. Patiente encore un peu... 🎯`,

  txt_erreur_pas_inscrit: `👉 Tape /start pour t'inscrire au jeu.`,

  theme_1: `🌱 *Semaine 1 — Découverte*\n\nRestez en surface. Partagez vos goûts, vos habitudes, ce qui vous fait sourire au quotidien.`,
  theme_2: `🌿 *Semaine 2 — Affinités*\n\nExplorez vos passions, vos univers, ce qui vous anime vraiment.`,
  theme_3: `🌳 *Semaine 3 — Profondeur*\n\nVos valeurs, vos rêves, ce qui vous a construit.`,
  theme_4: `🎁 *Semaine 4 — Révélation*\n\nPréparez votre cadeau et votre message de révélation. La soirée approche !`,

  faq: [
    { q: "C'est quoi les Amis Invisibles ?", a: "C'est un jeu de 4 semaines où tu prends soin d'une personne anonymement — en lui envoyant des messages, attentions et cadeaux — sans qu'elle sache qui tu es jusqu'à la révélation finale." },
    { q: "Comment s'inscrire au jeu ?", a: "Tape /start dans ce bot, choisis ton genre, indique ton pays, lis et accepte les règles. Un pseudo anonyme te sera attribué automatiquement." },
    { q: "Comment contacter mon ami invisible ?", a: "Écris directement dans ce bot — tous tes messages seront transmis anonymement à ton ami invisible. Tu peux envoyer du texte, des photos, des vocaux, des vidéos et des stickers." },
    { q: "Mon identité peut-elle être révélée avant la fin ?", a: "Non. L'anonymat est total jusqu'à la soirée de révélation. Ni toi ni ton ami invisible ne connaissez vos vraies identités pendant le jeu." },
    { q: "Comment envoyer un cadeau ?", a: "Tape /cadeau ou clique sur 🎁 Envoyer cadeau. Décris ton cadeau, envoie une photo, et un code secret sera généré. Envoie le cadeau à la boutique Douxeur via livreur avec ce code." },
    { q: "Où récupérer mon cadeau ?", a: "Ton cadeau t'attend à la boutique Douxeur. Quand il arrive, tu reçois une notification avec un code secret. Rends-toi à la boutique le lendemain et donne ce code pour récupérer ton cadeau." },
    { q: "Que faire si mon ami invisible ne répond pas ?", a: "Sois patient(e) — tout le monde a son rythme. Si le silence dure trop longtemps, tu peux signaler la situation via /signal pour que l'organisateur intervienne." },
    { q: "Peut-on se rencontrer avant la révélation ?", a: "Non, c'est formellement interdit. Aucun rendez-vous, aucune rencontre physique avant la soirée de révélation. L'anonymat doit être préservé jusqu'au bout." },
    { q: "Comment signaler un comportement inapproprié ?", a: "Utilise /signal suivi d'une description du problème. Ton signalement sera transmis anonymement à l'organisateur qui prendra les mesures nécessaires." },
    { q: "Quand et comment se passe la révélation finale ?", a: "À la fin de la 4ème semaine, l'organisateur lance la révélation. Chaque participant reçoit un message lui dévoilant l'identité de son ami invisible. Une soirée peut être organisée pour l'occasion." },
  ],
};

async function getText(key) {
  return await getConfig(key, DEFAULTS[key]);
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

// ─── BOT INIT ─────────────────────────────────────────────
const bot = new TelegramBot(TOKEN, { polling: true });

bot.setMyCommands([
  { command: "start", description: "Démarrer / Voir mon statut" },
  { command: "cadeau", description: "Envoyer un cadeau à ton ami invisible" },
  { command: "signal", description: "Signaler une infraction anonymement" },
  { command: "faq", description: "Questions fréquentes" },
]);

// ─── KEYBOARDS ────────────────────────────────────────────
const participantKeyboard = {
  keyboard: [
    [{ text: "📊 Mon statut" }, { text: "🎁 Envoyer cadeau" }, { text: "🚨 Signaler" }],
    [{ text: "📚 FAQ" }],
  ],
  resize_keyboard: true,
  persistent: true,
};

const adminKeyboard = {
  keyboard: [
    [{ text: "👥 Inscrits" }, { text: "👫 Binômes" }, { text: "📅 Thèmes" }],
    [{ text: "🎯 Défi" }, { text: "🚨 Signalements" }, { text: "✏️ Éditer" }],
    [{ text: "🎉 Révélation" }, { text: "🎮 Lancer jeu" }],
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
  const id = await getConfig("douxeurId", null);
  return id && String(id) === String(chatId);
}
async function getAdmins() {
  return await getConfig("admins", [String(MAIN_ADMIN)]);
}
async function notifyAdmins(text, options = {}) {
  const admins = await getAdmins();
  for (const id of admins) await bot.sendMessage(id, text, options);
}

// ─── CONFIRMATION TEXTE ───────────────────────────────────
async function askTextConfirmation(chatId, newText, pendingData) {
  await setPending(chatId, { ...pendingData, step: "confirm_text", draftText: newText });
  await bot.sendMessage(chatId,
    `📋 *Aperçu du texte :*\n\n${newText}\n\n---\nConfirmes-tu cette modification ?`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Confirmer", callback_data: "edit_confirm" },
          { text: "✏️ Modifier encore", callback_data: "edit_retry" },
          { text: "❌ Annuler", callback_data: "edit_cancel" },
        ]],
      },
    }
  );
}

// ─── FAQ ──────────────────────────────────────────────────
async function sendFAQ(chatId) {
  const faq = await getText("faq");
  const buttons = faq.map((item, i) => [{ text: `${i+1}. ${item.q}`, callback_data: `faq_${i}` }]);
  buttons.push([{ text: "⬅️ Retour", callback_data: "faq_back" }]);
  await bot.sendMessage(chatId, `📚 *FAQ — Amis Invisibles*\n\nClique sur une question pour voir la réponse :`, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: buttons },
  });
}

// ─── /start ───────────────────────────────────────────────
bot.onText(/\/start|📊 Mon statut/, async (msg) => {
  const chatId = String(msg.chat.id);
  if (await isAdmin(chatId)) { await sendAdminDashboard(chatId); return; }
  if (await isDouxeur(chatId)) { await sendDouxeurDashboard(chatId); return; }

  const participant = await Participant.findOne({ chatId });
  if (participant) {
    const errTirage = await getText("txt_erreur_tirage");
    bot.sendMessage(chatId,
      `Tu es inscrit(e) sous le pseudo *${participant.pseudo}*. 🎭\n\n` +
      (participant.pairedWith ? `Ton ami invisible t'attend — écris-lui directement ici. 💌` : errTirage),
      { parse_mode: "Markdown", reply_markup: participantKeyboard }
    );
    return;
  }

  await setPending(chatId, { step: "genre" });
  const bienvenue = await getText("txt_bienvenue");
  bot.sendMessage(chatId, `${bienvenue}\n\n---\n\n*Prêt(e) à rejoindre l'aventure ?*\n\n*Quel est ton genre ?*`, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "👨 Homme", callback_data: "genre_H" }, { text: "👩 Femme", callback_data: "genre_F" }],
        [{ text: "🌈 Autre / Non-binaire", callback_data: "genre_T" }],
      ],
    },
  });
});

// ─── /faq ─────────────────────────────────────────────────
bot.onText(/\/faq|📚 FAQ/, async (msg) => {
  await sendFAQ(String(msg.chat.id));
});

// ─── /cadeau ──────────────────────────────────────────────
bot.onText(/\/cadeau|🎁 Envoyer cadeau/, async (msg) => {
  const chatId = String(msg.chat.id);
  const participant = await Participant.findOne({ chatId });
  if (!participant) { bot.sendMessage(chatId, await getText("txt_erreur_pas_inscrit")); return; }
  if (!participant.pairedWith) { bot.sendMessage(chatId, await getText("txt_erreur_tirage")); return; }
  await setPending(chatId, { step: "cadeau_description" });
  bot.sendMessage(chatId, `🎁 *Envoyer un cadeau*\n\nDécris ton cadeau en quelques mots :`, { parse_mode: "Markdown" });
});

// ─── CALLBACKS ────────────────────────────────────────────
bot.on("callback_query", async (query) => {
  const chatId = String(query.message.chat.id);
  const cb = query.data;
  bot.answerCallbackQuery(query.id);

  // FAQ
  if (cb.startsWith("faq_")) {
    if (cb === "faq_back") { await sendFAQ(chatId); return; }
    const idx = parseInt(cb.split("_")[1]);
    const faq = await getText("faq");
    if (faq[idx]) {
      bot.sendMessage(chatId,
        `❓ *${faq[idx].q}*\n\n💬 ${faq[idx].a}`,
        {
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [[{ text: "⬅️ Retour aux questions", callback_data: "faq_back" }]] }
        }
      );
    }
    return;
  }

  // Confirmation édition texte
  if (cb === "edit_confirm") {
    const pending = await getPending(chatId);
    if (!pending || pending.step !== "confirm_text") return;
    await setConfig(pending.editKey, pending.draftText);
    await clearPending(chatId);
    bot.sendMessage(chatId, `✅ *Texte mis à jour avec succès !*`, { parse_mode: "Markdown", reply_markup: adminKeyboard });
    return;
  }

  if (cb === "edit_retry") {
    const pending = await getPending(chatId);
    if (!pending) return;
    await setPending(chatId, { ...pending, step: pending.prevStep || "edit_text" });
    bot.sendMessage(chatId, `✏️ Envoie le nouveau texte :`, { parse_mode: "Markdown" });
    return;
  }

  if (cb === "edit_cancel") {
    await clearPending(chatId);
    bot.sendMessage(chatId, `❌ Modification annulée.`, { reply_markup: adminKeyboard });
    return;
  }

  // Inscription genre
  if (cb.startsWith("genre_")) {
    const genre = cb.split("_")[1];
    await setPending(chatId, { step: "pays", genre });
    bot.sendMessage(chatId, `🌍 *Dans quel pays vis-tu ?*\n_(Tape simplement le nom de ton pays)_`, { parse_mode: "Markdown" });
    return;
  }

  // Règles
  if (cb === "rules_ok") {
    const pending = await getPending(chatId);
    if (!pending || pending.step !== "rules") return;
    const username = query.from.username || null;
    const pseudo = await assignPseudo(pending.genre, username);
    await Participant.create({ chatId, pseudo, realUsername: username, genre: pending.genre, pays: pending.pays, confirmed: true });
    await clearPending(chatId);
    const total = await Participant.countDocuments();
    await notifyAdmins(`📥 *Nouvel inscrit !*\nPseudo : *${pseudo}* | Genre : ${pending.genre} | Pays : ${pending.pays}\nTotal : ${total}`, { parse_mode: "Markdown" });
    let confirmTxt = await getText("txt_confirmation_inscription");
    confirmTxt = confirmTxt.replace("{pseudo}", pseudo);
    bot.sendMessage(chatId, confirmTxt, { parse_mode: "Markdown", reply_markup: participantKeyboard });
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
    if (String(challenge.submittedBy) === String(chatId)) { bot.sendMessage(chatId, "⚠️ Tu ne peux pas approuver ton propre défi."); return; }
    const participants = await Participant.find();
    for (const p of participants) bot.sendMessage(p.chatId, `🎯 *Défi de la semaine !*\n\n${challenge.text}`, { parse_mode: "Markdown" });
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
    bot.sendMessage(chatId, "🎯 *Envoie le texte du défi :*\n_(Soumis à validation par un autre admin)_", { parse_mode: "Markdown" });
    return;
  }

  if (cb === "admin_theme_menu") { await sendThemeMenu(chatId); return; }
  if (cb.startsWith("admin_theme_send_")) { await sendThemeToAll(chatId, cb.split("_")[3]); return; }

  if (cb.startsWith("admin_theme_edit_")) {
    const week = cb.split("_")[3];
    const current = await getText(`theme_${week}`);
    await setPending(chatId, { step: "edit_text", editKey: `theme_${week}`, prevStep: "edit_text", label: `Thème S${week}` });
    bot.sendMessage(chatId, `✏️ *Modifier Thème S${week}*\n\nActuel :\n${current}\n\n_Envoie le nouveau texte :_`, { parse_mode: "Markdown" });
    return;
  }

  if (cb === "admin_theme_next") {
    const current = await getText("theme_next") || "_Non défini_";
    await setPending(chatId, { step: "edit_text", editKey: "theme_next", prevStep: "edit_text", label: "Thème semaine prochaine" });
    bot.sendMessage(chatId, `✏️ *Thème semaine prochaine*\n\nActuel : ${current}\n\n_Envoie le nouveau texte :_`, { parse_mode: "Markdown" });
    return;
  }

  // Menu édition textes
  if (cb === "admin_edit_menu") { await sendEditMenu(chatId); return; }

  if (cb.startsWith("admin_edit_")) {
    const key = cb.replace("admin_edit_", "");
    const labels = {
      txt_bienvenue: "Message de bienvenue",
      txt_regles: "Règles du jeu",
      txt_confirmation_inscription: "Confirmation d'inscription",
      txt_debut_jeu: "Message début de jeu",
      txt_revelation: "Message de révélation",
      txt_erreur_tirage: "Erreur — tirage pas lancé",
      txt_erreur_pas_inscrit: "Erreur — pas inscrit",
    };
    const label = labels[key] || key;
    const current = await getText(key);
    await setPending(chatId, { step: "edit_text", editKey: key, prevStep: "edit_text", label });
    bot.sendMessage(chatId, `✏️ *Modifier : ${label}*\n\nActuel :\n${current}\n\n_Envoie le nouveau texte :_`, { parse_mode: "Markdown" });
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
    bot.sendMessage(chatId, `✅ *Jeu lancé !*`, { parse_mode: "Markdown", reply_markup: adminKeyboard });
    return;
  }
});

// ─── MESSAGES TEXTE ───────────────────────────────────────
bot.on("message", async (msg) => {
  const chatId = String(msg.chat.id);
  if (msg.text && msg.text.startsWith("/")) return;

  const pending = await getPending(chatId);

  if (await isDouxeur(chatId)) { await handleDouxeurMessage(chatId, msg, pending); return; }

  // Admin keyboard
  if (await isAdmin(chatId) && msg.text) {
    const handled = await handleAdminKeyboard(chatId, msg.text);
    if (handled) return;
  }

  // Inscription : pays
  if (pending && pending.step === "pays" && msg.text) {
    await setPending(chatId, { ...pending, pays: msg.text.trim(), step: "rules" });
    const regles = await getText("txt_regles");
    bot.sendMessage(chatId, `${regles}\n\n---\n\n*Tu as bien lu et compris les règles ?*`, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "✅ J'ai compris et j'accepte", callback_data: "rules_ok" }, { text: "❌ Je refuse", callback_data: "rules_refuse" }]] },
    });
    return;
  }

  // Édition texte (admin)
  if (pending && pending.step === "edit_text" && await isAdmin(chatId) && msg.text) {
    await askTextConfirmation(chatId, msg.text.trim(), pending);
    return;
  }

  // Admin : défi
  if (pending && pending.step === "admin_challenge" && await isAdmin(chatId) && msg.text) {
    const text = msg.text.trim();
    await askTextConfirmation(chatId, text, { step: "admin_challenge_confirm", editKey: "challenge", label: "Défi" });
    return;
  }

  // Confirmation défi après validation
  if (pending && pending.step === "confirm_text" && pending.editKey === "challenge" && await isAdmin(chatId)) {
    // géré via callback edit_confirm
    return;
  }

  // Cadeau : description
  if (pending && pending.step === "cadeau_description" && msg.text) {
    await setPending(chatId, { ...pending, step: "cadeau_photo", description: msg.text.trim() });
    bot.sendMessage(chatId, `📸 *Envoie une photo de ton cadeau*\n\n_(Ou tape /skip pour ignorer)_`, { parse_mode: "Markdown" });
    return;
  }

  if (msg.text === "/skip" && pending && pending.step === "cadeau_photo") {
    await finalizeCadeau(chatId, pending, null);
    return;
  }

  // Relais messages
  const participant = await Participant.findOne({ chatId });
  if (!participant) { bot.sendMessage(chatId, await getText("txt_erreur_pas_inscrit")); return; }
  if (!participant.pairedWith) { bot.sendMessage(chatId, await getText("txt_erreur_tirage")); return; }
  if (msg.text) {
    bot.sendMessage(participant.pairedWith, `💌 *Message de ton ami invisible :*\n\n${msg.text}`, { parse_mode: "Markdown" });
    bot.sendMessage(chatId, "✅ Transmis anonymement. 🤫");
  }
});

// ─── ADMIN KEYBOARD HANDLER ───────────────────────────────
async function handleAdminKeyboard(chatId, text) {
  if (text === "👥 Inscrits") { await sendAdminList(chatId); return true; }
  if (text === "👫 Binômes") { await sendAdminPairs(chatId); return true; }
  if (text === "📅 Thèmes") { await sendThemeMenu(chatId); return true; }
  if (text === "🎯 Défi") {
    await setPending(chatId, { step: "admin_challenge" });
    bot.sendMessage(chatId, "🎯 *Envoie le texte du défi :*", { parse_mode: "Markdown" });
    return true;
  }
  if (text === "🚨 Signalements") { await sendAdminReports(chatId); return true; }
  if (text === "✏️ Éditer") { await sendEditMenu(chatId); return true; }
  if (text === "🎉 Révélation") {
    bot.sendMessage(chatId, "⚠️ *Confirmes-tu la révélation finale ?*", {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "✅ Confirmer", callback_data: "admin_reveal_confirm" }, { text: "❌ Annuler", callback_data: "admin_back" }]] },
    });
    return true;
  }
  if (text === "🎮 Lancer jeu") {
    await setConfig("gameStartDate", new Date().toISOString());
    await setConfig("currentWeek", 1);
    bot.sendMessage(chatId, `✅ *Jeu lancé !*`, { parse_mode: "Markdown", reply_markup: adminKeyboard });
    return true;
  }
  return false;
}

// ─── DOUXEUR ──────────────────────────────────────────────
async function handleDouxeurMessage(chatId, msg, pending) {
  const text = msg.text || "";
  if (text === "📦 Cadeaux en attente") { await sendDouxeurPendingGifts(chatId); return; }
  if (text === "✅ Cadeau reçu" || (pending && pending.step === "douxeur_confirm_received")) {
    if (text === "✅ Cadeau reçu") { await setPending(chatId, { step: "douxeur_confirm_received" }); bot.sendMessage(chatId, "Entre le code du cadeau reçu :"); return; }
    if (pending && pending.step === "douxeur_confirm_received") { await confirmGiftReceived(chatId, msg.text.trim().toUpperCase()); return; }
  }
  if (text === "🎁 Cadeau remis" || (pending && pending.step === "douxeur_confirm_delivered")) {
    if (text === "🎁 Cadeau remis") { await setPending(chatId, { step: "douxeur_confirm_delivered" }); bot.sendMessage(chatId, "Entre le code du cadeau remis :"); return; }
    if (pending && pending.step === "douxeur_confirm_delivered") { await confirmGiftDelivered(chatId, msg.text.trim().toUpperCase()); return; }
  }
  if (text === "⚠️ Problème cadeau" || (pending && (pending.step === "douxeur_problem_code" || pending.step === "douxeur_problem_message"))) {
    if (text === "⚠️ Problème cadeau") { await setPending(chatId, { step: "douxeur_problem_code" }); bot.sendMessage(chatId, "Entre le code du cadeau concerné :"); return; }
    if (pending && pending.step === "douxeur_problem_code") { await setPending(chatId, { step: "douxeur_problem_message", code: msg.text.trim().toUpperCase() }); bot.sendMessage(chatId, "Décris le problème :"); return; }
    if (pending && pending.step === "douxeur_problem_message") { await reportGiftProblem(chatId, pending.code, msg.text.trim()); return; }
  }
  await sendDouxeurDashboard(chatId);
}

// ─── PHOTOS ───────────────────────────────────────────────
bot.on("photo", async (msg) => {
  const chatId = String(msg.chat.id);
  const pending = await getPending(chatId);
  if (pending && pending.step === "cadeau_photo") {
    await finalizeCadeau(chatId, pending, msg.photo[msg.photo.length - 1].file_id);
    return;
  }
  const p = await Participant.findOne({ chatId });
  if (!p || !p.pairedWith) return;
  bot.sendPhoto(p.pairedWith, msg.photo[msg.photo.length - 1].file_id, { caption: "📸 *Photo de ton ami invisible* 🤫", parse_mode: "Markdown" });
  bot.sendMessage(chatId, "✅ Transmis anonymement. 🤫");
});

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
  if (!participant) { bot.sendMessage(chatId, await getText("txt_erreur_pas_inscrit")); return; }
  if (match && match[1]) {
    await Report.create({ message: match[1].trim() });
    await notifyAdmins(`🚨 *Nouveau signalement*\n\n${match[1].trim()}`, { parse_mode: "Markdown" });
    bot.sendMessage(chatId, "✅ Signalement transmis anonymement.");
  } else {
    await setPending(chatId, { step: "signal" });
    bot.sendMessage(chatId, "🚨 Décris le problème :");
  }
});

// ─── /addadmin /removeadmin ───────────────────────────────
bot.onText(/\/addadmin (\d+)/, async (msg, match) => {
  const chatId = String(msg.chat.id);
  if (chatId !== String(MAIN_ADMIN)) { bot.sendMessage(chatId, "❌ Réservé à l'admin principal."); return; }
  const admins = await getAdmins();
  const newAdmin = match[1];
  if (!admins.includes(newAdmin)) {
    admins.push(newAdmin);
    await setConfig("admins", admins);
    bot.sendMessage(chatId, `✅ Admin ajouté : ${newAdmin}`);
    bot.sendMessage(newAdmin, `🎉 Tu as été ajouté(e) comme admin !\n\nTape /start.`, { reply_markup: adminKeyboard });
  } else { bot.sendMessage(chatId, "Déjà admin."); }
});

bot.onText(/\/removeadmin (\d+)/, async (msg, match) => {
  const chatId = String(msg.chat.id);
  if (chatId !== String(MAIN_ADMIN)) { bot.sendMessage(chatId, "❌ Réservé à l'admin principal."); return; }
  const targetId = match[1];
  if (targetId === String(MAIN_ADMIN)) { bot.sendMessage(chatId, "❌ Impossible de te retirer toi-même."); return; }
  const admins = await getAdmins();
  if (!admins.includes(targetId)) { bot.sendMessage(chatId, "Cet ID n'est pas admin."); return; }
  await setConfig("admins", admins.filter(a => a !== targetId));
  bot.sendMessage(chatId, `✅ Admin supprimé : ${targetId}`);
  try { bot.sendMessage(targetId, `ℹ️ Tu n'es plus admin.`); } catch (e) {}
});

bot.onText(/\/setdouxeur (\d+)/, async (msg, match) => {
  const chatId = String(msg.chat.id);
  if (chatId !== String(MAIN_ADMIN)) return;
  await setConfig("douxeurId", match[1]);
  bot.sendMessage(chatId, `✅ Douxeur configuré : ${match[1]}`);
  bot.sendMessage(match[1], `🏪 *Bienvenue — Compte Host Douxeur*\n\nTu gères les cadeaux du jeu Amis Invisibles. 🎁`, { parse_mode: "Markdown", reply_markup: douxeurKeyboard });
});

bot.onText(/\/setboutique (.+)/, async (msg, match) => {
  if (!await isAdmin(String(msg.chat.id))) return;
  await setConfig("boutiqueAddress", match[1].trim());
  bot.sendMessage(msg.chat.id, `✅ Adresse boutique : ${match[1].trim()}`);
});

// ─── FONCTIONS ADMIN ──────────────────────────────────────
async function sendAdminDashboard(chatId) {
  const total = await Participant.countDocuments();
  const h = await Participant.countDocuments({ genre: "H" });
  const f = await Participant.countDocuments({ genre: "F" });
  const paired = await Participant.countDocuments({ pairedWith: { $ne: null } });
  const reports = await Report.countDocuments();
  const pendingChallenges = await Challenge.countDocuments({ approved: false });
  const nextTheme = await getConfig("theme_next", null);
  const gameStart = await getConfig("gameStartDate", null);
  const currentWeek = await getConfig("currentWeek", 0);
  const pendingGifts = await Gift.countDocuments({ status: "pending" });

  bot.sendMessage(chatId,
    `🎛️ *Dashboard Admin — Amis Invisibles*\n\n` +
    `👥 Inscrits : *${total}* (${h}H / ${f}F)\n` +
    `👫 En binôme : *${Math.floor(paired/2)}*\n` +
    `🎮 Jeu : *${gameStart ? `Semaine ${currentWeek}` : "Non lancé"}*\n` +
    `📅 Thème S. prochaine : *${nextTheme ? "✅" : "⚠️ Non défini"}*\n` +
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
  text += (h > 0 && f > 0) ? `✅ Tirage possible : ${Math.min(h,f)} binôme(s)` : `⚠️ Besoin d'au moins 1H + 1F`;
  bot.sendMessage(chatId, text, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: [[{ text: "🎲 Tirage automatique", callback_data: "admin_autopair" }], [{ text: "⬅️ Retour", callback_data: "admin_back" }]] },
  });
}

async function autoCreatePairs(chatId) {
  const hommes = await Participant.find({ genre: "H", pairedWith: null });
  const femmes = await Participant.find({ genre: "F", pairedWith: null });
  if (hommes.length === 0 || femmes.length === 0) { bot.sendMessage(chatId, "❌ Pas assez de participants."); return; }
  const shuffle = arr => arr.sort(() => Math.random() - 0.5);
  shuffle(hommes); shuffle(femmes);
  const count = Math.min(hommes.length, femmes.length);
  const theme1 = await getText("theme_1");
  let debutJeu = await getText("txt_debut_jeu");
  debutJeu = debutJeu.replace("{theme1}", theme1);
  for (let i = 0; i < count; i++) {
    const h = hommes[i]; const f = femmes[i];
    await Participant.updateOne({ chatId: h.chatId }, { pairedWith: f.chatId });
    await Participant.updateOne({ chatId: f.chatId }, { pairedWith: h.chatId });
    bot.sendMessage(h.chatId, debutJeu, { parse_mode: "Markdown", reply_markup: participantKeyboard });
    bot.sendMessage(f.chatId, debutJeu, { parse_mode: "Markdown", reply_markup: participantKeyboard });
  }
  bot.sendMessage(chatId, `✅ *${count} binôme(s) créé(s) !*`, { parse_mode: "Markdown", reply_markup: adminKeyboard });
}

async function sendThemeMenu(chatId) {
  bot.sendMessage(chatId, "📅 *Gérer les thèmes*", {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "📤 Envoyer S1", callback_data: "admin_theme_send_1" }, { text: "✏️ Modifier S1", callback_data: "admin_theme_edit_1" }],
        [{ text: "📤 Envoyer S2", callback_data: "admin_theme_send_2" }, { text: "✏️ Modifier S2", callback_data: "admin_theme_edit_2" }],
        [{ text: "📤 Envoyer S3", callback_data: "admin_theme_send_3" }, { text: "✏️ Modifier S3", callback_data: "admin_theme_edit_3" }],
        [{ text: "📤 Envoyer S4", callback_data: "admin_theme_send_4" }, { text: "✏️ Modifier S4", callback_data: "admin_theme_edit_4" }],
        [{ text: "📝 Thème semaine prochaine", callback_data: "admin_theme_next" }],
        [{ text: "⬅️ Retour", callback_data: "admin_back" }],
      ],
    },
  });
}

async function sendThemeToAll(chatId, week) {
  const theme = await getText(`theme_${week}`);
  const participants = await Participant.find();
  for (const p of participants) bot.sendMessage(p.chatId, `📅 *Thème de la semaine :*\n\n${theme}`, { parse_mode: "Markdown" });
  bot.sendMessage(chatId, `✅ Thème S${week} envoyé à ${participants.length} participant(s).`, { reply_markup: adminKeyboard });
}

async function sendEditMenu(chatId) {
  bot.sendMessage(chatId, "✏️ *Que veux-tu modifier ?*", {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "👋 Message de bienvenue", callback_data: "admin_edit_txt_bienvenue" }],
        [{ text: "📋 Règles du jeu", callback_data: "admin_edit_txt_regles" }],
        [{ text: "✅ Confirmation inscription", callback_data: "admin_edit_txt_confirmation_inscription" }],
        [{ text: "🎉 Message début de jeu", callback_data: "admin_edit_txt_debut_jeu" }],
        [{ text: "🎭 Message révélation", callback_data: "admin_edit_txt_revelation" }],
        [{ text: "⏳ Erreur tirage pas lancé", callback_data: "admin_edit_txt_erreur_tirage" }],
        [{ text: "❌ Erreur pas inscrit", callback_data: "admin_edit_txt_erreur_pas_inscrit" }],
        [{ text: "📅 Thèmes →", callback_data: "admin_theme_menu" }],
        [{ text: "⬅️ Retour", callback_data: "admin_back" }],
      ],
    },
  });
}

async function sendAdminReports(chatId) {
  const reports = await Report.find().sort({ date: -1 }).limit(20);
  if (reports.length === 0) { bot.sendMessage(chatId, "Aucun signalement. ✅", { reply_markup: adminKeyboard }); return; }
  const text = reports.map((r, i) => `${i+1}. ${r.message}\n_${new Date(r.date).toLocaleString("fr-FR")}_`).join("\n\n");
  bot.sendMessage(chatId, `🚨 *Signalements :*\n\n${text}`, { parse_mode: "Markdown", reply_markup: adminKeyboard });
}

async function revealAll(chatId) {
  const participants = await Participant.find({ pairedWith: { $ne: null } });
  const done = new Set(); let count = 0;
  const revelationTxt = await getText("txt_revelation");
  for (const p of participants) {
    if (done.has(p.chatId) || done.has(p.pairedWith)) continue;
    done.add(p.chatId); done.add(p.pairedWith);
    const partner = await Participant.findOne({ chatId: p.pairedWith });
    if (!partner) continue;
    const r1 = partner.realUsername ? `@${partner.realUsername}` : partner.pseudo;
    const r2 = p.realUsername ? `@${p.realUsername}` : p.pseudo;
    bot.sendMessage(p.chatId, revelationTxt.replace("{partenaire}", r1), { parse_mode: "Markdown" });
    bot.sendMessage(p.pairedWith, revelationTxt.replace("{partenaire}", r2), { parse_mode: "Markdown" });
    count++;
  }
  bot.sendMessage(chatId, `✅ Révélation envoyée à ${count} binôme(s). 🎊`, { reply_markup: adminKeyboard });
}

// ─── CADEAUX ──────────────────────────────────────────────
async function finalizeCadeau(chatId, pending, photoFileId) {
  const participant = await Participant.findOne({ chatId });
  if (!participant || !participant.pairedWith) return;
  const code = generateGiftCode();
  await Gift.create({ code, fromId: chatId, toId: participant.pairedWith, description: pending.description, photoFileId, status: "pending" });
  await clearPending(chatId);
  const douxeurId = await getConfig("douxeurId", null);
  if (douxeurId) {
    const txt = `📦 *Nouveau cadeau en route !*\n\n🔑 Code : \`${code}\`\n📝 ${pending.description}`;
    if (photoFileId) bot.sendPhoto(douxeurId, photoFileId, { caption: txt, parse_mode: "Markdown" });
    else bot.sendMessage(douxeurId, txt, { parse_mode: "Markdown" });
  }
  await notifyAdmins(`📦 *Cadeau en route*\n🔑 \`${code}\`\n📝 ${pending.description}`, { parse_mode: "Markdown" });
  const boutique = await getConfig("boutiqueAddress", "la boutique Douxeur");
  bot.sendMessage(participant.pairedWith, `🎁 *Un cadeau arrive pour toi !*\n\nRends-toi *demain* à ${boutique} avec ce code :\n\n🔑 \`${code}\``, { parse_mode: "Markdown" });
  bot.sendMessage(chatId, `✅ Cadeau enregistré ! Code : \`${code}\`\n\nDouxeur a été notifiée. 🎁`, { parse_mode: "Markdown" });
}

async function confirmGiftReceived(chatId, code) {
  const gift = await Gift.findOne({ code });
  if (!gift) { bot.sendMessage(chatId, `❌ Code introuvable.`); return; }
  gift.status = "received"; await gift.save();
  await clearPending(chatId);
  bot.sendMessage(chatId, `✅ Cadeau *${code}* reçu en boutique.`, { parse_mode: "Markdown", reply_markup: douxeurKeyboard });
  bot.sendMessage(gift.toId, `✅ Ton cadeau est arrivé chez Douxeur ! Code : \`${code}\``, { parse_mode: "Markdown" });
}

async function confirmGiftDelivered(chatId, code) {
  const gift = await Gift.findOne({ code });
  if (!gift) { bot.sendMessage(chatId, `❌ Code introuvable.`); return; }
  gift.status = "delivered"; await gift.save();
  await clearPending(chatId);
  bot.sendMessage(chatId, `✅ Cadeau *${code}* remis.`, { parse_mode: "Markdown", reply_markup: douxeurKeyboard });
  bot.sendMessage(gift.fromId, `🎉 Ton cadeau a été remis à ton ami invisible ! 🎁`, { parse_mode: "Markdown" });
}

async function reportGiftProblem(chatId, code, message) {
  const gift = await Gift.findOne({ code });
  if (!gift) { bot.sendMessage(chatId, `❌ Code introuvable.`); await clearPending(chatId); return; }
  gift.status = "problem"; await gift.save();
  await clearPending(chatId);
  bot.sendMessage(chatId, `✅ Problème signalé.`, { reply_markup: douxeurKeyboard });
  bot.sendMessage(gift.fromId, `⚠️ *Problème avec ton cadeau*\n\n_"${message}"_`, { parse_mode: "Markdown" });
  await notifyAdmins(`⚠️ *Problème cadeau*\nCode : \`${code}\`\n${message}`, { parse_mode: "Markdown" });
}

async function sendDouxeurDashboard(chatId) {
  const pending = await Gift.countDocuments({ status: "pending" });
  const received = await Gift.countDocuments({ status: "received" });
  const delivered = await Gift.countDocuments({ status: "delivered" });
  const problems = await Gift.countDocuments({ status: "problem" });
  bot.sendMessage(chatId,
    `🏪 *Dashboard Douxeur*\n\n📦 En attente : *${pending}*\n✅ Reçus : *${received}*\n🎁 Remis : *${delivered}*\n⚠️ Problèmes : *${problems}*`,
    { parse_mode: "Markdown", reply_markup: douxeurKeyboard }
  );
}

async function sendDouxeurPendingGifts(chatId) {
  const gifts = await Gift.find({ status: { $in: ["pending", "received"] } }).sort({ date: -1 });
  if (gifts.length === 0) { bot.sendMessage(chatId, "Aucun cadeau en attente. ✅", { reply_markup: douxeurKeyboard }); return; }
  const text = gifts.map((g, i) => `${i+1}. 🔑 \`${g.code}\` — ${g.status}\n   📝 ${g.description}`).join("\n\n");
  bot.sendMessage(chatId, `📦 *Cadeaux en cours :*\n\n${text}`, { parse_mode: "Markdown", reply_markup: douxeurKeyboard });
}

// ─── RAPPELS ──────────────────────────────────────────────
async function checkDailyReminder() {
  const gameStart = await getConfig("gameStartDate", null);
  if (!gameStart) return;
  const today = new Date().toDateString();
  const last = await getConfig("lastReminderDate", null);
  if (last === today) return;
  const nextTheme = await getConfig("theme_next", null);
  if (!nextTheme) {
    await notifyAdmins(`⏰ *Rappel quotidien*\n\n📅 Le thème de la semaine prochaine n'est pas encore défini !\n\nVa dans ✏️ Éditer → Thèmes → Thème semaine prochaine.`, { parse_mode: "Markdown" });
    await setConfig("lastReminderDate", today);
  }
}

setInterval(checkDailyReminder, 60 * 60 * 1000);
setTimeout(checkDailyReminder, 5000);

// ─── MONGODB ──────────────────────────────────────────────
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log("✅ MongoDB connecté");
    console.log("🤖 AmiInvisibleBot v5 is running...");
  })
  .catch(err => {
    console.error("❌ Erreur MongoDB :", err.message);
    process.exit(1);
  });
