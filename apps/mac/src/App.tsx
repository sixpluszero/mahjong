import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, Text, View, StyleSheet, TextInput, Pressable, ScrollView } from 'react-native';
import { createLobbyRuntime, type LobbyViewState, type HandTile, type Meld } from './lobby-runtime';

type Lang = 'en' | 'zh';

const I18N: Record<Lang, Record<string, string>> = {
  en: {
    title: 'Mahjong Mac Client', subtitle: 'Lobby + Table Preview', mode: 'Mode', preview: 'Preview', live: 'Live', language: 'Language', wsUrl: 'WS URL',
    name: 'Name', room: 'Room ID', hello: 'Hello', create: 'Create', join: 'Join', addBot: 'Add Bot', ready: 'Ready', submitExchange: 'Submit Exchange', chooseLack: 'Choose Lack',
    reactHu: 'Hu', reactGang: 'Gang', reactPeng: 'Peng', reactPass: 'Pass', selfHu: 'Self Hu',
    connected: 'Connected', yes: 'Yes', no: 'No', status: 'Status', tableCard: 'Table Preview', yourSeat: 'Your Seat', turnSeat: 'Turn Seat', hand: 'Your Hand', discards: 'Discards',
    actionBusy: 'Processing...', exchangeHint: 'Exchange: select 3 tiles', playHint: 'Play: click tile to discard',
    lackWan: 'Lack Wan', lackTiao: 'Lack Tiao', lackTong: 'Lack Tong',
    detail_SOCKET_NOT_READY: 'Connection is not ready yet', detail_MISSING_NAME: 'Please set your name first', detail_NOT_CONNECTED: 'Not connected',
    status_idle: 'Idle', status_preview_connected: 'Preview connected', status_preview_disconnected: 'Preview disconnected',
    status_preview_hello: 'Hello {name} (preview mode)', status_preview_room_created: 'Room created (preview)', status_preview_room_joined: 'Join room {roomId} (preview)',
    status_connecting: 'Connecting: {wsUrl}', status_connected: 'Connected', status_disconnected: 'Disconnected', status_room_synced: 'Room synced ({players} players)', status_error: 'Error: {detail}'
  },
  zh: {
    title: '四川麻将 Mac 客户端', subtitle: '大厅 + 牌桌预览', mode: '模式', preview: '预览', live: '在线', language: '语言', wsUrl: 'WS 地址',
    name: '昵称', room: '房间号', hello: '确认昵称', create: '创建房间', join: '加入房间', addBot: '添加机器人', ready: '准备', submitExchange: '提交换三张', chooseLack: '选择定缺',
    reactHu: '胡', reactGang: '杠', reactPeng: '碰', reactPass: '过', selfHu: '自摸胡',
    connected: '已连接', yes: '是', no: '否', status: '状态', tableCard: '牌桌预览', yourSeat: '我的座位', turnSeat: '当前行动座位', hand: '我的手牌', discards: '弃牌池',
    actionBusy: '处理中...', exchangeHint: '换三张：先选 3 张', playHint: '出牌：点击手牌直接出牌',
    lackWan: '定缺万', lackTiao: '定缺条', lackTong: '定缺筒',
    detail_SOCKET_NOT_READY: '连接尚未就绪，请稍后再试', detail_MISSING_NAME: '请先设置昵称', detail_NOT_CONNECTED: '当前未连接',
    status_idle: '空闲', status_preview_connected: '预览模式已连接', status_preview_disconnected: '预览模式已断开',
    status_preview_hello: '你好，{name}（预览模式）', status_preview_room_created: '已创建房间（预览）', status_preview_room_joined: '已加入房间 {roomId}（预览）',
    status_connecting: '正在连接：{wsUrl}', status_connected: '已连接', status_disconnected: '已断开', status_room_synced: '房间同步完成（{players} 人）', status_error: '错误：{detail}'
  }
};

function tf(lang: Lang, key: string, vars?: Record<string, string | number>) {
  const tpl = I18N[lang][key] || key;
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars?.[k] ?? ''));
}

