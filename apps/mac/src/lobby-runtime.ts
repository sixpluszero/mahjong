import { reduceServerMessage } from '../../../packages/client-core/src/web-entry.js';

export type LobbyStatusKey = 'idle'|'preview_connected'|'preview_disconnected'|'preview_hello'|'preview_room_created'|'preview_room_joined'|'connecting'|'connected'|'disconnected'|'room_synced'|'error';
export type Meld = { type: string; tile: { suit: 'wan'|'tiao'|'tong'; rank: number } };
export type LobbyPlayer = { seat: number; name: string; isBot: boolean; ready: boolean; online: boolean; totalScore: number; roundDelta?: number; lackSuit?: 'wan'|'tiao'|'tong'|null; melds: Meld[] };
export type TableDiscard = { seat: number; tileCode: string; claimed?: boolean };
export type HandTile = { id: string; code: string; suit: 'wan'|'tiao'|'tong'; rank: number };
export type PendingReaction = { fromSeat: number; canHu: boolean; canGang: boolean; canPeng: boolean; tileCode: string } | null;
export type ScoreFeedItem = { id: string; ts: number; text: string };

export type LobbyViewState = {
  name: string; roomId: string; players: LobbyPlayer[]; connected: boolean;
  statusKey: LobbyStatusKey; statusArgs?: Record<string, string | number>;
  roomPhase?: string; roundNo?: number; maxRounds?: number; remainingTiles?: number;
  gamePhase?: string; turnSeat?: number; yourSeat?: number;
  yourHandTiles: HandTile[]; yourMelds: Meld[]; canSelfHu: boolean; pendingReaction: PendingReaction;
  discards: TableDiscard[]; rematchReadySeats: number[]; matchFinished: boolean;
  scoreFeed?: ScoreFeedItem[];
  settlementEvents?: any[];
  roundHistory?: any[];
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

  const pushScoreFeed = (text: string) => {
    if (!text) return;
    if (scoreFeed[0]?.text === text) return;
    scoreFeed = [{ id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, ts: Date.now(), text }, ...scoreFeed].slice(0, 80);
    onState({ scoreFeed });
  };

  const fmtSeatName = (seat: number, players: LobbyPlayer[]) => players.find((p) => p.seat === seat)?.name || `S${seat}`;

  const enrichRoundDelta = (players: LobbyPlayer[]): LobbyPlayer[] => {
    const enriched = players.map((p) => {
      const prev = prevTotals.get(p.seat);
      let roundDelta = p.roundDelta;
      if (typeof prev === 'number' && prev !== p.totalScore) {
        roundDelta = p.totalScore - prev;
      }
      prevTotals.set(p.seat, p.totalScore);
      return { ...p, roundDelta };
    });

    // fallback score feed: whenever total changes, log one line even without scoreEvents
    enriched.forEach((p) => {
      const prev = prevTotals.get(p.seat);
      // prevTotals already updated above; recover previous via total-delta if possible
      const d = Number(p.roundDelta || 0);
      if (d !== 0) {
        const sign = d > 0 ? '+' : '';
        pushScoreFeed(`${fmtSeatName(p.seat, enriched)} 分数变动 ${sign}${d}，总分 ${p.totalScore}`);
      }
    });

    return enriched;
  };

  const tryExtractScoreEventFromMessage = (message: any, players: LobbyPlayer[]) => {
    const payload = message?.payload || {};
    const events = Array.isArray(payload.scoreEvents) ? payload.scoreEvents : Array.isArray(payload.events) ? payload.events : [];
    for (const e of events) {
      const from = e.fromSeat ?? e.from ?? e.loserSeat;
      const to = e.toSeat ?? e.to ?? e.winnerSeat;
      const delta = e.delta ?? e.score ?? e.points;
      const reason = e.reason ?? e.action ?? e.type ?? '';
      const fan = e.fanType ?? e.fanName ?? e.fan ?? e.fans;
      const fromName = players.find((p) => p.seat === from)?.name || `S${from}`;
      const toName = players.find((p) => p.seat === to)?.name || `S${to}`;
      const deltaText = typeof delta === 'number' ? `${delta > 0 ? '+' : ''}${delta}` : String(delta || '');
      pushScoreFeed(`${fromName} 因${reason || '得分结算'} 给 ${toName} ${deltaText}${fan ? `（${fan}）` : ''}`);
    }

    if (String(message?.type || '').includes('settlement')) {
      const changed = players.filter((p) => (p.roundDelta ?? 0) !== 0);
      changed.forEach((p) => {
        const d = Number(p.roundDelta || 0);
        pushScoreFeed(`${p.name} 本局 ${d > 0 ? '+' : ''}${d}，总分 ${p.totalScore}`);
      });
    }
  };

  return {
    connect() { onState({ connected: true, statusKey: 'preview_connected' }); },
    disconnect() { onState({ connected: false, statusKey: 'preview_disconnected' }); },
    hello(name: string) { onState({ name, statusKey: 'preview_hello', statusArgs: { name: name || 'Player' } }); return true; },
    createRoom() { onState({ roomId:'ABC123', players:[{seat:0,name:'You',isBot:false,ready:false,online:true,totalScore:0,melds:[]}], gamePhase:'play', turnSeat:0, yourSeat:0, yourHandTiles:[tile('h1','w1','wan',1)], yourMelds:[], canSelfHu:false, pendingReaction:null, discards:[], rematchReadySeats:[], matchFinished:false, scoreFeed:[], statusKey:'preview_room_created' }); return true; },
    joinRoom(roomId: string) { onState({ roomId: roomId.toUpperCase(), statusKey: 'preview_room_joined' }); return true; },
    addBot() { return true; }, setReady() { return true; }, requestRematch() { return true; },
    discard() { return true; }, setLack() { return true; }, submitExchange() { return true; }, react() { return true; }, selfHu() { return true; }, anGang() { return true; }, buGang() { return true; }
  };
}

