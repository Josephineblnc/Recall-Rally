import { clozePassage, isAnswerCorrect, modeQueue, normalizeForComparison, summarizeAnswers } from './game-logic.js';

const screens = document.querySelectorAll('.screen');
const navItems = document.querySelectorAll('.nav-item');
const sampleDeck = [
  { term: 'Orbite', definition: "Trajectoire courbe d'un objet autour d'une étoile ou d'une planète", context: "Les planètes suivent une orbite autour du Soleil, tandis que la Lune suit celle de la Terre." },
  { term: 'Nébuleuse', definition: "Nuage de gaz et de poussière flottant dans l'espace", context: 'Une nébuleuse est un vaste nuage de gaz et de poussière où naissent parfois de nouvelles étoiles.' },
  { term: 'Gravité', definition: 'Force qui attire les objets les uns vers les autres', context: 'La gravité attire les objets les uns vers les autres et maintient les planètes autour du Soleil.' },
  { term: 'Galaxie', definition: "Immense ensemble d'étoiles, de gaz et de poussière", context: 'Notre galaxie, la Voie lactée, rassemble des milliards d’étoiles, ainsi que du gaz et de la poussière.' },
  { term: 'Astéroïde', definition: 'Objet rocheux qui se déplace autour du Soleil', context: 'Un astéroïde est un petit corps rocheux qui se déplace autour du Soleil.' },
  { term: 'Éclipse', definition: "Quand un objet spatial bloque la lumière d'un autre", context: 'Lors d’une éclipse, un astre passe devant un autre et bloque sa lumière.' }
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
  const validDeck = value.filter(validPair).map((pair) => {
    const samplePair = sampleDeck.find((sample) =>
      normalizeForComparison(sample.term) === normalizeForComparison(pair.term) &&
      normalizeForComparison(sample.definition) === normalizeForComparison(pair.definition)
    );
    const context = pair.context?.trim() || samplePair?.context;
    return {
      term: pair.term.trim().slice(0, 200),
      definition: pair.definition.trim().slice(0, 1000),
      ...(typeof context === 'string' ? { context: context.slice(0, 2000) } : {})
    };
  });
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
const localize = (french, english) => language === 'fr' ? french : english;
const displayedNickname = () => nickname === 'Study player' || nickname === 'Joueur' ? localize('Joueur', 'Study player') : nickname;

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
  $('[data-daily-questions]').textContent = challenge.mode === 'memory' ? localize('6 cartes', '6 cards') : localize('1 défi', '1 challenge');
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
    list.innerHTML = `<div class="notification-empty"><span>✦</span><strong>${localize('Aucune notification', 'No notifications')}</strong><small>${localize('Les réussites et récompenses apparaîtront ici.', 'Your achievements and rewards will appear here.')}</small></div>`;
  } else {
    const locale = language === 'fr' ? 'fr-FR' : 'en-US';
    list.innerHTML = notificationHistory.map((notification) => {
      const message = language === 'en'
        ? notification.message.replace(/Niveau (\d+)/g, 'Level $1').replace('Notifications du navigateur activées.', 'Browser notifications enabled.')
        : notification.message.replace(/Level (\d+)/g, 'Niveau $1').replace('Browser notifications enabled.', 'Notifications du navigateur activées.');
      return `<div class="notification-item"><span class="notification-item-icon">${escapeHTML(notification.icon || '✦')}</span><div><strong>${escapeHTML(message)}</strong><small>${new Date(notification.date).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></div></div>`;
    }).join('');
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
    if (response.status === 401) throw new Error(localize('Session expirée.', 'Session expired.'));
    if (!response.ok) throw new Error(localize('Synchronisation indisponible.', 'Sync is unavailable.'));
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
    $('[data-profile-name]').textContent = displayedNickname();
    renderAvatars();
    updateDeckLabels();
    updateDailyChallenge();
    showApp();
  } catch {
    authToken = '';
    localStorage.removeItem('recall-rally-access-token');
    $('[data-auth-feedback]').textContent = localize('Session expirée. Reconnecte-toi pour continuer.', 'Session expired. Sign in again to continue.');
    showAuth();
  }
}

