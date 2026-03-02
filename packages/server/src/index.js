import { createServer } from 'node:http';
import { randomInt } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

import {
  assignLackSuit,
  canDeclareSelfDrawHu,
  createInitialGame,
  declareAnGang,
  declareBuGang,
  declareSelfDrawHu,
  discardTile,
  getPublicSnapshot,
  resolveReactions,
  submitExchangeSelection
} from '@mahjong/shared';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_ROOT = path.resolve(__dirname, '../../web/src');
const STATIC_FILES = new Map([
  ['/', { file: 'index.html', type: 'text/html; charset=utf-8' }],
  ['/app.js', { file: 'app.js', type: 'application/javascript; charset=utf-8' }],
  ['/styles.css', { file: 'styles.css', type: 'text/css; charset=utf-8' }],
  ['/sw.js', { file: 'sw.js', type: 'application/javascript; charset=utf-8' }],
  ['/manifest.webmanifest', { file: 'manifest.webmanifest', type: 'application/manifest+json; charset=utf-8' }]
]);
const rooms = new Map();
const connections = new Map();
const BOT_ACTION_DELAY_MS = 120;
const BOT_ACTION_DELAY_WITH_HUMAN_MS = 1000;
const ROOM_IDLE_CLOSE_MS = 30 * 60 * 1000;
const DEFAULT_MAX_ROUNDS = 8;

const WS_PING_INTERVAL_MS = 25000;
const wsDebug = {
  startedAt: Date.now(),
  totals: {
    connections: 0,
    closes: 0,
    errors: 0,
    messages: 0,
    pings: 0,
    pongs: 0,
    terminatedByHeartbeat: 0
  },
  active: 0,
  byCloseCode: {},
  recent: []
};


const httpServer = createServer(async (req, res) => {
  if (req.url === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, service: 'mahjong-server' }));
    return;
  }

  if (req.url === '/api/ws-debug') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({
      ok: true,
      now: Date.now(),
      uptimeMs: Date.now() - wsDebug.startedAt,
      active: wsDebug.active,
      totals: wsDebug.totals,
      byCloseCode: wsDebug.byCloseCode,
      recent: wsDebug.recent
    }));
    return;
  }

  const staticEntry = STATIC_FILES.get(req.url ?? '/');
  if (!staticEntry) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }

  try {
    const content = await readFile(path.join(WEB_ROOT, staticEntry.file));
    res.writeHead(200, {
      'content-type': staticEntry.type,
      'cache-control': 'no-store'
    });
    res.end(content);
  } catch {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Failed to load static asset');
  }
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (socket, req) => {
  const client = {
    id: createId('c'),
    socket,
    name: null,
    roomId: null,
    seat: null
  };

  socket.isAlive = true;
  socket.on('pong', () => {
    socket.isAlive = true;
    wsDebug.totals.pongs += 1;
  });

  wsDebug.active += 1;
  wsDebug.totals.connections += 1;
  logWsEvent('open', {
    clientId: client.id,
    ip: getClientIp(req),
    ua: req?.headers?.['user-agent'] || null
  });

  connections.set(socket, client);
  send(socket, 'welcome', {
    clientId: client.id,
    now: Date.now()
  });

  socket.on('message', (raw) => {
    wsDebug.totals.messages += 1;
    handleIncoming(socket, raw);
  });

  socket.on('close', (code, reasonBuf) => {
    wsDebug.active = Math.max(0, wsDebug.active - 1);
    wsDebug.totals.closes += 1;
    const reason = safeCloseReason(reasonBuf);
    wsDebug.byCloseCode[code] = (wsDebug.byCloseCode[code] ?? 0) + 1;
    logWsEvent('close', {
      clientId: client.id,
      code,
      reason,
      roomId: client.roomId,
      seat: client.seat
    });
    handleDisconnect(socket);
  });

  socket.on('error', (error) => {
    wsDebug.totals.errors += 1;
    logWsEvent('error', {
      clientId: client.id,
      message: error?.message || String(error)
    });
    handleDisconnect(socket);
  });
});


const wsHeartbeatTimer = setInterval(() => {
  for (const socket of wss.clients) {
    if (socket.isAlive === false) {
      wsDebug.totals.terminatedByHeartbeat += 1;
      logWsEvent('terminate', { reason: 'heartbeat_timeout' });
      socket.terminate();
      continue;
    }

    socket.isAlive = false;
    wsDebug.totals.pings += 1;
    try {
      socket.ping();
    } catch {
      // ignore ping race
    }
  }
}, WS_PING_INTERVAL_MS);

