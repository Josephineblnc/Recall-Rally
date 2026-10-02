import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

try {
  const env = await readFile(join(root, '.env'), 'utf8');
  env.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^([^#=]+)=\s*(.*)$/);
    if (match && !process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim();
  });
} catch {
  // Environment variables may be supplied by the shell or hosting platform.
}

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const allowRemoteApi = process.env.ALLOW_REMOTE_API === 'true';
const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const maxBodySize = 8 * 1024 * 1024;
const requestCounts = new Map();
let activeGenerationRequests = 0;
const maxConcurrentGenerationRequests = 4;
const dailyGeminiQuota = 10;
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' https://api.dicebear.com data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
};
const publicFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/googlea666ff892c826164.html', ['googlea666ff892c826164.html', 'text/plain; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/game-logic.js', ['game-logic.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/logo.svg', ['logo.svg', 'image/svg+xml; charset=utf-8']]
]);

class HttpError extends Error {
  constructor(statusCode, message) { super(message); this.statusCode = statusCode; }
}

function sendJSON(response, statusCode, payload) {
  response.writeHead(statusCode, { ...securityHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(payload));
}

function requireSupabaseConfig() {
  if (!supabaseUrl || !supabaseAnonKey) throw new HttpError(503, 'La synchronisation n’est pas configurée sur ce serveur.');
}

function bearerToken(request) {
  const value = request.headers.authorization || '';
  if (!value.startsWith('Bearer ')) throw new HttpError(401, 'Connexion requise.');
  return value.slice(7).trim();
}

async function supabaseRequest(path, options = {}, token) {
  requireSupabaseConfig();
  const headers = { apikey: supabaseAnonKey, 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const result = await fetch(`${supabaseUrl}${path}`, { ...options, headers, signal: controller.signal });
    const payload = await result.json().catch(() => ({}));
    if (!result.ok) throw new HttpError(result.status === 401 ? 401 : result.status === 400 ? 400 : 502, payload.msg || payload.message || payload.error_description || 'La synchronisation a échoué.');
    return payload;
  } catch (error) {
    if (error.name === 'AbortError') throw new HttpError(504, 'Le service de synchronisation a mis trop de temps à répondre.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeProgress(value) {
  const progress = value && typeof value === 'object' ? value : {};
  const deck = Array.isArray(progress.deck) ? progress.deck.filter((pair) => typeof pair?.term === 'string' && pair.term.trim() && typeof pair?.definition === 'string' && pair.definition.trim()).slice(0, 30).map((pair) => ({ term: pair.term.trim().slice(0, 200), definition: pair.definition.trim().slice(0, 1000), ...(typeof pair.context === 'string' ? { context: pair.context.slice(0, 2000) } : {}) })) : [];
  return {
    nickname: typeof progress.nickname === 'string' ? progress.nickname.trim().slice(0, 24) || 'Study player' : 'Study player',
    avatar: typeof progress.avatar === 'string' ? progress.avatar.slice(0, 40) : 'adventurer-01',
    language: progress.language === 'en' ? 'en' : 'fr',
    xp: Number.isInteger(progress.xp) && progress.xp >= 0 ? Math.min(progress.xp, 100000000) : 0,
    streak: progress.streak && typeof progress.streak === 'object' ? progress.streak : { count: 0, lastDate: null, activityDates: [] },
    deck_name: typeof progress.deckName === 'string' ? progress.deckName.trim().slice(0, 80) || 'Space basics' : 'Space basics',
    deck
  };
}

const deckPrompt = 'Turn this study material into a useful game deck. Preserve the language of the source material. Return JSON only in the shape {"name":"short topic name","pairs":[{"term":"...","definition":"...","context":"one natural 1-3 sentence course-style excerpt that uses the term"}]}. Extract 2 to 30 distinct, concise term-definition pairs. Do not invent facts that are not supported by the material.';

function getGeminiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not configured. Add it to .env.');
  return key;
}

async function generateWithGemini(parts, fallbackName) {
  let payload;
  let response;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': getGeminiKey() },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json' } }),
        signal: controller.signal
      });
    } catch (error) {
      if (error.name === 'AbortError') throw new HttpError(504, 'Le service Gemini a mis trop de temps à répondre.');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    payload = await response.json();
    if (response.ok || ![429, 500, 503].includes(response.status) || attempt === 3) break;
    await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
  }
  if (!response.ok) throw new Error(payload.error?.message || 'The Gemini request failed.');
  const raw = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '{}';
  const result = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, ''));
  const pairs = Array.isArray(result.pairs) ? result.pairs.filter((pair) => typeof pair?.term === 'string' && pair.term.trim() && typeof pair?.definition === 'string' && pair.definition.trim()).slice(0, 30).map((pair) => ({
    term: pair.term.trim().slice(0, 200),
    definition: pair.definition.trim().slice(0, 1000),
    ...(typeof pair.context === 'string' ? { context: pair.context.slice(0, 2000) } : {})
  })) : [];
  if (pairs.length < 2) throw new Error('Gemini could not find at least two study pairs.');
  return { name: result.name || fallbackName, pairs };
}

