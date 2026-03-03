import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, Text, View, StyleSheet, TextInput, Pressable, ScrollView } from 'react-native';
import { createLobbyRuntime, type LobbyViewState } from './lobby-runtime';

type Lang = 'en' | 'zh';

const I18N: Record<Lang, Record<string, string>> = {
  en: {
    title: 'Mahjong Mac Client', subtitle: 'Lobby + Table Preview', mode: 'Mode', preview: 'Preview', live: 'Live', language: 'Language', wsUrl: 'WS URL',
    name: 'Name', room: 'Room ID', hello: 'Hello', create: 'Create', join: 'Join', addBot: 'Add Bot', ready: 'Ready',
    connected: 'Connected', yes: 'Yes', no: 'No', status: 'Status', players: 'Players', roomCard: 'Room Snapshot', phase: 'Phase', rounds: 'Rounds',
    tableCard: 'Table Preview', yourSeat: 'Your Seat', turnSeat: 'Turn Seat', hand: 'Your Hand', discards: 'Discards',
    roleHuman: 'Human', roleBot: 'Bot', readyYes: 'Ready', readyNo: 'Not Ready', onlineYes: 'Online', onlineNo: 'Offline',
    actionBusy: 'Processing...',
    detail_SOCKET_NOT_READY: 'Connection is not ready yet', detail_MISSING_NAME: 'Please set your name first', detail_NOT_CONNECTED: 'Not connected',
    status_idle: 'Idle', status_preview_connected: 'Preview connected', status_preview_disconnected: 'Preview disconnected',
    status_preview_hello: 'Hello {name} (preview mode)', status_preview_room_created: 'Room created (preview)', status_preview_room_joined: 'Join room {roomId} (preview)',
    status_connecting: 'Connecting: {wsUrl}', status_connected: 'Connected', status_disconnected: 'Disconnected', status_room_synced: 'Room synced ({players} players)', status_error: 'Error: {detail}'
  },
  zh: {
    title: '四川麻将 Mac 客户端', subtitle: '大厅 + 牌桌预览', mode: '模式', preview: '预览', live: '在线', language: '语言', wsUrl: 'WS 地址',
    name: '昵称', room: '房间号', hello: '确认昵称', create: '创建房间', join: '加入房间', addBot: '添加机器人', ready: '准备',
    connected: '已连接', yes: '是', no: '否', status: '状态', players: '玩家', roomCard: '房间快照', phase: '阶段', rounds: '局数',
    tableCard: '牌桌预览', yourSeat: '我的座位', turnSeat: '当前行动座位', hand: '我的手牌', discards: '弃牌池',
    roleHuman: '真人', roleBot: '机器人', readyYes: '已准备', readyNo: '未准备', onlineYes: '在线', onlineNo: '离线',
    actionBusy: '处理中...',
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
  const [state, setState] = useState<LobbyViewState>({
    name: '', roomId: '', players: [], connected: false, statusKey: 'idle', yourHandCodes: [], discards: []
  });

  const runtime = useMemo(() => createLobbyRuntime({
    mode,
    wsUrl,
    onState: (patch) => setState((s) => ({
      ...s,
      ...patch,
      ...(patch.connected === false ? { players: [], roomId: '', roomPhase: '-', roundNo: 0, maxRounds: 0, yourHandCodes: [], discards: [] } : {})
    }))
  }), [mode, wsUrl]);

  useEffect(() => {
    runtime.connect();
    return () => runtime.disconnect();
  }, [runtime]);

  const statusText = (() => {
    const vars = { ...(state.statusArgs || {}) } as Record<string, string | number>;
    const detail = String(vars.detail || '');
    if (detail && I18N[lang][`detail_${detail}`]) {
      vars.detail = I18N[lang][`detail_${detail}`];
    }
    return tf(lang, `status_${state.statusKey}`, vars);
  })();

  async function runAction(fn: () => boolean) {
    if (busy) return;
    setBusy(true);
    try {
      const ok = fn();
      if (!ok) {
        setState((s) => (s.statusKey === 'error' ? s : { ...s, statusKey: 'error', statusArgs: { detail: 'NOT_CONNECTED' } }));
      } else {
        setState((s) => (s.statusKey === 'error' ? { ...s, statusKey: 'connected', statusArgs: {} } : s));
      }
    } finally {
      setTimeout(() => setBusy(false), 280);
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

          {busy ? <Text style={styles.busyHint}>{tf(lang, 'actionBusy')}</Text> : null}

          <Text style={styles.meta}>{tf(lang, 'connected')}: {state.connected ? tf(lang, 'yes') : tf(lang, 'no')}</Text>
          <Text style={styles.meta}>{tf(lang, 'status')}: {statusText}</Text>

          <View style={styles.roomCard}>
            <Text style={styles.roomTitle}>{tf(lang, 'roomCard')}</Text>
            <Text style={styles.roomMeta}>{tf(lang, 'room')}: {state.roomId || '-'}</Text>
            <Text style={styles.roomMeta}>{tf(lang, 'phase')}: {state.roomPhase || '-'}</Text>
            <Text style={styles.roomMeta}>{tf(lang, 'rounds')}: {(state.roundNo ?? 0)}/{state.maxRounds ?? 0}</Text>
            <Text style={[styles.roomMeta, { marginTop: 8 }]}>{tf(lang, 'players')}:</Text>
            {(state.players || []).length === 0 ? <Text style={styles.playerLine}>-</Text> : state.players.map((p, idx) => (
              <Text key={`${p.name}-${idx}`} style={styles.playerLine}>{idx + 1}. {p.name} · {p.isBot ? tf(lang, 'roleBot') : tf(lang, 'roleHuman')} · {p.ready ? tf(lang, 'readyYes') : tf(lang, 'readyNo')} · {p.online ? tf(lang, 'onlineYes') : tf(lang, 'onlineNo')}</Text>
            ))}
          </View>

          <View style={styles.roomCard}>
            <Text style={styles.roomTitle}>{tf(lang, 'tableCard')}</Text>
            <Text style={styles.roomMeta}>{tf(lang, 'phase')}: {state.gamePhase || '-'}</Text>
            <Text style={styles.roomMeta}>{tf(lang, 'yourSeat')}: {state.yourSeat ?? '-'}</Text>
            <Text style={styles.roomMeta}>{tf(lang, 'turnSeat')}: {state.turnSeat ?? '-'}</Text>
            <Text style={[styles.roomMeta, { marginTop: 8 }]}>{tf(lang, 'hand')}:</Text>
            <View style={styles.tileRow}>{(state.yourHandCodes || []).length === 0 ? <Text style={styles.playerLine}>-</Text> : state.yourHandCodes.map((c, i) => <Tile key={`${c}-${i}`} code={c} />)}</View>
            <Text style={[styles.roomMeta, { marginTop: 8 }]}>{tf(lang, 'discards')}:</Text>
            <View style={styles.tileRow}>{(state.discards || []).length === 0 ? <Text style={styles.playerLine}>-</Text> : state.discards.map((d, i) => <Tile key={`${d.tileCode}-${i}`} code={`${d.tileCode}@${d.seat}`} />)}</View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionButton({ text, onPress, active = true, disabled = false }: { text: string; onPress: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <Pressable style={[styles.button, !active && styles.buttonInactive, disabled && styles.buttonDisabled]} onPress={onPress} disabled={disabled}>
      <Text style={styles.buttonText}>{text}</Text>
    </Pressable>
  );
}

function Tile({ code }: { code: string }) {
  return <View style={styles.tile}><Text style={styles.tileText}>{code}</Text></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0f172a' },
  scrollWrap: { padding: 16, alignItems: 'center' },
  card: { width: 760, borderRadius: 16, padding: 20, backgroundColor: '#111827' },
  title: { color: '#f8fafc', fontSize: 24, fontWeight: '700' },
  subtitle: { color: '#cbd5e1', marginTop: 8, fontSize: 16 },
  formRow: { marginTop: 14 },
  label: { color: '#94a3b8', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#334155', borderRadius: 10, color: '#e2e8f0', paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 14, flexWrap: 'wrap' },
  button: { backgroundColor: '#1d4ed8', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  buttonInactive: { backgroundColor: '#334155' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600' },
  busyHint: { color: '#f59e0b', marginTop: 8 },
  meta: { marginTop: 12, color: '#cbd5e1' },
  roomCard: { marginTop: 14, borderWidth: 1, borderColor: '#334155', borderRadius: 12, padding: 12, backgroundColor: '#0b1220' },
  roomTitle: { color: '#f8fafc', fontWeight: '700' },
  roomMeta: { color: '#cbd5e1', marginTop: 4 },
  playerLine: { color: '#94a3b8', marginTop: 4 },
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tile: { borderWidth: 1, borderColor: '#475569', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#1e293b' },
  tileText: { color: '#e2e8f0', fontSize: 12 }
});