function translateInterfaceEnglish() {
  const setText = (selector, text) => { const element = $(selector); if (element) element.textContent = text; };
  const setMany = (selector, texts) => $$(selector).forEach((element, index) => { element.textContent = texts[index] || ''; });
  setText('.welcome-row .eyebrow', 'Your learning space');
  setText('.section-heading:not(.compact) .eyebrow', 'Your next move');
  setText('.section-heading:not(.compact) h2', 'Daily quest');
  setText('.quest-card .tag', 'Astronomy');
  setText('.quest-card h3', 'Orbit Check');
  setText('.quest-card p', 'Can you tell a planet from a dwarf?');
  setText('.quest-card .play-link', 'Play quest ↗');
  setText('.section-heading.compact .eyebrow', 'Your study kit');
  setText('.section-heading.compact h2', 'Play your way');
  setText('.section-heading.compact .text-button', 'Manage');
  setText('.deck-summary small', `${deck.length} terms ready to turn into games`);
  setMany('.mode-card strong', ['Memory match', 'Hangman', 'Duel', 'Speed race', 'Course cloze', 'Flashcards']);
  setMany('.mode-card small', ['Pair term + meaning', 'Reveal the answer', 'Challenge a friend', 'Beat the clock', 'Complete the lesson excerpt', 'Classic review']);
  setText('.library-screen .eyebrow', 'Build your study kit');
  setText('.library-screen h1', 'Add a document');
  setText('.library-screen .library-intro', 'Bring your notes, then we’ll turn each term and definition into a game.');
  setText('.upload-drop strong', 'Choose a document');
  setText('.upload-drop small', 'TXT, MD, CSV, PDF, DOCX, or Pages · up to 5 MB');
  setText('.or-divider span', 'or paste your notes');
  setText('.library-actions .text-button', 'Clear');
  setText('.format-note', 'One pair per line. Separate the term and definition with `:`, ` - `, or a comma.');
  setText('[data-action="create-deck"]', 'Create study kit →');
  setText('[data-action="create-ai-deck"]', '✦ Build with AI');
  setText('.ai-limit-note', 'Gemini: 10 generations per day per account.');
  setText('.sample-note strong', 'Need a starting point?');
  setText('[data-action="load-sample"]', 'Load the space basics sample');
  setText('.modes-screen .eyebrow', 'Choose a challenge');
  setText('.modes-screen .library-intro', `${deck.length} terms are ready. Every game uses your study kit.`);
  setMany('.mode-list-item strong', ['Memory match', 'Hangman', 'Duel mode', 'Speed race', 'Course cloze', 'Flashcards']);
  setMany('.mode-list-item small', ['Match each term to its definition', 'Guess the letters in each term', 'Take turns and beat your friend', 'Answer as many as you can in 30 seconds', 'Complete a lesson excerpt', 'Review term after term']);
  setText('[data-screen="memory"] .eyebrow', 'Memory match');
  setText('[data-screen="memory"] h2', 'Find the pair');
  setText('[data-screen="memory"] .game-instruction', 'Match each term with its definition.');
  setText('[data-screen="hangman"] .game-header .eyebrow', 'Hangman');
  setText('[data-screen="hangman"] h2', 'Reveal the term');
  setText('[data-screen="hangman"] .hangman-card .eyebrow', 'Definition');
  setText('[data-screen="hangman"] .hangman-next', 'Next term →');
  setText('[data-screen="duel"] .game-header .eyebrow', 'Duel');
  setText('[data-screen="duel"] h2', 'Pass the phone');
  setText('[data-screen="duel"] .duel-question .eyebrow', 'Which term matches?');
  setMany('.duel-score small', ['PLAYER 1', 'PLAYER 2']);
  setText('[data-screen="speed"] .game-header .eyebrow', 'Speed race');
  setText('[data-screen="speed"] h2', 'Beat the clock');
  setText('[data-screen="speed"] .speed-question .eyebrow', 'Choose the matching term');
  setText('[data-action="start-speed"]', 'Start race →');
  setText('[data-screen="fill"] .game-header .eyebrow', 'Course cloze');
  setText('[data-screen="fill"] .fill-card .eyebrow', 'From your course');
  setText('[data-screen="fill"] h2', 'Complete the excerpt');
  setText('[data-screen="fill"] .fill-form label', 'What belongs in the blank?');
  setText('[data-screen="fill"] .fill-input-row button', 'Check');
  $('#fill-answer').placeholder = 'Type the missing concept';
  setText('[data-action="fill-next"]', 'Next excerpt →');
  setText('[data-screen="flashcards"] .game-header .eyebrow', 'Flashcards');
  setText('[data-screen="flashcards"] h2', 'Classic review');
  setText('[data-flashcard-label]', 'Term');
  setText('[data-action="flashcard-reveal"]', 'Reveal answer');
  setText('[data-action="flashcard-next"]', 'Next card →');
  setText('[data-action="flashcard-again"]', 'Again');
  setText('[data-action="flashcard-known"]', 'Known');
  setText('[data-summary-label]', 'Session');
  setText('[data-summary-title]', 'Good job');
  $$('.summary-metrics small').forEach((element, index) => { element.textContent = ['Correct', 'Errors', 'Accuracy'][index]; });
  setText('[data-action="summary-home"]', 'Back to home →');
  setText('.topics-screen .section-heading .eyebrow', 'Choose your lane');
  setText('.topics-screen h1', 'All topics');
  setMany('.topic-list-item strong', ['History', 'Science', 'Language']);
  setMany('.topic-list-item small', ['12 quests · 480 XP available', '8 quests · 320 XP available', '15 quests · 600 XP available']);
  setText('.profile-heading .eyebrow', 'Your space');
  setText('.profile-heading h1', 'Profile');
  setText('[data-profile-name]', displayedNickname());
  setText('.settings-heading .eyebrow', 'Preferences');
  setText('.settings-heading h2', 'Settings');
  setText('.avatar-setting strong', 'Avatar');
  setText('.avatar-setting small', 'Choose one of eight fixed characters');
  setText('.nickname-setting strong', 'Display name');
  setText('.nickname-setting small', 'Shown on your local profile');
  $('#nickname-input').placeholder = 'Your name';
  setText('[data-action="save-nickname"]', 'Save');
  setText('.support-setting strong', 'Contact support');
  setText('.support-setting small', 'Need help or want to report a bug?');
  setText('.support-button', 'Email us');
  setText('[data-setting="app-notifications"] strong', 'App notifications');
  setText('[data-setting="app-notifications"] small', 'Show feedback and daily reminders inside Recall Rally');
  setText('[data-action="toggle-app-notifications"]', appNotificationsEnabled ? 'On' : 'Off');
  $('[data-action="toggle-app-notifications"]').classList.toggle('active', appNotificationsEnabled);
  $('[data-action="toggle-app-notifications"]').setAttribute('aria-pressed', String(appNotificationsEnabled));
  setText('[data-setting="browser-notifications"] strong', 'Browser notifications');
  setText('[data-setting="browser-notifications"] small', 'Allow Recall Rally to notify you in this browser');
  setText('[data-action="enable-browser-notifications"]', 'Enable');
  setText('.notification-drawer-header .eyebrow', 'Recent activity');
  setText('.notification-drawer-header h2', 'Notifications');
  setText('[data-auth-title]', authMode === 'login' ? 'Sign in' : 'Create an account');
  setText('[data-auth-copy]', authMode === 'login' ? 'Sign in to find your progress on all your devices.' : 'Create an account to save your progress online.');
  setText('[data-auth-submit]', authMode === 'login' ? 'Sign in' : 'Create account');
  setText('[data-action="toggle-auth"]', authMode === 'login' ? 'Create an account' : 'I already have an account');
  setText('.auth-form label[for="auth-password"]', 'Password');
  setText('[data-motivation-eyebrow]', 'Your moment starts now');
  setText('[data-motivation-quote]', 'Every small step counts.');
  setText('[data-motivation-subtitle]', 'You’re back. Let’s make it count!');
  setText('[data-motivation-cta]', 'Continue');
  $('[data-motivation-image]').setAttribute('aria-label', 'An isometric illustration of a notebook and study cards');
  $('[data-action="close-motivation"]').setAttribute('aria-label', 'Close');
  updateStreakUI();
  updateProgressUI();
}

