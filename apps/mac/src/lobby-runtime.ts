/**
 * EN: macOS lobby/table runtime adapter (preview/live).
 * 中文：macOS 大厅/牌桌运行时适配层（预览/实时）。
 */

import { reduceServerMessage } from '../../../packages/client-core/src/web-entry.js';

export type LobbyStatusKey =
  | 'idle'
  | 'preview_connected'
  | 'preview_disconnected'
  | 'preview_hello'
  | 'preview_room_created'
  | 'preview_room_joined'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'room_synced'
  | 'error';

export type LobbyPlayer = {
  name: string;
  isBot: boolean;
  ready: boolean;
  online: boolean;
};

export type TableDiscard = {
  seat: number;
  tileCode: string;
};

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
  yourHandCodes: string[];
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
};

export type RuntimeOptions = {
  mode: 'preview' | 'live';
  wsUrl?: string;
  onState: (state: Partial<LobbyViewState>) => void;
};

export function createLobbyRuntime(options: RuntimeOptions): LobbyRuntime {
  if (options.mode === 'preview') {
    return createPreviewRuntime(options.onState);
  }
  return createLiveRuntime(options.wsUrl || 'ws://localhost:8787', options.onState);
}

function createPreviewRuntime(onState: RuntimeOptions['onState']): LobbyRuntime {
  return {
    connect() {
      onState({ connected: true, statusKey: 'preview_connected' });
    },
    disconnect() {
      onState({ connected: false, statusKey: 'preview_disconnected' });
    },
    hello(name: string) {
      onState({ name, statusKey: 'preview_hello', statusArgs: { name: name || 'Player' } });
      return true;
    },
    createRoom() {
      onState({
        roomId: 'ABC123',
        roomPhase: 'waiting',
        roundNo: 0,
        maxRounds: 8,
        players: [{ name: 'You', isBot: false, ready: false, online: true }],
        gamePhase: 'waiting',
        turnSeat: 0,
        yourSeat: 0,
        yourHandCodes: ['w1', 'w2', 'w3', 'b5', 'b6', 'b7', 't2', 't2', 't2', 'w9', 'w9', 'b1', 'b3'],
        discards: [{ seat: 1, tileCode: 'w4' }, { seat: 2, tileCode: 'b9' }],
        statusKey: 'preview_room_created'
      });
      return true;
    },
    joinRoom(roomId: string) {
      onState({ roomId: roomId.toUpperCase(), statusKey: 'preview_room_joined', statusArgs: { roomId: roomId.toUpperCase() } });
      return true;
    },
    addBot() {
      onState({
        players: [
          { name: 'You', isBot: false, ready: false, online: true },
          { name: 'Bot_1', isBot: true, ready: true, online: true }
        ],
        statusKey: 'room_synced',
        statusArgs: { players: 2 }
      });
      return true;
    },
    setReady() {
      onState({
        players: [
          { name: 'You', isBot: false, ready: true, online: true },
          { name: 'Bot_1', isBot: true, ready: true, online: true }
        ],
        statusKey: 'room_synced',
        statusArgs: { players: 2 }
      });
      return true;
    }
  };
}

