import { evaluateFans, isDiscardAllowed } from './rules.js';
import { createDeck, parseTileCode, SUITS } from './tiles.js';

const EXCHANGE_DIRECTIONS = ['clockwise', 'counterclockwise', 'across'];

export function createInitialGame(config = {}) {
  const seatCount = 4;
  const dealerSeat = config.dealerSeat ?? 0;
  const exchangeDirection = resolveExchangeDirection(config.exchangeDirection, config.randomFn);
  const wall = [...(config.deck ?? shuffleDeck(createDeck(), config.randomFn))];

  const players = Array.from({ length: seatCount }, (_, seat) => ({
    seat,
    hand: [],
    melds: [],
    lackSuit: null,
    hasHu: false,
    exchangeSelection: null,
    score: 0
  }));

  let wallHead = 0;
  const wallTail = wall.length - 1;

  for (let round = 0; round < 13; round += 1) {
    for (let seat = 0; seat < seatCount; seat += 1) {
      players[seat].hand.push(wall[wallHead]);
      wallHead += 1;
    }
  }

  players[dealerSeat].hand.push(wall[wallHead]);
  wallHead += 1;

  sortHands(players);

  return {
    config: {
      maxFan: config.maxFan ?? 16,
      minFan: config.minFan ?? 1,
      baseScore: config.baseScore ?? 1
    },
    phase: 'exchange',
    dealerSeat,
    turnSeat: dealerSeat,
    wall,
    wallHead,
    wallTail,
    players,
    exchangeDirection,
    pendingReactions: null,
    discardPool: [],
    winnerSeats: []
  };
}

export function submitExchangeSelection(state, seat, tileIds) {
  assertPhase(state, 'exchange');
  const player = getPlayer(state, seat);

  if (!Array.isArray(tileIds) || tileIds.length !== 3) {
    throw new Error('EXCHANGE_MUST_PICK_3_TILES');
  }

  const selected = pickTilesFromHand(player.hand, tileIds);
  const sameSuit = selected.every((tile) => tile.suit === selected[0].suit);
  if (!sameSuit) {
    throw new Error('EXCHANGE_MUST_BE_SAME_SUIT');
  }

  player.exchangeSelection = selected;

  const allReady = state.players.every((p) => p.exchangeSelection);
  if (allReady) {
    resolveExchange(state);
  }

  return state;
}

export function assignLackSuit(state, seat, lackSuit) {
  assertPhase(state, 'lack');

  if (!SUITS.includes(lackSuit)) {
    throw new Error(`INVALID_LACK_SUIT: ${lackSuit}`);
  }

  const player = getPlayer(state, seat);
  player.lackSuit = lackSuit;

  const allReady = state.players.every((p) => p.lackSuit !== null);
  if (allReady) {
    state.phase = 'play';
  }

  return state;
}

export function discardTile(state, seat, tileId) {
  assertPhase(state, 'play');
  ensureNoPendingReactions(state);

  if (state.turnSeat !== seat) {
    throw new Error('NOT_YOUR_TURN');
  }

  const player = getPlayer(state, seat);
  if (player.hasHu) {
    throw new Error('WINNER_CANNOT_ACT');
  }

  const tileIndex = player.hand.findIndex((tile) => tile.id === tileId);
  if (tileIndex === -1) {
    throw new Error('TILE_NOT_IN_HAND');
  }

  const tile = player.hand[tileIndex];
  if (!isDiscardAllowed(player.hand, tile, player.lackSuit)) {
    throw new Error('MUST_DISCARD_LACK_SUIT_FIRST');
  }

  player.hand.splice(tileIndex, 1);
  state.discardPool.push({
    seat,
    tile,
    claimed: false
  });

  const pending = buildPendingReactions(state, seat, tile);
  if (pending.options.length === 0) {
    advanceTurnAfterPass(state, seat);
    return state;
  }

  state.pendingReactions = pending;
  return state;
}

