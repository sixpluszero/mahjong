import { reduceServerMessage } from '../../../packages/client-core/src/web-entry.js';

export type LobbyStatusKey =
  | 'idle' | 'preview_connected' | 'preview_disconnected' | 'preview_hello' | 'preview_room_created' | 'preview_room_joined'
  | 'connecting' | 'connected' | 'disconnected' | 'room_synced' | 'error';

export type LobbyPlayer = { name: string; isBot: boolean; ready: boolean; online: boolean };
export type TableDiscard = { seat: number; tileCode: string };
export type HandTile = { id: string; code: string; suit: 'wan' | 'tiao' | 'tong'; rank: number };

export type LobbyViewState = {
  name: string;
  roomId: string;
  players: LobbyPlayer[];
  connected: boolean;
  statusKey: LobbyStatusKey;
  statusArgs?: Record<string, string | number>;
  roomPhase?: string;
  roundNo?: number;
  maxRounds?: number;
  gamePhase?: string;
  turnSeat?: number;
  yourSeat?: number;
  yourHandTiles: HandTile[];
  discards: TableDiscard[];
};

export type LobbyRuntime = {
  connect: () => void;
  disconnect: () => void;
  hello: (name: string) => boolean;
  createRoom: () => boolean;
  joinRoom: (roomId: string) => boolean;
  addBot: () => boolean;
  setReady: () => boolean;
  discard: (tileId: string) => boolean;
  setLack: (lackSuit: 'wan' | 'tiao' | 'tong') => boolean;
  submitExchange: (tileIds: string[]) => boolean;
};

export type RuntimeOptions = { mode: 'preview' | 'live'; wsUrl?: string; onState: (s: Partial<LobbyViewState>) => void };

export function createLobbyRuntime(options: RuntimeOptions): LobbyRuntime {
  if (options.mode === 'preview') return createPreviewRuntime(options.onState);
  return createLiveRuntime(options.wsUrl || 'ws://127.0.0.1:8787', options.onState);
}

function createPreviewRuntime(onState: RuntimeOptions['onState']): LobbyRuntime {
  return {
    connect() { onState({ connected: true, statusKey: 'preview_connected' }); },
    disconnect() { onState({ connected: false, statusKey: 'preview_disconnected' }); },
    hello(name: string) { onState({ name, statusKey: 'preview_hello', statusArgs: { name: name || 'Player' } }); return true; },
    createRoom() {
      onState({
        roomId: 'ABC123', roomPhase: 'waiting', roundNo: 0, maxRounds: 8,
        players: [{ name: 'You', isBot: false, ready: false, online: true }],
        gamePhase: 'play', turnSeat: 0, yourSeat: 0,
        yourHandTiles: [
          tile('h1','w1','wan',1), tile('h2','w2','wan',2), tile('h3','w3','wan',3),
          tile('h4','t3','tiao',3), tile('h5','t4','tiao',4), tile('h6','t5','tiao',5),
          tile('h7','b7','tong',7), tile('h8','b7','tong',7), tile('h9','b8','tong',8),
          tile('h10','w7','wan',7), tile('h11','w8','wan',8), tile('h12','w9','wan',9), tile('h13','b2','tong',2)
        ],
        discards: [{ seat: 1, tileCode: 'w4' }, { seat: 2, tileCode: 'b9' }],
        statusKey: 'preview_room_created'
      });
      return true;
    },
    joinRoom(roomId: string) { onState({ roomId: roomId.toUpperCase(), statusKey: 'preview_room_joined', statusArgs: { roomId: roomId.toUpperCase() } }); return true; },
    addBot() { return true; },
    setReady() { return true; },
    discard() { return true; },
    setLack() { return true; },
    submitExchange() { return true; }
  };
}

