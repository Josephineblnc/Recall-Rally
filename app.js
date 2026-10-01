import { isAnswerCorrect, modeQueue } from './game-logic.js';

const screens = document.querySelectorAll('.screen');
const navItems = document.querySelectorAll('.nav-item');
const sampleDeck = [
  { term: 'Orbite', definition: "Trajectoire courbe d'un objet autour d'une étoile ou d'une planète" },
  { term: 'Nébuleuse', definition: "Nuage de gaz et de poussière flottant dans l'espace" },
  { term: 'Gravité', definition: 'Force qui attire les objets les uns vers les autres' },
  { term: 'Galaxie', definition: "Immense ensemble d'étoiles, de gaz et de poussière" },
  { term: 'Astéroïde', definition: 'Objet rocheux qui se déplace autour du Soleil' },
  { term: 'Éclipse', definition: "Quand un objet spatial bloque la lumière d'un autre" }
];
function readStoredJSON(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function validPair(pair) {
  return pair && typeof pair.term === 'string' && pair.term.trim() && typeof pair.definition === 'string' && pair.definition.trim();
}

function normalizeDeck(value) {
  if (!Array.isArray(value)) return [...sampleDeck];
  const validDeck = value.filter(validPair).map((pair) => ({
    term: pair.term.trim().slice(0, 200),
    definition: pair.definition.trim().slice(0, 1000),
    ...(typeof pair.context === 'string' ? { context: pair.context.slice(0, 2000) } : {})
  }));
  return validDeck.length >= 2 ? validDeck : [...sampleDeck];
}

let deck = normalizeDeck(readStoredJSON('recall-rally-deck', sampleDeck));
const storedDeckName = localStorage.getItem('recall-rally-deck-name');
let deckName = typeof storedDeckName === 'string' ? storedDeckName.slice(0, 80) : 'Space basics';
let memoryCards = [];
let memorySelection = [];
let hangmanState = {};
let duelState = {};
let speedState = {};
let selectedDocumentFile = null;
let fillState = {};
let flashcardsState = {};
let summaryState = {};
let language = localStorage.getItem('recall-rally-language') || 'fr';
let nickname = localStorage.getItem('recall-rally-nickname') || 'Study player';
const avatarChoices = {
  'robot-01': { style: 'bottts', seed: 'rally-robot-01' },
  'robot-02': { style: 'bottts', seed: 'rally-robot-02' },
  'robot-03': { style: 'bottts', seed: 'rally-robot-03' },
  'robot-04': { style: 'bottts', seed: 'rally-robot-04' },
  'adventurer-01': { style: 'adventurer', seed: 'rally-adventurer-01' },
  'pixel-01': { style: 'pixel-art', seed: 'rally-pixel-01' },
  'lorelei-01': { style: 'lorelei', seed: 'rally-lorelei-01' },
  'fun-01': { style: 'fun-emoji', seed: 'rally-fun-01' }
};
const previousAvatarStyles = { adventurer: 'adventurer-01', bottts: 'robot-01', 'pixel-art': 'pixel-01', 'fun-emoji': 'fun-01', lorelei: 'lorelei-01', notionists: 'adventurer-01', 'open-peeps': 'adventurer-01', thumbs: 'fun-01' };
let avatar = localStorage.getItem('recall-rally-avatar') || 'adventurer-01';
avatar = previousAvatarStyles[avatar] || avatar;
if (!avatarChoices[avatar]) avatar = 'adventurer-01';
let xp = Number(localStorage.getItem('recall-rally-xp') || 0);
let streak = readStoredJSON('recall-rally-streak', { count: 0, lastDate: null, activityDates: [] });
let appNotificationsEnabled = localStorage.getItem('recall-rally-app-notifications') !== 'false';
let toastTimer;
let activeDailyChallenge = false;
let authToken = localStorage.getItem('recall-rally-access-token') || '';
let authMode = 'login';
let syncTimer;
let notificationHistory = readStoredJSON('recall-rally-notifications', []);
if (!Array.isArray(notificationHistory)) notificationHistory = [];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

function avatarUrl(choiceId) {
  const choice = avatarChoices[choiceId] || avatarChoices['adventurer-01'];
  return `https://api.dicebear.com/9.x/${choice.style}/svg?seed=${encodeURIComponent(choice.seed)}&backgroundColor=f4d36b`;
}

function renderAvatars() {
  const image = `<img src="${avatarUrl(avatar)}" alt="" />`;
  $('[data-home-avatar]').innerHTML = image;
  $('[data-profile-avatar]').innerHTML = image;
  $('[data-profile-heading-avatar]').innerHTML = image;
  $$('[data-avatar]').forEach((option) => { option.innerHTML = `<img src="${avatarUrl(option.dataset.avatar)}" alt="" />`; option.classList.toggle('active', option.dataset.avatar === avatar); });
}

function showScreen(name) {
  if (name !== 'speed') clearInterval(speedState.timer);
  screens.forEach((screen) => screen.classList.toggle('active', screen.dataset.screen === name));
  navItems.forEach((item) => item.classList.toggle('active', item.dataset.nav === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function freshPairQueue(mode = null) {
  return mode ? modeQueue(deck, mode) : shuffle(deck);
}

function dailyChallenge() {
  if (deck.length === 0) return { mode: 'memory', copy: ['Memory', 'Paire express', 'Ajoute au moins deux notions pour commencer.'], questions: 0, xp: 0 };
  const today = dateKey();
  const seed = [...today].reduce((total, character) => total + character.charCodeAt(0), 0);
  const modes = ['memory', 'hangman', 'duel', 'speed', 'fill', 'flashcards'];
  const mode = modes[seed % modes.length];
  const pair = deck[seed % deck.length];
  const french = language === 'fr';
  const copy = {
    memory: french ? ['Memory', 'Paire express', `Retrouve le terme et la définition de ${pair.term}.`] : ['Memory', 'Quick pair', `Find the term and definition for ${pair.term}.`],
    hangman: french ? ['Pendu', 'Terme mystère', `Révèle le terme lié à « ${pair.definition} ».`] : ['Hangman', 'Mystery term', `Reveal the term linked to “${pair.definition}”.`],
    duel: french ? ['Duel', 'Défi face-à-face', `Bats ton adversaire sur la notion ${pair.term}.`] : ['Duel', 'Face-off', `Beat your opponent on ${pair.term}.`],
    speed: french ? ['Course express', 'Vitesse éclair', `Réponds vite sur la notion ${pair.term}.`] : ['Speed race', 'Lightning round', `Answer quickly about ${pair.term}.`],
    fill: french ? ['Texte à trous', 'Extrait du jour', `Complète l’extrait consacré à ${pair.term}.`] : ['Course cloze', 'Daily excerpt', `Complete the excerpt about ${pair.term}.`]
  }[mode];
  return { mode, copy, questions: mode === 'memory' ? 6 : 1, xp: 80 + (seed % 5) * 10 };
}

function updateDailyChallenge() {
  const challenge = dailyChallenge();
  const [tag, title, description] = challenge.copy;
  $('[data-daily-tag]').textContent = tag;
  $('[data-daily-title]').textContent = title;
  $('[data-daily-description]').textContent = description;
  $('[data-daily-questions]').textContent = challenge.mode === 'memory' ? '6 cartes' : '1 défi';
  $('[data-daily-xp]').textContent = `+${challenge.xp} XP`;
}

function startMode(mode, fromDailyChallenge = false) {
  if (!fromDailyChallenge) activeDailyChallenge = false;
  if (deck.length < 2) {
    showToast(language === 'fr' ? 'Ajoute au moins deux notions avant de jouer.' : 'Add at least two study pairs before playing.');
    openLibrary();
    return;
  }
  if (mode === 'memory') startMemory();
  if (mode === 'hangman') { buildLetters(); startHangman(); }
  if (mode === 'duel') startDuel();
  if (mode === 'speed') showScreen('speed');
  if (mode === 'fill') startFill();
  if (mode === 'flashcards') startFlashcards();
}

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function recordStudyActivity() {
  const today = dateKey();
  if (streak.lastDate !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = dateKey(yesterday);
    streak.count = streak.lastDate === yesterdayKey ? streak.count + 1 : 1;
    streak.lastDate = today;
    streak.activityDates = [...new Set([...streak.activityDates, today])].slice(-30);
    localStorage.setItem('recall-rally-streak', JSON.stringify(streak));
    updateStreakUI();
  }
  const reward = activeDailyChallenge ? dailyChallenge().xp : 50;
  activeDailyChallenge = false;
  awardXP(reward);
}

function showToast(message) {
  if (!appNotificationsEnabled) return;
  const toast = $('[data-in-app-toast]');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3200);
}

function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function renderNotifications() {
  const list = $('[data-notification-list]');
  if (!notificationHistory.length) {
    list.innerHTML = '<div class="notification-empty"><span>✦</span><strong>Aucune notification</strong><small>Les réussites et récompenses apparaîtront ici.</small></div>';
  } else {
    list.innerHTML = notificationHistory.map((notification) => `<div class="notification-item"><span class="notification-item-icon">${escapeHTML(notification.icon || '✦')}</span><div><strong>${escapeHTML(notification.message)}</strong><small>${new Date(notification.date).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></div></div>`).join('');
  }
  $('.notification-dot').style.display = notificationHistory.length ? 'block' : 'none';
}

function addNotification(message, icon = '✦') {
  notificationHistory = [{ message, icon, date: new Date().toISOString() }, ...notificationHistory].slice(0, 12);
  localStorage.setItem('recall-rally-notifications', JSON.stringify(notificationHistory));
  renderNotifications();
}

function sendBrowserNotification(message) {
  if (localStorage.getItem('recall-rally-browser-notifications') !== 'true' || !('Notification' in window) || Notification.permission !== 'granted') return;
  new Notification('Recall Rally', { body: message, icon: '/favicon.ico' });
}

function notifyUser(message) {
  addNotification(message);
  showToast(message);
  sendBrowserNotification(message);
}

function updateProgressUI() {
  const level = Math.floor(xp / 500) + 1;
  const withinLevel = xp % 500;
  const french = language === 'fr';
  $('[data-level-label]').textContent = french ? `Niveau ${level}` : `Level ${level}`;
  $('[data-xp-label]').textContent = `${withinLevel} / 500 XP`;
  $('[data-xp-progress]').style.width = `${(withinLevel / 500) * 100}%`;
  $('[data-profile-stats]').textContent = french ? `${streak.count} jour${streak.count > 1 ? 's' : ''} de suite · ${xp} XP` : `${streak.count} day streak · ${xp.toLocaleString()} XP`;
}

function awardXP(amount) {
  xp += amount;
  localStorage.setItem('recall-rally-xp', String(xp));
  syncProgress();
  updateProgressUI();
  const level = Math.floor(xp / 500) + 1;
  notifyUser(language === 'fr' ? `+${amount} XP · Niveau ${level}` : `+${amount} XP · Level ${level}`);
}

function updateStreakUI() {
  const today = new Date();
  const currentDate = today.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' });
  const label = language === 'fr' ? `${streak.count} jour${streak.count > 1 ? 's' : ''} de suite` : `${streak.count} day streak`;
  const message = language === 'fr' ? (streak.count ? 'Continue sur ta lancée.' : 'Joue aujourd’hui pour commencer.') : (streak.count ? 'Keep the rally going.' : 'Play today to start your streak.');
  $('[data-current-date]').textContent = currentDate.charAt(0).toUpperCase() + currentDate.slice(1);
  $('[data-streak-label]').textContent = label;
  $('[data-streak-message]').textContent = message;
  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const dots = [...document.querySelectorAll('[data-week-dots] span')];
  dots.forEach((dot, index) => { const day = new Date(start); day.setDate(start.getDate() + index); const key = dateKey(day); dot.className = streak.activityDates.includes(key) ? 'done' : ''; if (key === dateKey(today)) dot.classList.add('today'); });
  updateProgressUI();
}

function updateDeckLabels() {
  $$('[data-deck-name]').forEach((item) => { item.textContent = deckName; });
  $$('[data-deck-count]').forEach((item) => { item.textContent = deck.length; });
  $('[data-mode-heading]').textContent = deckName;
}

function progressSnapshot() {
  return { nickname, avatar, language, xp, streak, deckName, deck };
}

function syncProgress() {
  if (!authToken) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      const response = await fetch('/api/progress', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` }, body: JSON.stringify(progressSnapshot()) });
      if (response.status === 401) { authToken = ''; localStorage.removeItem('recall-rally-access-token'); showAuth(); }
    } catch {
      showToast(language === 'fr' ? 'Synchronisation momentanément indisponible.' : 'Sync is temporarily unavailable.');
    }
  }, 500);
}

function showAuth() {
  $('.bottom-nav').style.display = 'none';
  showScreen('auth');
}

function showApp() {
  $('.bottom-nav').style.display = 'flex';
  showScreen('home');
}

async function loadProgress() {
  if (!authToken) { showAuth(); return; }
  try {
    const response = await fetch('/api/progress', { headers: { Authorization: `Bearer ${authToken}` } });
    if (response.status === 401) throw new Error('Session expirée.');
    if (!response.ok) throw new Error('Synchronisation indisponible.');
    const remote = await response.json();
    if (remote) {
      nickname = typeof remote.nickname === 'string' ? remote.nickname : nickname;
      avatar = avatarChoices[remote.avatar] ? remote.avatar : avatar;
      language = remote.language === 'en' ? 'en' : language;
      xp = Number.isInteger(remote.xp) ? remote.xp : xp;
      streak = remote.streak && typeof remote.streak === 'object' ? remote.streak : streak;
      deck = normalizeDeck(remote.deck);
      deckName = typeof remote.deck_name === 'string' ? remote.deck_name : deckName;
    } else syncProgress();
    applyLanguage();
    $('#nickname-input').value = nickname === 'Study player' ? '' : nickname;
    $('[data-profile-name]').textContent = nickname;
    renderAvatars();
    updateDeckLabels();
    updateDailyChallenge();
    showApp();
  } catch {
    authToken = '';
    localStorage.removeItem('recall-rally-access-token');
    $('[data-auth-feedback]').textContent = 'Session expirée. Reconnecte-toi pour continuer.';
    showAuth();
  }
}

function translateInterface() {
  const setText = (selector, text) => { const element = $(selector); if (element) element.textContent = text; };
  const setMany = (selector, texts) => $$(selector).forEach((element, index) => { if (texts[index]) element.textContent = texts[index]; });
  setText('.add-material-button', '+ Ajouter');
  setText('.welcome-row .eyebrow', 'Samedi 26 septembre');
  setText('.welcome-row h1', 'Prêt pour une petite victoire ?');
  updateStreakUI();
  setText('.section-heading:not(.compact) .eyebrow', 'À toi de jouer');
  setText('.section-heading:not(.compact) h2', 'Défi du jour');
  setText('.quest-card .tag', 'Astronomie');
  setText('.quest-card h3', 'Orbite express');
  setText('.quest-card p', 'Sauras-tu reconnaître une planète naine ?');
  setText('.quest-card .play-link', 'Jouer ↗');
  setText('.section-heading.compact .eyebrow', 'Ta fiche de révision');
  setText('.section-heading.compact h2', 'Joue à ta façon');
  setText('.section-heading.compact .text-button', 'Gérer');
  setText('.deck-summary small', `${deck.length} notions prêtes à jouer`);
  setMany('.mode-card strong', ['Memory', 'Pendu', 'Duel', 'Course express', 'Texte à trous']);
  setMany('.mode-card small', ['Associe terme et définition', 'Révèle la réponse', 'Défie un ami', 'Bats le chrono', "Complète l'extrait du cours"]);
  setText('.library-screen .eyebrow', 'Construis ta fiche');
  setText('.library-screen h1', 'Ajouter un document');
  setText('.library-intro', 'Ajoute ton cours : nous transformerons chaque notion en jeu.');
  setText('.upload-drop strong', 'Choisir un document');
  setText('.upload-drop small', 'TXT, MD, CSV, PDF, DOCX ou Pages · 5 Mo maximum');
  setText('.or-divider span', 'ou colle tes notes');
  setText('.format-note', 'Une notion par ligne. Sépare le terme et sa définition avec `:`, ` - ` ou une virgule.');
  setText('[data-action="create-deck"]', 'Créer la fiche →');
  setText('[data-action="create-ai-deck"]', '✦ Créer avec Gemini');
  setText('.ai-limit-note', 'Gemini : 10 générations par jour et par compte.');
  setText('.sample-note strong', "Besoin d'un exemple ?");
  setText('[data-action="load-sample"]', "Charger l'exemple astronomie");
  setText('.modes-screen .eyebrow', 'Choisis un défi');
  setText('.modes-screen .library-intro', `${deck.length} notions sont prêtes. Tous les jeux utilisent ta fiche.`);
  setMany('.mode-list-item strong', ['Memory', 'Pendu', 'Duel', 'Course express', 'Texte à trous']);
  setMany('.mode-list-item small', ['Associe chaque terme à sa définition', 'Devine les lettres du terme', 'Joue à tour de rôle avec un ami', 'Réponds en 30 secondes', 'Complète un extrait du cours']);
  setText('[data-screen="memory"] .eyebrow', 'Memory');
  setText('[data-screen="memory"] h2', 'Trouve les paires');
  setText('[data-screen="memory"] .game-instruction', 'Associe chaque terme à sa définition.');
  setText('[data-screen="hangman"] .eyebrow', 'Pendu');
  setText('[data-screen="hangman"] h2', 'Révèle le terme');
  setText('[data-screen="hangman"] .hangman-card .eyebrow', 'Définition');
  setText('[data-screen="duel"] .eyebrow', 'Duel');
  setText('[data-screen="duel"] h2', 'Passe le téléphone');
  setText('[data-screen="duel"] .duel-question .eyebrow', 'Quel terme correspond ?');
  setText('[data-screen="speed"] .eyebrow', 'Course express');
  setText('[data-screen="speed"] h2', 'Bats le chrono');
  setText('[data-screen="speed"] .speed-question .eyebrow', 'Choisis le terme correspondant');
  setText('[data-screen="fill"] .game-header .eyebrow', 'Texte à trous');
  setText('[data-screen="fill"] .fill-card .eyebrow', 'Extrait du cours');
  setText('[data-screen="fill"] h2', "Complète l'extrait");
  setText('[data-screen="fill"] .fill-form label', 'Que faut-il mettre dans le blanc ?');
  setText('[data-screen="fill"] .fill-input-row button', 'Vérifier');
  $('#fill-answer').placeholder = 'Écris le concept manquant';
  setText('[data-action="fill-next"]', 'Extrait suivant →');
  setMany('.nav-item', ['Accueil', 'Jeux', 'Ajouter', 'Profil']);
  $$('.nav-item').forEach((element, index) => { element.innerHTML = `<span>${['⌂', '✦', '＋', '◉'][index]}</span>${['Accueil', 'Jeux', 'Ajouter', 'Profil'][index]}`; });
  setText('.profile-heading .eyebrow', 'Ton espace');
  setText('.profile-heading h1', 'Profil');
  setText('.profile-card strong', 'Joueur');
  setText('[data-profile-name]', nickname);
  updateProgressUI();
  setText('.avatar-setting strong', 'Avatar');
  setText('.avatar-setting small', 'Choisis un personnage DiceBear pour ton profil');
  setText('.settings-heading .eyebrow', 'Préférences');
  setText('.settings-heading h2', 'Réglages');
  setText('.setting-row strong', 'Langue');
  setText('.setting-row small', "Choisis la langue de l'interface");
  setText('.nickname-setting strong', 'Nom affiché');
  setText('.nickname-setting small', 'Visible sur ton profil local');
  $('#nickname-input').placeholder = 'Ton prénom';
  setText('[data-action="save-nickname"]', 'Enregistrer');
  setText('[data-setting="app-notifications"] strong', 'Notifications dans l’app');
  setText('[data-setting="app-notifications"] small', 'Afficher les retours et rappels dans Recall Rally');
  setText('[data-action="toggle-app-notifications"]', appNotificationsEnabled ? 'Activées' : 'Désactivées');
  $('[data-action="toggle-app-notifications"]').classList.toggle('active', appNotificationsEnabled);
  $('[data-action="toggle-app-notifications"]').setAttribute('aria-pressed', String(appNotificationsEnabled));
  setText('[data-setting="browser-notifications"] strong', 'Notifications du navigateur');
  setText('[data-setting="browser-notifications"] small', 'Autoriser les notifications dans ce navigateur');
  setText('[data-action="enable-browser-notifications"]', 'Autoriser');
}

function applyLanguage() {
  document.documentElement.lang = language;
  if (language === 'fr') translateInterface();
  $$('[data-language]').forEach((button) => button.classList.toggle('active', button.dataset.language === language));
}

function showSessionSummary(summary) {
  const config = {
    memory: { label: 'Memory', title: 'Session réussie' },
    hangman: { label: 'Pendu', title: 'Partie terminée' },
    duel: { label: 'Duel', title: 'Fin du duel' },
    speed: { label: 'Course express', title: 'Course terminée' },
    fill: { label: 'Texte à trous', title: 'Extrait terminé' }
  }[summary.mode] || { label: 'Jeu', title: 'Session terminée' };
  const total = Number(summary.total) || 0;
  const correct = Number(summary.correct) || 0;
  const errors = Number(summary.errors) || Math.max(total - correct, 0);
  const percentage = total ? Math.round((correct / total) * 100) : 0;
  summaryState = { ...summary, total, correct, errors, percentage };
  $('[data-summary-label]').textContent = config.label;
  $('[data-summary-title]').textContent = config.title;
  $('[data-summary-score]').textContent = correct;
  $('[data-summary-total]').textContent = `${correct} / ${total}`;
  $('[data-summary-correct]').textContent = correct;
  $('[data-summary-errors]').textContent = errors;
  $('[data-summary-accuracy]').textContent = `${percentage}%`;
  const list = $('[data-summary-list]');
  const items = summary.badges || [
    { label: 'Bonnes réponses', value: correct },
    { label: 'Erreurs', value: errors },
    { label: 'Score', value: `${correct} pts` }
  ];
  list.innerHTML = items.map((item) => `<div class="summary-item"><span>${escapeHTML(item.label)}</span><strong>${escapeHTML(String(item.value))}</strong></div>`).join('');
  showScreen('summary');
}

function setLanguagePreference(nextLanguage) {
  if (!['fr', 'en'].includes(nextLanguage)) return;
  language = nextLanguage;
  localStorage.setItem('recall-rally-language', language);
  syncProgress();
  applyLanguage();
}

function updateImportPreview() {
  const pairs = parseDocument($('#document-text').value);
  const feedback = $('.import-feedback');
  if (!pairs.length) {
    if (feedback) feedback.textContent = '';
    return;
  }
  if (feedback) {
    feedback.textContent = `${pairs.length} notion${pairs.length > 1 ? 's' : ''} détectée${pairs.length > 1 ? 's' : ''}.`;
  }
}

function parseDocument(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const match = line.match(/^(.+?)\s*(?::|\s-\s|,|\t)\s*(.+)$/);
    return match ? { term: match[1].trim().replace(/^[-*]\s*/, ''), definition: match[2].trim() } : null;
  }).filter((pair) => pair && pair.term.length > 0 && pair.definition.length > 0).slice(0, 30);
}

function setDeck(nextDeck, name) {
  deck = normalizeDeck(nextDeck);
  deckName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 80) : 'My study kit';
  localStorage.setItem('recall-rally-deck', JSON.stringify(deck));
  localStorage.setItem('recall-rally-deck-name', deckName);
  syncProgress();
  updateDeckLabels();
}

function openLibrary() {
  $('.import-feedback').textContent = '';
  showScreen('library');
}

function openModes() {
  updateDeckLabels();
  showScreen('modes');
}

function startMemory() {
  memorySelection = [];
  const memoryDeck = freshPairQueue('memory').slice(0, Math.min(deck.length, 6));
  memoryCards = shuffle(memoryDeck.flatMap((pair, index) => [
    { id: `${index}-term`, pair: index, text: pair.term, type: 'term' },
    { id: `${index}-definition`, pair: index, text: pair.definition, type: 'definition' }
  ]));
  $('[data-memory-counter]').textContent = `0 / ${memoryCards.length / 2}`;
  $('[data-memory-feedback]').textContent = '';
  $('[data-memory-grid]').innerHTML = memoryCards.map((card) => `<button class="memory-card" data-card-id="${card.id}" aria-label="Carte retournée"><span class="memory-back">✦</span><span class="memory-kind">${card.type === 'term' ? 'TERME' : 'DÉFINITION'}</span><strong>${escapeHTML(card.text)}</strong></button>`).join('');
  $$('.memory-card').forEach((card) => card.addEventListener('click', () => chooseMemory(card)));
  showScreen('memory');
}

function chooseMemory(element) {
  if (element.classList.contains('matched') || memorySelection.length === 2) return;
  element.classList.add('flipped');
  memorySelection.push({ element, card: memoryCards.find((card) => card.id === element.dataset.cardId) });
  if (memorySelection.length < 2) return;
  const [first, second] = memorySelection;
  if (first.card.pair === second.card.pair && first.card.type !== second.card.type) {
    first.element.classList.add('matched');
    second.element.classList.add('matched');
    const matches = $$('.memory-card.matched').length / 2;
    const totalPairs = memoryCards.length / 2;
    $('[data-memory-counter]').textContent = `${matches} / ${totalPairs}`;
    $('[data-memory-feedback]').textContent = matches === totalPairs ? 'Fiche maîtrisée. Bravo !' : 'Paire trouvée.';
    if (matches === totalPairs) {
      recordStudyActivity();
      showSessionSummary({
        mode: 'memory',
        correct: totalPairs,
        total: totalPairs,
        errors: 0,
        badges: [
          { label: 'Paires trouvées', value: totalPairs },
          { label: 'Erreurs', value: 0 },
          { label: 'XP', value: '+50' }
        ]
      });
    }
    memorySelection = [];
  } else {
    $('[data-memory-feedback]').textContent = 'Ces deux cartes ne vont pas ensemble.';
    setTimeout(() => { first.element.classList.remove('flipped'); second.element.classList.remove('flipped'); memorySelection = []; }, 650);
  }
}

function startHangman() {
  hangmanState = { queue: freshPairQueue('hangman'), guessed: [], tries: 5, round: 1, total: Math.min(deck.length, 8), score: 0, roundRewarded: false };
  hangmanState.pair = hangmanState.queue.shift();
  $('[data-hangman-definition]').textContent = hangmanState.pair.definition;
  renderHangman();
  showScreen('hangman');
}

function renderHangman() {
  const answer = hangmanState.pair.term.toUpperCase();
  const solved = [...answer].every((letter) => letter === ' ' || hangmanState.guessed.includes(letter));
  const finished = solved || hangmanState.tries === 0;
  $('[data-hangman-definition]').textContent = hangmanState.pair.definition;
  $('[data-hangman-word]').innerHTML = [...answer].map((letter) => letter === ' ' ? '<i class="word-space"></i>' : `<span>${hangmanState.guessed.includes(letter) ? escapeHTML(letter) : '_'}</span>`).join('');
  $('[data-hangman-counter]').textContent = `${hangmanState.round} / ${hangmanState.total} · ${hangmanState.tries} essais`;
  $('[data-hangman-status]').textContent = solved ? 'Correct !' : (hangmanState.tries === 0 ? `La réponse était ${hangmanState.pair.term}.` : '');
  if (solved && !hangmanState.roundRewarded) { hangmanState.score += 1; hangmanState.roundRewarded = true; recordStudyActivity(); }
  const next = $('[data-action="hangman-next"]');
  next.hidden = !finished;
  next.textContent = hangmanState.round >= hangmanState.total ? 'Voir le résultat  →' : 'Terme suivant  →';
  $$('.letter-button').forEach((button) => { button.disabled = hangmanState.guessed.includes(button.textContent); });
}

function buildLetters() {
  $('[data-letter-grid]').innerHTML = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => `<button class="letter-button">${letter}</button>`).join('');
  $$('.letter-button').forEach((button) => button.addEventListener('click', () => {
    const letter = button.textContent;
    if (hangmanState.guessed.includes(letter) || hangmanState.tries === 0) return;
    hangmanState.guessed.push(letter);
    if (!hangmanState.pair.term.toUpperCase().includes(letter)) hangmanState.tries -= 1;
    renderHangman();
  }));
}

function nextHangmanRound() {
  if (hangmanState.round >= hangmanState.total && !hangmanState.summaryShown) {
    $('[data-hangman-status]').textContent = `Partie terminée : ${hangmanState.score} / ${hangmanState.total} bonne(s) réponse(s).`;
    $('[data-action="hangman-next"]').textContent = 'Rejouer  →';
    hangmanState.summaryShown = true;
    showSessionSummary({
      mode: 'hangman',
      correct: hangmanState.score,
      total: hangmanState.total,
      errors: hangmanState.total - hangmanState.score,
      badges: [
        { label: 'Bonnes réponses', value: hangmanState.score },
        { label: 'Erreurs', value: hangmanState.total - hangmanState.score },
        { label: 'XP', value: `+${hangmanState.score * 20}` }
      ]
    });
    return;
  }
  if (hangmanState.round >= hangmanState.total) { buildLetters(); startHangman(); return; }
  hangmanState.round += 1;
  if (!hangmanState.queue.length) hangmanState.queue = freshPairQueue();
  hangmanState.pair = hangmanState.queue.shift();
  hangmanState.guessed = [];
  hangmanState.tries = 5;
  hangmanState.roundRewarded = false;
  renderHangman();
}

function nextDuelQuestion() {
  if (!duelState.queue.length) duelState.queue = freshPairQueue('duel');
  duelState.pair = duelState.queue.shift();
  $('[data-duel-definition]').textContent = duelState.pair.definition;
  const choices = shuffle([duelState.pair, ...shuffle(deck.filter((pair) => pair !== duelState.pair)).slice(0, 3)]);
  $('[data-duel-options]').innerHTML = choices.map((pair) => `<button class="duel-option" data-answer="${escapeHTML(pair.term)}">${escapeHTML(pair.term)}</button>`).join('');
  $$('.duel-option').forEach((button) => button.addEventListener('click', () => answerDuel(button)));
}

function startDuel() {
  duelState = { player: 1, scoreOne: 0, scoreTwo: 0, queue: freshPairQueue('duel'), rounds: 0, target: Math.min(Math.max(deck.length, 5), 8) };
  $('[data-score-one]').textContent = '0';
  $('[data-score-two]').textContent = '0';
  $('[data-duel-feedback]').textContent = '';
  nextDuelQuestion();
  showScreen('duel');
}

function answerDuel(button) {
  const correct = isAnswerCorrect(button.dataset.answer, duelState.pair.term);
  duelState.rounds += 1;
  if (correct) duelState[duelState.player === 1 ? 'scoreOne' : 'scoreTwo'] += 1;
  if (correct) recordStudyActivity();
  button.classList.add(correct ? 'correct' : 'wrong');
  $('[data-score-one]').textContent = duelState.scoreOne;
  $('[data-score-two]').textContent = duelState.scoreTwo;
  $('[data-duel-feedback]').textContent = correct ? `Point pour le joueur ${duelState.player} !` : `La réponse était ${duelState.pair.term}.`;
  $$('.duel-option').forEach((option) => { option.disabled = true; });
  const hasFinished = duelState.rounds >= duelState.target;
  setTimeout(() => {
    if (hasFinished) {
      const winnerScore = Math.max(duelState.scoreOne, duelState.scoreTwo);
      const totalCorrect = duelState.scoreOne + duelState.scoreTwo;
      const totalRounds = duelState.target;
      showSessionSummary({
        mode: 'duel',
        correct: totalCorrect,
        total: totalRounds,
        errors: totalRounds - totalCorrect,
        badges: [
          { label: 'Joueur 1', value: duelState.scoreOne },
          { label: 'Joueur 2', value: duelState.scoreTwo },
          { label: 'Vainqueur', value: winnerScore }
        ]
      });
      return;
    }
    duelState.player = duelState.player === 1 ? 2 : 1; $('[data-duel-turn]').textContent = `Joueur ${duelState.player}`; nextDuelQuestion();
  }, 800);
}

function nextSpeedQuestion() {
  if (!speedState.queue.length) speedState.queue = freshPairQueue('speed');
  speedState.pair = speedState.queue.shift();
  $('[data-speed-definition]').textContent = speedState.pair.definition;
  const choices = shuffle([speedState.pair, ...shuffle(deck.filter((pair) => pair !== speedState.pair)).slice(0, 3)]);
  $('[data-speed-options]').innerHTML = choices.map((pair) => `<button class="duel-option" data-answer="${escapeHTML(pair.term)}">${escapeHTML(pair.term)}</button>`).join('');
  $$('.duel-option').forEach((button) => button.addEventListener('click', () => answerSpeed(button)));
}

function startSpeed() {
  clearInterval(speedState.timer);
  speedState = { score: 0, remaining: 45, queue: freshPairQueue('speed') };
  $('[data-action="start-speed"]').style.display = 'none';
  $('[data-speed-feedback]').textContent = '';
  $('[data-speed-progress]').style.width = '100%';
  nextSpeedQuestion();
  speedState.timer = setInterval(() => { speedState.remaining -= 1; $('[data-speed-timer]').textContent = `${speedState.remaining}s`; $('[data-speed-progress]').style.width = `${(speedState.remaining / 45) * 100}%`; if (speedState.remaining <= 0) finishSpeed(); }, 1000);
}

function answerSpeed(button) {
  if (speedState.remaining <= 0) return;
  const correct = isAnswerCorrect(button.dataset.answer, speedState.pair.term);
  if (correct) speedState.score += 1;
  button.classList.add(correct ? 'correct' : 'wrong');
  $('[data-speed-feedback]').textContent = correct ? `Bravo. ${speedState.score} bonne(s) réponse(s).` : `La réponse était ${speedState.pair.term}.`;
  $$('.duel-option').forEach((option) => { option.disabled = true; });
  setTimeout(() => { if (speedState.remaining > 0) nextSpeedQuestion(); }, 350);
}

function finishSpeed() {
  clearInterval(speedState.timer);
  speedState.timer = null;
  if (speedState.score > 0) recordStudyActivity();
  $('[data-speed-timer]').textContent = 'Done';
  $('[data-speed-feedback]').textContent = `Course terminée : ${speedState.score} bonne(s) réponse(s).`;
  showSessionSummary({
    mode: 'speed',
    correct: speedState.score,
    total: Math.max(speedState.score, 1),
    errors: Math.max(0, speedState.score === 0 ? 1 : 0),
    badges: [
      { label: 'Bonnes réponses', value: speedState.score },
      { label: 'Temps restant', value: `${speedState.remaining}s` },
      { label: 'XP', value: `+${speedState.score * 15}` }
    ]
  });
  $('[data-action="start-speed"]').style.display = 'block';
  $('[data-action="start-speed"]').textContent = 'Rejouer  →';
}

function startFill() {
  fillState = { round: 1, total: Math.min(deck.length, 8), queue: freshPairQueue('fill') };
  nextFillQuestion();
  showScreen('fill');
}

function startFlashcards() {
  flashcardsState = { queue: freshPairQueue('flashcards'), index: 0, known: 0, review: 0, shown: false };
  renderFlashcard();
  showScreen('flashcards');
}

function renderFlashcard() {
  const cards = flashcardsState.queue || [];
  if (!cards.length) {
    showSessionSummary({
      mode: 'flashcards',
      correct: flashcardsState.known,
      total: Math.max(flashcardsState.known + flashcardsState.review, 1),
      errors: flashcardsState.review,
      badges: [
        { label: 'Connus', value: flashcardsState.known },
        { label: 'À revoir', value: flashcardsState.review },
        { label: 'XP', value: `+${flashcardsState.known * 10}` }
      ]
    });
    return;
  }
  const pair = cards[flashcardsState.index % cards.length];
  const isRevealed = flashcardsState.shown;
  $('[data-flashcard-counter]').textContent = `${flashcardsState.index + 1} / ${cards.length}`;
  $('[data-flashcard-front]').textContent = pair.term;
  $('[data-flashcard-back]').textContent = pair.definition;
  $('[data-flashcard-back]').hidden = !isRevealed;
  $('[data-flashcard-label]').textContent = isRevealed ? 'Definition' : 'Term';
}

function advanceFlashcard(status) {
  const queue = flashcardsState.queue || [];
  if (!queue.length) return;
  const current = queue[flashcardsState.index % queue.length];
  if (status === 'known') flashcardsState.known += 1; else flashcardsState.review += 1;
  flashcardsState.index += 1;
  flashcardsState.shown = false;
  if (flashcardsState.index >= queue.length) {
    showSessionSummary({
      mode: 'flashcards',
      correct: flashcardsState.known,
      total: Math.max(queue.length, 1),
      errors: flashcardsState.review,
      badges: [
        { label: 'Connus', value: flashcardsState.known },
        { label: 'À revoir', value: flashcardsState.review },
        { label: 'XP', value: `+${flashcardsState.known * 10}` }
      ]
    });
    return;
  }
  renderFlashcard();
}

function maskClozeTerm(passage, term) {
  const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const normalizedPassage = normalize(passage);
  const normalizedTerm = normalize(term);
  const directIndex = normalizedPassage.indexOf(normalizedTerm);
  if (directIndex >= 0) {
    let normalizedOffset = 0;
    let originalStart = -1;
    let originalEnd = -1;
    for (let originalIndex = 0; originalIndex < passage.length; originalIndex += 1) {
      const normalizedCharacter = normalize(passage[originalIndex]);
      if (normalizedOffset === directIndex) originalStart = originalIndex;
      normalizedOffset += normalizedCharacter.length;
      if (normalizedOffset === directIndex + normalizedTerm.length) { originalEnd = originalIndex + 1; break; }
    }
    if (originalStart >= 0 && originalEnd >= 0) return `${escapeHTML(passage.slice(0, originalStart))}<span class="passage-blank">________</span>${escapeHTML(passage.slice(originalEnd))}`;
  }
  const trimmedPassage = passage.replace(/[.!?]+\s*$/, '');
  return `${escapeHTML(trimmedPassage)}. Le concept clé à retenir est <span class="passage-blank">________</span>.`;
}

function nextFillQuestion() {
  if (!fillState.queue.length || (fillState.round === 1 && fillState.pair)) fillState.queue = freshPairQueue('fill');
  fillState.pair = fillState.queue.shift();
  const answer = fillState.pair.term;
  const passage = fillState.pair.context || `Dans ce cours, ${answer} est important parce que ${fillState.pair.definition}.`;
  const maskedPassage = maskClozeTerm(passage, answer);
  $('[data-fill-counter]').textContent = `${fillState.round} / ${fillState.total}`;
  $('[data-fill-passage]').innerHTML = maskedPassage;
  $('[data-fill-feedback]').textContent = '';
  $('#fill-answer').value = '';
  $('#fill-answer').disabled = false;
  $('[data-fill-form] button').disabled = false;
  $('[data-action="fill-next"]').hidden = true;
  $('#fill-answer').focus();
}

function checkFill(event) {
  event.preventDefault();
  if (!fillState.pair) return;
  const answer = $('#fill-answer').value.trim();
  const correct = isAnswerCorrect(answer, fillState.pair.term);
  if (correct) recordStudyActivity();
  $('[data-fill-feedback]').textContent = correct ? 'Correct. Bonne mémoire !' : `Pas tout à fait. La réponse était ${fillState.pair.term}.`;
  $('#fill-answer').disabled = true;
  $('[data-fill-form] button').disabled = true;
  $('[data-action="fill-next"]').hidden = false;
  $('[data-action="fill-next"]').textContent = fillState.round >= fillState.total ? 'Rejouer  →' : 'Extrait suivant  →';
  if (fillState.round >= fillState.total) {
    const total = fillState.total;
    const score = Number(fillState.score || 0) + (correct ? 1 : 0);
    fillState.score = score;
    showSessionSummary({
      mode: 'fill',
      correct: score,
      total,
      errors: total - score,
      badges: [
        { label: 'Bonnes réponses', value: score },
        { label: 'Erreurs', value: total - score },
        { label: 'XP', value: `+${score * 20}` }
      ]
    });
  }
}

function bindModeButtons() {
  $$('[data-mode]').forEach((button) => button.addEventListener('click', () => {
    startMode(button.dataset.mode);
  }));
}

function resetFillScore() {
  fillState.score = 0;
}

document.querySelector('[data-action="toggle-auth"]').addEventListener('click', () => {
  authMode = authMode === 'login' ? 'signup' : 'login';
  $('[data-auth-title]').textContent = authMode === 'login' ? 'Connexion' : 'Créer un compte';
  $('[data-auth-copy]').textContent = authMode === 'login' ? 'Connecte-toi pour retrouver tes progrès sur tous tes appareils.' : 'Crée un compte pour sauvegarder tes progrès en ligne.';
  $('[data-auth-submit]').textContent = authMode === 'login' ? 'Se connecter' : 'Créer le compte';
  $('[data-action="toggle-auth"]').textContent = authMode === 'login' ? 'Créer un compte' : 'J’ai déjà un compte';
  $('#auth-password').autocomplete = authMode === 'login' ? 'current-password' : 'new-password';
});
document.querySelector('[data-auth-form]').addEventListener('submit', async (event) => {
  event.preventDefault();
  const feedback = $('[data-auth-feedback]');
  const button = $('[data-auth-submit]');
  button.textContent = '...';
  feedback.textContent = '';
  try {
    const response = await fetch(`/api/auth/${authMode === 'login' ? 'login' : 'signup'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('#auth-email').value, password: $('#auth-password').value }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Authentification impossible.');
    if (!result.access_token) { feedback.textContent = 'Compte créé. Vérifie ton email puis connecte-toi.'; authMode = 'login'; $('[data-auth-title]').textContent = 'Connexion'; $('[data-auth-submit]').textContent = 'Se connecter'; return; }
    authToken = result.access_token;
    localStorage.setItem('recall-rally-access-token', authToken);
    await loadProgress();
  } catch (error) {
    feedback.textContent = error.message;
    button.textContent = authMode === 'login' ? 'Se connecter' : 'Créer le compte';
  }
});

$$('[data-action="open-library"]').forEach((button) => button.addEventListener('click', openLibrary));
$$('[data-action="go-home"]').forEach((button) => button.addEventListener('click', () => showScreen('home')));
$$('[data-action="open-modes"]').forEach((button) => button.addEventListener('click', openModes));
document.querySelector('[data-action="daily-challenge"]').addEventListener('click', () => { activeDailyChallenge = true; startMode(dailyChallenge().mode, true); });
document.querySelector('[data-action="load-sample"]').addEventListener('click', () => { $('#document-text').value = sampleDeck.map((pair) => `${pair.term}: ${pair.definition}`).join('\n'); });
document.querySelector('[data-action="clear-document"]').addEventListener('click', () => {
  $('#document-text').value = '';
  $('#document-input').value = '';
  selectedDocumentFile = null;
  $('.import-feedback').textContent = '';
});
document.querySelector('[data-action="create-deck"]').addEventListener('click', () => {
  const pairs = parseDocument($('#document-text').value);
  const feedback = $('.import-feedback');
  if (pairs.length < 2) { feedback.textContent = 'Ajoute au moins deux notions pour créer un jeu.'; return; }
  setDeck(pairs, $('#document-input').files[0]?.name.replace(/\.[^.]+$/, '') || 'My study kit');
  feedback.textContent = `${pairs.length} notions prêtes. Tes jeux t'attendent.`;
  setTimeout(openModes, 700);
});
document.querySelector('[data-action="create-ai-deck"]').addEventListener('click', async () => {
  const text = $('#document-text').value.trim();
  const feedback = $('.import-feedback');
  const button = $('[data-action="create-ai-deck"]');
  if (!selectedDocumentFile && text.length < 10) { feedback.textContent = "Ajoute d'abord du contenu de cours."; return; }
  button.disabled = true;
  button.classList.add('loading');
  button.innerHTML = '<span>✦</span> Génération en cours… merci de patienter.';
  feedback.textContent = 'Génération en cours. Merci de patienter pendant la création de ta fiche…';
  try {
    const request = selectedDocumentFile ? { file: { name: selectedDocumentFile.name, type: selectedDocumentFile.type, data: await fileToBase64(selectedDocumentFile) } } : { text };
    const response = await fetch('/api/generate-deck', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) }, body: JSON.stringify(request) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The AI request failed.');
    if (!Array.isArray(result.pairs) || result.pairs.length < 2 || result.pairs.some((pair) => !validPair(pair))) throw new Error('La réponse générée est invalide.');
    setDeck(result.pairs, result.name);
    feedback.textContent = `${result.pairs.length} notions prêtes. Ta fiche Gemini est disponible.`;
    setTimeout(openModes, 700);
  } catch (error) {
    const quotaReached = /Limite Gemini/i.test(error.message);
    const overloaded = !quotaReached && /high demand|overload|temporar|429|503|sollicit/i.test(error.message);
    feedback.textContent = overloaded ? 'Gemini est momentanément très sollicité. Attends quelques secondes puis réessaie.' : error.message;
    button.disabled = false;
    button.classList.remove('loading');
    button.innerHTML = '<span>✦</span> Créer avec Gemini';
  }
});
function fileToBase64(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.addEventListener('load', () => resolve(reader.result.split(',')[1])); reader.addEventListener('error', reject); reader.readAsDataURL(file); }); }
$('#document-input').addEventListener('change', (event) => { const file = event.target.files[0]; if (!file) { selectedDocumentFile = null; return; } if (file.size > 5 * 1024 * 1024) { selectedDocumentFile = null; $('.import-feedback').textContent = 'Ce document dépasse la limite de 5 Mo.'; event.target.value = ''; return; } selectedDocumentFile = file; const textFormats = ['text/plain', 'text/markdown', 'text/csv']; if (textFormats.includes(file.type) || /\.(txt|md|csv)$/i.test(file.name)) { const reader = new FileReader(); reader.addEventListener('load', () => { $('#document-text').value = reader.result; }); reader.readAsText(file); } else { $('#document-text').value = `${file.name} selected. Click Build with AI to turn it into games.`; } });
$('#document-text').addEventListener('input', () => {
  selectedDocumentFile = null;
  $('#document-input').value = '';
  updateImportPreview();
});
$$('[data-nav]').forEach((item) => item.addEventListener('click', () => { if (item.dataset.nav === 'profile') { showScreen('profile'); return; } if (item.dataset.nav === 'library') openLibrary(); else if (item.dataset.nav === 'modes') openModes(); else showScreen('home'); }));
$$('[data-language]').forEach((button) => button.addEventListener('click', () => { setLanguagePreference(button.dataset.language); }));
document.querySelector('[data-action="save-nickname"]').addEventListener('click', () => { const value = $('#nickname-input').value.trim(); if (!value) return; nickname = value; localStorage.setItem('recall-rally-nickname', nickname); syncProgress(); $('[data-profile-name]').textContent = nickname; renderAvatars(); });
document.querySelector('[data-action="open-profile"]').addEventListener('click', () => showScreen('profile'));
$$('[data-action="open-avatar-picker"]').forEach((button) => button.addEventListener('click', () => { showScreen('profile'); $('.avatar-setting').scrollIntoView({ behavior: 'smooth', block: 'center' }); }));
$$('[data-avatar]').forEach((button) => button.addEventListener('click', () => { avatar = button.dataset.avatar; localStorage.setItem('recall-rally-avatar', avatar); syncProgress(); renderAvatars(); }));
document.querySelector('[data-action="toggle-app-notifications"]').addEventListener('click', () => { appNotificationsEnabled = !appNotificationsEnabled; localStorage.setItem('recall-rally-app-notifications', appNotificationsEnabled); applyLanguage(); });
document.querySelector('[data-action="enable-browser-notifications"]').addEventListener('click', async () => { if (!('Notification' in window)) { showToast(language === 'fr' ? 'Les notifications ne sont pas disponibles ici.' : 'Browser notifications are not available here.'); return; } const permission = await Notification.requestPermission(); if (permission === 'granted') { localStorage.setItem('recall-rally-browser-notifications', 'true'); notifyUser(language === 'fr' ? 'Notifications du navigateur activées.' : 'Browser notifications enabled.'); } else { showToast(language === 'fr' ? 'Autorisation refusée.' : 'Permission was denied.'); } });
document.querySelector('[data-action="toggle-notifications"]').addEventListener('click', () => { const drawer = $('[data-notification-drawer]'); const open = drawer.classList.toggle('open'); drawer.setAttribute('aria-hidden', String(!open)); $('[data-action="toggle-notifications"]').setAttribute('aria-expanded', String(open)); renderNotifications(); });
document.querySelector('[data-action="close-notifications"]').addEventListener('click', () => { $('[data-notification-drawer]').classList.remove('open'); $('[data-notification-drawer]').setAttribute('aria-hidden', 'true'); $('[data-action="toggle-notifications"]').setAttribute('aria-expanded', 'false'); });
document.querySelector('[data-action="start-speed"]').addEventListener('click', startSpeed);
document.querySelector('[data-action="hangman-next"]').addEventListener('click', nextHangmanRound);
document.querySelector('[data-action="flashcard-reveal"]').addEventListener('click', () => { flashcardsState.shown = true; renderFlashcard(); });
document.querySelector('[data-action="flashcard-next"]').addEventListener('click', () => advanceFlashcard('review'));
document.querySelector('[data-action="flashcard-known"]').addEventListener('click', () => advanceFlashcard('known'));
document.querySelector('[data-action="flashcard-again"]').addEventListener('click', () => advanceFlashcard('review'));
document.querySelector('[data-fill-form]').addEventListener('submit', checkFill);
document.querySelector('[data-action="fill-next"]').addEventListener('click', () => { if (fillState.round >= fillState.total) { fillState.round = 1; resetFillScore(); } else fillState.round += 1; nextFillQuestion(); });
document.querySelector('[data-action="summary-home"]').addEventListener('click', () => { showScreen('home'); });

applyLanguage();
$('#nickname-input').value = nickname === 'Study player' ? '' : nickname;
$('[data-profile-name]').textContent = nickname;
$('[data-profile-avatar]').textContent = nickname.charAt(0).toUpperCase();
$('.profile-heading .avatar').textContent = nickname.charAt(0).toUpperCase();
renderAvatars();
renderNotifications();
updateDeckLabels();
updateDailyChallenge();
bindModeButtons();
loadProgress();
