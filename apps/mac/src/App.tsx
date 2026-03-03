import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, Text, View, StyleSheet, TextInput, Pressable, ScrollView } from 'react-native';
import { createLobbyRuntime, type LobbyViewState, type HandTile, type Meld, type LobbyPlayer } from './lobby-runtime';

type Lang = 'en' | 'zh';
const I18N: Record<Lang, Record<string, string>> = {
  en: {
    randomName: 'Random', hello: 'Hello', create: 'Create', join: 'Join', addBot: 'Add Bot', ready: 'Ready', rematch: 'Rematch',
    scoreboard: 'Scoreboard', melds: 'Melds', status: 'Status', phase: 'Phase', table: 'Table', submitExchange: 'Submit Exchange',
    lackWan: 'Lack Wan', lackTiao: 'Lack Tiao', lackTong: 'Lack Tong', reactHu: 'Hu', reactGang: 'Gang', reactPeng: 'Peng', reactPass: 'Pass',
    selfHu: 'Self Hu', turn: 'Turn', room: 'Room', connected: 'Connected', actions: 'Actions', countdown: 'Countdown'
  },
  zh: {
    randomName: '随机昵称', hello: '确认昵称', create: '创建房间', join: '加入房间', addBot: '添加机器人', ready: '准备', rematch: '再来一局',
    scoreboard: '记分板', melds: '碰/杠', status: '状态', phase: '阶段', table: '牌桌', submitExchange: '提交换三张',
    lackWan: '定缺万', lackTiao: '定缺条', lackTong: '定缺筒', reactHu: '胡', reactGang: '杠', reactPeng: '碰', reactPass: '过',
    selfHu: '自摸胡', turn: '当前出牌', room: '房间', connected: '连接', actions: '操作', countdown: '倒计时'
  }
};
const t = (l: Lang, k: string) => I18N[l][k] || k;