function translateInterface() {
  if (language === 'en') { translateInterfaceEnglish(); return; }
  const setText = (selector, text) => { const element = $(selector); if (element) element.textContent = text; };
  const setMany = (selector, texts) => $$(selector).forEach((element, index) => { if (texts[index]) element.textContent = texts[index]; });
  setText('.add-material-button', '+ Ajouter');
  setText('.welcome-row .eyebrow', 'Samedi 26 septembre');
  $('.welcome-row h1').innerHTML = 'Prêt pour une<br><em>petite victoire ?</em>';
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
  setMany('.mode-card strong', ['Memory', 'Pendu', 'Duel', 'Course express', 'Texte à trous', 'Cartes mémoire']);
  setMany('.mode-card small', ['Associe terme et définition', 'Révèle la réponse', 'Défie un ami', 'Bats le chrono', "Complète l'extrait du cours", 'Révise avec des cartes']);
  setText('.library-screen .eyebrow', 'Construis ta fiche');
  setText('.library-screen h1', 'Ajouter un document');
  setText('.library-screen .library-intro', 'Ajoute ton cours : nous transformerons chaque notion en jeu.');
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
  setMany('.mode-list-item strong', ['Memory', 'Pendu', 'Duel', 'Course express', 'Texte à trous', 'Cartes mémoire']);
  setMany('.mode-list-item small', ['Associe chaque terme à sa définition', 'Devine les lettres du terme', 'Joue à tour de rôle avec un ami', 'Réponds en 30 secondes', 'Complète un extrait du cours', 'Révise terme après terme']);
  setText('.topics-screen .section-heading .eyebrow', 'Choisis ton parcours');
  setText('.topics-screen h1', 'Tous les thèmes');
  setMany('.topic-list-item strong', ['Histoire', 'Sciences', 'Langues']);
  setMany('.topic-list-item small', ['12 défis · 480 XP disponibles', '8 défis · 320 XP disponibles', '15 défis · 600 XP disponibles']);
  setText('.quiz-top span:first-of-type', 'Orbite express');
  setText('.question-meta span:first-child', 'QUESTION 1 SUR 5');
  setText('.question-card .eyebrow', 'Astronomie / Échauffement');
  const quizTitle = $('.question-card h2');
  if (quizTitle) quizTitle.innerHTML = 'Quel objet<br /><em>n’est pas</em> une planète ?';
  setText('.question-hint', 'Respire un bon coup. Tu vas y arriver.');
  $$('.answer').forEach((button, index) => { button.lastChild.textContent = ['Mercure', 'Pluton', 'Mars', 'Vénus'][index]; });
  setText('.continue-button', 'Choisis une réponse');
  setText('[data-screen="memory"] .eyebrow', 'Memory');
  setText('[data-screen="memory"] h2', 'Trouve les paires');
  setText('[data-screen="memory"] .game-instruction', 'Associe chaque terme à sa définition.');
  setText('[data-screen="hangman"] .eyebrow', 'Pendu');
  setText('[data-screen="hangman"] h2', 'Révèle le terme');
  setText('[data-screen="hangman"] .hangman-card .eyebrow', 'Définition');
  setText('[data-screen="duel"] .eyebrow', 'Duel');
  setText('[data-screen="duel"] h2', 'Passe le téléphone');
  setText('[data-screen="duel"] .duel-question .eyebrow', 'Quel terme correspond ?');
  setMany('.duel-score small', ['JOUEUR 1', 'JOUEUR 2']);
  setText('[data-screen="speed"] .eyebrow', 'Course express');
  setText('[data-screen="speed"] h2', 'Bats le chrono');
  setText('[data-screen="speed"] .speed-question .eyebrow', 'Choisis le terme correspondant');
  setText('[data-screen="fill"] .game-header .eyebrow', 'Texte à trous');
  setText('[data-screen="fill"] .fill-card .eyebrow', 'Extrait du cours');
  setText('[data-screen="fill"] h2', "Complète l'extrait");
  setText('[data-screen="fill"] .fill-form label', 'Que faut-il mettre dans le blanc ?');
  setText('[data-screen="fill"] .fill-input-row button', 'Vérifier');
  setText('[data-screen="flashcards"] .game-header .eyebrow', 'Cartes mémoire');
  $('#fill-answer').placeholder = 'Écris le concept manquant';
  setText('[data-action="fill-next"]', 'Extrait suivant →');
  setMany('.nav-item', ['Accueil', 'Jeux', 'Ajouter', 'Profil']);
  $$('.nav-item').forEach((element, index) => { element.innerHTML = `<span>${['⌂', '✦', '＋', '◉'][index]}</span>${['Accueil', 'Jeux', 'Ajouter', 'Profil'][index]}`; });
  setText('.profile-heading .eyebrow', 'Ton espace');
  setText('.profile-heading h1', 'Profil');
  setText('.profile-card strong', 'Joueur');
  setText('[data-profile-name]', displayedNickname());
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
  setText('.support-setting strong', 'Contacter le support');
  setText('.support-setting small', 'Besoin d’aide ou envie de signaler un bug ?');
  setText('.support-button', 'Nous écrire');
  setText('.notification-drawer-header .eyebrow', 'Activité récente');
  setText('.notification-drawer-header h2', 'Notifications');
  setText('[data-summary-title]', 'Bravo');
  setText('[data-motivation-eyebrow]', 'Ton moment commence maintenant');
  setText('[data-motivation-quote]', 'Chaque petit pas compte.');
  setText('[data-motivation-subtitle]', 'Tu es de retour. À toi de jouer !');
  setText('[data-motivation-cta]', 'Continuer');
  $('[data-motivation-image]').setAttribute('aria-label', 'Illustration d’un carnet et de fiches de révision en perspective');
  $('[data-action="close-motivation"]').setAttribute('aria-label', 'Fermer');
}

