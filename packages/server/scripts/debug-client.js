import WebSocket from 'ws';

const SERVER_URL = process.env.SERVER_URL ?? 'ws://localhost:8787';
const NAME = process.env.NAME ?? `bot_${Math.random().toString(36).slice(2, 6)}`;
const ROOM_ID = process.env.ROOM_ID ?? '';

const ws = new WebSocket(SERVER_URL);

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
    if (me) {
      send('set_ready', { ready: true });
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

ws.on('close', () => {
  console.log('disconnected');
});

function autoPlay(payload) {
  const phase = payload.state.phase;
  const hand = payload.you.hand;

  if (phase === 'exchange') {
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
    }

    return;
  }

  if (phase === 'lack') {
    const counts = countSuits(hand);
    const lackSuit = Object.entries(counts).sort((a, b) => a[1] - b[1])[0][0];
    send('set_lack', { lackSuit });
    return;
  }

  if (phase === 'play') {
    if (payload.pendingReaction) {
      if (payload.pendingReaction.canHu) {
        send('react', { action: 'hu' });
      } else {
        send('react', { action: 'pass' });
      }
      return;
    }

    if (payload.state.turnSeat === payload.you.seat && hand.length > 0) {
      const discard = pickDiscardByLackFirst(hand, payload.you.lackSuit);
      send('discard', { tileId: discard.id });
    }
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
