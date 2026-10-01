import test from 'node:test';
import assert from 'node:assert/strict';

import { clozePassage, normalizeForComparison, modeQueue, isAnswerCorrect, summarizeAnswers } from '../game-logic.js';

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
  assert.equal(isAnswerCorrect('E', 'É'), true);
});

test('clozePassage keeps useful context and gives a clear fallback', () => {
  assert.equal(clozePassage({ term: 'Éclipse', definition: 'Un astre en masque un autre', context: 'Lors d’une éclipse, un astre bloque la lumière.' }), 'Lors d’une éclipse, un astre bloque la lumière.');
  assert.equal(clozePassage({ term: 'Orbite', definition: 'Trajectoire autour d’un astre' }), 'Le terme « Orbite » désigne la notion suivante : Trajectoire autour d’un astre.');
  assert.equal(clozePassage({ term: 'Orbit', definition: 'A path around an object' }, 'en'), 'The term "Orbit" refers to the following concept: A path around an object.');
});

test('summarizeAnswers derives errors and accuracy from attempted answers', () => {
  assert.deepEqual(summarizeAnswers(3, 5), { correct: 3, total: 5, errors: 2, percentage: 60 });
  assert.deepEqual(summarizeAnswers(0, 0), { correct: 0, total: 0, errors: 0, percentage: 0 });
  assert.deepEqual(summarizeAnswers(8, 5), { correct: 5, total: 5, errors: 0, percentage: 100 });
});
