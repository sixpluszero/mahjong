import { spawn } from 'node:child_process';
import process from 'node:process';
import WebSocket from 'ws';

import { evaluateFans } from '../../shared/src/index.js';

const PORT = Number(process.env.STRESS_PORT ?? 8790);
const GAMES = Number(process.env.STRESS_GAMES ?? 10);
const TIMEOUT_MS = Number(process.env.STRESS_TIMEOUT_MS ?? 25000);
const SERVER_PATH = new URL('../src/index.js', import.meta.url);

const serverLogs = [];
const serverErrors = [];

async function main() {
  const server = await startServer();
  const summary = {
    games: GAMES,
    passed: 0,
    failed: 0,
    failures: []
  };

  try {
    for (let i = 0; i < GAMES; i += 1) {
      try {
        const result = await runOneGame(i);
        summary.passed += 1;
        console.log(`[game ${i + 1}] ok turns=${result.turns} events=${result.events}`);
      } catch (error) {
        summary.failed += 1;
        summary.failures.push({ game: i + 1, error: error.message });
        console.log(`[game ${i + 1}] fail: ${error.message}`);
      }
    }
  } finally {
    server.kill('SIGTERM');
  }

  const wsMessageErrors = serverErrors.filter((line) => line.includes('[ws_message_error]'));
  console.log('\n=== STRESS SUMMARY ===');
  console.log(JSON.stringify({ ...summary, wsMessageErrors: wsMessageErrors.length }, null, 2));

  if (wsMessageErrors.length > 0) {
    console.log('\n=== SAMPLE SERVER ERRORS ===');
    for (const line of wsMessageErrors.slice(0, 10)) {
      console.log(line);
    }
  }

  if (summary.failed > 0 || wsMessageErrors.length > 0) {
    process.exitCode = 1;
  }
}

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER_PATH.pathname], {
      env: {
        ...process.env,
        PORT: String(PORT)
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let ready = false;

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf-8');
      serverLogs.push(text);
      if (!ready && text.includes('Mahjong WebSocket server listening')) {
        ready = true;
        resolve(child);
      }
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf-8');
      serverErrors.push(text);
    });

    child.on('exit', (code) => {
      if (!ready) {
        reject(new Error(`server exited before ready: ${code}`));
      }
    });

    setTimeout(() => {
      if (!ready) {
        reject(new Error('server start timeout'));
      }
    }, 8000);
  });
}

function runOneGame(index) {
  return new Promise((resolve, reject) => {
    const bots = [];
    let roomId = '';
    let settled = false;
    let turns = 0;

    const joinTicker = setInterval(() => {
      if (!roomId) {
        return;
      }
      for (const bot of bots) {
        if (bot.seatIndex !== 0) {
          bot.tryJoin(roomId);
        }
      }
    }, 120);

    const deadline = setTimeout(() => {
      const snapshots = bots.map((bot) => bot.snapshot());
      cleanup();
      reject(new Error(`game timeout snapshots=${JSON.stringify(snapshots)}`));
    }, TIMEOUT_MS);

    for (let i = 0; i < 4; i += 1) {
      bots.push(new Bot(i, `g${index}_p${i}`, () => roomId, (id) => {
        roomId = id;
      }, {
        onTurn: () => {
          turns += 1;
        },
        onSettle: (payload) => {
          if (!settled && payload.state.phase === 'settlement') {
            settled = true;
            const events = payload.state.settlementEvents?.length ?? 0;
            cleanup();
            resolve({ turns, events });
          }
        },
        onError: (code) => {
          if (!isTolerableError(code)) {
            cleanup();
            reject(new Error(`client received error: ${code}`));
          }
        }
      }));
    }

    function cleanup() {
      clearTimeout(deadline);
      clearInterval(joinTicker);
      for (const bot of bots) {
        bot.close();
      }
    }
  });
}

