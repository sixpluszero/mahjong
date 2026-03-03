import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, Text, View, StyleSheet, TextInput, Pressable, ScrollView } from 'react-native';
import { createLobbyRuntime, type LobbyViewState, type HandTile } from './lobby-runtime';

type Lang = 'en' | 'zh';

const I18N: Record<Lang, Record<string, string>> = {
  en: {
    title: 'Mahjong Mac Client', subtitle: 'Lobby + Table Preview', mode: 'Mode', preview: 'Preview', live: 'Live', language: 'Language', wsUrl: 'WS URL',
    name: 'Name', room: 'Room ID', hello: 'Hello', create: 'Create', join: 'Join', addBot: 'Add Bot', ready: 'Ready',
    submitExchange: 'Submit Exchange', chooseLack: 'Choose Lack',
    connected: 'Connected', yes: 'Yes', no: 'No', status: 'Status', players: 'Players', roomCard: 'Room Snapshot', phase: 'Phase', rounds: 'Rounds',
    tableCard: 'Table Preview', yourSeat: 'Your Seat', turnSeat: 'Turn Seat', hand: 'Your Hand (click to play/select)', discards: 'Discards',
    roleHuman: 'Human', roleBot: 'Bot', readyYes: 'Ready', readyNo: 'Not Ready', onlineYes: 'Online', onlineNo: 'Offline',
    actionBusy: 'Processing...', exchangeHint: 'Exchange phase: select 3 tiles', playHint: 'Play phase: click a tile to discard',
    lackWan: 'Lack Wan', lackTiao: 'Lack Tiao', lackTong: 'Lack Tong',
    detail_SOCKET_NOT_READY: 'Connection is not ready yet', detail_MISSING_NAME: 'Please set your name first', detail_NOT_CONNECTED: 'Not connected',
    status_idle: 'Idle', status_preview_connected: 'Preview connected', status_preview_disconnected: 'Preview disconnected',
    status_preview_hello: 'Hello {name} (preview mode)', status_preview_room_created: 'Room created (preview)', status_preview_room_joined: 'Join room {roomId} (preview)',
    status_connecting: 'Connecting: {wsUrl}', status_connected: 'Connected', status_disconnected: 'Disconnected', status_room_synced: 'Room synced ({players} players)', status_error: 'Error: {detail}'
  },
  zh: {
    title: '四川麻将 Mac 客户端', subtitle: '大厅 + 牌桌预览', mode: '模式', preview: '预览', live: '在线', language: '语言', wsUrl: 'WS 地址',
    name: '昵称', room: '房间号', hello: '确认昵称', create: '创建房间', join: '加入房间', addBot: '添加机器人', ready: '准备',
    submitExchange: '提交换三张', chooseLack: '选择定缺',
    connected: '已连接', yes: '是', no: '否', status: '状态', players: '玩家', roomCard: '房间快照', phase: '阶段', rounds: '局数',
    tableCard: '牌桌预览', yourSeat: '我的座位', turnSeat: '当前行动座位', hand: '我的手牌（可点击）', discards: '弃牌池',
    roleHuman: '真人', roleBot: '机器人', readyYes: '已准备', readyNo: '未准备', onlineYes: '在线', onlineNo: '离线',
    actionBusy: '处理中...', exchangeHint: '换三张阶段：先选 3 张再提交', playHint: '出牌阶段：点击手牌直接出牌',
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
    name: '', roomId: '', players: [], connected: false, statusKey: 'idle', yourHandTiles: [], discards: []
  });

  const runtime = useMemo(() => createLobbyRuntime({
    mode,
    wsUrl,
    onState: (patch) => setState((s) => ({
      ...s,
      ...patch,
      ...(patch.connected === false ? { players: [], roomId: '', roomPhase: '-', roundNo: 0, maxRounds: 0, yourHandTiles: [], discards: [] } : {})
    }))
  }), [mode, wsUrl]);

  useEffect(() => {
    runtime.connect();
    return () => runtime.disconnect();
  }, [runtime]);

  useEffect(() => {
    if (state.gamePhase !== 'exchange') setExchangeSelected([]);
  }, [state.gamePhase]);

  const latestDrawIndex = state.yourHandTiles.length > 0 ? state.yourHandTiles.length - 1 : -1;
  const canDiscard = state.gamePhase === 'play' && state.turnSeat === state.yourSeat;
  const inExchange = state.gamePhase === 'exchange';
  const inLack = state.gamePhase === 'lack';

  const statusText = (() => {
    const vars = { ...(state.statusArgs || {}) } as Record<string, string | number>;
    const detail = String(vars.detail || '');
    if (detail && I18N[lang][`detail_${detail}`]) vars.detail = I18N[lang][`detail_${detail}`];
    return tf(lang, `status_${state.statusKey}`, vars);
  })();

  async function runAction(fn: () => boolean) {
    if (busy) return;
    setBusy(true);
    try {
      const ok = fn();
      if (!ok) setState((s) => (s.statusKey === 'error' ? s : { ...s, statusKey: 'error', statusArgs: { detail: 'NOT_CONNECTED' } }));
    } finally {
      setTimeout(() => setBusy(false), 180);
    }
  }

  function onTilePress(tile: HandTile) {
    if (busy) return;
    if (inExchange) {
      setExchangeSelected((prev) => {
        if (prev.includes(tile.id)) return prev.filter((x) => x !== tile.id);
        if (prev.length >= 3) return prev;
        return [...prev, tile.id];
      });
      return;
    }
    if (canDiscard) {
      runAction(() => runtime.discard(tile.id));
    }
  }

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.scrollWrap}>
        <View style={styles.card}>
          <Text style={styles.title}>{tf(lang, 'title')}</Text>
          <Text style={styles.subtitle}>{tf(lang, 'subtitle')}</Text>

          <View style={styles.formRow}><Text style={styles.label}>{tf(lang, 'language')}</Text><View style={styles.actionsRow}><ActionButton text="中文" onPress={() => setLang('zh')} active={lang === 'zh'} /><ActionButton text="EN" onPress={() => setLang('en')} active={lang === 'en'} /></View></View>
          <View style={styles.formRow}><Text style={styles.label}>{tf(lang, 'mode')}</Text><View style={styles.actionsRow}><ActionButton text={tf(lang, 'preview')} onPress={() => setMode('preview')} active={mode === 'preview'} /><ActionButton text={tf(lang, 'live')} onPress={() => setMode('live')} active={mode === 'live'} /></View></View>

          <View style={styles.formRow}><Text style={styles.label}>{tf(lang, 'wsUrl')}</Text><TextInput value={wsUrl} onChangeText={setWsUrl} placeholder="ws://127.0.0.1:8787" placeholderTextColor="#64748b" style={styles.input} editable={!busy} /></View>
          <View style={styles.formRow}><Text style={styles.label}>{tf(lang, 'name')}</Text><TextInput value={state.name} onChangeText={(name) => setState((s) => ({ ...s, name }))} placeholder="PlayerA" placeholderTextColor="#64748b" style={styles.input} editable={!busy} /></View>
          <View style={styles.formRow}><Text style={styles.label}>{tf(lang, 'room')}</Text><TextInput value={state.roomId} onChangeText={(roomId) => setState((s) => ({ ...s, roomId: roomId.toUpperCase() }))} placeholder="ABC123" placeholderTextColor="#64748b" style={styles.input} editable={!busy} /></View>

          <View style={styles.actionsRow}><ActionButton text={tf(lang, 'hello')} onPress={() => runAction(() => runtime.hello(state.name))} disabled={busy} /><ActionButton text={tf(lang, 'create')} onPress={() => runAction(() => runtime.createRoom())} disabled={busy} /><ActionButton text={tf(lang, 'join')} onPress={() => runAction(() => runtime.joinRoom(state.roomId))} disabled={busy} /></View>
          <View style={styles.actionsRow}><ActionButton text={tf(lang, 'addBot')} onPress={() => runAction(() => runtime.addBot())} disabled={busy} /><ActionButton text={tf(lang, 'ready')} onPress={() => runAction(() => runtime.setReady())} disabled={busy} /></View>

          {inExchange ? (
            <View style={styles.actionsRow}>
              <Text style={styles.phaseHint}>{tf(lang, 'exchangeHint')} ({exchangeSelected.length}/3)</Text>
              <ActionButton text={tf(lang, 'submitExchange')} onPress={() => runAction(() => runtime.submitExchange(exchangeSelected))} disabled={busy || exchangeSelected.length !== 3} />
            </View>
          ) : null}

          {inLack ? (
            <View style={styles.actionsRow}>
              <Text style={styles.phaseHint}>{tf(lang, 'chooseLack')}</Text>
              <ActionButton text={tf(lang, 'lackWan')} onPress={() => runAction(() => runtime.setLack('wan'))} disabled={busy} />
              <ActionButton text={tf(lang, 'lackTiao')} onPress={() => runAction(() => runtime.setLack('tiao'))} disabled={busy} />
              <ActionButton text={tf(lang, 'lackTong')} onPress={() => runAction(() => runtime.setLack('tong'))} disabled={busy} />
            </View>
          ) : null}

          {canDiscard ? <Text style={styles.phaseHint}>{tf(lang, 'playHint')}</Text> : null}
          {busy ? <Text style={styles.busyHint}>{tf(lang, 'actionBusy')}</Text> : null}

          <Text style={styles.meta}>{tf(lang, 'connected')}: {state.connected ? tf(lang, 'yes') : tf(lang, 'no')}</Text>
          <Text style={styles.meta}>{tf(lang, 'status')}: {statusText}</Text>

          <View style={styles.roomCard}>
            <Text style={styles.roomTitle}>{tf(lang, 'tableCard')}</Text>
            <Text style={styles.roomMeta}>{tf(lang, 'phase')}: {state.gamePhase || '-'}</Text>
            <Text style={styles.roomMeta}>{tf(lang, 'yourSeat')}: {state.yourSeat ?? '-'}</Text>
            <Text style={styles.roomMeta}>{tf(lang, 'turnSeat')}: {state.turnSeat ?? '-'}</Text>
            <Text style={[styles.roomMeta, { marginTop: 8 }]}>{tf(lang, 'hand')}:</Text>
            <View style={styles.tileRow}>{(state.yourHandTiles || []).length === 0 ? <Text style={styles.playerLine}>-</Text> : state.yourHandTiles.map((t, i) => <Tile key={t.id} code={t.code} selected={exchangeSelected.includes(t.id) || (i === latestDrawIndex && !inExchange)} onPress={() => onTilePress(t)} />)}</View>
            <Text style={[styles.roomMeta, { marginTop: 8 }]}>{tf(lang, 'discards')}:</Text>
            <View style={styles.tileRow}>{(state.discards || []).length === 0 ? <Text style={styles.playerLine}>-</Text> : state.discards.map((d, i) => <Tile key={`${d.tileCode}-${i}`} code={`${d.tileCode}@${d.seat}`} small />)}</View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
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
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[styles.tile, small && styles.tileSmall, selected && styles.tileSelected]}>
      <Text style={[styles.tileCorner, { color }]}>{suitLabel}</Text>
      <Text style={[styles.tileRank, { color }, small && styles.tileRankSmall]}>{Number.isFinite(rank) ? rank : '?'}</Text>
      <View style={styles.tileFootRow}><Text style={[styles.tileBottom, { color }]}>{suitLabel}</Text>{seatSuffix ? <Text style={styles.tileSeat}>{seatSuffix}</Text> : null}</View>
    </Pressable>
  );
}

