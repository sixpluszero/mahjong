import { calculateWinPayment, evaluateFans, isDiscardAllowed } from './rules.js';
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
    winnerSeats: [],
    settlementEvents: [],
    settlementReason: null,
    lastDraw: null
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
  const fromKongDiscard = state.lastDraw?.seat === seat && state.lastDraw.fromKong;
  const isLastTileDiscard = state.wallHead > state.wallTail;
  state.discardPool.push({
    seat,
    tile,
    claimed: false
  });
  state.lastDraw = null;

  const pending = buildPendingReactions(state, seat, tile, {
    kongPao: fromKongDiscard,
    lastTileDiscard: isLastTileDiscard
  });
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

      const request = huRequests.find((entry) => entry.seat === seat);
      settleDiscardHu(state, {
        winnerSeat: seat,
        fromSeat: pending.fromSeat,
        tile: pending.tile,
        huResult: request.huResult,
        winMode: pending.kind === 'rob_kong' ? 'qiang_gang_hu' : 'dian_pao'
      });
    }

    if (pending.kind !== 'rob_kong') {
      markLatestDiscardClaimed(state);
    }
    state.pendingReactions = null;

    if (countActiveNonWinners(state) <= 1) {
      finishRound(state, 'all_but_one_hu');
      return state;
    }

    advanceTurnAfterPass(state, pending.fromSeat);
    return state;
  }

  if (pending.kind === 'rob_kong') {
    applyBuGang(state, pending.buGangSeat, pending.tile);
    state.pendingReactions = null;
    state.turnSeat = pending.buGangSeat;
    drawTileForSeat(state, pending.buGangSeat, true);
    return state;
  }

  const gangRequests = requested.filter((entry) => entry.action === 'gang' && entry.canGang);
  if (gangRequests.length > 0) {
    const claimerSeat = selectNearestSeat(gangRequests.map((entry) => entry.seat), pending.fromSeat);
    applyClaimMeld(state, claimerSeat, pending.tile, 'ming_gang', 3);
    settleMingGang(state, {
      winnerSeat: claimerSeat,
      fromSeat: pending.fromSeat
    });
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
    finishRound(state, 'wall_exhausted');
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
  state.lastDraw = {
    seat,
    fromKong: useTail,
    lastTile: state.wallHead > state.wallTail
  };

  return tile;
}

export function declareSelfDrawHu(state, seat) {
  assertPhase(state, 'play');
  ensureNoPendingReactions(state);

  if (state.turnSeat !== seat) {
    throw new Error('NOT_YOUR_TURN');
  }

  const player = getPlayer(state, seat);
  if (player.hasHu) {
    throw new Error('ALREADY_HU');
  }

  const huResult = evaluateFans({
    tiles: player.hand,
    lackSuit: player.lackSuit,
    context: {
      selfDraw: true,
      menQing: isMenQing(player),
      kongDraw: Boolean(state.lastDraw?.seat === seat && state.lastDraw.fromKong),
      lastTileDraw: Boolean(state.lastDraw?.seat === seat && state.lastDraw.lastTile)
    },
    config: state.config
  });

  if (!huResult.canHu) {
    throw new Error('SELF_DRAW_HU_NOT_ALLOWED');
  }

  player.hasHu = true;
  if (!state.winnerSeats.includes(seat)) {
    state.winnerSeats.push(seat);
  }

  settleSelfDrawHu(state, {
    winnerSeat: seat,
    huResult
  });
  state.lastDraw = null;

  if (countActiveNonWinners(state) <= 1) {
    finishRound(state, 'all_but_one_hu');
    return state;
  }

  advanceTurnAfterPass(state, seat);
  return state;
}

export function declareAnGang(state, seat, tileId) {
  assertPhase(state, 'play');
  ensureNoPendingReactions(state);

  if (state.turnSeat !== seat) {
    throw new Error('NOT_YOUR_TURN');
  }

  const player = getPlayer(state, seat);
  const tile = player.hand.find((item) => item.id === tileId);
  if (!tile) {
    throw new Error('TILE_NOT_IN_HAND');
  }

  const sameTiles = player.hand.filter((item) => sameKind(item, tile));
  if (sameTiles.length < 4) {
    throw new Error('NOT_ENOUGH_TILES_FOR_AN_GANG');
  }

  removeTilesByMatcher(player.hand, (item) => sameKind(item, tile), 4);
  player.melds.push({
    type: 'an_gang',
    tile: { ...tile },
    fromDiscard: false
  });

  settleAnGang(state, {
    winnerSeat: seat
  });
  drawTileForSeat(state, seat, true);
  return state;
}