wss.on('close', () => {
  clearInterval(wsHeartbeatTimer);
});

httpServer.listen(PORT, HOST, () => {
  const lanIps = getLanIpv4Addresses();
  const lanHint = lanIps.length > 0
    ? ` | LAN: ${lanIps.map((ip) => `http://${ip}:${PORT}`).join(', ')}`
    : '';
  console.log(`Mahjong WebSocket server listening on ${HOST}:${PORT}${lanHint}`);
});

function handleIncoming(socket, raw) {
  const client = connections.get(socket);
  if (!client) {
    return;
  }

  let message;
  try {
    message = JSON.parse(raw.toString('utf-8'));
  } catch {
    sendError(socket, 'INVALID_JSON');
    return;
  }

  const { type, payload = {} } = message;

  try {
    switch (type) {
      case 'hello':
        handleHello(client, payload);
        return;
      case 'create_room':
        handleCreateRoom(client);
        return;
      case 'join_room':
        handleJoinRoom(client, payload);
        return;
      case 'resume_room':
        handleResumeRoom(client, payload);
        return;
      case 'set_ready':
        handleSetReady(client, payload);
        return;
      case 'add_bot':
        handleAddBot(client);
        return;
      case 'submit_exchange':
        handleSubmitExchange(client, payload);
        return;
      case 'set_lack':
        handleSetLack(client, payload);
        return;
      case 'discard':
        handleDiscard(client, payload);
        return;
      case 'self_hu':
        handleSelfHu(client);
        return;
      case 'an_gang':
        handleAnGang(client, payload);
        return;
      case 'bu_gang':
        handleBuGang(client, payload);
        return;
      case 'react':
        handleReact(client, payload);
        return;
      case 'get_state':
        handleGetState(client);
        return;
      case 'list_rooms':
        handleListRooms(client);
        return;
      case 'request_rematch':
        handleRequestRematch(client);
        return;
      default:
        sendError(socket, 'UNKNOWN_MESSAGE_TYPE');
    }
  } catch (error) {
    const code = error?.message || 'INTERNAL_ERROR';
    if (isBenignRaceError(code)) {
      const room = tryGetRoom(client);
      if (room?.game) {
        emitGameState(room);
      }
      return;
    }

    console.error('[ws_message_error]', {
      type,
      payload,
      error: error?.stack || code || String(error)
    });
    sendError(socket, code);
  }
}

function handleHello(client, payload) {
  const name = String(payload.name ?? '').trim();
  if (!name) {
    throw new Error('NAME_REQUIRED');
  }

  client.name = name.slice(0, 20);
  send(client.socket, 'hello_ack', {
    clientId: client.id,
    name: client.name
  });
}

function handleCreateRoom(client) {
  ensureNamed(client);
  ensureNoRoom(client);

  const roomId = createRoomId();
  const room = {
    id: roomId,
    players: new Array(4).fill(null),
    game: null,
    reactionIntents: new Map(),
    rematchReadySeats: new Set(),
    botActionTimer: null,
    idleCloseTimer: null,
    idleCloseDeadlineAt: 0,
    roundNo: 0,
    maxRounds: DEFAULT_MAX_ROUNDS,
    matchFinished: false,
    settlementRecorded: false,
    roundHistory: []
  };

  rooms.set(roomId, room);
  seatClient(room, client, 0);
  emitRoomState(room);
}

function handleJoinRoom(client, payload) {
  ensureNamed(client);
  ensureNoRoom(client);

  const roomId = String(payload.roomId ?? '').trim().toUpperCase();
  const room = rooms.get(roomId);
  if (!room) {
    throw new Error('ROOM_NOT_FOUND');
  }

  const openSeat = room.players.findIndex((player) => !player);
  if (openSeat === -1) {
    throw new Error('ROOM_FULL');
  }

  seatClient(room, client, openSeat);
  emitRoomState(room);
}

function handleSetReady(client, payload) {
  const room = requireRoom(client);
  if (room.game) {
    throw new Error('GAME_ALREADY_STARTED');
  }

  const seatState = requireSeatState(room, client.seat);

  seatState.ready = Boolean(payload.ready);
  emitRoomState(room);

  if (canStart(room)) {
    startGame(room);
  }
}

