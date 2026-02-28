import WebSocket from 'ws';

const SERVER_URL = process.env.SERVER_URL ?? 'ws://localhost:8787';
const NAME = process.env.NAME ?? `bot_${Math.random().toString(36).slice(2, 6)}`;
const ROOM_ID = process.env.ROOM_ID ?? '';

const ws = new WebSocket(SERVER_URL);
let readySent = false;
let exchangeSent = false;
let lackSent = false;
let lastDiscardTurn = -1;
let lastReactionKey = '';

ws.on('open', () => {
  send('hello', { name: NAME });

  if (ROOM_ID) {
    send('join_room', { roomId: ROOM_ID.toUpperCase() });
  } else {
    send('create_room', {});
  }
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString('utf-8'));
  const { type, payload } = msg;

  if (type === 'room_state') {
    const me = payload.players.find((p) => p.occupied && p.name === NAME);
    if (me && !readySent && !payload.hasGame) {
      send('set_ready', { ready: true });
      readySent = true;
    }
  }

  if (type === 'game_state') {
    autoPlay(payload);
  }

  if (type === 'error') {
    console.error('[error]', payload);
  } else {
    console.log(`[${type}]`, JSON.stringify(payload));
  }
});

ws.on('close', (code, reasonBuffer) => {
  const reason = reasonBuffer?.toString?.('utf-8') ?? '';
  console.log(`disconnected code=${code} reason=${reason}`);
});

ws.on('error', (err) => {
  console.error('[socket_error]', err.message);
});

function autoPlay(payload) {
  const phase = payload.state.phase;
  const hand = payload.you.hand;

  if (phase === 'exchange') {
    lackSent = false;
    lastDiscardTurn = -1;
    lastReactionKey = '';
  }

  if (phase === 'exchange') {
    if (exchangeSent) {
      return;
    }

    const suitGroups = {
      wan: [],
      tiao: [],
      tong: []
    };

    for (const tile of hand) {
      suitGroups[tile.suit].push(tile);
    }

    const choice = Object.values(suitGroups)
      .filter((group) => group.length >= 3)
      .sort((a, b) => b.length - a.length)[0];

    if (choice) {
      send('submit_exchange', { tileIds: choice.slice(0, 3).map((tile) => tile.id) });
      exchangeSent = true;
    }

    return;
  }

  if (phase === 'lack') {
    exchangeSent = false;
    if (lackSent) {
      return;
    }

    const counts = countSuits(hand);
    const lackSuit = Object.entries(counts).sort((a, b) => a[1] - b[1])[0][0];
    send('set_lack', { lackSuit });
    lackSent = true;
    return;
  }

  if (phase === 'play') {
    lackSent = false;
    if (payload.pendingReaction) {
      const reactionKey = `${payload.pendingReaction.fromSeat}-${payload.pendingReaction.tile.id}`;
      if (reactionKey === lastReactionKey) {
        return;
      }

      if (payload.pendingReaction.canHu) {
        send('react', { action: 'hu' });
      } else {
        send('react', { action: 'pass' });
      }
      lastReactionKey = reactionKey;
      return;
    }
    lastReactionKey = '';

    if (payload.state.turnSeat === payload.you.seat && hand.length > 0) {
      if (lastDiscardTurn === payload.state.turnSeat) {
        return;
      }
      const discard = pickDiscardByLackFirst(hand, payload.you.lackSuit);
      send('discard', { tileId: discard.id });
      lastDiscardTurn = payload.state.turnSeat;
      return;
    }
    lastDiscardTurn = -1;
  }
}

function pickDiscardByLackFirst(hand, lackSuit) {
  const lackTiles = hand.filter((tile) => tile.suit === lackSuit);
  if (lackTiles.length > 0) {
    return lackTiles[0];
  }

  return [...hand].sort((a, b) => b.rank - a.rank)[0];
}

function countSuits(hand) {
  return hand.reduce((acc, tile) => {
    acc[tile.suit] += 1;
    return acc;
  }, { wan: 0, tiao: 0, tong: 0 });
}

function send(type, payload) {
  ws.send(JSON.stringify({ type, payload }));
}