export default function App(): JSX.Element {
  const [lang, setLang] = useState<Lang>('zh');
  const [mode, setMode] = useState<'preview' | 'live'>('preview');
  const [wsUrl, setWsUrl] = useState('ws://127.0.0.1:8787');
  const [busy, setBusy] = useState(false);
  const [exchangeSelected, setExchangeSelected] = useState<string[]>([]);
  const [state, setState] = useState<LobbyViewState>({
    name: '', roomId: '', players: [], connected: false, statusKey: 'idle', yourHandTiles: [], discards: [], yourMelds: [], canSelfHu: false, pendingReaction: null
  });

  const runtime = useMemo(() => createLobbyRuntime({ mode, wsUrl, onState: (patch) => setState((s) => ({ ...s, ...patch })) }), [mode, wsUrl]);

  useEffect(() => { runtime.connect(); return () => runtime.disconnect(); }, [runtime]);
  useEffect(() => { if (state.gamePhase !== 'exchange') setExchangeSelected([]); }, [state.gamePhase]);

  const latestDrawIndex = state.yourHandTiles.length > 0 ? state.yourHandTiles.length - 1 : -1;
  const canDiscard = state.gamePhase === 'play' && state.turnSeat === state.yourSeat;
  const inExchange = state.gamePhase === 'exchange';
  const inLack = state.gamePhase === 'lack';

  const anGangCandidates = findAnGangCandidates(state.yourHandTiles);
  const buGangCandidates = findBuGangCandidates(state.yourHandTiles, state.yourMelds);

  const statusText = (() => {
    const vars = { ...(state.statusArgs || {}) } as Record<string, string | number>;
    const detail = String(vars.detail || '');
    if (detail && I18N[lang][`detail_${detail}`]) vars.detail = I18N[lang][`detail_${detail}`];
    return tf(lang, `status_${state.statusKey}`, vars);
  })();

  async function runAction(fn: () => boolean) {
    if (busy) return;
    setBusy(true);
    try { fn(); } finally { setTimeout(() => setBusy(false), 160); }
  }

  function onTilePress(tile: HandTile) {
    if (busy) return;
    if (inExchange) {
      setExchangeSelected((prev) => prev.includes(tile.id) ? prev.filter((x) => x !== tile.id) : (prev.length >= 3 ? prev : [...prev, tile.id]));
      return;
    }
    if (canDiscard) runAction(() => runtime.discard(tile.id));
  }

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.scrollWrap}>
        <View style={styles.card}>
          <Text style={styles.title}>{tf(lang, 'title')}</Text>
          <Text style={styles.subtitle}>{tf(lang, 'subtitle')}</Text>

          <View style={styles.actionsRow}><ActionButton text="中文" onPress={() => setLang('zh')} active={lang === 'zh'} /><ActionButton text="EN" onPress={() => setLang('en')} active={lang === 'en'} /><ActionButton text={tf(lang, 'preview')} onPress={() => setMode('preview')} active={mode === 'preview'} /><ActionButton text={tf(lang, 'live')} onPress={() => setMode('live')} active={mode === 'live'} /></View>
          <View style={styles.formRow}><TextInput value={wsUrl} onChangeText={setWsUrl} placeholder="ws://127.0.0.1:8787" placeholderTextColor="#64748b" style={styles.input} editable={!busy} /></View>
          <View style={styles.formRow}><TextInput value={state.name} onChangeText={(name) => setState((s) => ({ ...s, name }))} placeholder="Name" placeholderTextColor="#64748b" style={styles.input} editable={!busy} /></View>
          <View style={styles.formRow}><TextInput value={state.roomId} onChangeText={(roomId) => setState((s) => ({ ...s, roomId: roomId.toUpperCase() }))} placeholder="Room" placeholderTextColor="#64748b" style={styles.input} editable={!busy} /></View>

          <View style={styles.actionsRow}><ActionButton text={tf(lang, 'hello')} onPress={() => runAction(() => runtime.hello(state.name))} disabled={busy} /><ActionButton text={tf(lang, 'create')} onPress={() => runAction(() => runtime.createRoom())} disabled={busy} /><ActionButton text={tf(lang, 'join')} onPress={() => runAction(() => runtime.joinRoom(state.roomId))} disabled={busy} /><ActionButton text={tf(lang, 'addBot')} onPress={() => runAction(() => runtime.addBot())} disabled={busy} /><ActionButton text={tf(lang, 'ready')} onPress={() => runAction(() => runtime.setReady())} disabled={busy} /></View>

          {state.pendingReaction ? (
            <View style={styles.actionsRow}>
              {state.pendingReaction.canHu ? <ActionButton text={tf(lang, 'reactHu')} onPress={() => runAction(() => runtime.react('hu'))} disabled={busy} /> : null}
              {state.pendingReaction.canGang ? <ActionButton text={tf(lang, 'reactGang')} onPress={() => runAction(() => runtime.react('gang'))} disabled={busy} /> : null}
              {state.pendingReaction.canPeng ? <ActionButton text={tf(lang, 'reactPeng')} onPress={() => runAction(() => runtime.react('peng'))} disabled={busy} /> : null}
              <ActionButton text={tf(lang, 'reactPass')} onPress={() => runAction(() => runtime.react('pass'))} disabled={busy} />
            </View>
          ) : null}

          {!state.pendingReaction && canDiscard && state.canSelfHu ? <View style={styles.actionsRow}><ActionButton text={tf(lang, 'selfHu')} onPress={() => runAction(() => runtime.selfHu())} disabled={busy} /></View> : null}
          {!state.pendingReaction && canDiscard && anGangCandidates.map((t) => <View key={`ag-${t.id}`} style={styles.actionsRow}><ActionButton text={`暗杠 ${t.code}`} onPress={() => runAction(() => runtime.anGang(t.id))} disabled={busy} /></View>)}
          {!state.pendingReaction && canDiscard && buGangCandidates.map((t) => <View key={`bg-${t.id}`} style={styles.actionsRow}><ActionButton text={`补杠 ${t.code}`} onPress={() => runAction(() => runtime.buGang(t.id))} disabled={busy} /></View>)}

          {inExchange ? <View style={styles.actionsRow}><Text style={styles.phaseHint}>{tf(lang, 'exchangeHint')} ({exchangeSelected.length}/3)</Text><ActionButton text={tf(lang, 'submitExchange')} onPress={() => runAction(() => runtime.submitExchange(exchangeSelected))} disabled={busy || exchangeSelected.length !== 3} /></View> : null}
          {inLack ? <View style={styles.actionsRow}><ActionButton text={tf(lang, 'lackWan')} onPress={() => runAction(() => runtime.setLack('wan'))} disabled={busy} /><ActionButton text={tf(lang, 'lackTiao')} onPress={() => runAction(() => runtime.setLack('tiao'))} disabled={busy} /><ActionButton text={tf(lang, 'lackTong')} onPress={() => runAction(() => runtime.setLack('tong'))} disabled={busy} /></View> : null}
          {canDiscard ? <Text style={styles.phaseHint}>{tf(lang, 'playHint')}</Text> : null}

          <Text style={styles.meta}>{tf(lang, 'status')}: {statusText}</Text>
          <Text style={styles.meta}>{tf(lang, 'phase')}: {state.gamePhase || '-'}</Text>

          <View style={styles.roomCard}>
            <Text style={styles.roomTitle}>{tf(lang, 'hand')}</Text>
            <View style={styles.tileRow}>{state.yourHandTiles.map((t, i) => <Tile key={t.id} code={t.code} selected={exchangeSelected.includes(t.id) || (i === latestDrawIndex && !inExchange)} onPress={() => onTilePress(t)} />)}</View>
            <Text style={[styles.roomMeta, { marginTop: 8 }]}>{tf(lang, 'discards')}:</Text>
            <View style={styles.tileRow}>{state.discards.map((d, i) => <Tile key={`${d.tileCode}-${i}`} code={`${d.tileCode}@${d.seat}`} small />)}</View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function findAnGangCandidates(hand: HandTile[]) {
  const map = new Map<string, HandTile[]>();
  for (const t of hand) {
    const k = `${t.suit}-${t.rank}`;
    map.set(k, [...(map.get(k) || []), t]);
  }
  return [...map.values()].filter((x) => x.length >= 4).map((x) => x[0]);
}

