import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, Text, View, StyleSheet, TextInput, Pressable } from 'react-native';
import { createLobbyRuntime, type LobbyViewState } from './lobby-runtime';

type Lang = 'en' | 'zh';

const I18N: Record<Lang, Record<string, string>> = {
  en: {
    title: 'Mahjong Mac Client',
    subtitle: 'Lobby MVP',
    mode: 'Mode',
    preview: 'Preview',
    live: 'Live',
    language: 'Language',
    wsUrl: 'WS URL',
    name: 'Name',
    room: 'Room ID',
    hello: 'Hello',
    create: 'Create',
    join: 'Join',
    addBot: 'Add Bot',
    ready: 'Ready',
    connected: 'Connected',
    yes: 'Yes',
    no: 'No',
    status: 'Status',
    players: 'Players',
    roomCard: 'Room Snapshot',
    phase: 'Phase',
    rounds: 'Rounds',
    roleHuman: 'Human',
    roleBot: 'Bot',
    readyYes: 'Ready',
    readyNo: 'Not Ready',
    onlineYes: 'Online',
    onlineNo: 'Offline',
    status_idle: 'Idle',
    status_preview_connected: 'Preview connected',
    status_preview_disconnected: 'Preview disconnected',
    status_preview_hello: 'Hello {name} (preview mode)',
    status_preview_room_created: 'Room created (preview)',
    status_preview_room_joined: 'Join room {roomId} (preview)',
    status_connecting: 'Connecting: {wsUrl}',
    status_connected: 'Connected',
    status_disconnected: 'Disconnected',
    status_room_synced: 'Room synced ({players} players)',
    status_error: 'Message handling error'
  },
  zh: {
    title: '四川麻将 Mac 客户端',
    subtitle: '大厅 MVP',
    mode: '模式',
    preview: '预览',
    live: '在线',
    language: '语言',
    wsUrl: 'WS 地址',
    name: '昵称',
    room: '房间号',
    hello: '确认昵称',
    create: '创建房间',
    join: '加入房间',
    addBot: '添加机器人',
    ready: '准备',
    connected: '已连接',
    yes: '是',
    no: '否',
    status: '状态',
    players: '玩家',
    roomCard: '房间快照',
    phase: '阶段',
    rounds: '局数',
    roleHuman: '真人',
    roleBot: '机器人',
    readyYes: '已准备',
    readyNo: '未准备',
    onlineYes: '在线',
    onlineNo: '离线',
    status_idle: '空闲',
    status_preview_connected: '预览模式已连接',
    status_preview_disconnected: '预览模式已断开',
    status_preview_hello: '你好，{name}（预览模式）',
    status_preview_room_created: '已创建房间（预览）',
    status_preview_room_joined: '已加入房间 {roomId}（预览）',
    status_connecting: '正在连接：{wsUrl}',
    status_connected: '已连接',
    status_disconnected: '已断开',
    status_room_synced: '房间同步完成（{players} 人）',
    status_error: '消息处理异常'
  }
};

function tf(lang: Lang, key: string, vars?: Record<string, string | number>) {
  const tpl = I18N[lang][key] || key;
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars?.[k] ?? ''));
}