function handleResumeRoom(client, payload) {
  ensureNoRoom(client);

  const roomId = String(payload.roomId ?? '').trim().toUpperCase();
  const seat = Number(payload.seat);
  const resumeToken = String(payload.resumeToken ?? '').trim();

  const room = rooms.get(roomId);
  if (!room) {
    throw new Error('ROOM_NOT_FOUND');
  }
  if (!Number.isInteger(seat) || seat < 0 || seat > 3) {
    throw new Error('INVALID_SEAT');
  }
  if (!resumeToken) {
    throw new Error('RESUME_TOKEN_REQUIRED');
  }

  const seatState = room.players[seat];
  if (!seatState || seatState.isBot) {
    throw new Error('RESUME_NOT_ALLOWED');
  }
  if (seatState.resumeToken !== resumeToken) {
    throw new Error('RESUME_TOKEN_INVALID');
  }

  const oldConn = seatState.clientId ? findConnectionById(seatState.clientId) : null;
  if (oldConn && oldConn.socket !== client.socket) {
    try {
      oldConn.socket.close(4001, 'session replaced');
    } catch {
      // ignore close race
    }
  }

  bindClientToSeat(room, client, seatState);
  seatState.online = true;
  seatState.auto = false;
  send(client.socket, 'resume_ack', {
    roomId: room.id,
    seat: seatState.seat,
    name: seatState.name
  });
  emitRoomState(room);
  if (room.game) {
    emitGameState(room);
  }
}

function handleAddBot(client) {
  const room = requireRoom(client);
  if (room.game) {
    throw new Error('CANNOT_ADD_BOT_DURING_GAME');
  }

  const openSeat = room.players.findIndex((player) => !player);
  if (openSeat === -1) {
    throw new Error('ROOM_FULL');
  }

  seatBot(room, openSeat);
  emitRoomState(room);

  if (canStart(room)) {
    startGame(room);
    return;
  }

  scheduleBotAction(room);
}

function handleSubmitExchange(client, payload) {
  const room = requireGameRoom(client, 'exchange');
  const seat = client.seat;
  const tileIds = payload.tileIds;

  submitExchangeSelection(room.game, seat, tileIds);
  emitGameState(room);
}

function handleSetLack(client, payload) {
  const room = requireGameRoom(client, 'lack');
  assignLackSuit(room.game, client.seat, payload.lackSuit);
  emitGameState(room);
}

function handleDiscard(client, payload) {
  const room = requireGameRoom(client, 'play');
  discardTile(room.game, client.seat, payload.tileId);

  if (!room.game.pendingReactions) {
    room.reactionIntents.clear();
  }

  emitGameState(room);
}

function handleSelfHu(client) {
  const room = requireGameRoom(client, 'play');
  declareSelfDrawHu(room.game, client.seat);
  room.reactionIntents.clear();
  emitGameState(room);
}

function handleAnGang(client, payload) {
  const room = requireGameRoom(client, 'play');
  declareAnGang(room.game, client.seat, payload.tileId);
  room.reactionIntents.clear();
  emitGameState(room);
}

function handleBuGang(client, payload) {
  const room = requireGameRoom(client, 'play');
  declareBuGang(room.game, client.seat, payload.tileId);

  if (!room.game.pendingReactions) {
    room.reactionIntents.clear();
  }

  emitGameState(room);
}

function handleReact(client, payload) {
  const room = requireGameRoom(client, 'play');
  const pending = room.game.pendingReactions;
  if (!pending) {
    throw new Error('NO_PENDING_REACTIONS');
  }

  const seat = client.seat;
  const eligible = pending.options.some((option) => option.seat === seat);
  if (!eligible) {
    throw new Error('SEAT_NOT_ELIGIBLE_TO_REACT');
  }

  const action = normalizeReaction(payload.action);
  room.reactionIntents.set(seat, action);

  const allResponded = pending.options.every((option) => room.reactionIntents.has(option.seat));
  if (!allResponded) {
    emitGameState(room);
    return;
  }

  const actions = [...room.reactionIntents.entries()].map(([reactSeat, reactAction]) => ({
    seat: reactSeat,
    action: reactAction
  }));

  resolveReactions(room.game, actions);
  room.reactionIntents.clear();
  emitGameState(room);
}

