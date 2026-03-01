import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assignLackSuit,
  createInitialGame,
  declareAnGang,
  declareBuGang,
  declareSelfDrawHu,
  discardTile,
  resolveReactions,
  submitExchangeSelection,
  tileFromCode
} from '../src/game.js';

function makeTiles(codes, tag) {
  return codes.map((code, index) => tileFromCode(code, `${tag}-${index}`));
}

test('createInitialGame deals 14 to dealer and 13 to others', () => {
  const game = createInitialGame({
    dealerSeat: 2,
    exchangeDirection: 'across',
    randomFn: () => 0
  });

  assert.equal(game.phase, 'exchange');
  assert.equal(game.players[2].hand.length, 14);
  assert.equal(game.players[0].hand.length, 13);
  assert.equal(game.players[1].hand.length, 13);
  assert.equal(game.players[3].hand.length, 13);
});

test('submitExchangeSelection resolves to lack phase when all seats selected', () => {
  const game = createInitialGame({ exchangeDirection: 'across' });

  game.players[0].hand = makeTiles(['w1', 'w2', 'w3', 't1'], 'p0');
  game.players[1].hand = makeTiles(['t1', 't2', 't3', 'w1'], 'p1');
  game.players[2].hand = makeTiles(['b1', 'b2', 'b3', 'w1'], 'p2');
  game.players[3].hand = makeTiles(['w4', 'w5', 'w6', 't1'], 'p3');

  submitExchangeSelection(game, 0, game.players[0].hand.slice(0, 3).map((tile) => tile.id));
  submitExchangeSelection(game, 1, game.players[1].hand.slice(0, 3).map((tile) => tile.id));
  submitExchangeSelection(game, 2, game.players[2].hand.slice(0, 3).map((tile) => tile.id));
  submitExchangeSelection(game, 3, game.players[3].hand.slice(0, 3).map((tile) => tile.id));

  assert.equal(game.phase, 'lack');
  assert.equal(game.players[0].hand.length, 4);
  assert.equal(game.players[1].hand.length, 4);
  assert.equal(game.players[2].hand.length, 4);
  assert.equal(game.players[3].hand.length, 4);
});

test('assignLackSuit transitions to play when all players confirmed', () => {
  const game = createInitialGame({ exchangeDirection: 'clockwise' });
  game.phase = 'lack';

  assignLackSuit(game, 0, 'wan');
  assignLackSuit(game, 1, 'tiao');
  assignLackSuit(game, 2, 'tong');
  assert.equal(game.phase, 'lack');

  assignLackSuit(game, 3, 'wan');
  assert.equal(game.phase, 'play');
});

