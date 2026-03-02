/**
 * EN: Initial macOS app UI scaffold (React Native macOS target).
 * 中文：macOS 客户端初始 UI 脚手架（react-native-macos 目标）。
 */

import React, { useMemo, useState } from 'react';
import { SafeAreaView, Text, View, StyleSheet, TextInput, Pressable } from 'react-native';

type LobbyState = {
  name: string;
  roomId: string;
  status: string;
  players: string[];
};

function useLobbyPreviewState() {
  const [state, setState] = useState<LobbyState>({
    name: '',
    roomId: '',
    status: 'Not connected yet',
    players: []
  });

  const actions = useMemo(
    () => ({
      setName: (name: string) => setState((s) => ({ ...s, name })),
      setRoomId: (roomId: string) => setState((s) => ({ ...s, roomId: roomId.toUpperCase() })),
      hello: () => setState((s) => ({ ...s, status: `Hello ${s.name || 'Player'} (preview mode)` })),
      createRoom: () =>
        setState((s) => ({
          ...s,
          roomId: s.roomId || 'ABC123',
          status: 'Room created (preview)',
          players: s.name ? [s.name] : []
        })),
      joinRoom: () =>
        setState((s) => ({
          ...s,
          status: `Join room ${s.roomId || '-'} (preview)`,
          players: s.name && !s.players.includes(s.name) ? [...s.players, s.name] : s.players
        }))
    }),
    []
  );

  return { state, actions };
}

export default function App(): JSX.Element {
  const { state, actions } = useLobbyPreviewState();

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.title}>Mahjong Mac Client (Preview)</Text>
        <Text style={styles.subtitle}>四川麻将 Mac 端（大厅预览）</Text>

        <View style={styles.formRow}>
          <Text style={styles.label}>Name / 昵称</Text>
          <TextInput
            value={state.name}
            onChangeText={actions.setName}
            placeholder="PlayerA"
            placeholderTextColor="#64748b"
            style={styles.input}
          />
        </View>

        <View style={styles.formRow}>
          <Text style={styles.label}>Room / 房间号</Text>
          <TextInput
            value={state.roomId}
            onChangeText={actions.setRoomId}
            placeholder="ABC123"
            placeholderTextColor="#64748b"
            style={styles.input}
          />
        </View>

        <View style={styles.actionsRow}>
          <ActionButton text="Hello" onPress={actions.hello} />
          <ActionButton text="Create" onPress={actions.createRoom} />
          <ActionButton text="Join" onPress={actions.joinRoom} />
        </View>

        <Text style={styles.meta}>Status: {state.status}</Text>
        <Text style={styles.meta}>Players: {state.players.join(', ') || '-'}</Text>

        <Text style={styles.note}>
          Next step: replace preview state with @mahjong/client-core realtime wiring.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function ActionButton({ text, onPress }: { text: string; onPress: () => void }) {
  return (
    <Pressable style={styles.button} onPress={onPress}>
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
  buttonText: {
    color: '#fff',
    fontWeight: '600'
  },
  meta: {
    marginTop: 12,
    color: '#cbd5e1'
  },
  note: {
    marginTop: 14,
    color: '#94a3b8',
    fontSize: 13
  }
});
