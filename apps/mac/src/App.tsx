import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, Text, View, StyleSheet, TextInput, Pressable } from 'react-native';
import { createLobbyRuntime, type LobbyViewState } from './lobby-runtime';

export default function App(): JSX.Element {
  const [mode, setMode] = useState<'preview' | 'live'>('preview');
  const [wsUrl, setWsUrl] = useState('ws://localhost:8787');
  const [state, setState] = useState<LobbyViewState>({
    name: '',
    roomId: '',
    status: 'Not connected yet',
    players: [],
    connected: false
  });

  const runtime = useMemo(
    () => createLobbyRuntime({ mode, wsUrl, onState: (patch) => setState((s) => ({ ...s, ...patch })) }),
    [mode, wsUrl]
  );

  useEffect(() => {
    runtime.connect();
    return () => runtime.disconnect();
  }, [runtime]);

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.title}>Mahjong Mac Client (Preview)</Text>
        <Text style={styles.subtitle}>四川麻将 Mac 端（大厅预览）</Text>

        <View style={styles.formRow}>
          <Text style={styles.label}>Mode / 模式</Text>
          <View style={styles.actionsRow}>
            <ActionButton text="Preview" onPress={() => setMode('preview')} active={mode === 'preview'} />
            <ActionButton text="Live" onPress={() => setMode('live')} active={mode === 'live'} />
          </View>
        </View>

        <View style={styles.formRow}>
          <Text style={styles.label}>WS URL</Text>
          <TextInput
            value={wsUrl}
            onChangeText={setWsUrl}
            placeholder="ws://localhost:8787"
            placeholderTextColor="#64748b"
            style={styles.input}
          />
        </View>

        <View style={styles.formRow}>
          <Text style={styles.label}>Name / 昵称</Text>
          <TextInput
            value={state.name}
            onChangeText={(name) => setState((s) => ({ ...s, name }))}
            placeholder="PlayerA"
            placeholderTextColor="#64748b"
            style={styles.input}
          />
        </View>

        <View style={styles.formRow}>
          <Text style={styles.label}>Room / 房间号</Text>
          <TextInput
            value={state.roomId}
            onChangeText={(roomId) => setState((s) => ({ ...s, roomId: roomId.toUpperCase() }))}
            placeholder="ABC123"
            placeholderTextColor="#64748b"
            style={styles.input}
          />
        </View>

        <View style={styles.actionsRow}>
          <ActionButton text="Hello" onPress={() => runtime.hello(state.name)} />
          <ActionButton text="Create" onPress={() => runtime.createRoom()} />
          <ActionButton text="Join" onPress={() => runtime.joinRoom(state.roomId)} />
        </View>

        <Text style={styles.meta}>Connected: {state.connected ? 'Yes' : 'No'}</Text>
        <Text style={styles.meta}>Status: {state.status}</Text>
        <Text style={styles.meta}>Players: {state.players.join(', ') || '-'}</Text>
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
  page: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center'
  },
  card: {
    width: 620,
    borderRadius: 16,
    padding: 20,
    backgroundColor: '#111827'
  },
  title: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '700'
  },
  subtitle: {
    color: '#cbd5e1',
    marginTop: 8,
    fontSize: 16
  },
  formRow: {
    marginTop: 14
  },
  label: {
    color: '#94a3b8',
    marginBottom: 6
  },
  input: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    color: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14
  },
  button: {
    backgroundColor: '#1d4ed8',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  buttonInactive: {
    backgroundColor: '#334155'
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600'
  },
  meta: {
    marginTop: 12,
    color: '#cbd5e1'
  }
});