function createLiveRuntime(wsUrl: string, onState: RuntimeOptions['onState']): LobbyRuntime {
  let ws: WebSocket | null = null;
  let acknowledgedName = '';
  let pendingName = '';
  let socketReady = false;
  const model: any = { roomState: null, gameState: null, roomId: '', activeRooms: [] };

  const send = (type: string, payload: unknown) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify({ type, payload }));
    return true;
  };

  const ensureHello = () => {
    if (!socketReady) { onState({ statusKey: 'error', statusArgs: { detail: 'SOCKET_NOT_READY' } }); return false; }
    if (!pendingName) { onState({ statusKey: 'error', statusArgs: { detail: 'MISSING_NAME' } }); return false; }
    if (acknowledgedName === pendingName) return true;
    return send('hello', { name: pendingName });
  };

  return {
    connect() {
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
      ws = new WebSocket(wsUrl);
      onState({ statusKey: 'connecting', statusArgs: { wsUrl } });

      ws.addEventListener('open', () => {
        socketReady = true;
        onState({ connected: true, statusKey: 'connected' });
        if (pendingName) send('hello', { name: pendingName });
      });
      ws.addEventListener('close', () => { socketReady = false; onState({ connected: false, statusKey: 'disconnected' }); });
      ws.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(String(event.data));
          const { patch = {} } = reduceServerMessage(model, message);
          Object.assign(model, patch);

          if (message.type === 'hello_ack') acknowledgedName = message.payload?.name || pendingName;
          if (message.type === 'error') onState({ statusKey: 'error', statusArgs: { detail: message.payload?.code || 'SERVER_ERROR' } });

          if (message.type === 'room_state') {
            const players = (message.payload?.players || []).filter((p: any) => p.occupied).map((p: any) => ({
              name: p.name, isBot: !!p.isBot, ready: !!p.ready, online: p.online !== false
            }));
            onState({ roomId: message.payload?.roomId || '', roomPhase: message.payload?.phase, roundNo: message.payload?.roundNo || 0, maxRounds: message.payload?.maxRounds || 0, players, statusKey: 'room_synced', statusArgs: { players: players.length } });
          }

          if (message.type === 'game_state') {
            const yourHandTiles = (message.payload?.you?.hand || []).map((t: any) => ({
              id: t.id,
              code: `${suitPrefix(t.suit)}${t.rank}`,
              suit: t.suit,
              rank: t.rank
            }));
            const discards = (message.payload?.state?.discardPool || []).slice(-16).map((d: any) => ({ seat: d.seat, tileCode: `${suitPrefix(d.tile.suit)}${d.tile.rank}` }));
            onState({ gamePhase: message.payload?.state?.phase, turnSeat: message.payload?.state?.turnSeat, yourSeat: message.payload?.you?.seat, yourHandTiles, discards });
          }
        } catch {
          onState({ statusKey: 'error', statusArgs: { detail: 'PARSE_ERROR' } });
        }
      });
    },
    disconnect() { if (ws) try { ws.close(); } catch {} },
    hello(name: string) {
      pendingName = String(name || '').trim();
      if (!pendingName) { onState({ statusKey: 'error', statusArgs: { detail: 'MISSING_NAME' } }); return false; }
      return send('hello', { name: pendingName });
    },
    createRoom() { if (!ensureHello()) return false; return send('create_room', {}); },
    joinRoom(roomId: string) { if (!ensureHello()) return false; return send('join_room', { roomId: roomId.toUpperCase() }); },
    addBot() { return send('add_bot', {}); },
    setReady() { return send('set_ready', { ready: true }); },
    discard(tileId: string) { return send('discard', { tileId }); },
    setLack(lackSuit: 'wan'|'tiao'|'tong') { return send('set_lack', { lackSuit }); },
    submitExchange(tileIds: string[]) { return send('submit_exchange', { tileIds }); }
  };
}

function suitPrefix(suit: string) {
  if (suit === 'wan') return 'w';
  if (suit === 'tong') return 'b';
  return 't';
}

function tile(id: string, code: string, suit: 'wan'|'tiao'|'tong', rank: number): HandTile { return { id, code, suit, rank }; }