function handleGetState(client) {
  const room = requireRoom(client);
  emitRoomState(room);
  if (room.game) {
    emitGameState(room);
  }
}

function handleListRooms(client) {
  send(client.socket, 'rooms_list', {
    rooms: listActiveRooms()
  });
}

function handleRequestRematch(client) {
  const room = requireRoom(client);
  if (!room.game || room.game.phase !== 'settlement') {
    throw new Error('REMATCH_NOT_AVAILABLE');
  }
  if (room.matchFinished) {
    throw new Error('MATCH_FINISHED');
  }

  room.rematchReadySeats.add(client.seat);
  emitRoomState(room);

  if (canStartRematch(room)) {
    startGame(room);
    return;
  }

  scheduleBotAction(room);
}

function handleDisconnect(socket) {
  const client = connections.get(socket);
  if (!client) {
    return;
  }

  connections.delete(socket);
  if (!client.roomId) {
    return;
  }

  const room = rooms.get(client.roomId);
  if (!room) {
    return;
  }

  const seatState = room.players[client.seat];
  if (seatState && seatState.clientId === client.id) {
    if (seatState.isBot || !room.game) {
      room.players[client.seat] = null;
      room.rematchReadySeats.delete(client.seat);
    } else {
      seatState.clientId = null;
      seatState.online = false;
      seatState.auto = true;
    }
  }

  if (shouldCloseRoom(room)) {
    closeRoom(room);
    return;
  }

  refreshRoomIdleClosePolicy(room);
  emitRoomState(room);
  if (room.game) {
    emitGameState(room);
  }
}

function canStart(room) {
  return room.players.every((player) => player && player.ready) && !room.game && !room.matchFinished;
}

function startGame(room) {
  if (room.matchFinished) {
    throw new Error('MATCH_FINISHED');
  }

  room.game = createInitialGame();
  room.reactionIntents.clear();
  room.rematchReadySeats.clear();
  room.roundNo += 1;
  room.settlementRecorded = false;

  for (const player of room.players) {
    if (!player) {
      continue;
    }
    player.ready = Boolean(player.isBot);
  }

  emitRoomState(room);
  emitGameState(room);
  scheduleBotAction(room);
}

function seatClient(room, client, seat) {
  const seatState = {
    clientId: null,
    isBot: false,
    name: client.name,
    seat,
    ready: false,
    totalScore: 0,
    online: true,
    auto: false,
    resumeToken: createId('r')
  };

  room.players[seat] = seatState;
  bindClientToSeat(room, client, seatState);
}

function bindClientToSeat(room, client, seatState) {
  seatState.clientId = client.id;
  client.roomId = room.id;
  client.seat = seatState.seat;
  client.name = seatState.name;
  send(client.socket, 'seat_assigned', {
    roomId: room.id,
    seat: seatState.seat,
    name: seatState.name,
    resumeToken: seatState.resumeToken ?? null
  });
  refreshRoomIdleClosePolicy(room);
}

function seatBot(room, seat) {
  room.players[seat] = {
    clientId: createId('bot'),
    isBot: true,
    name: `机器人${generateBotName()}`,
    seat,
    ready: true,
    totalScore: 0,
    online: true,
    auto: false,
    resumeToken: null
  };
}

function emitRoomState(room) {
  refreshRoomIdleClosePolicy(room);

  const payload = {
    roomId: room.id,
    hasGame: Boolean(room.game),
    phase: room.game?.phase ?? null,
    rematchReadySeats: [...room.rematchReadySeats],
    roundNo: room.roundNo,
    maxRounds: room.maxRounds,
    matchFinished: room.matchFinished,
    idleCloseDeadlineAt: room.idleCloseDeadlineAt || null,
    roundHistory: room.roundHistory,
    finalStandings: buildFinalStandings(room),
    players: room.players.map((player, seat) => {
      if (!player) {
        return {
          seat,
          occupied: false
        };
      }

      return {
        seat,
        occupied: true,
        clientId: player.clientId,
        isBot: Boolean(player.isBot),
        name: player.name,
        ready: player.ready,
        totalScore: player.totalScore ?? 0,
        online: Boolean(player.online),
        auto: Boolean(player.auto)
      };
    })
  };

  broadcastRoom(room, 'room_state', payload);
  scheduleBotAction(room);
}

