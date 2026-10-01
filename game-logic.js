export function normalizeForComparison(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_/]+/g, ' ')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function isAnswerCorrect(input, expected) {
  return normalizeForComparison(input) === normalizeForComparison(expected);
}

export function summarizeAnswers(correct, total) {
  const totalAnswers = Math.max(0, Math.floor(Number(total) || 0));
  const correctAnswers = Math.min(totalAnswers, Math.max(0, Math.floor(Number(correct) || 0)));
  return {
    correct: correctAnswers,
    total: totalAnswers,
    errors: totalAnswers - correctAnswers,
    percentage: totalAnswers ? Math.round((correctAnswers / totalAnswers) * 100) : 0
  };
}

export function clozePassage(pair, language = 'fr') {
  const term = String(pair?.term || '').trim();
  const definition = String(pair?.definition || '').trim();
  const context = typeof pair?.context === 'string' ? pair.context.trim() : '';
  const normalizedTerm = normalizeForComparison(term);
  if (context && normalizedTerm && normalizeForComparison(context).includes(normalizedTerm)) return context;
  return language === 'fr'
    ? `Le terme « ${term} » désigne la notion suivante : ${definition}.`
    : `The term "${term}" refers to the following concept: ${definition}.`;
}

const modeCounters = new Map();

function stableHash(value = '') {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function modeQueue(deck, mode = 'memory') {
  const items = Array.isArray(deck) ? [...deck] : [];
  if (!items.length) return [];
  if (items.length === 1) return items;

  const nextCount = (modeCounters.get(mode) || 0) + 1;
  modeCounters.set(mode, nextCount);

  const deckSignature = items
    .map((entry, index) => `${index}:${entry?.term ?? ''}|${entry?.definition ?? ''}`)
    .join('|');

  const seed = stableHash(`${mode}|${deckSignature}|${nextCount}`);
  const queue = items
    .map((entry, index) => {
      const score = stableHash(`${mode}|${index}|${entry?.term ?? ''}|${entry?.definition ?? ''}|${nextCount}|${seed}`);
      return { entry, score };
    })
    .sort((left, right) => left.score - right.score)
    .map(({ entry }) => entry);

  const rotation = (seed % queue.length + nextCount) % queue.length;
  return [...queue.slice(rotation), ...queue.slice(0, rotation)];
}
