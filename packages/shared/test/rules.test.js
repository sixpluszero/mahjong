import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCounts,
  calculateWinPayment,
  createDeck,
  detectWinShape,
  evaluateFans,
  isDiscardAllowed,
  parseTileCodes
} from '../src/index.js';

function tiles(codes) {
  return parseTileCodes(codes);
}

test('createDeck creates full 108-tile Sichuan deck', () => {
  const deck = createDeck();
  assert.equal(deck.length, 108);

  const counts = buildCounts(deck);
  for (const count of counts) {
    assert.equal(count, 4);
  }
});

test('detectWinShape recognizes standard winning hand', () => {
  const hand = tiles([
    'w1', 'w2', 'w3',
    'w3', 'w4', 'w5',
    'w5', 'w6', 'w7',
    't2', 't3', 't4',
    'b9', 'b9'
  ]);

  const result = detectWinShape(hand);
  assert.equal(result.isWin, true);
  assert.equal(result.winType, 'standard');
});

test('detectWinShape rejects non-winning hand', () => {
  const hand = tiles([
    'w1', 'w1', 'w1',
    'w2', 'w2', 'w2',
    'w3', 'w3', 'w3',
    't4', 't4', 't4',
    'b5', 'b6'
  ]);

  const result = detectWinShape(hand);
  assert.equal(result.isWin, false);
});

test('detectWinShape recognizes seven pairs and dragon pair', () => {
  const hand = tiles([
    'w1', 'w1',
    'w2', 'w2',
    'w3', 'w3',
    'w4', 'w4',
    'w5', 'w5',
    'w6', 'w6', 'w6', 'w6'
  ]);

  const result = detectWinShape(hand);
  assert.equal(result.isWin, true);
  assert.equal(result.winType, 'seven_pairs');
  assert.equal(result.details.hasDragonPair, true);
});

test('evaluateFans calculates ping hu + zi mo + men qing', () => {
  const hand = tiles([
    'w1', 'w2', 'w3',
    'w3', 'w4', 'w5',
    'w5', 'w6', 'w7',
    't2', 't3', 't4',
    'b9', 'b9'
  ]);

  const result = evaluateFans({
    tiles: hand,
    context: {
      selfDraw: true,
      menQing: true
    }
  });

  assert.equal(result.canHu, true);
  assert.equal(result.fan, 3);
  assert.deepEqual(result.patterns, ['ping_hu', 'zi_mo', 'men_qing']);
});

test('evaluateFans calculates qing yi se + peng peng hu', () => {
  const hand = tiles([
    'w1', 'w1', 'w1',
    'w2', 'w2', 'w2',
    'w3', 'w3', 'w3',
    'w4', 'w4', 'w4',
    'w5', 'w5'
  ]);

  const result = evaluateFans({
    tiles: hand,
    context: {
      menQing: true
    }
  });

  assert.equal(result.canHu, true);
  assert.equal(result.fan, 7);
  assert.equal(result.patterns.includes('peng_peng_hu'), true);
  assert.equal(result.patterns.includes('qing_yi_se'), true);
});

test('evaluateFans detects jiang dui as primary type', () => {
  const hand = tiles([
    'w2', 'w2', 'w2',
    't5', 't5', 't5',
    'b8', 'b8', 'b8',
    'w5', 'w5', 'w5',
    't2', 't2'
  ]);

  const result = evaluateFans({
    tiles: hand,
    context: {
      menQing: false
    }
  });

  assert.equal(result.canHu, true);
  assert.equal(result.patterns[0], 'jiang_dui');
  assert.equal(result.fan, 4);
});

test('evaluateFans detects yao jiu as primary type', () => {
  const hand = tiles([
    'w1', 'w1', 'w1',
    't1', 't1', 't1',
    'b9', 'b9', 'b9',
    'w9', 'w9', 'w9',
    't9', 't9'
  ]);

  const result = evaluateFans({
    tiles: hand,
    context: {
      menQing: false
    }
  });

  assert.equal(result.canHu, true);
  assert.equal(result.patterns[0], 'yao_jiu');
  assert.equal(result.fan, 4);
});

test('evaluateFans enforces ding-que by rejecting hu with lack-suit tiles', () => {
  const hand = tiles([
    'w1', 'w1', 'w1',
    'w2', 'w2', 'w2',
    'w3', 'w3', 'w3',
    'w4', 'w4', 'w4',
    't5', 't5'
  ]);

  const result = evaluateFans({
    tiles: hand,
    lackSuit: 'tiao',
    context: {
      menQing: true
    }
  });

  assert.equal(result.canHu, false);
  assert.equal(result.reason, 'HAS_LACK_SUIT_TILES');
});

test('isDiscardAllowed enforces discard of lack suit first', () => {
  const hand = tiles(['w1', 'w2', 't3', 'b4']);

  const illegalDiscard = isDiscardAllowed(hand, tiles(['w1'])[0], 'tiao');
  const legalDiscard = isDiscardAllowed(hand, tiles(['t3'])[0], 'tiao');

  assert.equal(illegalDiscard, false);
  assert.equal(legalDiscard, true);
});

test('calculateWinPayment applies fan cap', () => {
  const payment = calculateWinPayment({
    fan: 20,
    maxFan: 16,
    baseScore: 2
  });

  assert.equal(payment, 2 * (2 ** 16));
});

test('evaluateFans includes optional context bonuses', () => {
  const hand = tiles([
    'w1', 'w2', 'w3',
    'w3', 'w4', 'w5',
    'w5', 'w6', 'w7',
    't2', 't3', 't4',
    'b9', 'b9'
  ]);

  const result = evaluateFans({
    tiles: hand,
    context: {
      menQing: true,
      robbedKong: true,
      lastTileDraw: true
    }
  });

  assert.equal(result.canHu, true);
  assert.equal(result.fan, 4);
  assert.equal(result.patterns.includes('qiang_gang_hu'), true);
  assert.equal(result.patterns.includes('hai_di_lao_yue'), true);
});