function emitGameState(room) {
  if (!room.game) {
    return;
  }

  if (room.game.phase === 'settlement' && !room.settlementRecorded) {
    recordSettlementIfNeeded(room);
    emitRoomState(room);
  }

  const publicState = getPublicSnapshot(room.game);

  for (const player of room.players) {
    if (!player) {
      continue;
    }

    const conn = findConnectionById(player.clientId);
    if (!conn) {
      continue;
    }

    send(conn.socket, 'game_state', {
      roomId: room.id,
      you: {
        seat: player.seat,
        hand: room.game.players[player.seat].hand,
        melds: room.game.players[player.seat].melds,
        lackSuit: room.game.players[player.seat].lackSuit,
        hasHu: room.game.players[player.seat].hasHu,
        score: room.game.players[player.seat].score,
        canSelfHu: canDeclareSelfDrawHu(room.game, player.seat)
      },
      state: publicState,
      pendingReaction: describePendingForSeat(room.game.pendingReactions, player.seat)
    });
  }
  scheduleBotAction(room);
}

function recordSettlementIfNeeded(room) {
  if (!room.game || room.game.phase !== 'settlement' || room.settlementRecorded) {
    return;
  }

  const scoreChanges = [];
  for (let seat = 0; seat < room.players.length; seat += 1) {
    const player = room.players[seat];
    if (!player) {
      continue;
    }

    const delta = room.game.players[seat]?.score ?? 0;
    player.totalScore = (player.totalScore ?? 0) + delta;
    scoreChanges.push({
      seat,
      name: player.name,
      delta,
      totalScore: player.totalScore
    });
  }

  room.roundHistory.push({
    roundNo: room.roundNo,
    settlementReason: room.game.settlementReason ?? null,
    scoreChanges,
    settledAt: Date.now()
  });

  if (room.roundHistory.length > 30) {
    room.roundHistory.shift();
  }

  room.settlementRecorded = true;
  updateMatchFinishedState(room);
}

function describePendingForSeat(pending, seat) {
  if (!pending) {
    return null;
  }

  const own = pending.options.find((option) => option.seat === seat);
  if (!own) {
    return null;
  }

  return {
    fromSeat: pending.fromSeat,
    tile: pending.tile,
    canHu: own.canHu,
    canGang: own.canGang,
    canPeng: own.canPeng
  };
}

function findConnectionById(clientId) {
  if (!clientId) {
    return null;
  }
  for (const client of connections.values()) {
    if (client.id === clientId) {
      return client;
    }
  }

  return null;
}

function broadcastRoom(room, type, payload) {
  for (const player of room.players) {
    if (!player) {
      continue;
    }

    const conn = findConnectionById(player.clientId);
    if (!conn) {
      continue;
    }

    send(conn.socket, type, payload);
  }
}

function requireRoom(client) {
  if (!client.roomId) {
    throw new Error('NOT_IN_ROOM');
  }

  const room = rooms.get(client.roomId);
  if (!room) {
    throw new Error('ROOM_NOT_FOUND');
  }

  return room;
}

function tryGetRoom(client) {
  if (!client.roomId) {
    return null;
  }
  return rooms.get(client.roomId) ?? null;
}

function requireGameRoom(client, expectedPhase) {
  const room = requireRoom(client);
  if (!room.game) {
    throw new Error('GAME_NOT_STARTED');
  }

  if (expectedPhase && room.game.phase !== expectedPhase) {
    throw new Error(`INVALID_GAME_PHASE: ${room.game.phase}`);
  }

  return room;
}

function requireSeatState(room, seat) {
  const state = room.players[seat];
  if (!state) {
    throw new Error('SEAT_EMPTY');
  }

  return state;
}

function ensureNamed(client) {
  if (!client.name) {
    throw new Error('HELLO_REQUIRED');
  }
}

function ensureNoRoom(client) {
  if (client.roomId) {
    throw new Error('ALREADY_IN_ROOM');
  }
}

function normalizeReaction(action) {
  const normalized = String(action ?? 'pass').toLowerCase();
  if (!['hu', 'gang', 'peng', 'pass'].includes(normalized)) {
    throw new Error('INVALID_REACTION');
  }

  return normalized;
}