class Bot {
  constructor(seatIndex, name, getRoomId, setRoomId, hooks) {
    this.seatIndex = seatIndex;
    this.name = name;
    this.getRoomId = getRoomId;
    this.setRoomId = setRoomId;
    this.hooks = hooks;

    this.readySent = false;
    this.exchangeSubmitted = false;
    this.lackSubmitted = false;
    this.lastActionToken = '';
    this.lastReactionToken = '';
    this.joinRequested = false;
    this.lastPhase = 'init';
    this.lastTurnSeat = null;
    this.lastPending = false;
    this.lastHandCount = 0;
    this.actionsSent = 0;
    this.reactionsSent = 0;

    this.ws = new WebSocket(`ws://localhost:${PORT}`);
    this.ws.on('open', () => this.onOpen());
    this.ws.on('message', (raw) => this.onMessage(raw));
    this.ws.on('error', () => {
      // ignore socket errors; summary is determined by server-side ws_message_error and protocol errors.
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }

  onOpen() {
    this.send('hello', { name: this.name });
    if (this.seatIndex === 0) {
      this.send('create_room', {});
    }
  }

  tryJoin(roomId) {
    if (this.joinRequested) {
      return;
    }
    this.joinRequested = true;
    this.send('join_room', { roomId });
  }

  onMessage(raw) {
    const msg = JSON.parse(raw.toString('utf-8'));
    const { type, payload } = msg;

    if (type === 'room_state') {
      this.handleRoomState(payload);
      return;
    }

    if (type === 'game_state') {
      this.handleGameState(payload);
      return;
    }

    if (type === 'error') {
      this.hooks.onError(payload.code);
    }
  }

  handleRoomState(payload) {
    if (!this.getRoomId() && payload.roomId) {
      this.setRoomId(payload.roomId);
    }

    const me = payload.players.find((p) => p.occupied && p.name === this.name);
    if (me && !this.readySent && !payload.hasGame) {
      this.readySent = true;
      this.send('set_ready', { ready: true });
    }
  }

  handleGameState(payload) {
    const phase = payload.state.phase;
    const hand = payload.you.hand;
    this.hooks.onSettle(payload);
    this.lastPhase = phase;
    this.lastTurnSeat = payload.state.turnSeat;
    this.lastPending = Boolean(payload.state.pendingReactions);
    this.lastHandCount = hand.length;

    if (phase === 'exchange' && !this.exchangeSubmitted) {
      const choice = pickExchangeTiles(hand);
      if (choice.length === 3) {
        this.exchangeSubmitted = true;
        this.send('submit_exchange', { tileIds: choice.map((tile) => tile.id) });
      }
      return;
    }

    if (phase === 'lack' && !this.lackSubmitted) {
      const lackSuit = pickLackSuit(hand);
      this.lackSubmitted = true;
      this.send('set_lack', { lackSuit });
      return;
    }

    if (phase !== 'play') {
      return;
    }

    if (payload.pendingReaction) {
      const token = `${payload.pendingReaction.fromSeat}-${payload.pendingReaction.tile.id}`;
      if (token === this.lastReactionToken) {
        return;
      }
      this.lastReactionToken = token;

      const options = ['pass'];
      if (payload.pendingReaction.canHu) options.push('hu');
      if (payload.pendingReaction.canGang) options.push('gang');
      if (payload.pendingReaction.canPeng) options.push('peng');
      const action = pickRandom(options);
      this.send('react', { action });
      this.reactionsSent += 1;
      return;
    }

    this.lastReactionToken = '';

    if (payload.state.turnSeat !== payload.you.seat) {
      return;
    }

    const token = `${payload.state.turnSeat}-${payload.state.discardPool.length}-${hand.map((t) => t.id).join('.')}`;
    if (token === this.lastActionToken) {
      return;
    }
    this.lastActionToken = token;
    this.hooks.onTurn();

    const actions = [];

    if (canSelfHu(payload.you)) {
      actions.push({ type: 'self_hu', payload: {} });
    }

    for (const tile of findAnGangCandidates(hand)) {
      actions.push({ type: 'an_gang', payload: { tileId: tile.id } });
    }

    for (const tile of findBuGangCandidates(hand, payload.you.melds ?? [])) {
      actions.push({ type: 'bu_gang', payload: { tileId: tile.id } });
    }

    const discard = pickDiscardByLackFirst(hand, payload.you.lackSuit);
    if (discard) {
      actions.push({ type: 'discard', payload: { tileId: discard.id } });
    }

    if (actions.length === 0) {
      return;
    }

    const action = weightedAction(actions);
    this.send(action.type, action.payload);
    this.actionsSent += 1;
  }

  send(type, payload) {
    if (this.ws.readyState !== 1) {
      return;
    }

    this.ws.send(JSON.stringify({ type, payload }));
  }

  snapshot() {
    return {
      seatIndex: this.seatIndex,
      phase: this.lastPhase,
      turnSeat: this.lastTurnSeat,
      pending: this.lastPending,
      handCount: this.lastHandCount,
      actionsSent: this.actionsSent,
      reactionsSent: this.reactionsSent,
      exchangeSubmitted: this.exchangeSubmitted,
      lackSubmitted: this.lackSubmitted,
      readySent: this.readySent
    };
  }
}

function pickExchangeTiles(hand) {
  const suitGroups = { wan: [], tiao: [], tong: [] };
  for (const tile of hand) {
    suitGroups[tile.suit].push(tile);
  }

  const candidates = Object.values(suitGroups).filter((group) => group.length >= 3);
  if (candidates.length === 0) {
    return [];
  }

  const group = pickRandom(candidates);
  return shuffle([...group]).slice(0, 3);
}

function pickLackSuit(hand) {
  const counts = hand.reduce((acc, tile) => {
    acc[tile.suit] += 1;
    return acc;
  }, { wan: 0, tiao: 0, tong: 0 });

  return Object.entries(counts).sort((a, b) => a[1] - b[1])[0][0];
}

function pickDiscardByLackFirst(hand, lackSuit) {
  if (!hand.length) {
    return null;
  }

  const lackTiles = hand.filter((tile) => tile.suit === lackSuit);
  if (lackTiles.length > 0) {
    return pickRandom(lackTiles);
  }

  return pickRandom(hand);
}

function findAnGangCandidates(hand) {
  const groups = new Map();
  for (const tile of hand) {
    const key = `${tile.suit}-${tile.rank}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(tile);
  }

  return [...groups.values()].filter((tiles) => tiles.length >= 4).map((tiles) => tiles[0]);
}

function findBuGangCandidates(hand, melds) {
  const pengKinds = melds
    .filter((meld) => meld.type === 'peng')
    .map((meld) => `${meld.tile.suit}-${meld.tile.rank}`);

  const out = [];
  for (const tile of hand) {
    const key = `${tile.suit}-${tile.rank}`;
    if (pengKinds.includes(key) && !out.some((t) => t.suit === tile.suit && t.rank === tile.rank)) {
      out.push(tile);
    }
  }

  return out;
}

function canSelfHu(you) {
  const huResult = evaluateFans({
    tiles: you.hand,
    lackSuit: you.lackSuit,
    context: {
      selfDraw: true,
      menQing: (you.melds ?? []).every((meld) => meld.type === 'an_gang')
    },
    config: {
      minFan: 1,
      maxFan: 16
    }
  });

  return huResult.canHu;
}

function weightedAction(actions) {
  const selfHu = actions.find((a) => a.type === 'self_hu');
  if (selfHu && Math.random() < 0.9) {
    return selfHu;
  }

  const discard = actions.find((a) => a.type === 'discard');
  const gangLike = actions.filter((a) => a.type === 'an_gang' || a.type === 'bu_gang');

  if (gangLike.length > 0 && Math.random() < 0.25) {
    return pickRandom(gangLike);
  }

  return discard ?? pickRandom(actions);
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isTolerableError(code) {
  return [
    'GAME_ALREADY_STARTED',
    'ALREADY_IN_ROOM',
    'ROOM_FULL'
  ].includes(code);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
