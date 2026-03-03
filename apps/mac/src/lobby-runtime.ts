/**
 * EN: macOS lobby runtime adapter (preview/live).
 * 中文：macOS 大厅运行时适配层（预览/实时）。
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
};

export type LobbyRuntime = {
  connect: () => void;
  disconnect: () => void;
  hello: (name: string) => void;
  createRoom: () => void;
  joinRoom: (roomId: string) => void;
  addBot: () => void;
  setReady: () => void;
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
    },
    createRoom() {
      onState({
        roomId: 'ABC123',
        roomPhase: 'waiting',
        roundNo: 0,
        maxRounds: 8,
        players: [{ name: 'You', isBot: false, ready: false, online: true }],
        statusKey: 'preview_room_created'
      });
    },
    joinRoom(roomId: string) {
      onState({ roomId: roomId.toUpperCase(), statusKey: 'preview_room_joined', statusArgs: { roomId: roomId.toUpperCase() } });
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
    }
  };
}

function createLiveRuntime(wsUrl: string, onState: RuntimeOptions['onState']): LobbyRuntime {
  let ws: WebSocket | null = null;
  const model: any = {
    roomState: null,
    gameState: null,
    roomId: '',
    activeRooms: []
  };

  return {
    connect() {
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
      }
      ws = new WebSocket(wsUrl);
      onState({ statusKey: 'connecting', statusArgs: { wsUrl } });

      ws.addEventListener('open', () => {
        onState({ connected: true, statusKey: 'connected' });
      });

      ws.addEventListener('close', () => {
        onState({ connected: false, statusKey: 'disconnected' });
      });

      ws.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(String(event.data));
          const { patch = {} } = reduceServerMessage(model, message);
          Object.assign(model, patch);

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
        } catch {
          onState({ statusKey: 'error' });
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
      send(ws, 'hello', { name });
    },
    createRoom() {
      send(ws, 'create_room', {});
    },
    joinRoom(roomId: string) {
      send(ws, 'join_room', { roomId: roomId.toUpperCase() });
    },
    addBot() {
      send(ws, 'add_bot', {});
    },
    setReady() {
      send(ws, 'set_ready', { ready: true });
    }
  };
}

function send(ws: WebSocket | null, type: string, payload: unknown) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type, payload }));
}
