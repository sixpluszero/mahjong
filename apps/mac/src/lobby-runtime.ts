import { reduceServerMessage } from '../../../packages/client-core/src/web-entry.js';

export type LobbyStatusKey = 'idle'|'preview_connected'|'preview_disconnected'|'preview_hello'|'preview_room_created'|'preview_room_joined'|'connecting'|'connected'|'disconnected'|'room_synced'|'error';
export type Meld = { type: string; tile: { suit: 'wan'|'tiao'|'tong'; rank: number } };
export type LobbyPlayer = { seat: number; name: string; isBot: boolean; ready: boolean; online: boolean; totalScore: number; roundDelta?: number; melds: Meld[] };
export type TableDiscard = { seat: number; tileCode: string };
export type HandTile = { id: string; code: string; suit: 'wan'|'tiao'|'tong'; rank: number };
export type PendingReaction = { fromSeat: number; canHu: boolean; canGang: boolean; canPeng: boolean; tileCode: string } | null;

export type LobbyViewState = {
  name: string; roomId: string; players: LobbyPlayer[]; connected: boolean;
  statusKey: LobbyStatusKey; statusArgs?: Record<string, string | number>;
  roomPhase?: string; roundNo?: number; maxRounds?: number;
  gamePhase?: string; turnSeat?: number; yourSeat?: number;
  yourHandTiles: HandTile[]; yourMelds: Meld[]; canSelfHu: boolean; pendingReaction: PendingReaction;
  discards: TableDiscard[]; rematchReadySeats: number[]; matchFinished: boolean;
};

export type LobbyRuntime = {
  connect: () => void; disconnect: () => void;
  hello: (name: string) => boolean; createRoom: () => boolean; joinRoom: (roomId: string) => boolean;
  addBot: () => boolean; setReady: () => boolean; requestRematch: () => boolean;
  discard: (tileId: string) => boolean; setLack: (lackSuit: 'wan'|'tiao'|'tong') => boolean; submitExchange: (tileIds: string[]) => boolean;
  react: (action: 'hu'|'gang'|'peng'|'pass') => boolean; selfHu: () => boolean; anGang: (tileId: string) => boolean; buGang: (tileId: string) => boolean;
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
    createRoom() { onState({ roomId:'ABC123', players:[{seat:0,name:'You',isBot:false,ready:false,online:true,totalScore:0,melds:[]}], gamePhase:'play', turnSeat:0, yourSeat:0, yourHandTiles:[tile('h1','w1','wan',1)], yourMelds:[], canSelfHu:false, pendingReaction:null, discards:[], rematchReadySeats:[], matchFinished:false, statusKey:'preview_room_created' }); return true; },
    joinRoom(roomId: string) { onState({ roomId: roomId.toUpperCase(), statusKey: 'preview_room_joined' }); return true; },
    addBot() { return true; }, setReady() { return true; }, requestRematch() { return true; },
    discard() { return true; }, setLack() { return true; }, submitExchange() { return true; }, react() { return true; }, selfHu() { return true; }, anGang() { return true; }, buGang() { return true; }
  };
}