function findBuGangCandidates(hand: HandTile[], melds: Meld[]) {
  const keys = new Set((melds || []).filter((m) => m.type === 'peng').map((m) => `${m.tile.suit}-${m.tile.rank}`));
  return hand.filter((t) => keys.has(`${t.suit}-${t.rank}`));
}

function ActionButton({ text, onPress, active = true, disabled = false }: { text: string; onPress: () => void; active?: boolean; disabled?: boolean }) {
  return <Pressable style={[styles.button, !active && styles.buttonInactive, disabled && styles.buttonDisabled]} onPress={onPress} disabled={disabled}><Text style={styles.buttonText}>{text}</Text></Pressable>;
}

function Tile({ code, small = false, selected = false, onPress }: { code: string; small?: boolean; selected?: boolean; onPress?: () => void }) {
  const pureCode = code.includes('@') ? code.split('@')[0] : code;
  const seatSuffix = code.includes('@') ? `S${code.split('@')[1]}` : '';
  const suit = pureCode[0];
  const rank = Number(pureCode.slice(1));
  const { suitLabel, color } = suitMeta(suit);
  return <Pressable onPress={onPress} disabled={!onPress} style={[styles.tile, small && styles.tileSmall, selected && styles.tileSelected]}><Text style={[styles.tileCorner, { color }]}>{suitLabel}</Text><Text style={[styles.tileRank, { color }, small && styles.tileRankSmall]}>{Number.isFinite(rank) ? rank : '?'}</Text><View style={styles.tileFootRow}><Text style={[styles.tileBottom, { color }]}>{suitLabel}</Text>{seatSuffix ? <Text style={styles.tileSeat}>{seatSuffix}</Text> : null}</View></Pressable>;
}