function applyLanguage() {
  document.documentElement.lang = language;
  translateInterface();
  $('[data-action="toggle-notifications"]').setAttribute('aria-label', localize('Ouvrir les notifications', 'Open notifications'));
  $('[data-action="toggle-notifications"]').setAttribute('title', localize('Notifications', 'Notifications'));
  $('.bottom-nav').setAttribute('aria-label', localize('Navigation principale', 'Main navigation'));
  $$('[data-language]').forEach((button) => button.classList.toggle('active', button.dataset.language === language));
  renderNotifications();
}

function showMotivation() {
  const messages = language === 'fr'
    ? ['Chaque petit pas compte.', 'Tu es capable de plus que tu ne le crois.', 'La régularité fait les grandes réussites.', 'Une notion à la fois, tu avances.']
    : ['Every small step counts.', 'You are capable of more than you think.', 'Consistency builds great things.', 'One idea at a time, you are moving forward.'];
  $('[data-motivation-quote]').textContent = messages[Math.floor(Math.random() * messages.length)];
  $('[data-motivation-dialog]').showModal();
}

function showSessionSummary(summary) {
  const french = language === 'fr';
  const config = {
    memory: french ? { label: 'Memory', title: 'Session réussie' } : { label: 'Memory', title: 'Session complete' },
    hangman: french ? { label: 'Pendu', title: 'Partie terminée' } : { label: 'Hangman', title: 'Game over' },
    duel: french ? { label: 'Duel', title: 'Fin du duel' } : { label: 'Duel', title: 'Duel complete' },
    speed: french ? { label: 'Course express', title: 'Course terminée' } : { label: 'Speed race', title: 'Race complete' },
    fill: french ? { label: 'Texte à trous', title: 'Extrait terminé' } : { label: 'Course cloze', title: 'Excerpt complete' },
    flashcards: french ? { label: 'Cartes mémoire', title: 'Révision terminée' } : { label: 'Flashcards', title: 'Review complete' }
  }[summary.mode] || (french ? { label: 'Jeu', title: 'Session terminée' } : { label: 'Game', title: 'Session complete' });
  const { total, correct, errors, percentage } = summarizeAnswers(summary.correct, summary.total);
  summaryState = { ...summary, total, correct, errors, percentage };
  $('[data-summary-label]').textContent = config.label;
  $('[data-summary-title]').textContent = config.title;
  $$('.summary-metrics small').forEach((label, index) => {
    label.textContent = (french ? ['Bonnes réponses', 'Erreurs', 'Précision'] : ['Correct', 'Errors', 'Accuracy'])[index];
  });
  $('[data-summary-score]').textContent = correct;
  $('[data-summary-total]').textContent = `${correct} / ${total}`;
  $('[data-summary-correct]').textContent = correct;
  $('[data-summary-errors]').textContent = errors;
  $('[data-summary-accuracy]').textContent = `${percentage}%`;
  const list = $('[data-summary-list]');
  const items = summary.badges || [
    { label: french ? 'Bonnes réponses' : 'Correct answers', value: correct },
    { label: french ? 'Erreurs' : 'Errors', value: errors },
    { label: 'Score', value: `${correct} pts` }
  ];
  const badgeLabels = { 'Paires trouvées': 'Pairs found', 'Bonnes réponses': 'Correct answers', 'Erreurs': 'Errors', 'Joueur 1': 'Player 1', 'Joueur 2': 'Player 2', 'Vainqueur': 'Winner', 'Temps restant': 'Time left', 'Connus': 'Known', 'À revoir': 'To review' };
  list.innerHTML = items.map((item) => `<div class="summary-item"><span>${escapeHTML(!french ? badgeLabels[item.label] || item.label : item.label)}</span><strong>${escapeHTML(String(item.value))}</strong></div>`).join('');
  $('[data-action="summary-home"]').innerHTML = `${french ? 'Retour à l’accueil' : 'Back to home'} <span>→</span>`;
  $('[data-screen="summary"] [data-action="go-home"]').setAttribute('aria-label', french ? 'Retour à l’accueil' : 'Back to home');
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
    feedback.textContent = language === 'fr' ? `${pairs.length} notion${pairs.length > 1 ? 's' : ''} détectée${pairs.length > 1 ? 's' : ''}.` : `${pairs.length} pair${pairs.length > 1 ? 's' : ''} found.`;
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
  $('[data-memory-grid]').innerHTML = memoryCards.map((card) => `<button class="memory-card" data-card-id="${card.id}" aria-label="${localize('Carte retournée', 'Face-down card')}"><span class="memory-back">✦</span><span class="memory-kind">${card.type === 'term' ? localize('TERME', 'TERM') : localize('DÉFINITION', 'DEFINITION')}</span><strong>${escapeHTML(card.text)}</strong></button>`).join('');
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
    $('[data-memory-feedback]').textContent = matches === totalPairs ? localize('Fiche maîtrisée. Bravo !', 'Study kit mastered. Great job!') : localize('Paire trouvée.', 'Pair found.');
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
    $('[data-memory-feedback]').textContent = localize('Ces deux cartes ne vont pas ensemble.', 'Those cards do not match.');
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
  const answer = hangmanState.pair.term.normalize('NFC').toLocaleUpperCase(language === 'fr' ? 'fr-FR' : 'en-US');
  const guessed = new Set(hangmanState.guessed.map(normalizeForComparison));
  const solved = [...answer].every((letter) => letter === ' ' || guessed.has(normalizeForComparison(letter)));
  const finished = solved || hangmanState.tries === 0;
  $('[data-hangman-definition]').textContent = hangmanState.pair.definition;
  $('[data-hangman-word]').innerHTML = [...answer].map((letter) => letter === ' ' ? '<i class="word-space"></i>' : `<span>${guessed.has(normalizeForComparison(letter)) ? escapeHTML(letter) : '_'}</span>`).join('');
  $('[data-hangman-counter]').textContent = `${hangmanState.round} / ${hangmanState.total} · ${hangmanState.tries} ${localize('essais', 'tries')}`;
  $('[data-hangman-status]').textContent = solved ? localize('Correct !', 'Correct!') : (hangmanState.tries === 0 ? localize(`La réponse était ${hangmanState.pair.term}.`, `The answer was ${hangmanState.pair.term}.`) : '');
  if (solved && !hangmanState.roundRewarded) { hangmanState.score += 1; hangmanState.roundRewarded = true; recordStudyActivity(); }
  const next = $('[data-action="hangman-next"]');
  next.hidden = !finished;
  next.textContent = hangmanState.round >= hangmanState.total ? localize('Voir le résultat  →', 'See results  →') : localize('Terme suivant  →', 'Next term  →');
  $$('.letter-button').forEach((button) => { button.disabled = guessed.has(normalizeForComparison(button.textContent)); });
}

