import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

import {
  assignLackSuit,
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
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_ROOT = path.resolve(__dirname, '../../web/src');
const STATIC_FILES = new Map([
  ['/', { file: 'index.html', type: 'text/html; charset=utf-8' }],
  ['/app.js', { file: 'app.js', type: 'application/javascript; charset=utf-8' }],
  ['/styles.css', { file: 'styles.css', type: 'text/css; charset=utf-8' }]
]);
const rooms = new Map();
const connections = new Map();

const httpServer = createServer(async (req, res) => {
  if (req.url === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, service: 'mahjong-server' }));
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

wss.on('connection', (socket) => {
  const client = {
    id: createId('c'),
    socket,
    name: null,
    roomId: null,
    seat: null
  };

  connections.set(socket, client);
  send(socket, 'welcome', {
    clientId: client.id,
    now: Date.now()
  });

  socket.on('message', (raw) => {
    handleIncoming(socket, raw);
  });

  socket.on('close', () => {
    handleDisconnect(socket);
  });

  socket.on('error', () => {
    handleDisconnect(socket);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Mahjong WebSocket server listening on :${PORT}`);
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
      case 'set_ready':
        handleSetReady(client, payload);
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
    reactionIntents: new Map()
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
    room.players[client.seat] = null;
  }

  if (room.players.every((player) => !player)) {
    rooms.delete(room.id);
    return;
  }

  emitRoomState(room);
}

function canStart(room) {
  return room.players.every((player) => player && player.ready) && !room.game;
}

function startGame(room) {
  room.game = createInitialGame();
  room.reactionIntents.clear();

  for (const player of room.players) {
    player.ready = false;
  }

  emitRoomState(room);
  emitGameState(room);
}

function seatClient(room, client, seat) {
  room.players[seat] = {
    clientId: client.id,
    name: client.name,
    seat,
    ready: false,
    online: true
  };

  client.roomId = room.id;
  client.seat = seat;
}

function emitRoomState(room) {
  const payload = {
    roomId: room.id,
    hasGame: Boolean(room.game),
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
        name: player.name,
        ready: player.ready,
        online: true
      };
    })
  };

  broadcastRoom(room, 'room_state', payload);
}

function emitGameState(room) {
  if (!room.game) {
    return;
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
        score: room.game.players[player.seat].score
      },
      state: publicState,
      pendingReaction: describePendingForSeat(room.game.pendingReactions, player.seat)
    });
  }
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