function createLiveRuntime(wsUrl: string, onState: RuntimeOptions['onState']): LobbyRuntime {
  let ws: WebSocket | null = null;
  let acknowledgedName = ''; let pendingName = ''; let socketReady = false;
  const model: any = { roomState: null, gameState: null };

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

  const buildPlayers = (roomPlayers: any[] = [], gamePlayers: any[] = []): LobbyPlayer[] => {
    const meldBySeat = new Map<number, Meld[]>(gamePlayers.map((p: any) => [p.seat, p.melds || []]));
    return roomPlayers.filter((p: any) => p.occupied).map((p: any) => ({
      seat: p.seat, name: p.name, isBot: !!p.isBot, ready: !!p.ready, online: p.online !== false, totalScore: p.totalScore ?? 0, roundDelta: p.roundScore ?? p.deltaScore ?? p.changeScore ?? 0, melds: meldBySeat.get(p.seat) || []
    }));
  };

  return {
    connect() {
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
      ws = new WebSocket(wsUrl);
      onState({ statusKey: 'connecting', statusArgs: { wsUrl } });
      ws.addEventListener('open', () => { socketReady = true; onState({ connected: true, statusKey: 'connected' }); if (pendingName) send('hello', { name: pendingName }); });
      ws.addEventListener('close', () => { socketReady = false; onState({ connected: false, statusKey: 'disconnected' }); });
      ws.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(String(event.data));
          const { patch = {} } = reduceServerMessage(model, message);
          Object.assign(model, patch);

          if (message.type === 'hello_ack') acknowledgedName = message.payload?.name || pendingName;
          if (message.type === 'error') onState({ statusKey: 'error', statusArgs: { detail: message.payload?.code || 'SERVER_ERROR' } });

          if (message.type === 'room_state') {
            onState({
              roomId: message.payload?.roomId || '', roomPhase: message.payload?.phase,
              roundNo: message.payload?.roundNo || 0, maxRounds: message.payload?.maxRounds || 0,
              rematchReadySeats: message.payload?.rematchReadySeats || [], matchFinished: !!message.payload?.matchFinished,
              players: buildPlayers(message.payload?.players || [], model.gameState?.players || []),
              statusKey: 'room_synced'
            });
          }

          if (message.type === 'game_state') {
            const you = message.payload?.you || {}; const gs = message.payload?.state || {};
            const yourHandTiles = (you.hand || []).map((t: any) => ({ id: t.id, code: `${suitPrefix(t.suit)}${t.rank}`, suit: t.suit, rank: t.rank }));
            const discards = (gs.discardPool || []).slice(-16).map((d: any) => ({ seat: d.seat, tileCode: `${suitPrefix(d.tile.suit)}${d.tile.rank}` }));
            const pending = message.payload?.pendingReaction ? { fromSeat: message.payload.pendingReaction.fromSeat, canHu: !!message.payload.pendingReaction.canHu, canGang: !!message.payload.pendingReaction.canGang, canPeng: !!message.payload.pendingReaction.canPeng, tileCode: `${suitPrefix(message.payload.pendingReaction.tile.suit)}${message.payload.pendingReaction.tile.rank}` } : null;
            onState({ players: buildPlayers(model.roomState?.players || [], gs.players || []), gamePhase: gs.phase, turnSeat: gs.turnSeat, yourSeat: you.seat, yourHandTiles, discards, canSelfHu: !!you.canSelfHu, yourMelds: you.melds || [], pendingReaction: pending });
          }
        } catch { onState({ statusKey: 'error', statusArgs: { detail: 'PARSE_ERROR' } }); }
      });
    },
    disconnect() { if (ws) try { ws.close(); } catch {} },
    hello(name: string) { pendingName = String(name || '').trim(); if (!pendingName) { onState({ statusKey:'error', statusArgs:{detail:'MISSING_NAME'} }); return false; } return send('hello',{name:pendingName}); },
    createRoom() { if (!ensureHello()) return false; return send('create_room',{}); },
    joinRoom(roomId: string) { if (!ensureHello()) return false; return send('join_room',{roomId:roomId.toUpperCase()}); },
    addBot() { return send('add_bot',{}); }, setReady() { return send('set_ready',{ready:true}); }, requestRematch() { return send('request_rematch',{}); },
    discard(tileId: string) { return send('discard',{tileId}); }, setLack(lackSuit: 'wan'|'tiao'|'tong') { return send('set_lack',{lackSuit}); }, submitExchange(tileIds: string[]) { return send('submit_exchange',{tileIds}); },
    react(action: 'hu'|'gang'|'peng'|'pass') { return send('react',{action}); }, selfHu() { return send('self_hu',{}); }, anGang(tileId: string) { return send('an_gang',{tileId}); }, buGang(tileId: string) { return send('bu_gang',{tileId}); }
  };
}

function suitPrefix(suit: string) { if (suit === 'wan') return 'w'; if (suit === 'tong') return 'b'; return 't'; }
function tile(id: string, code: string, suit: 'wan'|'tiao'|'tong', rank: number): HandTile { return { id, code, suit, rank }; }