function createLiveRuntime(wsUrl: string, onState: RuntimeOptions['onState']): LobbyRuntime {
  let ws: WebSocket | null = null;
  let acknowledgedName = ''; let pendingName = ''; let socketReady = false;
  const model: any = { roomState: null, gameState: null };
  let scoreFeed: ScoreFeedItem[] = [];
  const prevTotals = new Map<number, number>();

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
    const gameBySeat = new Map<number, any>(gamePlayers.map((p: any) => [p.seat, p]));
    return roomPlayers.filter((p: any) => p.occupied).map((p: any) => {
      const gp = gameBySeat.get(p.seat) || {};
      const lackRaw = gp.lackSuit ?? gp.lackType ?? gp.missingSuit ?? gp.lack ?? p.lackSuit ?? p.lackType ?? p.missingSuit ?? p.lack ?? null;
    
  const pushScoreFeed = (text: string) => {
    if (!text) return;
    if (scoreFeed[0]?.text === text) return;
    scoreFeed = [{ id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, ts: Date.now(), text }, ...scoreFeed].slice(0, 80);
    onState({ scoreFeed });
  };

  const fmtSeatName = (seat: number, players: LobbyPlayer[]) => players.find((p) => p.seat === seat)?.name || `S${seat}`;

  const enrichRoundDelta = (players: LobbyPlayer[]): LobbyPlayer[] => {
    const enriched = players.map((p) => {
      const prev = prevTotals.get(p.seat);
      let roundDelta = p.roundDelta;
      if (typeof prev === 'number' && prev !== p.totalScore) {
        roundDelta = p.totalScore - prev;
      }
      prevTotals.set(p.seat, p.totalScore);
      return { ...p, roundDelta };
    });

    // fallback score feed: whenever total changes, log one line even without scoreEvents
    enriched.forEach((p) => {
      const prev = prevTotals.get(p.seat);
      // prevTotals already updated above; recover previous via total-delta if possible
      const d = Number(p.roundDelta || 0);
      if (d !== 0) {
        const sign = d > 0 ? '+' : '';
        pushScoreFeed(`${fmtSeatName(p.seat, enriched)} 分数变动 ${sign}${d}，总分 ${p.totalScore}`);
      }
    });

    return enriched;
  };

  const tryExtractScoreEventFromMessage = (message: any, players: LobbyPlayer[]) => {
    const payload = message?.payload || {};
    const events = Array.isArray(payload.scoreEvents) ? payload.scoreEvents : Array.isArray(payload.events) ? payload.events : [];
    for (const e of events) {
      const from = e.fromSeat ?? e.from ?? e.loserSeat;
      const to = e.toSeat ?? e.to ?? e.winnerSeat;
      const delta = e.delta ?? e.score ?? e.points;
      const reason = e.reason ?? e.action ?? e.type ?? '';
      const fan = e.fanType ?? e.fanName ?? e.fan ?? e.fans;
      const fromName = players.find((p) => p.seat === from)?.name || `S${from}`;
      const toName = players.find((p) => p.seat === to)?.name || `S${to}`;
      const deltaText = typeof delta === 'number' ? `${delta > 0 ? '+' : ''}${delta}` : String(delta || '');
      pushScoreFeed(`${fromName} 因${reason || '得分结算'} 给 ${toName} ${deltaText}${fan ? `（${fan}）` : ''}`);
    }

    if (String(message?.type || '').includes('settlement')) {
      const changed = players.filter((p) => (p.roundDelta ?? 0) !== 0);
      changed.forEach((p) => {
        const d = Number(p.roundDelta || 0);
        pushScoreFeed(`${p.name} 本局 ${d > 0 ? '+' : ''}${d}，总分 ${p.totalScore}`);
      });
    }
  };

  return {
        seat: p.seat,
        name: p.name,
        isBot: !!p.isBot,
        ready: !!p.ready,
        online: p.online !== false,
        totalScore: gp.totalScore ?? p.totalScore ?? 0,
        roundDelta: gp.roundScore ?? gp.deltaScore ?? gp.changeScore ?? p.roundScore ?? p.deltaScore ?? p.changeScore ?? 0,
        lackSuit: lackRaw,
        melds: gp.melds || []
      };
    });
  };


  const pushScoreFeed = (text: string) => {
    if (!text) return;
    if (scoreFeed[0]?.text === text) return;
    scoreFeed = [{ id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, ts: Date.now(), text }, ...scoreFeed].slice(0, 80);
    onState({ scoreFeed });
  };

  const fmtSeatName = (seat: number, players: LobbyPlayer[]) => players.find((p) => p.seat === seat)?.name || `S${seat}`;

  const enrichRoundDelta = (players: LobbyPlayer[]): LobbyPlayer[] => {
    const enriched = players.map((p) => {
      const prev = prevTotals.get(p.seat);
      let roundDelta = p.roundDelta;
      if (typeof prev === 'number' && prev !== p.totalScore) {
        roundDelta = p.totalScore - prev;
      }
      prevTotals.set(p.seat, p.totalScore);
      return { ...p, roundDelta };
    });

    // fallback score feed: whenever total changes, log one line even without scoreEvents
    enriched.forEach((p) => {
      const prev = prevTotals.get(p.seat);
      // prevTotals already updated above; recover previous via total-delta if possible
      const d = Number(p.roundDelta || 0);
      if (d !== 0) {
        const sign = d > 0 ? '+' : '';
        pushScoreFeed(`${fmtSeatName(p.seat, enriched)} 分数变动 ${sign}${d}，总分 ${p.totalScore}`);
      }
    });

    return enriched;
  };

  const tryExtractScoreEventFromMessage = (message: any, players: LobbyPlayer[]) => {
    const payload = message?.payload || {};
    const events = Array.isArray(payload.scoreEvents) ? payload.scoreEvents : Array.isArray(payload.events) ? payload.events : [];
    for (const e of events) {
      const from = e.fromSeat ?? e.from ?? e.loserSeat;
      const to = e.toSeat ?? e.to ?? e.winnerSeat;
      const delta = e.delta ?? e.score ?? e.points;
      const reason = e.reason ?? e.action ?? e.type ?? '';
      const fan = e.fanType ?? e.fanName ?? e.fan ?? e.fans;
      const fromName = players.find((p) => p.seat === from)?.name || `S${from}`;
      const toName = players.find((p) => p.seat === to)?.name || `S${to}`;
      const deltaText = typeof delta === 'number' ? `${delta > 0 ? '+' : ''}${delta}` : String(delta || '');
      pushScoreFeed(`${fromName} 因${reason || '得分结算'} 给 ${toName} ${deltaText}${fan ? `（${fan}）` : ''}`);
    }

    if (String(message?.type || '').includes('settlement')) {
      const changed = players.filter((p) => (p.roundDelta ?? 0) !== 0);
      changed.forEach((p) => {
        const d = Number(p.roundDelta || 0);
        pushScoreFeed(`${p.name} 本局 ${d > 0 ? '+' : ''}${d}，总分 ${p.totalScore}`);
      });
    }
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
              rematchReadySeats: message.payload?.rematchReadySeats || [], matchFinished: !!message.payload?.matchFinished, roundHistory: message.payload?.roundHistory || [],
              players: enrichRoundDelta(buildPlayers(message.payload?.players || [], model.gameState?.players || [])),
              statusKey: 'room_synced'
            });
          }

          if (message.type === 'game_state') {
            const you = message.payload?.you || {}; const gs = message.payload?.state || {};
            const yourHandTiles = (you.hand || []).map((t: any) => ({ id: t.id, code: `${suitPrefix(t.suit)}${t.rank}`, suit: t.suit, rank: t.rank }));
            const discards = (gs.discardPool || []).map((d: any) => ({ seat: d.seat, tileCode: `${suitPrefix(d.tile.suit)}${d.tile.rank}`, claimed: !!d.claimed || !!d.claimedBy || !!d.melded || d.takenBy != null || d.status === 'claimed' }));
            const pending = message.payload?.pendingReaction ? { fromSeat: message.payload.pendingReaction.fromSeat, canHu: !!message.payload.pendingReaction.canHu, canGang: !!message.payload.pendingReaction.canGang, canPeng: !!message.payload.pendingReaction.canPeng, tileCode: `${suitPrefix(message.payload.pendingReaction.tile.suit)}${message.payload.pendingReaction.tile.rank}` } : null;
            const playersNow = enrichRoundDelta(buildPlayers(model.roomState?.players || [], gs.players || []));
            onState({ players: playersNow, gamePhase: gs.phase, turnSeat: gs.turnSeat, yourSeat: you.seat, yourHandTiles, discards, remainingTiles: gs.remainingTiles ?? gs.wallRemaining ?? gs.tilesLeft ?? gs.leftTileCount ?? undefined, canSelfHu: !!you.canSelfHu, yourMelds: you.melds || [], pendingReaction: pending, scoreFeed, settlementEvents: gs.settlementEvents || [] });
            tryExtractScoreEventFromMessage(message, playersNow);
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
