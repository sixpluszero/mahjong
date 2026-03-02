/**
 * EN: macOS lobby runtime adapter (preview/live).
 * 中文：macOS 大厅运行时适配层（预览/实时）。
 */

import { reduceServerMessage } from '../../../packages/client-core/src/web-entry.js';

export type LobbyViewState = {
  name: string;
  roomId: string;
  status: string;
  players: string[];
  connected: boolean;
};

export type LobbyRuntime = {
  connect: () => void;
  disconnect: () => void;
  hello: (name: string) => void;
  createRoom: () => void;
  joinRoom: (roomId: string) => void;
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
      onState({ connected: true, status: 'Preview connected' });
    },
    disconnect() {
      onState({ connected: false, status: 'Preview disconnected' });
    },
    hello(name: string) {
      onState({ name, status: `Hello ${name || 'Player'} (preview mode)` });
    },
    createRoom() {
      onState(({
        roomId: 'ABC123',
        status: 'Room created (preview)'
      }) as Partial<LobbyViewState>);
    },
    joinRoom(roomId: string) {
      onState({ roomId: roomId.toUpperCase(), status: `Join room ${roomId.toUpperCase()} (preview)` });
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
      onState({ status: `Connecting: ${wsUrl}` });

      ws.addEventListener('open', () => {
        onState({ connected: true, status: 'Connected' });
      });

      ws.addEventListener('close', () => {
        onState({ connected: false, status: 'Disconnected' });
      });

      ws.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data));
        const { patch = {} } = reduceServerMessage(model, message);
        Object.assign(model, patch);

        if (message.type === 'room_state') {
          const players = (message.payload?.players || [])
            .filter((p: any) => p.occupied)
            .map((p: any) => p.name);
          onState({
            roomId: message.payload?.roomId || '',
            players,
            status: `Room synced (${players.length} players)`
          });
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
    }
  };
}

function send(ws: WebSocket | null, type: string, payload: unknown) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type, payload }));
}