function buildLetters() {
  $('[data-letter-grid]').innerHTML = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => `<button class="letter-button">${letter}</button>`).join('');
  $$('.letter-button').forEach((button) => button.addEventListener('click', () => {
    const letter = button.textContent;
    if (hangmanState.guessed.includes(letter) || hangmanState.tries === 0) return;
    hangmanState.guessed.push(letter);
    if (!normalizeForComparison(hangmanState.pair.term).includes(normalizeForComparison(letter))) hangmanState.tries -= 1;
    renderHangman();
  }));
}

function nextHangmanRound() {
  if (hangmanState.round >= hangmanState.total && !hangmanState.summaryShown) {
    $('[data-hangman-status]').textContent = localize(`Partie terminée : ${hangmanState.score} / ${hangmanState.total} bonne(s) réponse(s).`, `Game over: ${hangmanState.score} / ${hangmanState.total} correct answers.`);
    $('[data-action="hangman-next"]').textContent = localize('Rejouer  →', 'Play again  →');
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
  $('[data-duel-turn]').textContent = localize('Joueur 1', 'Player 1');
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
  $('[data-duel-feedback]').textContent = correct ? localize(`Point pour le joueur ${duelState.player} !`, `Point for player ${duelState.player}!`) : localize(`La réponse était ${duelState.pair.term}.`, `The answer was ${duelState.pair.term}.`);
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
    duelState.player = duelState.player === 1 ? 2 : 1; $('[data-duel-turn]').textContent = localize(`Joueur ${duelState.player}`, `Player ${duelState.player}`); nextDuelQuestion();
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
  speedState = { score: 0, attempts: 0, remaining: 45, queue: freshPairQueue('speed') };
  $('[data-action="start-speed"]').style.display = 'none';
  $('[data-speed-feedback]').textContent = '';
  $('[data-speed-progress]').style.width = '100%';
  nextSpeedQuestion();
  speedState.timer = setInterval(() => { speedState.remaining -= 1; $('[data-speed-timer]').textContent = `${speedState.remaining}s`; $('[data-speed-progress]').style.width = `${(speedState.remaining / 45) * 100}%`; if (speedState.remaining <= 0) finishSpeed(); }, 1000);
}

function answerSpeed(button) {
  if (speedState.remaining <= 0) return;
  const correct = isAnswerCorrect(button.dataset.answer, speedState.pair.term);
  speedState.attempts += 1;
  if (correct) speedState.score += 1;
  button.classList.add(correct ? 'correct' : 'wrong');
  $('[data-speed-feedback]').textContent = correct ? localize(`Bravo. ${speedState.score} bonne(s) réponse(s).`, `Great! ${speedState.score} correct answer(s).`) : localize(`La réponse était ${speedState.pair.term}.`, `The answer was ${speedState.pair.term}.`);
  $$('.duel-option').forEach((option) => { option.disabled = true; });
  setTimeout(() => { if (speedState.remaining > 0) nextSpeedQuestion(); }, 350);
}

function finishSpeed() {
  clearInterval(speedState.timer);
  speedState.timer = null;
  if (speedState.score > 0) recordStudyActivity();
  $('[data-speed-timer]').textContent = language === 'fr' ? 'Terminé' : 'Done';
  $('[data-speed-feedback]').textContent = localize(`Course terminée : ${speedState.score} bonne(s) réponse(s).`, `Race over: ${speedState.score} correct answer(s).`);
  showSessionSummary({
    mode: 'speed',
    correct: speedState.score,
    total: speedState.attempts,
    errors: speedState.attempts - speedState.score,
    badges: [
      { label: 'Bonnes réponses', value: speedState.score },
      { label: 'Temps restant', value: `${speedState.remaining}s` },
      { label: 'XP', value: `+${speedState.score * 15}` }
    ]
  });
  $('[data-action="start-speed"]').style.display = 'block';
  $('[data-action="start-speed"]').textContent = localize('Rejouer  →', 'Play again  →');
}

function startFill() {
  fillState = { round: 1, total: Math.min(deck.length, 8), score: 0, queue: freshPairQueue('fill') };
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
        { label: language === 'fr' ? 'Connus' : 'Known', value: flashcardsState.known },
        { label: language === 'fr' ? 'À revoir' : 'To review', value: flashcardsState.review },
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
  $('[data-flashcard-label]').textContent = isRevealed ? localize('Définition', 'Definition') : localize('Terme', 'Term');
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
        { label: language === 'fr' ? 'Connus' : 'Known', value: flashcardsState.known },
        { label: language === 'fr' ? 'À revoir' : 'To review', value: flashcardsState.review },
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
  return language === 'fr' ? `${escapeHTML(trimmedPassage)}. Le concept clé à retenir est <span class="passage-blank">________</span>.` : `${escapeHTML(trimmedPassage)}. The key concept to remember is <span class="passage-blank">________</span>.`;
}

function nextFillQuestion() {
  if (!fillState.queue.length || (fillState.round === 1 && fillState.pair)) fillState.queue = freshPairQueue('fill');
  fillState.pair = fillState.queue.shift();
  const answer = fillState.pair.term;
  const passage = clozePassage(fillState.pair, language);
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
  if (correct) fillState.score += 1;
  if (correct) recordStudyActivity();
  $('[data-fill-feedback]').textContent = correct ? localize('Correct. Bonne mémoire !', 'Correct. Nice recall!') : localize(`Pas tout à fait. La réponse était ${fillState.pair.term}.`, `Not quite. The answer was ${fillState.pair.term}.`);
  $('#fill-answer').disabled = true;
  $('[data-fill-form] button').disabled = true;
  $('[data-action="fill-next"]').hidden = false;
  $('[data-action="fill-next"]').textContent = fillState.round >= fillState.total ? localize('Rejouer  →', 'Play again  →') : localize('Extrait suivant  →', 'Next excerpt  →');
  if (fillState.round >= fillState.total) {
    const total = fillState.total;
    const score = fillState.score;
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
  $('#auth-password').autocomplete = authMode === 'login' ? 'current-password' : 'new-password';
  applyLanguage();
});
document.querySelector('[data-auth-form]').addEventListener('submit', async (event) => {
  event.preventDefault();
  const signingIn = authMode === 'login';
  const feedback = $('[data-auth-feedback]');
  const button = $('[data-auth-submit]');
  button.textContent = '...';
  feedback.textContent = '';
  try {
    const response = await fetch(`/api/auth/${authMode === 'login' ? 'login' : 'signup'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('#auth-email').value, password: $('#auth-password').value }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Authentification impossible.');
    if (!result.access_token) { feedback.textContent = localize('Compte créé. Vérifie ton email puis connecte-toi.', 'Account created. Check your email, then sign in.'); authMode = 'login'; applyLanguage(); return; }
    authToken = result.access_token;
    localStorage.setItem('recall-rally-access-token', authToken);
    await loadProgress();
    if (signingIn && authToken) showMotivation();
  } catch (error) {
    feedback.textContent = error.message;
    button.textContent = authMode === 'login' ? localize('Se connecter', 'Sign in') : localize('Créer le compte', 'Create account');
  }
});
$$('[data-action="close-motivation"]').forEach((button) => button.addEventListener('click', () => $('[data-motivation-dialog]').close()));

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
  if (pairs.length < 2) { feedback.textContent = localize('Ajoute au moins deux notions pour créer un jeu.', 'Add at least two pairs to create a game.'); return; }
  setDeck(pairs, $('#document-input').files[0]?.name.replace(/\.[^.]+$/, '') || localize('Ma fiche', 'My study kit'));
  feedback.textContent = localize(`${pairs.length} notions prêtes. Tes jeux t'attendent.`, `${pairs.length} pairs ready. Your games are waiting.`);
  setTimeout(openModes, 700);
});
document.querySelector('[data-action="create-ai-deck"]').addEventListener('click', async () => {
  const text = $('#document-text').value.trim();
  const feedback = $('.import-feedback');
  const button = $('[data-action="create-ai-deck"]');
  if (!selectedDocumentFile && text.length < 10) { feedback.textContent = localize("Ajoute d'abord du contenu de cours.", 'Add some course material first.'); return; }
  button.disabled = true;
  button.classList.add('loading');
  button.innerHTML = '<span>✦</span> Génération en cours… merci de patienter.';
  feedback.textContent = localize('Génération en cours. Merci de patienter pendant la création de ta fiche…', 'Building your study kit. Please wait…');
  try {
    const request = selectedDocumentFile ? { file: { name: selectedDocumentFile.name, type: selectedDocumentFile.type, data: await fileToBase64(selectedDocumentFile) } } : { text };
    const response = await fetch('/api/generate-deck', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) }, body: JSON.stringify(request) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The AI request failed.');
    if (!Array.isArray(result.pairs) || result.pairs.length < 2 || result.pairs.some((pair) => !validPair(pair))) throw new Error('La réponse générée est invalide.');
    setDeck(result.pairs, result.name);
    feedback.textContent = localize(`${result.pairs.length} notions prêtes. Ta fiche Gemini est disponible.`, `${result.pairs.length} pairs ready. Your AI study kit is ready.`);
    button.disabled = false;
    button.classList.remove('loading');
    button.innerHTML = '<span>✦</span> Créer avec Gemini';
    setTimeout(openModes, 700);
  } catch (error) {
    const quotaReached = /Limite Gemini/i.test(error.message);
    const overloaded = !quotaReached && /high demand|overload|temporar|429|503|sollicit/i.test(error.message);
    feedback.textContent = overloaded ? localize('Gemini est momentanément très sollicité. Attends quelques secondes puis réessaie.', 'Gemini is busy right now. Wait a few seconds, then try again.') : error.message;
    button.disabled = false;
    button.classList.remove('loading');
    button.innerHTML = '<span>✦</span> Créer avec Gemini';
  }
});
function fileToBase64(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.addEventListener('load', () => resolve(reader.result.split(',')[1])); reader.addEventListener('error', reject); reader.readAsDataURL(file); }); }
$('#document-input').addEventListener('change', (event) => { const file = event.target.files[0]; if (!file) { selectedDocumentFile = null; return; } if (file.size > 5 * 1024 * 1024) { selectedDocumentFile = null; $('.import-feedback').textContent = localize('Ce document dépasse la limite de 5 Mo.', 'This file is larger than the 5 MB limit.'); event.target.value = ''; return; } selectedDocumentFile = file; const textFormats = ['text/plain', 'text/markdown', 'text/csv']; if (textFormats.includes(file.type) || /\.(txt|md|csv)$/i.test(file.name)) { const reader = new FileReader(); reader.addEventListener('load', () => { $('#document-text').value = reader.result; }); reader.readAsText(file); } else { $('#document-text').value = localize(`${file.name} sélectionné. Clique sur « Créer avec Gemini » pour le transformer en jeu.`, `${file.name} selected. Click Build with AI to turn it into games.`); } });
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
$('[data-profile-name]').textContent = displayedNickname();
$('[data-profile-avatar]').textContent = nickname.charAt(0).toUpperCase();
$('.profile-heading .avatar').textContent = nickname.charAt(0).toUpperCase();
renderAvatars();
renderNotifications();
updateDeckLabels();
updateDailyChallenge();
bindModeButtons();
loadProgress();