test('discardTile enforces ding-que constraint', () => {
  const game = createInitialGame({ dealerSeat: 0 });
  game.phase = 'play';
  game.turnSeat = 0;

  game.players[0].hand = makeTiles(['w1', 't1', 't2', 't3', 'b1', 'b2', 'b3', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8'], 'self');
  game.players[0].lackSuit = 'wan';

  assert.throws(() => {
    discardTile(game, 0, game.players[0].hand.find((tile) => tile.suit === 'tiao').id);
  }, /MUST_DISCARD_LACK_SUIT_FIRST/);
});

test('resolveReactions prioritizes hu over peng', () => {
  const game = createInitialGame({ dealerSeat: 0 });
  game.phase = 'play';
  game.turnSeat = 0;

  game.players[0].hand = makeTiles([
    'b9',
    'w1', 'w1', 'w1',
    'w2', 'w2', 'w2',
    'w3', 'w3', 'w3',
    't1', 't1', 't1',
    'b1'
  ], 'p0');

  game.players[1].hand = makeTiles([
    'w1', 'w2', 'w3',
    'w3', 'w4', 'w5',
    'w5', 'w6', 'w7',
    't2', 't3', 't4',
    'b9'
  ], 'p1');

  game.players[2].hand = makeTiles([
    'b9', 'b9',
    't1', 't2', 't3',
    't4', 't5', 't6',
    'w4', 'w5', 'w6',
    'b1', 'b2'
  ], 'p2');

  game.players[3].hand = makeTiles([
    'w7', 'w8', 'w9',
    't7', 't8', 't9',
    'b1', 'b2', 'b3',
    'w1', 'w2', 'w3',
    't1'
  ], 'p3');

  discardTile(game, 0, game.players[0].hand[0].id);
  assert.ok(game.pendingReactions);

  resolveReactions(game, [
    { seat: 1, action: 'hu' },
    { seat: 2, action: 'peng' }
  ]);

  assert.equal(game.players[1].hasHu, true);
  assert.equal(game.players[2].hasHu, false);
  assert.equal(game.pendingReactions, null);
  assert.equal(game.discardPool.at(-1).claimed, true);
  assert.equal(game.players[1].score > 0, true);
  assert.equal(game.players[0].score < 0, true);
  assert.equal(game.settlementEvents.at(-1).type, 'hu');
});

test('resolveReactions prioritizes gang over peng when no hu', () => {
  const game = createInitialGame({ dealerSeat: 0 });
  game.phase = 'play';
  game.turnSeat = 0;

  game.players[0].hand = makeTiles([
    'b9',
    'w1', 'w1', 'w1',
    'w2', 'w2', 'w2',
    'w3', 'w3', 'w3',
    't1', 't1', 't1',
    'b1'
  ], 'p0g');

  game.players[1].hand = makeTiles([
    'b9', 'b9', 'b9',
    'w1', 'w2', 'w3',
    't1', 't2', 't3',
    'b1', 'b2', 'b3',
    'w4'
  ], 'p1g');

  game.players[2].hand = makeTiles([
    'b9', 'b9',
    'w4', 'w5', 'w6',
    't4', 't5', 't6',
    'b1', 'b2', 'b3',
    'w7', 'w8'
  ], 'p2g');

  game.players[3].hand = makeTiles([
    'w7', 'w8', 'w9',
    't7', 't8', 't9',
    'b1', 'b2', 'b3',
    'w1', 'w2', 'w3',
    't1'
  ], 'p3g');

  discardTile(game, 0, game.players[0].hand[0].id);
  resolveReactions(game, [
    { seat: 1, action: 'gang' },
    { seat: 2, action: 'peng' }
  ]);

  assert.equal(game.turnSeat, 1);
  assert.equal(game.players[1].melds[0].type, 'ming_gang');
  assert.equal(game.players[1].score, 1);
  assert.equal(game.players[0].score, -1);
  assert.equal(game.settlementEvents.at(-1).type, 'gang');
});

test('resolveReactions supports one discard multiple hu with independent payments', () => {
  const game = createInitialGame({ dealerSeat: 0 });
  game.phase = 'play';
  game.turnSeat = 0;

  game.players[0].hand = makeTiles([
    'b9',
    'w1', 'w1', 'w1',
    'w2', 'w2', 'w2',
    'w3', 'w3', 'w3',
    't1', 't1', 't1',
    'b1'
  ], 'p0m');

  game.players[1].hand = makeTiles([
    'w1', 'w2', 'w3',
    'w3', 'w4', 'w5',
    'w5', 'w6', 'w7',
    't2', 't3', 't4',
    'b9'
  ], 'p1m');

  game.players[2].hand = makeTiles([
    't1', 't2', 't3',
    't3', 't4', 't5',
    't5', 't6', 't7',
    'w4', 'w5', 'w6',
    'b9'
  ], 'p2m');

  game.players[3].hand = makeTiles([
    'w7', 'w8', 'w9',
    't7', 't8', 't9',
    'b1', 'b2', 'b3',
    'w1', 'w2', 'w3',
    't1'
  ], 'p3m');

  discardTile(game, 0, game.players[0].hand[0].id);
  resolveReactions(game, [
    { seat: 1, action: 'hu' },
    { seat: 2, action: 'hu' }
  ]);

  assert.equal(game.players[1].hasHu, true);
  assert.equal(game.players[2].hasHu, true);
  assert.equal(game.players[0].score < 0, true);
  assert.equal(game.players[1].score > 0, true);
  assert.equal(game.players[2].score > 0, true);
  assert.equal(game.settlementEvents.filter((event) => event.type === 'hu').length, 2);
});

test('round enters settlement after third winner appears', () => {
  const game = createInitialGame({ dealerSeat: 0 });
  game.phase = 'play';
  game.turnSeat = 0;
  game.players[2].hasHu = true;
  game.players[3].hasHu = true;
  game.winnerSeats = [2, 3];

  game.players[0].hand = makeTiles([
    'b9',
    'w1', 'w1', 'w1',
    'w2', 'w2', 'w2',
    'w3', 'w3', 'w3',
    't1', 't1', 't1',
    'b1'
  ], 'p0s');

  game.players[1].hand = makeTiles([
    'w1', 'w2', 'w3',
    'w3', 'w4', 'w5',
    'w5', 'w6', 'w7',
    't2', 't3', 't4',
    'b9'
  ], 'p1s');

  discardTile(game, 0, game.players[0].hand[0].id);
  resolveReactions(game, [
    { seat: 1, action: 'hu' }
  ]);

  assert.equal(game.phase, 'settlement');
  assert.equal(game.settlementReason, 'all_but_one_hu');
});

test('declareSelfDrawHu settles from all active opponents', () => {
  const game = createInitialGame({ dealerSeat: 1, baseScore: 1 });
  game.phase = 'play';
  game.turnSeat = 1;

  game.players[1].hand = makeTiles([
    'w1', 'w2', 'w3',
    'w3', 'w4', 'w5',
    'w5', 'w6', 'w7',
    't2', 't3', 't4',
    't9', 't9'
  ], 'zimo');
  game.players[1].lackSuit = 'tong';
  game.players[0].lackSuit = 'wan';
  game.players[2].lackSuit = 'wan';
  game.players[3].lackSuit = 'wan';

  declareSelfDrawHu(game, 1);

  assert.equal(game.players[1].hasHu, true);
  assert.equal(game.players[1].score, 24);
  assert.equal(game.players[0].score, -8);
  assert.equal(game.players[2].score, -8);
  assert.equal(game.players[3].score, -8);
  assert.equal(game.settlementEvents.at(-1).winMode, 'zi_mo');
});

test('declareSelfDrawHu works with open melds + small concealed hand', () => {
  const game = createInitialGame({ dealerSeat: 3, baseScore: 1 });
  game.phase = 'play';
  game.turnSeat = 3;

  game.players[3].hand = makeTiles(['w2', 'w3', 'w4', 't4', 't4'], 'open-hu');
  game.players[3].melds = [
    { type: 'peng', tile: tileFromCode('w7', 'm1'), fromDiscard: true },
    { type: 'ming_gang', tile: tileFromCode('t2', 'm2'), fromDiscard: true },
    { type: 'peng', tile: tileFromCode('w1', 'm3'), fromDiscard: true }
  ];
  game.players[3].lackSuit = 'tong';

  game.players[0].lackSuit = 'wan';
  game.players[1].lackSuit = 'wan';
  game.players[2].lackSuit = 'wan';

  declareSelfDrawHu(game, 3);

  assert.equal(game.players[3].hasHu, true);
  assert.equal(game.settlementEvents.at(-1).winMode, 'zi_mo');
});

test('declareAnGang awards gang score and draws from tail', () => {
  const game = createInitialGame({ dealerSeat: 0 });
  game.phase = 'play';
  game.turnSeat = 0;
  game.wallTail = game.wall.length - 1;

  game.players[0].hand = makeTiles([
    'w1', 'w1', 'w1', 'w1',
    't1', 't2', 't3',
    't4', 't5', 't6',
    'b1', 'b2', 'b3', 'b4'
  ], 'angang');

  const beforeTail = game.wallTail;
  declareAnGang(game, 0, game.players[0].hand[0].id);

  assert.equal(game.players[0].melds.at(-1).type, 'an_gang');
  assert.equal(game.players[0].score, 3);
  assert.equal(game.players[1].score, -1);
  assert.equal(game.players[2].score, -1);
  assert.equal(game.players[3].score, -1);
  assert.equal(game.wallTail, beforeTail - 1);
  assert.equal(game.lastDraw.fromKong, true);
});

test('declareBuGang opens rob-kong window and supports qiang-gang-hu', () => {
  const game = createInitialGame({ dealerSeat: 0 });
  game.phase = 'play';
  game.turnSeat = 0;

  game.players[0].hand = makeTiles([
    'b9',
    'w1', 'w2', 'w3',
    'w3', 'w4', 'w5',
    't1', 't2', 't3',
    'b1', 'b2', 'b3'
  ], 'bugang0');
  game.players[0].melds = [{
    type: 'peng',
    tile: tileFromCode('b9', 'peng'),
    fromDiscard: true
  }];

  game.players[1].hand = makeTiles([
    'w1', 'w2', 'w3',
    'w3', 'w4', 'w5',
    'w5', 'w6', 'w7',
    't2', 't3', 't4',
    'b9'
  ], 'bugang1');

  game.players[2].hand = makeTiles([
    'w1', 'w1', 'w2',
    'w2', 'w3', 'w3',
    't1', 't1', 't2',
    't2', 'b1', 'b1', 'b2'
  ], 'bugang2');
  game.players[3].hand = makeTiles([
    'w4', 'w5', 'w6',
    't4', 't5', 't6',
    'b3', 'b4', 'b5',
    'w7', 'w8', 'w9', 't7'
  ], 'bugang3');

  declareBuGang(game, 0, game.players[0].hand[0].id);
  assert.equal(game.pendingReactions.kind, 'rob_kong');

  resolveReactions(game, [
    { seat: 1, action: 'hu' }
  ]);

  assert.equal(game.players[1].hasHu, true);
  assert.equal(game.players[0].score < 0, true);
  assert.equal(game.settlementEvents.at(-1).winMode, 'qiang_gang_hu');
  assert.equal(game.players[0].melds[0].type, 'peng');
});