function isBenignRaceError(code) {
  if (!code) {
    return false;
  }

  return (
    code === 'NOT_YOUR_TURN'
    || code === 'REACTIONS_PENDING'
    || code === 'TILE_NOT_IN_HAND'
    || code.startsWith('INVALID_GAME_PHASE')
  );
}

function canStartRematch(room) {
  const allSeatsOccupied = room.players.every((player) => Boolean(player));
  if (!allSeatsOccupied) {
    return false;
  }
  return room.players.every((player, seat) => Boolean(player) && room.rematchReadySeats.has(seat));
}

function scheduleBotAction(room) {
  if (!room || room.botActionTimer || !room.players.some((player) => isAutoPilotPlayer(player))) {
    return;
  }

  const delay = roomHasOnlineHumanPlayer(room) ? BOT_ACTION_DELAY_WITH_HUMAN_MS : BOT_ACTION_DELAY_MS;
  room.botActionTimer = setTimeout(() => {
    room.botActionTimer = null;
    processBotAction(room);
  }, delay);
}

function processBotAction(room) {
  if (!room || !rooms.has(room.id) || !room.players.some((player) => isAutoPilotPlayer(player))) {
    return;
  }

  if (!room.game) {
    return;
  }

  if (room.game.phase === 'settlement') {
    if (room.matchFinished) {
      return;
    }
    if (!roomHasOnlineHumanPlayer(room)) {
      // 全员托管/机器人时，结算后等待真人回来，不自动续局
      return;
    }

    let changed = false;
    for (const player of room.players) {
      if (!isAutoPilotPlayer(player)) {
        continue;
      }
      if (!room.rematchReadySeats.has(player.seat)) {
        room.rematchReadySeats.add(player.seat);
        changed = true;
      }
    }

    if (changed) {
      emitRoomState(room);
    }

    if (canStartRematch(room)) {
      startGame(room);
      return;
    }

    return;
  }

  if (room.game.phase === 'exchange') {
    for (const player of room.players) {
      if (!isAutoPilotPlayer(player)) {
        continue;
      }
      if (room.game.players[player.seat].exchangeSelection) {
        continue;
      }
      const hand = room.game.players[player.seat].hand;
      const chosen = pickExchangeTiles(hand);
      submitExchangeSelection(room.game, player.seat, chosen.map((tile) => tile.id));
      emitGameState(room);
      return;
    }
    return;
  }

  if (room.game.phase === 'lack') {
    for (const player of room.players) {
      if (!isAutoPilotPlayer(player)) {
        continue;
      }
      if (room.game.players[player.seat].lackSuit) {
        continue;
      }
      const hand = room.game.players[player.seat].hand;
      assignLackSuit(room.game, player.seat, pickLackSuit(hand));
      emitGameState(room);
      return;
    }
    return;
  }

  if (room.game.phase !== 'play') {
    return;
  }

  const pending = room.game.pendingReactions;
  if (pending) {
    let changed = false;
    for (const option of pending.options) {
      const roomPlayer = room.players[option.seat];
      if (!isAutoPilotPlayer(roomPlayer) || room.reactionIntents.has(option.seat)) {
        continue;
      }
      room.reactionIntents.set(option.seat, pickReactionAction(option));
      changed = true;
    }

    if (!changed) {
      return;
    }

    const allResponded = pending.options.every((option) => room.reactionIntents.has(option.seat));
    if (!allResponded) {
      emitGameState(room);
      return;
    }

    const actions = [...room.reactionIntents.entries()].map(([seat, action]) => ({ seat, action }));
    resolveReactions(room.game, actions);
    room.reactionIntents.clear();
    emitGameState(room);
    return;
  }

  const turnSeat = room.game.turnSeat;
  const turnPlayer = room.players[turnSeat];
  if (!isAutoPilotPlayer(turnPlayer) || room.game.players[turnSeat].hasHu) {
    return;
  }

  if (trySelfHu(room, turnSeat)) {
    emitGameState(room);
    return;
  }

  const buGangTile = pickBuGangTile(room.game.players[turnSeat]);
  if (buGangTile && tryBuGang(room, turnSeat, buGangTile.id)) {
    emitGameState(room);
    return;
  }

  const anGangTile = pickAnGangTile(room.game.players[turnSeat].hand);
  if (anGangTile && tryAnGang(room, turnSeat, anGangTile.id)) {
    emitGameState(room);
    return;
  }

  const discard = pickBestDiscard(room.game.players[turnSeat].hand, room.game.players[turnSeat].lackSuit);
  discardTile(room.game, turnSeat, discard.id);
  if (!room.game.pendingReactions) {
    room.reactionIntents.clear();
  }
  emitGameState(room);
}