export function resolveReactions(state, actions) {
  const pending = state.pendingReactions;
  if (!pending) {
    throw new Error('NO_PENDING_REACTIONS');
  }

  const actionMap = new Map();
  for (const action of actions ?? []) {
    if (!pending.options.some((option) => option.seat === action.seat)) {
      throw new Error(`INVALID_REACTION_SEAT: ${action.seat}`);
    }

    actionMap.set(action.seat, action.action);
  }

  const requested = pending.options.map((option) => ({
    ...option,
    action: actionMap.get(option.seat) ?? 'pass'
  }));

  const huRequests = requested.filter((entry) => entry.action === 'hu' && entry.canHu);
  if (huRequests.length > 0) {
    const winners = sortByDistanceFromSeat(huRequests.map((entry) => entry.seat), pending.fromSeat);
    for (const seat of winners) {
      const winner = getPlayer(state, seat);
      winner.hasHu = true;
      if (!state.winnerSeats.includes(seat)) {
        state.winnerSeats.push(seat);
      }
    }

    markLatestDiscardClaimed(state);
    state.pendingReactions = null;

    if (countActiveNonWinners(state) <= 1) {
      state.phase = 'settlement';
      return state;
    }

    advanceTurnAfterPass(state, pending.fromSeat);
    return state;
  }

  const gangRequests = requested.filter((entry) => entry.action === 'gang' && entry.canGang);
  if (gangRequests.length > 0) {
    const claimerSeat = selectNearestSeat(gangRequests.map((entry) => entry.seat), pending.fromSeat);
    applyClaimMeld(state, claimerSeat, pending.tile, 'ming_gang', 3);
    markLatestDiscardClaimed(state);
    state.pendingReactions = null;
    state.turnSeat = claimerSeat;
    drawTileForSeat(state, claimerSeat, true);
    return state;
  }

  const pengRequests = requested.filter((entry) => entry.action === 'peng' && entry.canPeng);
  if (pengRequests.length > 0) {
    const claimerSeat = selectNearestSeat(pengRequests.map((entry) => entry.seat), pending.fromSeat);
    applyClaimMeld(state, claimerSeat, pending.tile, 'peng', 2);
    markLatestDiscardClaimed(state);
    state.pendingReactions = null;
    state.turnSeat = claimerSeat;
    return state;
  }

  state.pendingReactions = null;
  advanceTurnAfterPass(state, pending.fromSeat);
  return state;
}

export function drawTileForSeat(state, seat, useTail = false) {
  assertPhase(state, 'play');

  const player = getPlayer(state, seat);
  if (player.hasHu) {
    throw new Error('WINNER_CANNOT_DRAW');
  }

  if (state.wallHead > state.wallTail) {
    state.phase = 'settlement';
    return null;
  }

  const index = useTail ? state.wallTail : state.wallHead;
  const tile = state.wall[index];

  if (useTail) {
    state.wallTail -= 1;
  } else {
    state.wallHead += 1;
  }

  player.hand.push(tile);
  sortHand(player.hand);

  return tile;
}

export function getPublicSnapshot(state) {
  return {
    phase: state.phase,
    dealerSeat: state.dealerSeat,
    turnSeat: state.turnSeat,
    exchangeDirection: state.exchangeDirection,
    wallRemaining: Math.max(0, state.wallTail - state.wallHead + 1),
    discardPool: [...state.discardPool],
    pendingReactions: state.pendingReactions,
    winnerSeats: [...state.winnerSeats],
    players: state.players.map((player) => ({
      seat: player.seat,
      handCount: player.hand.length,
      melds: [...player.melds],
      lackSuit: player.lackSuit,
      hasHu: player.hasHu,
      score: player.score
    }))
  };
}

function resolveExchange(state) {
  const outgoing = state.players.map((player) => ({
    seat: player.seat,
    tiles: player.exchangeSelection
  }));

  for (const player of state.players) {
    const selectedIds = new Set(player.exchangeSelection.map((tile) => tile.id));
    player.hand = player.hand.filter((tile) => !selectedIds.has(tile.id));
  }

  for (const item of outgoing) {
    const targetSeat = getExchangeTargetSeat(item.seat, state.exchangeDirection);
    state.players[targetSeat].hand.push(...item.tiles);
  }

  for (const player of state.players) {
    player.exchangeSelection = null;
    sortHand(player.hand);
  }

  state.phase = 'lack';
}

function getExchangeTargetSeat(seat, direction) {
  if (direction === 'clockwise') {
    return (seat + 1) % 4;
  }

  if (direction === 'counterclockwise') {
    return (seat + 3) % 4;
  }

  return (seat + 2) % 4;
}

function resolveExchangeDirection(direction, randomFn = Math.random) {
  if (!direction || direction === 'random') {
    const index = Math.floor(randomFn() * EXCHANGE_DIRECTIONS.length);
    return EXCHANGE_DIRECTIONS[index];
  }

  if (!EXCHANGE_DIRECTIONS.includes(direction)) {
    throw new Error(`INVALID_EXCHANGE_DIRECTION: ${direction}`);
  }

  return direction;
}

function advanceTurnAfterPass(state, fromSeat) {
  const nextSeat = findNextActiveSeat(state, fromSeat);

  if (nextSeat === null) {
    state.phase = 'settlement';
    return;
  }

  state.turnSeat = nextSeat;
  drawTileForSeat(state, nextSeat);
}

