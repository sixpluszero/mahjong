/**
 * EN: Initial macOS app UI scaffold (React Native macOS target).
 * 中文：macOS 客户端初始 UI 脚手架（react-native-macos 目标）。
 *
 * Note: This is a source scaffold for upcoming RN macOS project bootstrap.
 */

import React from 'react';
import { SafeAreaView, Text, View, StyleSheet } from 'react-native';

export default function App(): JSX.Element {
  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.title}>Mahjong Mac Client (Preview)</Text>
        <Text style={styles.subtitle}>四川麻将 Mac 端（开发中）</Text>
        <Text style={styles.body}>Next: wire @mahjong/client-core for realtime lobby flow.</Text>
      </View>
    </SafeAreaView>
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
    width: 560,
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
  body: {
    color: '#94a3b8',
    marginTop: 14,
    fontSize: 14
  }
});