function pickExchangeTiles(hand) {
  const groups = new Map();
  for (const tile of hand) {
    if (!groups.has(tile.suit)) {
      groups.set(tile.suit, []);
    }
    groups.get(tile.suit).push(tile);
  }

  const sorted = [...groups.values()].sort((a, b) => b.length - a.length);
  const pick = sorted.find((group) => group.length >= 3) ?? sorted[0] ?? [];
  return pick.slice(0, 3);
}

function pickLackSuit(hand) {
  const counts = { wan: 0, tiao: 0, tong: 0 };
  for (const tile of hand) {
    counts[tile.suit] += 1;
  }
  return ['wan', 'tiao', 'tong'].sort((a, b) => counts[a] - counts[b])[0];
}

function pickReactionAction(option) {
  if (option.canHu) {
    return 'hu';
  }
  if (option.canGang) {
    return 'gang';
  }
  if (option.canPeng) {
    return 'peng';
  }
  return 'pass';
}

function trySelfHu(room, seat) {
  try {
    declareSelfDrawHu(room.game, seat);
    room.reactionIntents.clear();
    return true;
  } catch (error) {
    if (error?.message === 'SELF_DRAW_HU_NOT_ALLOWED') {
      return false;
    }
    throw error;
  }
}

function pickBuGangTile(playerState) {
  const pengKinds = playerState.melds
    .filter((meld) => meld.type === 'peng')
    .map((meld) => `${meld.tile.suit}-${meld.tile.rank}`);
  for (const tile of playerState.hand) {
    if (pengKinds.includes(`${tile.suit}-${tile.rank}`)) {
      return tile;
    }
  }
  return null;
}

function tryBuGang(room, seat, tileId) {
  try {
    declareBuGang(room.game, seat, tileId);
    if (!room.game.pendingReactions) {
      room.reactionIntents.clear();
    }
    return true;
  } catch (error) {
    if (error?.message === 'NO_MATCHING_PENG_FOR_BU_GANG') {
      return false;
    }
    throw error;
  }
}