function createLiveRuntime(wsUrl: string, onState: RuntimeOptions['onState']): LobbyRuntime {
  let ws: WebSocket | null = null;
  let acknowledgedName = '';
  let pendingName = '';

  const model: any = {
    roomState: null,
    gameState: null,
    roomId: '',
    activeRooms: []
  };

  function isOpen() {
    return !!ws && ws.readyState === WebSocket.OPEN;
  }

  function send(type: string, payload: unknown) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify({ type, payload }));
    return true;
  }

  function ensureHello() {
    if (!pendingName) {
      onState({ statusKey: 'error', statusArgs: { detail: 'MISSING_NAME' } });
      return false;
    }
    if (acknowledgedName === pendingName) {
      return true;
    }
    return send('hello', { name: pendingName });
  }

  return {
    connect() {
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
      }
      ws = new WebSocket(wsUrl);
      onState({ statusKey: 'connecting', statusArgs: { wsUrl } });

      ws.addEventListener('open', () => {
        onState({ connected: true, statusKey: 'connected' });
        if (pendingName) {
          send('hello', { name: pendingName });
        }
      });

      ws.addEventListener('close', () => {
        onState({ connected: false, statusKey: 'disconnected' });
      });

      ws.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(String(event.data));
          const { patch = {} } = reduceServerMessage(model, message);
          Object.assign(model, patch);

          if (message.type === 'hello_ack') {
            acknowledgedName = message.payload?.name || pendingName;
            onState({ statusKey: 'room_synced', statusArgs: { players: model.roomState?.players?.length || 0 } });
          }

          if (message.type === 'error') {
            onState({ statusKey: 'error', statusArgs: { detail: message.payload?.code || 'SERVER_ERROR' } });
          }

          if (message.type === 'room_state') {
            const players = (message.payload?.players || [])
              .filter((p: any) => p.occupied)
              .map((p: any) => ({
                name: p.name,
                isBot: !!p.isBot,
                ready: !!p.ready,
                online: p.online !== false
              }));

            onState({
              roomId: message.payload?.roomId || '',
              roomPhase: message.payload?.phase,
              roundNo: message.payload?.roundNo || 0,
              maxRounds: message.payload?.maxRounds || 0,
              players,
              statusKey: 'room_synced',
              statusArgs: { players: players.length }
            });
          }

          if (message.type === 'game_state') {
            const yourHandCodes = (message.payload?.you?.hand || []).map((t: any) => `${suitPrefix(t.suit)}${t.rank}`);
            const discards = (message.payload?.state?.discardPool || []).slice(-16).map((d: any) => ({
              seat: d.seat,
              tileCode: `${suitPrefix(d.tile.suit)}${d.tile.rank}`
            }));

            onState({
              gamePhase: message.payload?.state?.phase,
              turnSeat: message.payload?.state?.turnSeat,
              yourSeat: message.payload?.you?.seat,
              yourHandCodes,
              discards
            });
          }
        } catch {
          onState({ statusKey: 'error', statusArgs: { detail: 'PARSE_ERROR' } });
        }
      });
    },
    disconnect() {
      if (!ws) return;
      try {
        ws.close();
      } catch {}
    },
    hello(name: string) {
      pendingName = String(name || '').trim();
      if (!pendingName) {
        onState({ statusKey: 'error', statusArgs: { detail: 'MISSING_NAME' } });
        return false;
      }
      const ok = send('hello', { name: pendingName });
      if (!ok) {
        onState({ statusKey: 'error', statusArgs: { detail: 'NOT_CONNECTED' } });
      }
      return ok;
    },
    createRoom() {
      if (!ensureHello()) return false;
      const ok = send('create_room', {});
      if (!ok) onState({ statusKey: 'error', statusArgs: { detail: 'NOT_CONNECTED' } });
      return ok;
    },
    joinRoom(roomId: string) {
      if (!ensureHello()) return false;
      const normalized = roomId.toUpperCase();
      const ok = send('join_room', { roomId: normalized });
      if (!ok) onState({ statusKey: 'error', statusArgs: { detail: 'NOT_CONNECTED' } });
      return ok;
    },
    addBot() {
      const ok = send('add_bot', {});
      if (!ok) onState({ statusKey: 'error', statusArgs: { detail: 'NOT_CONNECTED' } });
      return ok;
    },
    setReady() {
      const ok = send('set_ready', { ready: true });
      if (!ok) onState({ statusKey: 'error', statusArgs: { detail: 'NOT_CONNECTED' } });
      return ok;
    }
  };
}

function suitPrefix(suit: string) {
  if (suit === 'wan') return 'w';
  if (suit === 'tong') return 'b';
  return 't';
}