export function declareBuGang(state, seat, tileId) {
  assertPhase(state, 'play');
  ensureNoPendingReactions(state);

  if (state.turnSeat !== seat) {
    throw new Error('NOT_YOUR_TURN');
  }

  const player = getPlayer(state, seat);
  const tile = player.hand.find((item) => item.id === tileId);
  if (!tile) {
    throw new Error('TILE_NOT_IN_HAND');
  }

  const hasPeng = player.melds.some((meld) => meld.type === 'peng' && sameKind(meld.tile, tile));
  if (!hasPeng) {
    throw new Error('NO_MATCHING_PENG_FOR_BU_GANG');
  }

  const robOptions = buildRobKongOptions(state, seat, tile);
  if (robOptions.length > 0) {
    state.pendingReactions = {
      kind: 'rob_kong',
      fromSeat: seat,
      tile,
      options: robOptions,
      buGangSeat: seat
    };
    return state;
  }

  applyBuGang(state, seat, tile);
  drawTileForSeat(state, seat, true);
  return state;
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
    settlementReason: state.settlementReason,
    settlementEvents: [...state.settlementEvents],
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
    finishRound(state, 'no_active_players');
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

function buildPendingReactions(state, fromSeat, tile, context = {}) {
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
        menQing: isMenQing(player),
        kongPao: Boolean(context.kongPao),
        lastTileDiscard: Boolean(context.lastTileDiscard)
      },
      config: state.config
    });

    const canHu = huResult.canHu;

    if (canHu || canGang || canPeng) {
      options.push({
        seat,
        canHu,
        canGang,
        canPeng,
        huResult: canHu ? huResult : null
      });
    }
  }

  return {
    kind: 'normal',
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

function settleDiscardHu(state, { winnerSeat, fromSeat, tile, huResult, winMode = 'dian_pao' }) {
  if (!huResult?.canHu) {
    return;
  }

  const payment = calculateHuPayment(state, huResult);
  applyTransfer(state, fromSeat, winnerSeat, payment);
  state.settlementEvents.push({
    type: 'hu',
    winMode,
    winnerSeat,
    fromSeat,
    tile: { ...tile },
    fan: huResult.cappedFan,
    rawFan: huResult.fan,
    amount: payment,
    patterns: huResult.patterns
  });
}

function settleSelfDrawHu(state, { winnerSeat, huResult }) {
  const payment = calculateHuPayment(state, huResult);
  const payers = state.players
    .filter((player) => player.seat !== winnerSeat && !player.hasHu)
    .map((player) => player.seat);

  for (const fromSeat of payers) {
    applyTransfer(state, fromSeat, winnerSeat, payment);
  }

  state.settlementEvents.push({
    type: 'hu',
    winMode: 'zi_mo',
    winnerSeat,
    fromSeat: null,
    fan: huResult.cappedFan,
    rawFan: huResult.fan,
    amount: payment,
    payerCount: payers.length,
    patterns: huResult.patterns
  });
}

function settleMingGang(state, { winnerSeat, fromSeat }) {
  const amount = state.config.baseScore;
  applyTransfer(state, fromSeat, winnerSeat, amount);
  state.settlementEvents.push({
    type: 'gang',
    gangType: 'ming_gang',
    winnerSeat,
    fromSeat,
    amount
  });
}

function settleAnGang(state, { winnerSeat }) {
  const amount = state.config.baseScore;
  const payers = state.players
    .filter((player) => player.seat !== winnerSeat && !player.hasHu)
    .map((player) => player.seat);

  for (const fromSeat of payers) {
    applyTransfer(state, fromSeat, winnerSeat, amount);
  }

  state.settlementEvents.push({
    type: 'gang',
    gangType: 'an_gang',
    winnerSeat,
    fromSeat: null,
    amount,
    payerCount: payers.length
  });
}

function settleBuGang(state, { winnerSeat }) {
  const amount = state.config.baseScore;
  const payers = state.players
    .filter((player) => player.seat !== winnerSeat && !player.hasHu)
    .map((player) => player.seat);

  for (const fromSeat of payers) {
    applyTransfer(state, fromSeat, winnerSeat, amount);
  }

  state.settlementEvents.push({
    type: 'gang',
    gangType: 'bu_gang',
    winnerSeat,
    fromSeat: null,
    amount,
    payerCount: payers.length
  });
}

function calculateHuPayment(state, huResult) {
  return calculateWinPayment({
    fan: huResult.fan,
    maxFan: state.config.maxFan,
    baseScore: state.config.baseScore
  });
}

function applyTransfer(state, fromSeat, toSeat, amount) {
  state.players[fromSeat].score -= amount;
  state.players[toSeat].score += amount;
}

function finishRound(state, reason) {
  state.phase = 'settlement';
  state.settlementReason = reason;
}

function buildRobKongOptions(state, fromSeat, tile) {
  const options = [];

  for (let offset = 1; offset <= 3; offset += 1) {
    const seat = (fromSeat + offset) % 4;
    const player = state.players[seat];
    if (player.hasHu) {
      continue;
    }

    const candidateHand = [...player.hand, tile];
    const huResult = evaluateFans({
      tiles: candidateHand,
      lackSuit: player.lackSuit,
      context: {
        selfDraw: false,
        menQing: isMenQing(player),
        robbedKong: true
      },
      config: state.config
    });

    if (huResult.canHu) {
      options.push({
        seat,
        canHu: true,
        canGang: false,
        canPeng: false,
        huResult
      });
    }
  }

  return options;
}

function applyBuGang(state, seat, tile) {
  const player = getPlayer(state, seat);
  const meld = player.melds.find((item) => item.type === 'peng' && sameKind(item.tile, tile));
  if (!meld) {
    throw new Error('NO_MATCHING_PENG_FOR_BU_GANG');
  }

  removeTilesByMatcher(player.hand, (item) => sameKind(item, tile), 1);
  meld.type = 'bu_gang';
  settleBuGang(state, { winnerSeat: seat });
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

function removeTilesByMatcher(hand, matcher, count) {
  let remaining = count;
  for (let i = hand.length - 1; i >= 0; i -= 1) {
    if (remaining === 0) {
      break;
    }

    if (matcher(hand[i])) {
      hand.splice(i, 1);
      remaining -= 1;
    }
  }

  if (remaining > 0) {
    throw new Error('NOT_ENOUGH_MATCHING_TILES');
  }
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

function isMenQing(player) {
  return player.melds.every((meld) => meld.type === 'an_gang');
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