function pickAnGangTile(hand) {
  const counts = new Map();
  for (const tile of hand) {
    const key = `${tile.suit}-${tile.rank}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (counts.get(key) >= 4) {
      return tile;
    }
  }
  return null;
}

function tryAnGang(room, seat, tileId) {
  try {
    declareAnGang(room.game, seat, tileId);
    room.reactionIntents.clear();
    return true;
  } catch (error) {
    if (error?.message === 'NOT_ENOUGH_TILES_FOR_AN_GANG') {
      return false;
    }
    throw error;
  }
}

function pickBestDiscard(hand, lackSuit) {
  const candidates = hand.filter((tile) => tile.suit === lackSuit);
  const pool = candidates.length > 0 ? candidates : hand;

  let bestTile = pool[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const tile of pool) {
    const score = discardScore(hand, tile);
    if (score < bestScore) {
      bestScore = score;
      bestTile = tile;
      continue;
    }
    if (score === bestScore && tieBreakDiscard(tile, bestTile) < 0) {
      bestTile = tile;
    }
  }
  return bestTile;
}

function discardScore(hand, tile) {
  let same = 0;
  let near1 = 0;
  let near2 = 0;
  for (const candidate of hand) {
    if (candidate.id === tile.id) {
      continue;
    }
    if (candidate.suit !== tile.suit) {
      continue;
    }
    const gap = Math.abs(candidate.rank - tile.rank);
    if (gap === 0) {
      same += 1;
    } else if (gap === 1) {
      near1 += 1;
    } else if (gap === 2) {
      near2 += 1;
    }
  }
  return same * 4 + near1 * 2 + near2;
}

function tieBreakDiscard(a, b) {
  if (a.rank !== b.rank) {
    return b.rank - a.rank;
  }
  return a.id.localeCompare(b.id);
}

function generateBotName() {
  const prefixes = ['雀友', '牌侠', '川麻客', '听牌王', '杠上花'];
  const suffixes = ['东风', '南风', '西风', '北风', '红中', '发财', '白板'];
  return `${prefixes[randomInt(0, prefixes.length)]}${suffixes[randomInt(0, suffixes.length)]}${randomInt(1000, 10000)}`;
}

function send(socket, type, payload = {}) {
  if (socket.readyState !== 1) {
    return;
  }

  socket.send(JSON.stringify({ type, payload }));
}

function sendError(socket, code) {
  send(socket, 'error', { code });
}

function createId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function createRoomId() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';

  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  if (rooms.has(code)) {
    return createRoomId();
  }

  return code;
}

function listActiveRooms() {
  const out = [];
  for (const room of rooms.values()) {
    if (!roomHasOnlineHumanPlayer(room)) {
      continue;
    }

    const occupiedSeats = room.players
      .map((player, seat) => (player ? seat : null))
      .filter((seat) => seat !== null);

    if (occupiedSeats.length === 0) {
      continue;
    }

    out.push({
      roomId: room.id,
      occupied: occupiedSeats.length,
      capacity: 4,
      hasGame: Boolean(room.game),
      phase: room.game?.phase ?? null,
      canJoin: occupiedSeats.length < 4
    });
  }

  out.sort((a, b) => b.occupied - a.occupied || a.roomId.localeCompare(b.roomId));
  return out;
}

function isAutoPilotPlayer(player) {
  return Boolean(player && (player.isBot || player.auto));
}

function roomHasOnlineHumanPlayer(room) {
  return room.players.some((player) => player && !player.isBot && player.online);
}

function refreshRoomIdleClosePolicy(room) {
  if (roomHasOnlineHumanPlayer(room)) {
    if (room.idleCloseTimer) {
      clearTimeout(room.idleCloseTimer);
      room.idleCloseTimer = null;
    }
    room.idleCloseDeadlineAt = 0;
    return;
  }

  if (room.idleCloseTimer) {
    return;
  }

  room.idleCloseDeadlineAt = Date.now() + ROOM_IDLE_CLOSE_MS;
  room.idleCloseTimer = setTimeout(() => {
    room.idleCloseTimer = null;
    const target = rooms.get(room.id);
    if (!target) {
      return;
    }
    if (!roomHasOnlineHumanPlayer(target)) {
      closeRoom(target);
    } else {
      refreshRoomIdleClosePolicy(target);
    }
  }, ROOM_IDLE_CLOSE_MS);
}

function closeRoom(room) {
  if (room.botActionTimer) {
    clearTimeout(room.botActionTimer);
    room.botActionTimer = null;
  }
  if (room.idleCloseTimer) {
    clearTimeout(room.idleCloseTimer);
    room.idleCloseTimer = null;
  }
  rooms.delete(room.id);
}

function updateMatchFinishedState(room) {
  if (room.matchFinished) {
    return;
  }
  if (room.roundNo >= room.maxRounds) {
    room.matchFinished = true;
  }
}

function buildFinalStandings(room) {
  if (!room.matchFinished) {
    return [];
  }
  return room.players
    .filter((player) => Boolean(player))
    .map((player) => ({
      seat: player.seat,
      name: player.name,
      isBot: Boolean(player.isBot),
      totalScore: player.totalScore ?? 0
    }))
    .sort((a, b) => b.totalScore - a.totalScore || a.seat - b.seat);
}

function shouldCloseRoom(room) {
  return room.players.every((player) => !player);
}


function logWsEvent(type, payload = {}) {
  const entry = {
    at: Date.now(),
    type,
    ...payload
  };
  wsDebug.recent.push(entry);
  if (wsDebug.recent.length > 80) {
    wsDebug.recent.shift();
  }
}

function getClientIp(req) {
  const forwarded = req?.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req?.socket?.remoteAddress || null;
}

function safeCloseReason(reasonBuf) {
  if (!reasonBuf) {
    return '';
  }
  try {
    return reasonBuf.toString('utf-8');
  } catch {
    return '';
  }
}

function getLanIpv4Addresses() {
  const out = [];
  const nets = networkInterfaces();
  for (const ifaces of Object.values(nets)) {
    for (const info of ifaces ?? []) {
      if (info.family === 'IPv4' && !info.internal) {
        out.push(info.address);
      }
    }
  }
  return [...new Set(out)];
}