async function generateDeck(text) {
  return generateWithGemini([{ text: `${deckPrompt}\n\nStudy material:\n${text.slice(0, 50000)}` }], 'Gemini study kit');
}

async function generateDeckFromFile(file) {
  if (!file?.name || !file?.data || typeof file.name !== 'string' || typeof file.data !== 'string') throw new HttpError(400, 'Choisis un document valide.');
  const extension = extname(file.name).toLowerCase();
  const allowedTypes = new Set(['.txt', '.md', '.csv', '.pdf', '.doc', '.docx', '.pages']);
  if (!allowedTypes.has(extension)) throw new HttpError(415, 'Format de document non pris en charge.');
  if (file.data.length > 7 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.data)) throw new HttpError(400, 'Le document envoyé est invalide ou trop volumineux.');
  const bytes = Buffer.from(file.data, 'base64');
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new HttpError(413, 'Le document doit faire moins de 5 Mo.');
  const signatures = { '.pdf': (value) => value.subarray(0, 5).toString() === '%PDF-', '.doc': (value) => value.subarray(0, 8).toString('hex') === 'd0cf11e0a1b11ae1', '.docx': (value) => value.subarray(0, 2).toString() === 'PK', '.pages': (value) => value.subarray(0, 2).toString() === 'PK' };
  if (signatures[extension] && !signatures[extension](bytes)) throw new HttpError(400, 'Le contenu du document ne correspond pas à son extension.');
  const safeName = file.name.replace(/[\\/\0]/g, '').slice(0, 100) || 'document';
  const mimeTypes = { '.txt': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv', '.pdf': 'application/pdf', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.pages': 'application/octet-stream' };
  return generateWithGemini([
    { text: `${deckPrompt}\n\nFile name: ${safeName}` },
    { inlineData: { mimeType: mimeTypes[extension], data: file.data } }
  ], safeName.replace(/\.[^.]+$/, ''));
}

async function requestBody(request) {
  let body = '';
  let size = 0;
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > maxBodySize) throw new HttpError(413, 'La requête est trop volumineuse. Limite : 8 Mo.');
    body += chunk;
  }
  return JSON.parse(body || '{}');
}

function checkRateLimit(request) {
  const key = request.socket.remoteAddress || 'local';
  const now = Date.now();
  for (const [address, entry] of requestCounts) if (now - entry.startedAt > 300000) requestCounts.delete(address);
  const current = requestCounts.get(key);
  if (!current || now - current.startedAt > 60000) { requestCounts.set(key, { startedAt: now, count: 1 }); return; }
  current.count += 1;
  if (current.count > 20) throw new HttpError(429, 'Trop de requêtes. Réessaie dans une minute.');
}

function isLoopbackAddress(address) {
  return address === '::1' || address === '127.0.0.1' || address?.startsWith('::ffff:127.');
}

