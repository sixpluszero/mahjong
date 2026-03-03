import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, Text, View, StyleSheet, TextInput, Pressable, ScrollView } from 'react-native';
import { createLobbyRuntime, type LobbyViewState, type HandTile, type Meld, type LobbyPlayer } from './lobby-runtime';

type Lang = 'en' | 'zh';
const I18N: Record<Lang, Record<string, string>> = {
  en: {
    randomName: 'Random', hello: 'Hello', create: 'Create', join: 'Join', addBot: 'Add Bot', ready: 'Ready', rematch: 'Rematch',
    scoreboard: 'Scoreboard', melds: 'Peng/Gang', status: 'Status', phase: 'Phase', table: 'Table', submitExchange: 'Submit Exchange',
    lackWan: 'Lack Wan', lackTiao: 'Lack Tiao', lackTong: 'Lack Tong', reactHu: 'Hu', reactGang: 'Gang', reactPeng: 'Peng', reactPass: 'Pass',
    selfHu: 'Self Hu', turn: 'Turn', room: 'Room', connected: 'Connected', actions: 'Actions', countdown: 'Countdown'
  },
  zh: {
    randomName: '随机昵称', hello: '确认昵称', create: '创建房间', join: '加入房间', addBot: '添加机器人', ready: '准备', rematch: '再来一局',
    scoreboard: '记分板', melds: '碰杠牌组', status: '状态', phase: '阶段', table: '牌桌', submitExchange: '提交换三张',
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
  const [lastDiscardFlash, setLastDiscardFlash] = useState(false);
  const [actionToast, setActionToast] = useState('');
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
    setActionCountdown(15);
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

  const bottomPlayer = seatMap.bottom ? { ...seatMap.bottom, melds: (state.yourMelds && state.yourMelds.length > 0) ? state.yourMelds : seatMap.bottom.melds } : undefined;
  const discardsBySeat = groupDiscardsBySeat(state.discards);
  const lastDiscard = state.discards.length > 0 ? state.discards[state.discards.length - 1] : null;
  const lastDiscardPlayerName = lastDiscard ? (findPlayerBySeat(state.players, lastDiscard.seat)?.name || `S${lastDiscard.seat}`) : '';
  const reactionTarget = state.pendingReaction ? { seat: state.pendingReaction.fromSeat, tileCode: state.pendingReaction.tileCode } : null;

  useEffect(() => {
    if (!lastDiscard) return;
    setLastDiscardFlash(true);
    const timer = setTimeout(() => setLastDiscardFlash(false), 1200);
    return () => clearTimeout(timer);
  }, [lastDiscard?.seat, lastDiscard?.tileCode, state.discards.length]);

  const run = (fn: () => boolean) => {
    if (busy) return;
    setBusy(true);
    try { fn(); } finally { setTimeout(() => setBusy(false), 120); }
  };

  const runAction = (label: string, fn: () => boolean) => {
    run(() => {
      const ok = fn();
      if (ok) {
        setActionToast(label);
        setTimeout(() => setActionToast(''), 1200);
      }
      return ok;
    });
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
          <View style={styles.row}><Btn text={t(lang, 'create')} onPress={() => runAction('创建房间', () => runtime.createRoom())} /><Btn text={t(lang, 'join')} onPress={() => runAction('加入房间', () => runtime.joinRoom(state.roomId))} /><Btn text={t(lang, 'addBot')} onPress={() => runAction('添加机器人', () => runtime.addBot())} /><Btn text={t(lang, 'ready')} onPress={() => runAction('准备', () => runtime.setReady())} /></View>

          <View style={styles.tablePanel}>
            <View style={styles.tableHeader}>
              <Text style={styles.tableTitle}>{t(lang, 'table')}</Text>
              <Text style={styles.meta}>{t(lang, 'connected')}: {state.connected ? 'Yes' : 'No'} · {t(lang, 'room')}: {state.roomId || '-'} · {t(lang, 'phase')}: {state.gamePhase || '-'}</Text>
            </View>

            <View style={styles.tableSurface}>
              <CenterHUD
                turnSeat={state.turnSeat}
                roomPhase={state.roomPhase}
                roundNo={state.roundNo}
                maxRounds={state.maxRounds}
                statusKey={state.statusKey}
                statusDetail={state.statusArgs?.detail}
                remainingTiles={state.remainingTiles}
                lastDiscard={lastDiscard}
                lastDiscardPlayerName={lastDiscardPlayerName}
                flash={lastDiscardFlash}
              />
              <SeatPanel player={seatMap.top} rematchReadySeats={state.rematchReadySeats} isTurn={state.turnSeat === seatMap.top?.seat} isSelf={false} />
              <View style={styles.middleRow}>
                <SeatPanel player={seatMap.left} rematchReadySeats={state.rematchReadySeats} vertical side="left" isTurn={state.turnSeat === seatMap.left?.seat} isSelf={false} />
                <View style={styles.centerSpacer} />
                <SeatPanel player={seatMap.right} rematchReadySeats={state.rematchReadySeats} vertical side="right" isTurn={state.turnSeat === seatMap.right?.seat} isSelf={false} />
              </View>
              <DiscardRivers discardsBySeat={discardsBySeat} mySeat={mySeat} reactionTarget={reactionTarget} />
              <View style={styles.bottomSeatWrap}>
                <SeatPanel player={bottomPlayer} rematchReadySeats={state.rematchReadySeats} isTurn={state.turnSeat === bottomPlayer?.seat} isSelf />
              </View>
            </View>

            {actionOpen ? (
              <View style={styles.actionBarWrap}>
                <View style={styles.actionBarHeader}>
                  <Text style={styles.actionTitle}>{t(lang, 'actions')}</Text>
                  <Text style={[styles.actionTimer, actionCountdown <= 3 ? styles.actionTimerDanger : (actionCountdown <= 5 ? styles.actionTimerWarn : null)]}>{t(lang, 'countdown')}: {actionCountdown}s</Text>
                </View>
                {actionCountdown > 0 ? <View style={[styles.countdownBar, actionCountdown <= 3 ? styles.countdownBarDanger : (actionCountdown <= 5 ? styles.countdownBarWarn : null), { width: `${Math.max(8, Math.round((actionCountdown / 15) * 100))}%` }]} /> : null}
                {state.pendingReaction ? (
                  <View style={styles.actionBar}>
                    {state.pendingReaction.canHu && <Btn text={t(lang, 'reactHu')} onPress={() => runAction('胡', () => runtime.react('hu'))} />}
                    {state.pendingReaction.canGang && <Btn text={t(lang, 'reactGang')} onPress={() => runAction('杠', () => runtime.react('gang'))} />}
                    {state.pendingReaction.canPeng && <Btn text={t(lang, 'reactPeng')} onPress={() => runAction('碰', () => runtime.react('peng'))} />}
                    <Btn text={t(lang, 'reactPass')} onPress={() => runAction('过', () => runtime.react('pass'))} />
                  </View>
                ) : (
                  <View style={styles.actionBar}>
                    <Btn text={t(lang, 'selfHu')} disabled={!(canDiscard && state.canSelfHu)} onPress={() => runAction('自摸胡', () => runtime.selfHu())} />
                    {!canDiscard ? <Text style={styles.meta}>当前不可操作：未到你回合</Text> : null}
                  </View>
                )}
              </View>
            ) : null}

            {!state.pendingReaction && canDiscard && anGang.map((x) => <View key={x.id} style={styles.row}><Btn text={`暗杠 ${tileCodeToZh(x.code)}`} onPress={() => runAction('暗杠', () => runtime.anGang(x.id))} /></View>)}
            {!state.pendingReaction && canDiscard && buGang.map((x) => <View key={x.id} style={styles.row}><Btn text={`补杠 ${tileCodeToZh(x.code)}`} onPress={() => runAction('补杠', () => runtime.buGang(x.id))} /></View>)}

            {inExchange ? <View style={styles.row}><Text style={styles.meta}>换三张 {exchangeSelected.length}/3</Text><Btn text={t(lang, 'submitExchange')} onPress={() => runAction('提交换三张', () => runtime.submitExchange(exchangeSelected))} /></View> : null}
            {inLack ? <View style={styles.row}><Btn text={t(lang, 'lackWan')} onPress={() => runAction('定缺万', () => runtime.setLack('wan'))} /><Btn text={t(lang, 'lackTiao')} onPress={() => runAction('定缺条', () => runtime.setLack('tiao'))} /><Btn text={t(lang, 'lackTong')} onPress={() => runAction('定缺筒', () => runtime.setLack('tong'))} /></View> : null}
            {inSettlement ? <View style={styles.row}><Btn text={t(lang, 'rematch')} onPress={() => runAction('再来一局', () => runtime.requestRematch())} /></View> : null}

            {(inSettlement || state.matchFinished) ? (
              <View style={styles.settlementOverlay}>
                <Text style={styles.settlementTitle}>本局结算</Text>
                {leaderboard.map((p, i) => {
                  const delta = Number(p.roundDelta ?? 0);
                  const deltaText = delta > 0 ? `+${delta}` : `${delta}`;
                  return <Text key={`st-${p.seat}`} style={styles.settlementItem}>{i + 1}. S{p.seat} {p.name}  本局 {deltaText}  ·  总分 {p.totalScore}</Text>;
                })}
                <View style={styles.row}>
                  <Btn text={t(lang, 'rematch')} onPress={() => runAction('再来一局', () => runtime.requestRematch())} />
                </View>
              </View>
            ) : null}

            {actionToast ? <View style={styles.actionToast}><Text style={styles.actionToastText}>{actionToast}</Text></View> : null}
            <View style={styles.handArea}>
              <View style={[styles.tileRow, !(canDiscard || inExchange) && styles.tileRowDisabled]}>{state.yourHandTiles.map((tile) => <Tile key={tile.id} code={tile.code} selected={exchangeSelected.includes(tile.id)} active={canDiscard || inExchange} onPress={() => onTilePress(tile)} />)}</View>
            </View>
          </View>


        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SeatPanel({ player, rematchReadySeats, vertical = false, side, isTurn = false, isSelf = false }: { player?: LobbyPlayer; rematchReadySeats: number[]; vertical?: boolean; side?: 'left' | 'right'; isTurn?: boolean; isSelf?: boolean }) {
  if (!player) return <View style={[styles.seatPanel, vertical && styles.seatPanelVertical, side === 'left' && styles.seatPanelLeft, side === 'right' && styles.seatPanelRight]}><Text style={styles.meta}>-</Text></View>;
  return (
    <View style={[styles.seatPanel, vertical && styles.seatPanelVertical, side === 'left' && styles.seatPanelLeft, side === 'right' && styles.seatPanelRight, isTurn && styles.seatPanelTurn]}>
      <Text style={[styles.seatName, isTurn && styles.seatNameTurn]}>S{player.seat} {player.name}{isTurn ? ' ●' : ''}</Text>
      <Text style={styles.meta}>分数: {player.totalScore} {rematchReadySeats.includes(player.seat) ? '✅已准备' : ''}</Text>
      <Text style={styles.meta}>定缺: {lackSuitToZh(player.lackSuit)} · {player.online ? '在线' : '离线'}</Text>
      <View style={styles.meldGroupWrap}>
        {(player.melds || [])
          .filter((m) => isMeldVisible(m, isSelf))
          .slice(0, 4)
          .map((m, i) => <MeldGroupView key={`${player.seat}-${i}`} meld={m} />)}
      </View>
    </View>
  );
}

function MeldGroupView({ meld }: { meld: Meld }) {
  const raw: any = meld as any;
  const rawTiles = Array.isArray(raw.tiles) ? raw.tiles : null;
  const tiles = rawTiles && rawTiles.length > 0
    ? rawTiles.map((t: any) => `${suitPrefix(t.suit)}${t.rank}`)
    : Array.from({ length: inferMeldCount(raw.type) }, () => `${suitPrefix(meld.tile.suit)}${meld.tile.rank}`);
  const badge = inferMeldBadge(raw.type);

  return (
    <View style={styles.meldGroup}>
      <View style={styles.meldTilesRow}>{tiles.map((c, i) => <MiniTile key={`${c}-${i}`} code={c} />)}</View>
      <Text style={styles.meldBadge}>{badge}</Text>
    </View>
  );
}

function CenterHUD({ turnSeat, roomPhase, roundNo, maxRounds, statusKey, statusDetail, remainingTiles, lastDiscard, lastDiscardPlayerName, flash }: { turnSeat?: number; roomPhase?: string; roundNo?: number; maxRounds?: number; statusKey?: string; statusDetail?: string | number; remainingTiles?: number; lastDiscard?: { seat: number; tileCode: string } | null; lastDiscardPlayerName?: string; flash?: boolean }) {
  return (
    <View style={styles.centerHud}>
      <Text style={styles.centerTitle}>局况</Text>
      <Text style={styles.meta}>Turn: {turnSeat ?? '-'}</Text>
      <Text style={styles.meta}>Room: {roomPhase || '-'}</Text>
      <Text style={styles.meta}>Round: {roundNo ?? 0}/{maxRounds ?? 0}</Text>
      <Text style={styles.meta}>剩余牌: {remainingTiles ?? '-'}</Text>
      <Text style={styles.meta}>State: {statusKey}{statusDetail ? ` (${statusDetail})` : ''}</Text>
      {lastDiscard ? (
        <View style={[styles.lastDiscardBadge, flash && styles.lastDiscardBadgeFlash]}>
          <Text style={styles.lastDiscardText}>{lastDiscardPlayerName || `S${lastDiscard.seat}`} 打出 {tileCodeToZh(lastDiscard.tileCode)}</Text>
        </View>
      ) : null}
    </View>
  );
}

function DiscardRivers({ discardsBySeat, mySeat, reactionTarget }: { discardsBySeat: Record<number, string[]>; mySeat: number; reactionTarget?: { seat: number; tileCode: string } | null }) {
  const topSeat = (mySeat + 2) % 4;
  const leftSeat = (mySeat + 1) % 4;
  const rightSeat = (mySeat + 3) % 4;
  return (
    <View style={styles.riversWrap}>
      <RiverGrid tiles={discardsBySeat[topSeat] || []} highlightCode={reactionTarget?.seat === topSeat ? reactionTarget.tileCode : undefined} />
      <View style={styles.riverMiddle}>
        <RiverGrid tiles={discardsBySeat[leftSeat] || []} compact highlightCode={reactionTarget?.seat === leftSeat ? reactionTarget.tileCode : undefined} />
        <RiverGrid tiles={discardsBySeat[rightSeat] || []} compact highlightCode={reactionTarget?.seat === rightSeat ? reactionTarget.tileCode : undefined} />
      </View>
      <RiverGrid tiles={discardsBySeat[mySeat] || []} highlightCode={reactionTarget?.seat === mySeat ? reactionTarget.tileCode : undefined} />
    </View>
  );
}

function RiverGrid({ tiles, compact = false, highlightCode }: { tiles: string[]; compact?: boolean; highlightCode?: string }) {
  const perRow = compact ? 5 : 6;
  const rows = Math.max(2, Math.ceil(tiles.length / perRow));
  const padded = [...tiles];
  while (padded.length < rows * perRow) padded.push('');
  const highlightIndex = highlightCode ? tiles.lastIndexOf(highlightCode) : -1;
  return (
    <View style={[styles.riverGrid, compact && styles.riverGridCompact]}>
      {Array.from({ length: rows }).map((_, r) => (
        <View key={r} style={styles.riverRow}>
          {padded.slice(r * perRow, (r + 1) * perRow).map((c, i) => {
            const index = r * perRow + i;
            if (!c) return <View key={`${r}-${i}-x`} style={styles.riverPlaceholder} />;
            return <MiniTile key={`${r}-${i}-${c}`} code={c} highlighted={index === highlightIndex} />;
          })}
        </View>
      ))}
    </View>
  );
}

function isMeldVisible(meld: Meld, isSelf: boolean) {
  const t = String((meld as any)?.type || '').toLowerCase();
  const isAnGang = t.includes('angang') || t.includes('an_gang') || t.includes('concealed') || t.includes('concealed_kong') || t.includes('暗杠');
  return !isAnGang || isSelf;
}

function inferMeldCount(type: string) {
  const t = String(type || '').toLowerCase();
  if (t.includes('gang') || t.includes('kong') || t.includes('杠')) return 4;
  return 3;
}

function inferMeldBadge(type: string) {
  const t = String(type || '').toLowerCase();
  if (t.includes('peng') || t.includes('碰')) return '碰';
  if (t.includes('gang') || t.includes('kong') || t.includes('杠')) return '杠';
  return '组合';
}

function findAnGangCandidates(hand: HandTile[]) { const m = new Map<string, HandTile[]>(); for (const t of hand) { const k = `${t.suit}-${t.rank}`; m.set(k, [...(m.get(k) || []), t]); } return [...m.values()].filter((v) => v.length >= 4).map((v) => v[0]); }
function findBuGangCandidates(hand: HandTile[], melds: Meld[]) { const keys = new Set((melds || []).filter((m) => m.type === 'peng').map((m) => `${m.tile.suit}-${m.tile.rank}`)); return hand.filter((t) => keys.has(`${t.suit}-${t.rank}`)); }
function suitPrefix(suit: string) { if (suit === 'wan') return 'w'; if (suit === 'tong') return 'b'; return 't'; }
function findPlayerBySeat(players: LobbyPlayer[], seat: number) { return players.find((p) => p.seat === seat); }
function groupDiscardsBySeat(discards: { seat: number; tileCode: string; claimed?: boolean }[]) { const map: Record<number, string[]> = {}; for (const d of discards) { if (d.claimed) continue; if (!map[d.seat]) map[d.seat] = []; map[d.seat].push(d.tileCode); } return map; }

function Btn({ text, onPress, disabled = false }: { text: string; onPress: () => void; disabled?: boolean }) { return <Pressable style={[styles.btn, disabled && styles.btnDisabled]} disabled={disabled} onPress={onPress}><Text style={[styles.btnText, disabled && styles.btnTextDisabled]}>{text}</Text></Pressable>; }
function Tile({ code, small = false, selected = false, active = false, highlighted = false, onPress }: { code: string; small?: boolean; selected?: boolean; active?: boolean; highlighted?: boolean; onPress?: () => void }) {
  const pure = code.includes('@') ? code.split('@')[0] : code;
  const suit = pure[0]; const rank = Number(pure.slice(1)); const { label, color } = meta(suit);
  return <Pressable onPress={onPress} disabled={!onPress} style={[styles.tile, small && styles.tileSmall, selected && styles.tileSel, highlighted && styles.tileHighlight, !active && styles.tileInactive]}><Text style={[styles.corner, { color }]}>{label}</Text><Text style={[styles.rank, { color }]}>{rank}</Text><Text style={[styles.corner, { color, alignSelf: 'flex-end' }]}></Text></Pressable>;
}
function MiniTile({ code, highlighted = false }: { code: string; highlighted?: boolean }) { return <Tile code={code} small active highlighted={highlighted} />; }
function meta(s: string) { if (s === 'w') return { label: '萬', color: '#dc2626' }; if (s === 't') return { label: '条', color: '#16a34a' }; return { label: '筒', color: '#2563eb' }; }
function lackSuitToZh(s?: 'wan'|'tiao'|'tong'|null) {
  if (s === 'wan') return '万';
  if (s === 'tiao') return '条';
  if (s === 'tong') return '筒';
  return '未定';
}

function tileCodeToZh(code: string) {
  const pure = code.includes('@') ? code.split('@')[0] : code;
  const suit = pure[0];
  const rank = Number(pure.slice(1));
  if (suit === 'w') return `${rank}万`;
  if (suit === 't') return `${rank}条`;
  if (suit === 'b') return `${rank}筒`;
  return code;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0f172a' },
  wrap: { padding: 16, alignItems: 'center' },
  card: { width: 860, backgroundColor: '#111827', borderRadius: 14, padding: 14 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#334155', borderRadius: 8, color: '#e2e8f0', padding: 10, marginTop: 8 },
  nameInput: { minWidth: 180 },
  btn: { backgroundColor: '#1d4ed8', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  btnText: { color: '#fff', fontWeight: '600' },
  btnDisabled: { backgroundColor: '#334155' },
  btnTextDisabled: { color: '#94a3b8' },
  meta: { color: '#cbd5e1', marginTop: 4, fontSize: 12 },

  tablePanel: { marginTop: 12, borderWidth: 1, borderColor: '#334155', borderRadius: 12, padding: 10, backgroundColor: '#0b1220' },
  tableHeader: { marginBottom: 8 },
  tableTitle: { color: '#f8fafc', fontWeight: '700', fontSize: 16 },
  tableSurface: { borderRadius: 10, padding: 10, backgroundColor: '#0a3a32' },
  middleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8, columnGap: 10 },
  centerSpacer: { width: 250 },

  seatPanel: { minWidth: 200, minHeight: 66, borderWidth: 1, borderColor: '#1f2937', borderRadius: 8, backgroundColor: '#0f172a', padding: 8, alignSelf: 'center' },
  seatPanelVertical: { minWidth: 132, width: 132 },
  seatPanelLeft: { marginTop: 0, alignSelf: 'center' },
  seatPanelRight: { marginTop: 0, alignSelf: 'center' },
  seatPanelTurn: { borderColor: '#fbbf24', shadowColor: '#fbbf24', shadowOpacity: 0.45, shadowRadius: 8 },
  seatNameTurn: { color: '#fde68a' },
  seatName: { color: '#f8fafc', fontWeight: '700' },
  meldGroupWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  meldGroup: { borderWidth: 1, borderColor: '#334155', borderRadius: 6, padding: 3, backgroundColor: '#0b1220' },
  meldTilesRow: { flexDirection: 'row', gap: 2 },
  meldBadge: { color: '#94a3b8', fontSize: 10, textAlign: 'center', marginTop: 2 },

  centerHud: { width: 250, borderWidth: 1, borderColor: '#1f2937', borderRadius: 8, backgroundColor: '#111827', padding: 8, alignItems: 'center' },
  centerTitle: { color: '#f8fafc', fontWeight: '700' },
  lastDiscardBadge: { marginTop: 6, borderWidth: 1, borderColor: '#334155', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#0b1220' },
  lastDiscardBadgeFlash: { borderColor: '#f59e0b', backgroundColor: '#3f2a00' },
  lastDiscardText: { color: '#fef3c7', fontWeight: '700', fontSize: 12 },

  riversWrap: { width: '60%', alignSelf: 'center', marginTop: 8, borderWidth: 1, borderColor: '#14532d', borderRadius: 8, padding: 8, backgroundColor: '#064e3b' },
  bottomSeatWrap: { marginTop: 8, alignItems: 'center' },
  riverGrid: { alignItems: 'center', marginVertical: 2 },
  riverGridCompact: { width: '48%' },
  riverRow: { flexDirection: 'row', gap: 4, minHeight: 30, justifyContent: 'center' },
  riverMiddle: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 6 },
  riverPlaceholder: { width: 24, height: 34, borderRadius: 5, borderWidth: 1, borderColor: '#065f46', backgroundColor: '#065f46' },

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
  actionToast: { alignSelf: 'center', marginTop: 8, backgroundColor: '#312e81', borderColor: '#818cf8', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  actionToastText: { color: '#e0e7ff', fontWeight: '700' },
  settlementOverlay: { marginTop: 10, borderWidth: 1, borderColor: '#7c3aed', borderRadius: 10, padding: 10, backgroundColor: '#1f1147' },
  settlementTitle: { color: '#f5d0fe', fontWeight: '800', fontSize: 16 },
  settlementItem: { color: '#e9d5ff', marginTop: 4 },

  panel: { marginTop: 10, borderWidth: 1, borderColor: '#334155', borderRadius: 10, padding: 8, backgroundColor: '#0b1220' },
  title: { color: '#f8fafc', fontWeight: '700' },

  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, justifyContent: 'center' },
  tileRowDisabled: { opacity: 0.55 },
  tile: { width: 38, height: 58, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, backgroundColor: '#fff', padding: 4, justifyContent: 'space-between' },
  tileSmall: { width: 24, height: 34, borderRadius: 5, padding: 2 },
  tileSel: { borderColor: '#f59e0b', transform: [{ translateY: -2 }] },
  tileHighlight: { borderColor: '#fde047', borderWidth: 2, shadowColor: '#fde047', shadowOpacity: 0.5, shadowRadius: 4 },
  tileInactive: { opacity: 0.72, backgroundColor: '#f3f4f6' },
  corner: { fontSize: 9, fontWeight: '700' },
  rank: { fontSize: 20, fontWeight: '800', textAlign: 'center' }
});