export default function App(): JSX.Element {
  const [lang, setLang] = useState<Lang>('zh');
  const [mode, setMode] = useState<'preview' | 'live'>('live');
  const [wsUrl, setWsUrl] = useState('ws://127.0.0.1:8787');
  const [busy, setBusy] = useState(false);
  const [exchangeSelected, setExchangeSelected] = useState<string[]>([]);
  const [state, setState] = useState<LobbyViewState>({
    name: '', roomId: '', players: [], connected: false, statusKey: 'idle', yourHandTiles: [], discards: [], yourMelds: [],
    canSelfHu: false, pendingReaction: null, rematchReadySeats: [], matchFinished: false
  });

  const runtime = useMemo(() => createLobbyRuntime({ mode, wsUrl, onState: (patch) => setState((s) => ({ ...s, ...patch })) }), [mode, wsUrl]);
  useEffect(() => { runtime.connect(); return () => runtime.disconnect(); }, [runtime]);
  useEffect(() => { if (state.gamePhase !== 'exchange') setExchangeSelected([]); }, [state.gamePhase]);

  const canDiscard = state.gamePhase === 'play' && state.turnSeat === state.yourSeat;
  const inExchange = state.gamePhase === 'exchange';
  const inLack = state.gamePhase === 'lack';
  const inSettlement = state.gamePhase === 'settlement';

  const actionOpen = !!state.pendingReaction || canDiscard;
  const [actionCountdown, setActionCountdown] = useState(0);
  useEffect(() => {
    if (!actionOpen) { setActionCountdown(0); return; }
    setActionCountdown(8);
    const timer = setInterval(() => {
      setActionCountdown((n) => (n <= 1 ? 0 : n - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [actionOpen, state.turnSeat, state.gamePhase, state.pendingReaction?.tileCode]);

  const anGang = findAnGangCandidates(state.yourHandTiles);
  const buGang = findBuGangCandidates(state.yourHandTiles, state.yourMelds);
  const leaderboard = [...state.players].sort((a, b) => b.totalScore - a.totalScore || a.seat - b.seat);

  const mySeat = state.yourSeat ?? 0;
  const seatMap = {
    bottom: findPlayerBySeat(state.players, mySeat),
    top: findPlayerBySeat(state.players, (mySeat + 2) % 4),
    left: findPlayerBySeat(state.players, (mySeat + 1) % 4),
    right: findPlayerBySeat(state.players, (mySeat + 3) % 4)
  };

  const discardsBySeat = groupDiscardsBySeat(state.discards);

  const run = (fn: () => boolean) => {
    if (busy) return;
    setBusy(true);
    try { fn(); } finally { setTimeout(() => setBusy(false), 120); }
  };

  const genRandomName = () => {
    const p = ['雀友', '牌侠', '听牌王', '川麻客', '杠上花'];
    const q = ['东风', '南风', '西风', '北风', '红中', '发财', '白板'];
    const a = p[Math.floor(Math.random() * p.length)];
    const b = q[Math.floor(Math.random() * q.length)];
    return `${a}${b}${Math.floor(1000 + Math.random() * 9000)}`;
  };

  const onTilePress = (tile: HandTile) => {
    if (inExchange) {
      setExchangeSelected((prev) => prev.includes(tile.id) ? prev.filter((x) => x !== tile.id) : (prev.length >= 3 ? prev : [...prev, tile.id]));
      return;
    }
    if (canDiscard) run(() => runtime.discard(tile.id));
  };

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <View style={styles.card}>
          <View style={styles.row}><Btn text="中文" onPress={() => setLang('zh')} /><Btn text="EN" onPress={() => setLang('en')} /><Btn text="Preview" onPress={() => setMode('preview')} /><Btn text="Live" onPress={() => setMode('live')} /></View>
          <TextInput style={styles.input} value={wsUrl} onChangeText={setWsUrl} />
          <View style={styles.row}>
            <TextInput style={[styles.input, styles.nameInput]} value={state.name} onChangeText={(name) => setState((s) => ({ ...s, name }))} placeholder="Name" />
            <Btn text={t(lang, 'randomName')} onPress={() => setState((s) => ({ ...s, name: genRandomName() }))} />
            <Btn text={t(lang, 'hello')} onPress={() => run(() => runtime.hello(state.name))} />
          </View>
          <TextInput style={styles.input} value={state.roomId} onChangeText={(roomId) => setState((s) => ({ ...s, roomId: roomId.toUpperCase() }))} placeholder="Room" />
          <View style={styles.row}><Btn text={t(lang, 'create')} onPress={() => run(() => runtime.createRoom())} /><Btn text={t(lang, 'join')} onPress={() => run(() => runtime.joinRoom(state.roomId))} /><Btn text={t(lang, 'addBot')} onPress={() => run(() => runtime.addBot())} /><Btn text={t(lang, 'ready')} onPress={() => run(() => runtime.setReady())} /></View>

          <View style={styles.tablePanel}>
            <View style={styles.tableHeader}>
              <Text style={styles.tableTitle}>{t(lang, 'table')}</Text>
              <Text style={styles.meta}>{t(lang, 'connected')}: {state.connected ? 'Yes' : 'No'} · {t(lang, 'room')}: {state.roomId || '-'} · {t(lang, 'phase')}: {state.gamePhase || '-'}</Text>
            </View>

            <View style={styles.tableSurface}>
              <SeatPanel player={seatMap.top} rematchReadySeats={state.rematchReadySeats} isTurn={state.turnSeat === seatMap.top?.seat} />
              <View style={styles.middleRow}>
                <SeatPanel player={seatMap.left} rematchReadySeats={state.rematchReadySeats} vertical isTurn={state.turnSeat === seatMap.left?.seat} />
                <CenterHUD
                  turnSeat={state.turnSeat}
                  roomPhase={state.roomPhase}
                  roundNo={state.roundNo}
                  maxRounds={state.maxRounds}
                  statusKey={state.statusKey}
                  statusDetail={state.statusArgs?.detail}
                />
                <SeatPanel player={seatMap.right} rematchReadySeats={state.rematchReadySeats} vertical isTurn={state.turnSeat === seatMap.right?.seat} />
              </View>
              <DiscardRivers discardsBySeat={discardsBySeat} mySeat={mySeat} />
              <View style={styles.bottomSeatWrap}>
                <SeatPanel player={seatMap.bottom} rematchReadySeats={state.rematchReadySeats} isTurn={state.turnSeat === seatMap.bottom?.seat} />
              </View>
            </View>

            {actionOpen ? (
              <View style={styles.actionBarWrap}>
                <View style={styles.actionBarHeader}>
                  <Text style={styles.actionTitle}>{t(lang, 'actions')}</Text>
                  <Text style={[styles.actionTimer, actionCountdown <= 3 ? styles.actionTimerDanger : (actionCountdown <= 5 ? styles.actionTimerWarn : null)]}>{t(lang, 'countdown')}: {actionCountdown}s</Text>
                </View>
                {actionCountdown > 0 ? <View style={[styles.countdownBar, actionCountdown <= 3 ? styles.countdownBarDanger : (actionCountdown <= 5 ? styles.countdownBarWarn : null), { width: `${Math.max(8, Math.round((actionCountdown / 8) * 100))}%` }]} /> : null}
                {state.pendingReaction ? (
                  <View style={styles.actionBar}>
                    {state.pendingReaction.canHu && <Btn text={t(lang, 'reactHu')} onPress={() => run(() => runtime.react('hu'))} />}
                    {state.pendingReaction.canGang && <Btn text={t(lang, 'reactGang')} onPress={() => run(() => runtime.react('gang'))} />}
                    {state.pendingReaction.canPeng && <Btn text={t(lang, 'reactPeng')} onPress={() => run(() => runtime.react('peng'))} />}
                    <Btn text={t(lang, 'reactPass')} onPress={() => run(() => runtime.react('pass'))} />
                  </View>
                ) : (
                  <View style={styles.actionBar}>
                    {canDiscard && state.canSelfHu ? <Btn text={t(lang, 'selfHu')} onPress={() => run(() => runtime.selfHu())} /> : null}
                    {canDiscard && !state.canSelfHu ? <Text style={styles.meta}>请先出牌</Text> : null}
                  </View>
                )}
              </View>
            ) : null}

            {!state.pendingReaction && canDiscard && anGang.map((x) => <View key={x.id} style={styles.row}><Btn text={`暗杠 ${x.code}`} onPress={() => run(() => runtime.anGang(x.id))} /></View>)}
            {!state.pendingReaction && canDiscard && buGang.map((x) => <View key={x.id} style={styles.row}><Btn text={`补杠 ${x.code}`} onPress={() => run(() => runtime.buGang(x.id))} /></View>)}

            {inExchange ? <View style={styles.row}><Text style={styles.meta}>换三张 {exchangeSelected.length}/3</Text><Btn text={t(lang, 'submitExchange')} onPress={() => run(() => runtime.submitExchange(exchangeSelected))} /></View> : null}
            {inLack ? <View style={styles.row}><Btn text={t(lang, 'lackWan')} onPress={() => run(() => runtime.setLack('wan'))} /><Btn text={t(lang, 'lackTiao')} onPress={() => run(() => runtime.setLack('tiao'))} /><Btn text={t(lang, 'lackTong')} onPress={() => run(() => runtime.setLack('tong'))} /></View> : null}
            {inSettlement ? <View style={styles.row}><Btn text={t(lang, 'rematch')} onPress={() => run(() => runtime.requestRematch())} /></View> : null}

            <View style={styles.handArea}>
              <View style={[styles.tileRow, !(canDiscard || inExchange) && styles.tileRowDisabled]}>{state.yourHandTiles.map((tile) => <Tile key={tile.id} code={tile.code} selected={exchangeSelected.includes(tile.id)} active={canDiscard || inExchange} onPress={() => onTilePress(tile)} />)}</View>
            </View>
          </View>

          <View style={styles.panel}><Text style={styles.title}>{t(lang, 'scoreboard')}</Text>{leaderboard.map((p, i) => <Text key={p.seat} style={styles.meta}>{i + 1}. S{p.seat} {p.name} {p.totalScore} {state.rematchReadySeats.includes(p.seat) ? '✅' : ''}</Text>)}</View>
          <View style={styles.panel}><Text style={styles.title}>{t(lang, 'melds')}</Text>{state.players.length === 0 ? <Text style={styles.meta}>-</Text> : state.players.map((p) => <Text key={p.seat} style={styles.meta}>S{p.seat} {p.name}: {renderMelds(p.melds)}</Text>)}</View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SeatPanel({ player, rematchReadySeats, vertical = false, isTurn = false }: { player?: LobbyPlayer; rematchReadySeats: number[]; vertical?: boolean; isTurn?: boolean }) {
  if (!player) return <View style={[styles.seatPanel, vertical && styles.seatPanelVertical]}><Text style={styles.meta}>-</Text></View>;
  return (
    <View style={[styles.seatPanel, vertical && styles.seatPanelVertical, isTurn && styles.seatPanelTurn]}>
      <Text style={[styles.seatName, isTurn && styles.seatNameTurn]}>S{player.seat} {player.name}{isTurn ? ' ●' : ''}</Text>
      <Text style={styles.meta}>Score: {player.totalScore} {rematchReadySeats.includes(player.seat) ? '✅' : ''}</Text>
      <View style={styles.meldGroupWrap}>
        {(player.melds || []).slice(0, 4).map((m, i) => <MeldGroupView key={`${player.seat}-${i}`} meld={m} />)}
      </View>
    </View>
  );
}

function MeldGroupView({ meld }: { meld: Meld }) {
  const baseCode = `${suitPrefix(meld.tile.suit)}${meld.tile.rank}`;
  const count = meld.type === 'gang' ? 4 : 3;
  const tiles = Array.from({ length: count }, () => baseCode);
  const badge = meld.type === 'peng' ? '碰' : meld.type === 'gang' ? '杠' : '组合';

  return (
    <View style={styles.meldGroup}>
      <View style={styles.meldTilesRow}>{tiles.map((c, i) => <MiniTile key={`${c}-${i}`} code={c} />)}</View>
      <Text style={styles.meldBadge}>{badge}</Text>
    </View>
  );
}

function CenterHUD({ turnSeat, roomPhase, roundNo, maxRounds, statusKey, statusDetail }: { turnSeat?: number; roomPhase?: string; roundNo?: number; maxRounds?: number; statusKey?: string; statusDetail?: string | number }) {
  return (
    <View style={styles.centerHud}>
      <Text style={styles.centerTitle}>局况</Text>
      <Text style={styles.meta}>Turn: {turnSeat ?? '-'}</Text>
      <Text style={styles.meta}>Room: {roomPhase || '-'}</Text>
      <Text style={styles.meta}>Round: {roundNo ?? 0}/{maxRounds ?? 0}</Text>
      <Text style={styles.meta}>State: {statusKey}{statusDetail ? ` (${statusDetail})` : ''}</Text>
    </View>
  );
}

function DiscardRivers({ discardsBySeat, mySeat }: { discardsBySeat: Record<number, string[]>; mySeat: number }) {
  const topSeat = (mySeat + 2) % 4;
  const leftSeat = (mySeat + 1) % 4;
  const rightSeat = (mySeat + 3) % 4;
  return (
    <View style={styles.riversWrap}>
      <View style={styles.riverRow}>{(discardsBySeat[topSeat] || []).slice(-12).map((c, i) => <MiniTile key={`t-${i}`} code={c} />)}</View>
      <View style={styles.riverMiddle}><View style={[styles.riverCol, { alignItems: 'flex-start' }]}>{(discardsBySeat[leftSeat] || []).slice(-10).map((c, i) => <MiniTile key={`l-${i}`} code={c} />)}</View><View style={[styles.riverCol, { alignItems: 'flex-end' }]}>{(discardsBySeat[rightSeat] || []).slice(-10).map((c, i) => <MiniTile key={`r-${i}`} code={c} />)}</View></View>
      <View style={styles.riverRow}>{(discardsBySeat[mySeat] || []).slice(-12).map((c, i) => <MiniTile key={`b-${i}`} code={c} />)}</View>
    </View>
  );
}

function renderMelds(melds: Meld[]) { if (!melds || melds.length === 0) return '-'; return melds.map((m) => `${m.type}:${suitPrefix(m.tile.suit)}${m.tile.rank}`).join('、'); }
function findAnGangCandidates(hand: HandTile[]) { const m = new Map<string, HandTile[]>(); for (const t of hand) { const k = `${t.suit}-${t.rank}`; m.set(k, [...(m.get(k) || []), t]); } return [...m.values()].filter((v) => v.length >= 4).map((v) => v[0]); }
function findBuGangCandidates(hand: HandTile[], melds: Meld[]) { const keys = new Set((melds || []).filter((m) => m.type === 'peng').map((m) => `${m.tile.suit}-${m.tile.rank}`)); return hand.filter((t) => keys.has(`${t.suit}-${t.rank}`)); }
function suitPrefix(suit: string) { if (suit === 'wan') return 'w'; if (suit === 'tong') return 'b'; return 't'; }
function findPlayerBySeat(players: LobbyPlayer[], seat: number) { return players.find((p) => p.seat === seat); }
function groupDiscardsBySeat(discards: { seat: number; tileCode: string }[]) { const map: Record<number, string[]> = {}; for (const d of discards) { if (!map[d.seat]) map[d.seat] = []; map[d.seat].push(d.tileCode); } return map; }

function Btn({ text, onPress }: { text: string; onPress: () => void }) { return <Pressable style={styles.btn} onPress={onPress}><Text style={styles.btnText}>{text}</Text></Pressable>; }
function Tile({ code, small = false, selected = false, active = false, onPress }: { code: string; small?: boolean; selected?: boolean; active?: boolean; onPress?: () => void }) {
  const pure = code.includes('@') ? code.split('@')[0] : code;
  const suit = pure[0]; const rank = Number(pure.slice(1)); const { label, color } = meta(suit);
  return <Pressable onPress={onPress} disabled={!onPress} style={[styles.tile, small && styles.tileSmall, selected && styles.tileSel, !active && styles.tileInactive]}><Text style={[styles.corner, { color }]}>{label}</Text><Text style={[styles.rank, { color }]}>{rank}</Text><Text style={[styles.corner, { color, alignSelf: 'flex-end' }]}>{label}</Text></Pressable>;
}
function MiniTile({ code }: { code: string }) { return <Tile code={code} small active />; }
function meta(s: string) { if (s === 'w') return { label: '萬', color: '#dc2626' }; if (s === 't') return { label: '条', color: '#16a34a' }; return { label: '筒', color: '#2563eb' }; }

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0f172a' },
  wrap: { padding: 16, alignItems: 'center' },
  card: { width: 980, backgroundColor: '#111827', borderRadius: 14, padding: 14 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#334155', borderRadius: 8, color: '#e2e8f0', padding: 10, marginTop: 8 },
  nameInput: { minWidth: 180 },
  btn: { backgroundColor: '#1d4ed8', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  btnText: { color: '#fff', fontWeight: '600' },
  meta: { color: '#cbd5e1', marginTop: 4, fontSize: 12 },

  tablePanel: { marginTop: 12, borderWidth: 1, borderColor: '#334155', borderRadius: 12, padding: 10, backgroundColor: '#0b1220' },
  tableHeader: { marginBottom: 8 },
  tableTitle: { color: '#f8fafc', fontWeight: '700', fontSize: 16 },
  tableSurface: { borderRadius: 10, padding: 10, backgroundColor: '#0a3a32' },
  middleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8 },

  seatPanel: { minWidth: 200, minHeight: 66, borderWidth: 1, borderColor: '#1f2937', borderRadius: 8, backgroundColor: '#0f172a', padding: 8, alignSelf: 'center' },
  seatPanelVertical: { minWidth: 130, width: 130 },
  seatPanelTurn: { borderColor: '#fbbf24', shadowColor: '#fbbf24', shadowOpacity: 0.45, shadowRadius: 8 },
  seatNameTurn: { color: '#fde68a' },
  seatName: { color: '#f8fafc', fontWeight: '700' },
  meldGroupWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  meldGroup: { borderWidth: 1, borderColor: '#334155', borderRadius: 6, padding: 3, backgroundColor: '#0b1220' },
  meldTilesRow: { flexDirection: 'row', gap: 2 },
  meldBadge: { color: '#94a3b8', fontSize: 10, textAlign: 'center', marginTop: 2 },

  centerHud: { width: 280, borderWidth: 1, borderColor: '#1f2937', borderRadius: 8, backgroundColor: '#111827', padding: 8, alignItems: 'center' },
  centerTitle: { color: '#f8fafc', fontWeight: '700' },

  riversWrap: { marginTop: 8, borderWidth: 1, borderColor: '#14532d', borderRadius: 8, padding: 8, backgroundColor: '#064e3b' },
  bottomSeatWrap: { marginTop: 8, alignItems: 'center' },
  riverRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, minHeight: 30, justifyContent: 'center' },
  riverMiddle: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 6 },
  riverCol: { width: '48%', minHeight: 30, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },

  actionBarWrap: { marginTop: 10, backgroundColor: '#111827', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#334155' },
  actionBarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  actionTitle: { color: '#f8fafc', fontWeight: '700' },
  actionTimer: { color: '#86efac', fontWeight: '700' },
  actionTimerWarn: { color: '#fbbf24' },
  actionTimerDanger: { color: '#f87171' },
  countdownBar: { height: 4, borderRadius: 999, backgroundColor: '#22c55e', marginBottom: 6 },
  countdownBarWarn: { backgroundColor: '#f59e0b' },
  countdownBarDanger: { backgroundColor: '#ef4444' },
  actionBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  handArea: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 10 },

  panel: { marginTop: 10, borderWidth: 1, borderColor: '#334155', borderRadius: 10, padding: 8, backgroundColor: '#0b1220' },
  title: { color: '#f8fafc', fontWeight: '700' },

  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, justifyContent: 'center' },
  tileRowDisabled: { opacity: 0.55 },
  tile: { width: 38, height: 58, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, backgroundColor: '#fff', padding: 4, justifyContent: 'space-between' },
  tileSmall: { width: 24, height: 34, borderRadius: 5, padding: 2 },
  tileSel: { borderColor: '#f59e0b', transform: [{ translateY: -2 }] },
  tileInactive: { opacity: 0.72, backgroundColor: '#f3f4f6' },
  corner: { fontSize: 9, fontWeight: '700' },
  rank: { fontSize: 20, fontWeight: '800', textAlign: 'center' }
});