const server = createServer(async (request, response) => {
  try {
    const origin = request.headers.origin;
    if (origin && new URL(origin).host !== request.headers.host) throw new HttpError(403, 'Origine de requête refusée.');
    if (request.method === 'OPTIONS') { response.writeHead(204, securityHeaders); response.end(); return; }
    if (request.method === 'POST' && (request.url === '/api/auth/signup' || request.url === '/api/auth/login')) {
      if (!allowRemoteApi && !isLoopbackAddress(request.socket.remoteAddress)) throw new HttpError(403, 'Authentification disponible uniquement en local.');
      checkRateLimit(request);
      if (!request.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'Le type de contenu doit être JSON.');
      const body = await requestBody(request);
      if (typeof body.email !== 'string' || !/^\S+@\S+\.\S+$/.test(body.email) || typeof body.password !== 'string' || body.password.length < 8) throw new HttpError(400, 'Adresse email ou mot de passe invalide.');
      const payload = request.url.endsWith('/signup')
        ? await supabaseRequest('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email: body.email.trim().toLowerCase(), password: body.password }) })
        : await supabaseRequest('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: body.email.trim().toLowerCase(), password: body.password }) });
      sendJSON(response, 200, { access_token: payload.access_token || null, refresh_token: payload.refresh_token || null, user: payload.user || null });
      return;
    }
    if ((request.method === 'GET' || request.method === 'PUT') && request.url === '/api/progress') {
      const token = bearerToken(request);
      const user = await supabaseRequest('/auth/v1/user', {}, token);
      if (!user?.id) throw new HttpError(401, 'Session invalide.');
      if (request.method === 'GET') {
        const rows = await supabaseRequest(`/rest/v1/user_progress?select=nickname,avatar,language,xp,streak,deck_name,deck&user_id=eq.${encodeURIComponent(user.id)}`, {}, token);
        sendJSON(response, 200, rows[0] || null);
      } else {
        if (!request.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'Le type de contenu doit être JSON.');
        const progress = normalizeProgress(await requestBody(request));
        const row = { user_id: user.id, email: user.email || '', ...progress, updated_at: new Date().toISOString() };
        const rows = await supabaseRequest('/rest/v1/user_progress?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(row) }, token);
        sendJSON(response, 200, rows[0] || progress);
      }
      return;
    }
    if (request.method === 'POST' && request.url === '/api/generate-deck') {
      if (!allowRemoteApi && !isLoopbackAddress(request.socket.remoteAddress)) throw new HttpError(403, 'API disponible uniquement en local.');
      checkRateLimit(request);
      if (!request.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'Le type de contenu doit être JSON.');
      if (activeGenerationRequests >= maxConcurrentGenerationRequests) throw new HttpError(503, 'Le service est momentanément trop sollicité.');
      activeGenerationRequests += 1;
      try {
        const { text, file } = await requestBody(request);
        if (!file && (typeof text !== 'string' || text.trim().length < 10 || text.length > 50000)) throw new HttpError(400, 'Le texte doit contenir entre 10 et 50 000 caractères.');
        if (allowRemoteApi) {
          const token = bearerToken(request);
          await supabaseRequest('/auth/v1/user', {}, token);
          const quotaAvailable = await supabaseRequest('/rest/v1/rpc/consume_gemini_quota', { method: 'POST', body: JSON.stringify({ p_limit: dailyGeminiQuota }) }, token);
          if (quotaAvailable !== true) throw new HttpError(429, `Limite Gemini atteinte : ${dailyGeminiQuota} générations par jour.`);
        }
        const deck = file ? await generateDeckFromFile(file) : await generateDeck(text);
        sendJSON(response, 200, deck);
      } finally {
        activeGenerationRequests -= 1;
      }
      return;
    }
    if (request.method !== 'GET') throw new HttpError(405, 'Méthode non autorisée.');
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const publicFile = publicFiles.get(pathname);
    if (!publicFile) throw new HttpError(404, 'Fichier introuvable.');
    const [filename, contentType] = publicFile;
    const file = await readFile(join(root, filename));
    response.writeHead(200, { ...securityHeaders, 'Content-Type': contentType, 'Cache-Control': 'no-store' });
    response.end(file);
  } catch (error) {
    const isHttpError = error instanceof HttpError;
    sendJSON(response, isHttpError ? error.statusCode : 502, { error: isHttpError ? error.message : 'Le service de génération a échoué.' });
  }
});

server.listen(port, host, () => console.log(`Recall Rally running at http://${host}:${port}`));