export default function App(): JSX.Element {
  const [lang, setLang] = useState<Lang>('zh');
  const [mode, setMode] = useState<'preview' | 'live'>('preview');
  const [wsUrl, setWsUrl] = useState('ws://localhost:8787');
  const [state, setState] = useState<LobbyViewState>({
    name: '',
    roomId: '',
    players: [],
    connected: false,
    statusKey: 'idle'
  });

  const runtime = useMemo(
    () => createLobbyRuntime({ mode, wsUrl, onState: (patch) => setState((s) => ({ ...s, ...patch })) }),
    [mode, wsUrl]
  );

  useEffect(() => {
    runtime.connect();
    return () => runtime.disconnect();
  }, [runtime]);

  const statusText = tf(lang, `status_${state.statusKey}`, state.statusArgs);

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.title}>{tf(lang, 'title')}</Text>
        <Text style={styles.subtitle}>{tf(lang, 'subtitle')}</Text>

        <View style={styles.formRow}>
          <Text style={styles.label}>{tf(lang, 'language')}</Text>
          <View style={styles.actionsRow}>
            <ActionButton text="中文" onPress={() => setLang('zh')} active={lang === 'zh'} />
            <ActionButton text="EN" onPress={() => setLang('en')} active={lang === 'en'} />
          </View>
        </View>

        <View style={styles.formRow}>
          <Text style={styles.label}>{tf(lang, 'mode')}</Text>
          <View style={styles.actionsRow}>
            <ActionButton text={tf(lang, 'preview')} onPress={() => setMode('preview')} active={mode === 'preview'} />
            <ActionButton text={tf(lang, 'live')} onPress={() => setMode('live')} active={mode === 'live'} />
          </View>
        </View>

        <View style={styles.formRow}>
          <Text style={styles.label}>{tf(lang, 'wsUrl')}</Text>
          <TextInput value={wsUrl} onChangeText={setWsUrl} placeholder="ws://localhost:8787" placeholderTextColor="#64748b" style={styles.input} />
        </View>

        <View style={styles.formRow}>
          <Text style={styles.label}>{tf(lang, 'name')}</Text>
          <TextInput value={state.name} onChangeText={(name) => setState((s) => ({ ...s, name }))} placeholder="PlayerA" placeholderTextColor="#64748b" style={styles.input} />
        </View>

        <View style={styles.formRow}>
          <Text style={styles.label}>{tf(lang, 'room')}</Text>
          <TextInput value={state.roomId} onChangeText={(roomId) => setState((s) => ({ ...s, roomId: roomId.toUpperCase() }))} placeholder="ABC123" placeholderTextColor="#64748b" style={styles.input} />
        </View>

        <View style={styles.actionsRow}>
          <ActionButton text={tf(lang, 'hello')} onPress={() => runtime.hello(state.name)} />
          <ActionButton text={tf(lang, 'create')} onPress={() => runtime.createRoom()} />
          <ActionButton text={tf(lang, 'join')} onPress={() => runtime.joinRoom(state.roomId)} />
        </View>
        <View style={styles.actionsRow}>
          <ActionButton text={tf(lang, 'addBot')} onPress={() => runtime.addBot()} />
          <ActionButton text={tf(lang, 'ready')} onPress={() => runtime.setReady()} />
        </View>

        <Text style={styles.meta}>{tf(lang, 'connected')}: {state.connected ? tf(lang, 'yes') : tf(lang, 'no')}</Text>
        <Text style={styles.meta}>{tf(lang, 'status')}: {statusText}</Text>

        <View style={styles.roomCard}>
          <Text style={styles.roomTitle}>{tf(lang, 'roomCard')}</Text>
          <Text style={styles.roomMeta}>{tf(lang, 'room')}: {state.roomId || '-'}</Text>
          <Text style={styles.roomMeta}>{tf(lang, 'phase')}: {state.roomPhase || '-'}</Text>
          <Text style={styles.roomMeta}>{tf(lang, 'rounds')}: {(state.roundNo ?? 0)}/{state.maxRounds ?? 0}</Text>

          <Text style={[styles.roomMeta, { marginTop: 8 }]}>{tf(lang, 'players')}:</Text>
          {(state.players || []).length === 0 ? (
            <Text style={styles.playerLine}>-</Text>
          ) : (
            state.players.map((p, idx) => (
              <Text key={`${p.name}-${idx}`} style={styles.playerLine}>
                {idx + 1}. {p.name} · {p.isBot ? tf(lang, 'roleBot') : tf(lang, 'roleHuman')} · {p.ready ? tf(lang, 'readyYes') : tf(lang, 'readyNo')} · {p.online ? tf(lang, 'onlineYes') : tf(lang, 'onlineNo')}
              </Text>
            ))
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

function ActionButton({ text, onPress, active = true }: { text: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable style={[styles.button, !active && styles.buttonInactive]} onPress={onPress}>
      <Text style={styles.buttonText}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' },
  card: { width: 760, borderRadius: 16, padding: 20, backgroundColor: '#111827' },
  title: { color: '#f8fafc', fontSize: 24, fontWeight: '700' },
  subtitle: { color: '#cbd5e1', marginTop: 8, fontSize: 16 },
  formRow: { marginTop: 14 },
  label: { color: '#94a3b8', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#334155', borderRadius: 10, color: '#e2e8f0', paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  button: { backgroundColor: '#1d4ed8', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  buttonInactive: { backgroundColor: '#334155' },
  buttonText: { color: '#fff', fontWeight: '600' },
  meta: { marginTop: 12, color: '#cbd5e1' },
  roomCard: { marginTop: 14, borderWidth: 1, borderColor: '#334155', borderRadius: 12, padding: 12, backgroundColor: '#0b1220' },
  roomTitle: { color: '#f8fafc', fontWeight: '700' },
  roomMeta: { color: '#cbd5e1', marginTop: 4 },
  playerLine: { color: '#94a3b8', marginTop: 4 }
});
