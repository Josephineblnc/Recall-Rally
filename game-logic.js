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