function suitMeta(suit: string) {
  if (suit === 'w') return { suitLabel: '萬', color: '#dc2626' };
  if (suit === 't') return { suitLabel: '条', color: '#16a34a' };
  return { suitLabel: '筒', color: '#2563eb' };
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0f172a' }, scrollWrap: { padding: 16, alignItems: 'center' },
  card: { width: 760, borderRadius: 16, padding: 20, backgroundColor: '#111827' }, title: { color: '#f8fafc', fontSize: 24, fontWeight: '700' }, subtitle: { color: '#cbd5e1', marginTop: 8, fontSize: 16 },
  formRow: { marginTop: 14 }, label: { color: '#94a3b8', marginBottom: 6 }, input: { borderWidth: 1, borderColor: '#334155', borderRadius: 10, color: '#e2e8f0', paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 14, flexWrap: 'wrap' },
  button: { backgroundColor: '#1d4ed8', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 }, buttonInactive: { backgroundColor: '#334155' }, buttonDisabled: { opacity: 0.5 }, buttonText: { color: '#fff', fontWeight: '600' },
  phaseHint: { color: '#93c5fd', marginTop: 8 }, busyHint: { color: '#f59e0b', marginTop: 8 }, meta: { marginTop: 12, color: '#cbd5e1' },
  roomCard: { marginTop: 14, borderWidth: 1, borderColor: '#334155', borderRadius: 12, padding: 12, backgroundColor: '#0b1220' }, roomTitle: { color: '#f8fafc', fontWeight: '700' }, roomMeta: { color: '#cbd5e1', marginTop: 4 }, playerLine: { color: '#94a3b8', marginTop: 4 },
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tile: { width: 40, height: 62, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, backgroundColor: '#fff', paddingHorizontal: 4, paddingVertical: 4, justifyContent: 'space-between', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  tileSmall: { width: 36, height: 52, borderRadius: 7 }, tileSelected: { borderColor: '#f59e0b', shadowColor: '#f59e0b', shadowOpacity: 0.45, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, transform: [{ translateY: -2 }] },
  tileCorner: { fontSize: 10, fontWeight: '700' }, tileRank: { fontSize: 22, fontWeight: '800', textAlign: 'center', lineHeight: 24 }, tileRankSmall: { fontSize: 18, lineHeight: 20 }, tileFootRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, tileBottom: { fontSize: 10, fontWeight: '700' }, tileSeat: { fontSize: 8, color: '#64748b' }
});