function suitMeta(suit: string) { if (suit === 'w') return { suitLabel: '萬', color: '#dc2626' }; if (suit === 't') return { suitLabel: '条', color: '#16a34a' }; return { suitLabel: '筒', color: '#2563eb' }; }

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0f172a' }, scrollWrap: { padding: 16, alignItems: 'center' }, card: { width: 760, borderRadius: 16, padding: 20, backgroundColor: '#111827' },
  title: { color: '#f8fafc', fontSize: 24, fontWeight: '700' }, subtitle: { color: '#cbd5e1', marginTop: 8, fontSize: 16 }, formRow: { marginTop: 10 }, input: { borderWidth: 1, borderColor: '#334155', borderRadius: 10, color: '#e2e8f0', paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }, button: { backgroundColor: '#1d4ed8', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }, buttonInactive: { backgroundColor: '#334155' }, buttonDisabled: { opacity: 0.5 }, buttonText: { color: '#fff', fontWeight: '600' },
  phaseHint: { color: '#93c5fd', marginTop: 8 }, meta: { marginTop: 8, color: '#cbd5e1' }, roomCard: { marginTop: 12, borderWidth: 1, borderColor: '#334155', borderRadius: 12, padding: 10, backgroundColor: '#0b1220' }, roomTitle: { color: '#f8fafc', fontWeight: '700' }, roomMeta: { color: '#cbd5e1', marginTop: 4 },
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tile: { width: 40, height: 62, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, backgroundColor: '#fff', paddingHorizontal: 4, paddingVertical: 4, justifyContent: 'space-between', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  tileSmall: { width: 36, height: 52, borderRadius: 7 }, tileSelected: { borderColor: '#f59e0b', shadowColor: '#f59e0b', shadowOpacity: 0.45, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, transform: [{ translateY: -2 }] },
  tileCorner: { fontSize: 10, fontWeight: '700' }, tileRank: { fontSize: 22, fontWeight: '800', textAlign: 'center', lineHeight: 24 }, tileRankSmall: { fontSize: 18, lineHeight: 20 }, tileFootRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, tileBottom: { fontSize: 10, fontWeight: '700' }, tileSeat: { fontSize: 8, color: '#64748b' }
});
