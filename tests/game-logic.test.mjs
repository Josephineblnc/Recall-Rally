import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeForComparison, modeQueue, isAnswerCorrect } from '../game-logic.js';

test('normalizeForComparison ignores accents and case', () => {
  assert.equal(normalizeForComparison('Éclipse'), 'eclipse');
  assert.equal(normalizeForComparison('  Météo  '), 'meteo');
});

test('modeQueue varies generated order by mode and session', () => {
  const deck = [
    { term: 'Planète', definition: '...' },
    { term: 'Géante', definition: '...' },
    { term: 'Astéroïde', definition: '...' },
    { term: 'Nébuleuse', definition: '...' }
  ];

  const memoryQueue = modeQueue(deck, 'memory');
  const hangmanQueue = modeQueue(deck, 'hangman');
  const nextMemoryQueue = modeQueue(deck, 'memory');

  assert.notDeepEqual(memoryQueue.map((pair) => pair.term), hangmanQueue.map((pair) => pair.term));
  assert.notDeepEqual(memoryQueue.map((pair) => pair.term), nextMemoryQueue.map((pair) => pair.term));
});

test('isAnswerCorrect accepts accented and unaccented equivalents', () => {
  assert.equal(isAnswerCorrect('Nébuleuse', 'Nebuleuse'), true);
  assert.equal(isAnswerCorrect('  étoile ', 'Etoile'), true);
});