function findNextActiveSeat(state, fromSeat) {
  for (let offset = 1; offset <= 4; offset += 1) {
    const seat = (fromSeat + offset) % 4;
    if (!state.players[seat].hasHu) {
      return seat;
    }
  }

  return null;
}

function buildPendingReactions(state, fromSeat, tile) {
  const options = [];

  for (let offset = 1; offset <= 3; offset += 1) {
    const seat = (fromSeat + offset) % 4;
    const player = state.players[seat];
    if (player.hasHu) {
      continue;
    }

    const sameKindCount = player.hand.filter((handTile) => sameKind(handTile, tile)).length;
    const canPeng = sameKindCount >= 2;
    const canGang = sameKindCount >= 3;
    const candidateHand = [...player.hand, tile];
    const huResult = evaluateFans({
      tiles: candidateHand,
      lackSuit: player.lackSuit,
      context: {
        selfDraw: false,
        menQing: true
      },
      config: state.config
    });

    const canHu = huResult.canHu;

    if (canHu || canGang || canPeng) {
      options.push({
        seat,
        canHu,
        canGang,
        canPeng
      });
    }
  }

  return {
    fromSeat,
    tile,
    options
  };
}

function applyClaimMeld(state, seat, tile, meldType, requiredCount) {
  const player = getPlayer(state, seat);
  const removeIndices = [];

  for (let i = 0; i < player.hand.length; i += 1) {
    if (sameKind(player.hand[i], tile)) {
      removeIndices.push(i);
      if (removeIndices.length === requiredCount) {
        break;
      }
    }
  }

  if (removeIndices.length < requiredCount) {
    throw new Error('INSUFFICIENT_TILES_FOR_MELD');
  }

  for (let i = removeIndices.length - 1; i >= 0; i -= 1) {
    player.hand.splice(removeIndices[i], 1);
  }

  player.melds.push({
    type: meldType,
    tile: { ...tile },
    fromDiscard: true
  });
}

function markLatestDiscardClaimed(state) {
  const latest = state.discardPool[state.discardPool.length - 1];
  if (latest) {
    latest.claimed = true;
  }
}

function countActiveNonWinners(state) {
  return state.players.filter((player) => !player.hasHu).length;
}

function sortByDistanceFromSeat(seats, fromSeat) {
  return [...seats].sort((a, b) => distanceFrom(a, fromSeat) - distanceFrom(b, fromSeat));
}

function selectNearestSeat(seats, fromSeat) {
  return sortByDistanceFromSeat(seats, fromSeat)[0];
}

function distanceFrom(targetSeat, fromSeat) {
  return (targetSeat - fromSeat + 4) % 4;
}

function pickTilesFromHand(hand, tileIds) {
  const picked = [];
  const used = new Set();

  for (const id of tileIds) {
    const index = hand.findIndex((tile, tileIndex) => tile.id === id && !used.has(tileIndex));
    if (index === -1) {
      throw new Error(`TILE_NOT_IN_HAND: ${id}`);
    }

    used.add(index);
    picked.push(hand[index]);
  }

  return picked;
}

function sameKind(a, b) {
  return a.suit === b.suit && a.rank === b.rank;
}

function assertPhase(state, expectedPhase) {
  if (state.phase !== expectedPhase) {
    throw new Error(`INVALID_PHASE: expected ${expectedPhase}, got ${state.phase}`);
  }
}

function ensureNoPendingReactions(state) {
  if (state.pendingReactions) {
    throw new Error('REACTIONS_PENDING');
  }
}

function getPlayer(state, seat) {
  if (seat < 0 || seat > 3) {
    throw new Error(`INVALID_SEAT: ${seat}`);
  }

  return state.players[seat];
}

function sortHands(players) {
  for (const player of players) {
    sortHand(player.hand);
  }
}

function sortHand(hand) {
  hand.sort((a, b) => {
    const suitDelta = suitWeight(a.suit) - suitWeight(b.suit);
    if (suitDelta !== 0) {
      return suitDelta;
    }

    if (a.rank !== b.rank) {
      return a.rank - b.rank;
    }

    return a.id.localeCompare(b.id);
  });
}

function suitWeight(suit) {
  if (suit === 'wan') {
    return 0;
  }

  if (suit === 'tiao') {
    return 1;
  }

  return 2;
}

function shuffleDeck(deck, randomFn = Math.random) {
  const next = [...deck];

  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(randomFn() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }

  return next;
}

export function tileFromCode(code, idSuffix = 'test') {
  const tile = parseTileCode(code);
  return {
    ...tile,
    id: `${code}-${idSuffix}`
  };
}
