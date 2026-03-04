import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, Text, View, StyleSheet, TextInput, Pressable, ScrollView, useColorScheme } from 'react-native';
import { createLobbyRuntime, type LobbyViewState, type HandTile, type Meld, type LobbyPlayer } from './lobby-runtime';

type Lang = 'en' | 'zh';
const I18N: Record<Lang, Record<string, string>> = {
  en: {
    randomName: 'Random', hello: 'Hello', create: 'Create', join: 'Join', addBot: 'Add Bot', ready: 'Ready', rematch: 'Rematch',
    scoreboard: 'Scoreboard', melds: 'Peng/Gang', status: 'Status', phase: 'Phase', table: 'Table', submitExchange: 'Submit Exchange',
    lackWan: 'Lack Wan', lackTiao: 'Lack Tiao', lackTong: 'Lack Tong', reactHu: 'Hu', reactGang: 'Gang', reactPeng: 'Peng', reactPass: 'Pass',
    selfHu: 'Self Hu', turn: 'Turn', room: 'Room', connected: 'Connected', actions: 'Actions', countdown: 'Countdown', confirm: 'Confirm'
  },
  zh: {
    randomName: '随机昵称', hello: '确认昵称', create: '创建房间', join: '加入房间', addBot: '添加机器人', ready: '准备', rematch: '再来一局',
    scoreboard: '记分板', melds: '碰杠牌组', status: '状态', phase: '阶段', table: '牌桌', submitExchange: '提交换三张',
    lackWan: '定缺万', lackTiao: '定缺条', lackTong: '定缺筒', reactHu: '胡', reactGang: '杠', reactPeng: '碰', reactPass: '过',
    selfHu: '自摸胡', turn: '当前出牌', room: '房间', connected: '连接', actions: '操作', countdown: '倒计时', confirm: '确认'
  }
};
const t = (l: Lang, k: string) => I18N[l][k] || k;
type AppStyles = ReturnType<typeof createStyles>;

type ThemeTokens = {
  bgApp: string;
  bgPanel: string;
  bgCard: string;
  bgTable: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  brand: string;
  success: string;
  warning: string;
  danger: string;
  borderSoft: string;
  inputBg: string;
  riverBg: string;
  riverBorder: string;
  modalMask: string;
  cardShadow: string;
  btnSecondaryBg: string;
  btnSecondaryText: string;
  btnDangerBg: string;
  btnDangerText: string;
  btnGhostText: string;
  toastBg: string;
  toastText: string;
};

const DARK_THEME: ThemeTokens = {
  bgApp: '#0B1220',
  bgPanel: '#0F1B33',
  bgCard: '#13223D',
  bgTable: '#0D5A46',
  textPrimary: '#F3F6FF',
  textSecondary: '#A9B4C7',
  textTertiary: '#94A3B8',
  brand: '#3B82F6',
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  borderSoft: 'rgba(255,255,255,0.12)',
  inputBg: '#0A1A2F',
  riverBg: 'rgba(0,0,0,0.08)',
  riverBorder: 'rgba(255,255,255,0.08)',
  modalMask: 'rgba(2,6,23,0.72)',
  cardShadow: '#020617',
  btnSecondaryBg: '#10233D',
  btnSecondaryText: '#F3F6FF',
  btnDangerBg: '#4A1720',
  btnDangerText: '#FECACA',
  btnGhostText: '#93C5FD',
  toastBg: '#10233D',
  toastText: '#DBEAFE'
};

const LIGHT_THEME: ThemeTokens = {
  bgApp: '#EEF3FA',
  bgPanel: '#F7FAFF',
  bgCard: '#FFFFFF',
  bgTable: '#2B8E72',
  textPrimary: '#0F172A',
  textSecondary: '#334155',
  textTertiary: '#64748B',
  brand: '#2563EB',
  success: '#16A34A',
  warning: '#D97706',
  danger: '#DC2626',
  borderSoft: 'rgba(15,23,42,0.14)',
  inputBg: '#FFFFFF',
  riverBg: 'rgba(255,255,255,0.55)',
  riverBorder: 'rgba(15,23,42,0.10)',
  modalMask: 'rgba(15,23,42,0.35)',
  cardShadow: 'rgba(15,23,42,0.25)',
  btnSecondaryBg: '#E2E8F0',
  btnSecondaryText: '#1E293B',
  btnDangerBg: '#FEE2E2',
  btnDangerText: '#991B1B',
  btnGhostText: '#1D4ED8',
  toastBg: '#DBEAFE',
  toastText: '#1E3A8A'
};

export default function App(): JSX.Element {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'light' ? LIGHT_THEME : DARK_THEME;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [lang, setLang] = useState<Lang>('zh');
  const [mode, setMode] = useState<'preview' | 'live'>('live');
  const [wsUrl, setWsUrl] = useState('ws://127.0.0.1:8787');
  const [busy, setBusy] = useState(false);
  const [exchangeSelected, setExchangeSelected] = useState<string[]>([]);
  const [lastDiscardFlash, setLastDiscardFlash] = useState(false);
  const [actionToast, setActionToast] = useState('');
  const [scoreFeedExpanded, setScoreFeedExpanded] = useState(false);
  const [settlementModalVisible, setSettlementModalVisible] = useState(false);
  const [lastSettlementRound, setLastSettlementRound] = useState<number | null>(null);
  const [state, setState] = useState<LobbyViewState>({
    name: '', roomId: '', players: [], connected: false, statusKey: 'idle', yourHandTiles: [], discards: [], yourMelds: [],
    canSelfHu: false, pendingReaction: null, rematchReadySeats: [], matchFinished: false, scoreFeed: []
  });

  const runtime = useMemo(() => createLobbyRuntime({ mode, wsUrl, onState: (patch) => setState((s) => ({ ...s, ...patch })) }), [mode, wsUrl]);
  useEffect(() => { runtime.connect(); return () => runtime.disconnect(); }, [runtime]);
  useEffect(() => { if (state.gamePhase !== 'exchange') setExchangeSelected([]); }, [state.gamePhase]);
  useEffect(() => {
    const latest = (state.roundHistory || []).slice(-1)[0];
    if (!latest?.roundNo) return;
    if (lastSettlementRound === latest.roundNo) return;
    setLastSettlementRound(latest.roundNo);
    setSettlementModalVisible(true);
  }, [state.roundHistory, lastSettlementRound]);

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
  const latestRound = (state.roundHistory || []).slice(-1)[0] || null;
  const scoreFeedLines = buildScoreFeedLines(state, latestRound);
  const displayedScoreFeedLines = scoreFeedExpanded ? scoreFeedLines : scoreFeedLines.slice(0, 6);
  const roundDeltaMap = new Map<number, number>((latestRound?.scoreChanges || []).map((x: any) => [x.seat, x.delta]));

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

  const Btn = ({ text, onPress, disabled = false, variant = 'primary' }: { text: string; onPress: () => void; disabled?: boolean; variant?: BtnVariant }) => (
    <Pressable
      style={({ pressed }) => ([
        styles.btn,
        variant === 'secondary' && styles.btnSecondary,
        variant === 'danger' && styles.btnDanger,
        variant === 'ghost' && styles.btnGhost,
        pressed && !disabled && styles.btnPressed,
        disabled && styles.btnDisabled
      ])}
      disabled={disabled}
      onPress={onPress}
    >
      <Text style={[
        styles.btnText,
        variant === 'secondary' && styles.btnTextSecondary,
        variant === 'danger' && styles.btnTextDanger,
        variant === 'ghost' && styles.btnTextGhost,
        disabled && styles.btnTextDisabled
      ]}
      >
        {text}
      </Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <View style={styles.card}>
          <View style={styles.contentRow}>
            <View style={styles.managePanel}>
              <Text style={styles.panelTitle}>房间管理</Text>
              <SidebarSection styles={styles}>
                <View style={styles.row}>
                  <Btn text="中文" variant={lang === 'zh' ? 'primary' : 'secondary'} onPress={() => setLang('zh')} />
                  <Btn text="EN" variant={lang === 'en' ? 'primary' : 'secondary'} onPress={() => setLang('en')} />
                  <Btn text="Preview" variant={mode === 'preview' ? 'primary' : 'secondary'} onPress={() => setMode('preview')} />
                  <Btn text="Live" variant={mode === 'live' ? 'primary' : 'secondary'} onPress={() => setMode('live')} />
                </View>
                <InputField styles={styles} theme={theme} value={wsUrl} onChangeText={setWsUrl} placeholder="ws://127.0.0.1:8787" />
                <View style={styles.row}>
                  <InputField styles={styles} theme={theme} compact value={state.name} onChangeText={(name) => setState((s) => ({ ...s, name }))} placeholder="Name" />
                  <Btn text={t(lang, 'randomName')} variant="secondary" onPress={() => setState((s) => ({ ...s, name: genRandomName() }))} />
                  <Btn text={t(lang, 'hello')} onPress={() => run(() => runtime.hello(state.name))} />
                </View>
              </SidebarSection>

              <SidebarSection styles={styles}>
                <InputField styles={styles} theme={theme} value={state.roomId} onChangeText={(roomId) => setState((s) => ({ ...s, roomId: roomId.toUpperCase() }))} placeholder="Room" />
                <View style={styles.row}>
                  <Btn text={t(lang, 'create')} onPress={() => runAction('创建房间', () => runtime.createRoom())} />
                  <Btn text={t(lang, 'join')} variant="secondary" onPress={() => runAction('加入房间', () => runtime.joinRoom(state.roomId))} />
                  <Btn text={t(lang, 'addBot')} variant="secondary" onPress={() => runAction('添加机器人', () => runtime.addBot())} />
                  <Btn text={t(lang, 'ready')} onPress={() => runAction('准备', () => runtime.setReady())} />
                </View>
              </SidebarSection>

              <View style={styles.scoreFeedPanel}>
                <Text style={styles.scoreFeedTitle}>得分信息流</Text>
                {scoreFeedLines.length === 0 ? (
                  <Text style={styles.meta}>暂无</Text>
                ) : (
                  displayedScoreFeedLines.map((line, idx) => {
                const isGain = /\+\d+/.test(line);
                const isLose = /(^|\s)-\d+/.test(line);
                const hasFan = /（.*）/.test(line) || /\(.*\)/.test(line) || /番/.test(line);
                return (
                  <Text
                    key={`${idx}-${line}`}
                    style={[
                      styles.scoreFeedItem,
                      isGain && styles.scoreFeedGain,
                      isLose && styles.scoreFeedLose,
                      hasFan && styles.scoreFeedFan
                    ]}
                  >
                    • {line}
                  </Text>
                );
                  })
                )}
                {scoreFeedLines.length > 6 ? (
                  <View style={styles.row}>
                    <Btn
                      text={scoreFeedExpanded ? '收起' : '展开更多'}
                      variant="ghost"
                      onPress={() => setScoreFeedExpanded((v) => !v)}
                    />
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.tablePanel}>
            <View style={styles.tableHeader}>
              <Text style={styles.tableTitle}>{t(lang, 'table')}</Text>
              <Text style={styles.meta}>{t(lang, 'connected')}: {state.connected ? 'Yes' : 'No'} · {t(lang, 'room')}: {state.roomId || '-'} · {t(lang, 'phase')}: {state.gamePhase || '-'}</Text>
            </View>

            <View style={styles.tableSurface}>
              <CenterHUD
                styles={styles}
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
              <SeatPanel styles={styles} player={seatMap.top} rematchReadySeats={state.rematchReadySeats} isTurn={state.turnSeat === seatMap.top?.seat} isSelf={false} />
              <View style={styles.riversRow}>
                <SeatPanel styles={styles} player={seatMap.left} rematchReadySeats={state.rematchReadySeats} vertical side="left" isTurn={state.turnSeat === seatMap.left?.seat} isSelf={false} />
                <DiscardRivers styles={styles} discardsBySeat={discardsBySeat} mySeat={mySeat} reactionTarget={reactionTarget} />
                <SeatPanel styles={styles} player={seatMap.right} rematchReadySeats={state.rematchReadySeats} vertical side="right" isTurn={state.turnSeat === seatMap.right?.seat} isSelf={false} />
              </View>
              <View style={styles.bottomSeatWrap}>
                <SeatPanel styles={styles} player={bottomPlayer} rematchReadySeats={state.rematchReadySeats} isTurn={state.turnSeat === bottomPlayer?.seat} isSelf />
              </View>
            </View>


            {!state.pendingReaction && canDiscard && anGang.map((x) => <View key={x.id} style={styles.row}><Btn text={`暗杠 ${tileCodeToZh(x.code)}`} variant="secondary" onPress={() => runAction('暗杠', () => runtime.anGang(x.id))} /></View>)}
            {!state.pendingReaction && canDiscard && buGang.map((x) => <View key={x.id} style={styles.row}><Btn text={`补杠 ${tileCodeToZh(x.code)}`} variant="secondary" onPress={() => runAction('补杠', () => runtime.buGang(x.id))} /></View>)}

            {inExchange ? <View style={styles.row}><Text style={styles.meta}>换三张 {exchangeSelected.length}/3</Text><Btn text={t(lang, 'submitExchange')} onPress={() => runAction('提交换三张', () => runtime.submitExchange(exchangeSelected))} /></View> : null}
            {inLack ? <View style={styles.row}><Btn text={t(lang, 'lackWan')} variant="secondary" onPress={() => runAction('定缺万', () => runtime.setLack('wan'))} /><Btn text={t(lang, 'lackTiao')} variant="secondary" onPress={() => runAction('定缺条', () => runtime.setLack('tiao'))} /><Btn text={t(lang, 'lackTong')} variant="secondary" onPress={() => runAction('定缺筒', () => runtime.setLack('tong'))} /></View> : null}
            {inSettlement ? <View style={styles.row}><Btn text={t(lang, 'rematch')} onPress={() => runAction('再来一局', () => runtime.requestRematch())} /></View> : null}

            {settlementModalVisible ? (
              <View style={styles.settlementModalMask}>
                <View style={styles.settlementModalCard}>
                  <Text style={styles.settlementTitle}>本局结算</Text>
                  {leaderboard.map((p, i) => {
                    const delta = Number(roundDeltaMap.get(p.seat) ?? p.roundDelta ?? 0);
                    const deltaText = delta > 0 ? `+${delta}` : `${delta}`;
                    const top = delta === Math.max(...leaderboard.map((x) => Number(roundDeltaMap.get(x.seat) ?? x.roundDelta ?? 0)));
                    return <Text key={`st-${p.seat}`} style={[styles.settlementItem, top && styles.settlementItemTop]}>{i + 1}. S{p.seat} {p.name}  本局 {deltaText}  ·  总分 {p.totalScore}</Text>;
                  })}

                  {(state.revealedHands || []).length > 0 ? (
                    <View style={styles.revealPanel}>
                      <Text style={styles.revealTitle}>本局亮牌</Text>
                      {(state.revealedHands || []).map((rh: any) => {
                        const name = findPlayerBySeat(state.players, rh.seat)?.name || `S${rh.seat}`;
                        const handTiles = (rh.hand || []).map((t: any) => `${t.suit?.[0] === 'w' ? 'w' : t.suit?.[0] === 't' ? 't' : 'b'}${t.rank}`);
                        const meldTiles = ((rh.melds || []) as any[]).flatMap((m: any, mi: number) => {
                          const rawTiles = Array.isArray(m.tiles) ? m.tiles.map((t: any) => `${t.suit?.[0] === 'w' ? 'w' : t.suit?.[0] === 't' ? 't' : 'b'}${t.rank}`) : null;
                          if (rawTiles && rawTiles.length) return rawTiles;
                          const base = `${m.tile?.suit?.[0] === 'w' ? 'w' : m.tile?.suit?.[0] === 't' ? 't' : 'b'}${m.tile?.rank}`;
                          const cnt = inferMeldCount(m.type);
                          return Array.from({ length: cnt }, () => base);
                        });
                        return (
                          <View key={`rh-${rh.seat}`} style={styles.revealRow}>
                            <Text style={styles.revealName}>{name}:</Text>
                            <View style={styles.revealTiles}>
                              {handTiles.length ? handTiles.map((c: string, i: number) => <MiniTile key={`${rh.seat}-h-${i}-${c}`} styles={styles} code={c} />) : <Text style={styles.revealItem}>-</Text>}
                              {meldTiles.length > 0 ? <View style={styles.revealGap} /> : null}
                              {meldTiles.map((c: string, i: number) => <MiniTile key={`${rh.seat}-m-${i}-${c}`} styles={styles} code={c} />)}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={styles.revealItem}>（未收到结算亮牌数据）</Text>
                  )}

                  <View style={[styles.row, { justifyContent: 'center' }]}>
                    <Btn text={t(lang, 'confirm')} onPress={() => setSettlementModalVisible(false)} />
                  </View>
                </View>
              </View>
            ) : null}


            {actionToast ? <View style={styles.actionToast}><Text style={styles.actionToastText}>{actionToast}</Text></View> : null}
            <View style={styles.handArea}>
              <View style={[styles.tileRow, !(canDiscard || inExchange) && styles.tileRowDisabled]}>{state.yourHandTiles.map((tile) => <Tile key={tile.id} styles={styles} code={tile.code} selected={exchangeSelected.includes(tile.id)} active={canDiscard || inExchange} onPress={() => onTilePress(tile)} />)}</View>
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
                    {state.pendingReaction.canGang && <Btn text={t(lang, 'reactGang')} variant="secondary" onPress={() => runAction('杠', () => runtime.react('gang'))} />}
                    {state.pendingReaction.canPeng && <Btn text={t(lang, 'reactPeng')} variant="secondary" onPress={() => runAction('碰', () => runtime.react('peng'))} />}
                    <Btn text={t(lang, 'reactPass')} variant="danger" onPress={() => runAction('过', () => runtime.react('pass'))} />
                  </View>
                ) : (
                  <View style={styles.actionBar}>
                    <Btn text={t(lang, 'selfHu')} disabled={!(canDiscard && state.canSelfHu)} onPress={() => runAction('自摸胡', () => runtime.selfHu())} />
                    {!canDiscard ? <Text style={styles.meta}>当前不可操作：未到你回合</Text> : null}
                  </View>
                )}
              </View>
            ) : null}
          </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SidebarSection({ styles, children }: { styles: AppStyles; children: React.ReactNode }) {
  return <View style={styles.manageSection}>{children}</View>;
}

function InputField({ styles, theme, value, onChangeText, placeholder, compact = false }: { styles: AppStyles; theme: ThemeTokens; value: string; onChangeText: (next: string) => void; placeholder: string; compact?: boolean }) {
  return (
    <TextInput
      style={[styles.input, compact && styles.nameInput]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.textTertiary}
    />
  );
}

function SeatPanel({ styles, player, rematchReadySeats, vertical = false, side, isTurn = false, isSelf = false }: { styles: AppStyles; player?: LobbyPlayer; rematchReadySeats: number[]; vertical?: boolean; side?: 'left' | 'right'; isTurn?: boolean; isSelf?: boolean }) {
  if (!player) return <View style={[styles.seatPanel, vertical && styles.seatPanelVertical, side === 'left' && styles.seatPanelLeft, side === 'right' && styles.seatPanelRight]}><Text style={styles.meta}>-</Text></View>;
  const compact = true;
  return (
    <View style={[styles.seatPanel, styles.seatPanelOpponent, vertical && styles.seatPanelVertical, vertical && styles.seatPanelOpponentVertical, side === 'left' && styles.seatPanelLeft, side === 'right' && styles.seatPanelRight, isTurn && styles.seatPanelTurn]}>
      <Text style={[styles.seatName, compact && styles.seatNameCompact, isTurn && styles.seatNameTurn]}>S{player.seat} {player.name}{isTurn ? ' ●' : ''}</Text>
      {compact ? (
        <Text style={[styles.meta, styles.metaCompact]}>
          分:{player.totalScore} · 缺:{lackSuitToZh(player.lackSuit)} · {player.online ? '在线' : '离线'} {rematchReadySeats.includes(player.seat) ? '· ✅' : ''}
        </Text>
      ) : (
        <>
          <Text style={styles.meta}>分数: {player.totalScore} {rematchReadySeats.includes(player.seat) ? '✅已准备' : ''}</Text>
          <Text style={styles.meta}>定缺: {lackSuitToZh(player.lackSuit)} · {player.online ? '在线' : '离线'}</Text>
        </>
      )}
      <View style={[styles.meldGroupWrap, compact && styles.meldGroupWrapCompact]}>
        {(player.melds || [])
          .filter((m) => isMeldVisible(m, isSelf))
          .slice(0, 4)
          .map((m, i) => <MeldGroupView key={`${player.seat}-${i}`} styles={styles} meld={m} />)}
      </View>
    </View>
  );
}

function MeldGroupView({ styles, meld }: { styles: AppStyles; meld: Meld }) {
  const raw: any = meld as any;
  const rawTiles = Array.isArray(raw.tiles) ? raw.tiles : null;
  const tiles = rawTiles && rawTiles.length > 0
    ? rawTiles.map((t: any) => `${suitPrefix(t.suit)}${t.rank}`)
    : Array.from({ length: inferMeldCount(raw.type) }, () => `${suitPrefix(meld.tile.suit)}${meld.tile.rank}`);
  return (
    <View style={styles.meldGroup}>
      <View style={styles.meldTilesRow}>{tiles.map((c, i) => <MiniTile key={`${c}-${i}`} styles={styles} code={c} />)}</View>
    </View>
  );
}

function CenterHUD({ styles, turnSeat, roomPhase, roundNo, maxRounds, statusKey, statusDetail, remainingTiles, lastDiscard, lastDiscardPlayerName, flash }: { styles: AppStyles; turnSeat?: number; roomPhase?: string; roundNo?: number; maxRounds?: number; statusKey?: string; statusDetail?: string | number; remainingTiles?: number; lastDiscard?: { seat: number; tileCode: string } | null; lastDiscardPlayerName?: string; flash?: boolean }) {
  return (
    <View style={styles.centerHud}>
      <Text style={styles.centerTitle}>局况</Text>
      <Text style={[styles.meta, styles.centerHudLine]}>回合: {turnSeat ?? '-'} · 局面: {roomPhase || '-'} · 局数: {roundNo ?? 0}/{maxRounds ?? 0} · 剩余牌: {remainingTiles ?? '-'} · 状态: {statusKey}{statusDetail ? ` (${statusDetail})` : ''}</Text>
      {lastDiscard ? (
        <View style={[styles.lastDiscardBadge, flash && styles.lastDiscardBadgeFlash]}>
          <Text style={styles.lastDiscardText}>{lastDiscardPlayerName || `S${lastDiscard.seat}`} 打出 {tileCodeToZh(lastDiscard.tileCode)}</Text>
        </View>
      ) : null}
    </View>
  );
}

function DiscardRivers({ styles, discardsBySeat, mySeat, reactionTarget }: { styles: AppStyles; discardsBySeat: Record<number, string[]>; mySeat: number; reactionTarget?: { seat: number; tileCode: string } | null }) {
  const topSeat = (mySeat + 2) % 4;
  const leftSeat = (mySeat + 1) % 4;
  const rightSeat = (mySeat + 3) % 4;
  return (
    <View style={styles.riversWrap}>
      <RiverGrid styles={styles} tiles={discardsBySeat[topSeat] || []} highlightCode={reactionTarget?.seat === topSeat ? reactionTarget.tileCode : undefined} />
      <View style={styles.riverMiddle}>
        <RiverGrid styles={styles} tiles={discardsBySeat[leftSeat] || []} compact vertical highlightCode={reactionTarget?.seat === leftSeat ? reactionTarget.tileCode : undefined} />
        <RiverGrid styles={styles} tiles={discardsBySeat[rightSeat] || []} compact vertical highlightCode={reactionTarget?.seat === rightSeat ? reactionTarget.tileCode : undefined} />
      </View>
      <RiverGrid styles={styles} tiles={discardsBySeat[mySeat] || []} highlightCode={reactionTarget?.seat === mySeat ? reactionTarget.tileCode : undefined} />
    </View>
  );
}

function RiverGrid({ styles, tiles, compact = false, vertical = false, highlightCode }: { styles: AppStyles; tiles: string[]; compact?: boolean; vertical?: boolean; highlightCode?: string }) {
  const perLine = vertical ? 2 : (compact ? 5 : 6);
  const lineCount = Math.max(2, Math.ceil(tiles.length / perLine));
  const padded = [...tiles];
  while (padded.length < lineCount * perLine) padded.push('');
  const highlightIndex = highlightCode ? tiles.lastIndexOf(highlightCode) : -1;
  return (
    <View style={[styles.riverGrid, compact && styles.riverGridCompact, vertical && styles.riverGridVertical]}>
      {Array.from({ length: lineCount }).map((_, line) => (
        <View key={line} style={[styles.riverRow, vertical && styles.riverRowVertical]}>
          {padded.slice(line * perLine, (line + 1) * perLine).map((c, i) => {
            const index = line * perLine + i;
            if (!c) return <View key={`${line}-${i}-x`} style={styles.riverPlaceholder} />;
            return <MiniTile key={`${line}-${i}-${c}`} styles={styles} code={c} highlighted={index === highlightIndex} />;
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

function findAnGangCandidates(hand: HandTile[]) { const m = new Map<string, HandTile[]>(); for (const t of hand) { const k = `${t.suit}-${t.rank}`; m.set(k, [...(m.get(k) || []), t]); } return [...m.values()].filter((v) => v.length >= 4).map((v) => v[0]); }
function findBuGangCandidates(hand: HandTile[], melds: Meld[]) { const keys = new Set((melds || []).filter((m) => m.type === 'peng').map((m) => `${m.tile.suit}-${m.tile.rank}`)); return hand.filter((t) => keys.has(`${t.suit}-${t.rank}`)); }
function suitPrefix(suit: string) { if (suit === 'wan') return 'w'; if (suit === 'tong') return 'b'; return 't'; }
function findPlayerBySeat(players: LobbyPlayer[], seat: number) { return players.find((p) => p.seat === seat); }
function groupDiscardsBySeat(discards: { seat: number; tileCode: string; claimed?: boolean }[]) { const map: Record<number, string[]> = {}; for (const d of discards) { if (d.claimed) continue; if (!map[d.seat]) map[d.seat] = []; map[d.seat].push(d.tileCode); } return map; }

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
function Tile({ styles, code, small = false, selected = false, active = false, highlighted = false, onPress }: { styles: AppStyles; code: string; small?: boolean; selected?: boolean; active?: boolean; highlighted?: boolean; onPress?: () => void }) {
  const pure = code.includes('@') ? code.split('@')[0] : code;
  const suit = pure[0]; const rank = Number(pure.slice(1)); const { label, color } = meta(suit);
  return <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.tile, small && styles.tileSmall, selected && styles.tileSel, highlighted && styles.tileHighlight, !active && styles.tileInactive, pressed && onPress && styles.tilePressed]}><Text style={[styles.corner, { color }]}>{label}</Text><Text style={[styles.rank, { color }]}>{rank}</Text><Text style={[styles.corner, { color, alignSelf: 'flex-end' }]}></Text></Pressable>;
}
function MiniTile({ styles, code, highlighted = false }: { styles: AppStyles; code: string; highlighted?: boolean }) { return <Tile styles={styles} code={code} small active highlighted={highlighted} />; }
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


function formatPatternDetail(event: any) {
  const nameMap: Record<string, string> = {
    ping_hu: '平胡', peng_peng_hu: '碰碰胡', qi_dui: '七对', long_qi_dui: '龙七对', jiang_dui: '将对',
    yao_jiu: '幺九', qing_yi_se: '清一色', zi_mo: '自摸', men_qing: '门清', gang_shang_hua: '杠上花',
    gang_shang_pao: '杠上炮', qiang_gang_hu: '抢杠胡', hai_di_lao_yue: '海底捞月', hai_di_pao: '海底炮',
    tian_hu: '天胡', di_hu: '地胡'
  };
  const ps = event?.patterns || [];
  if (!ps.length) return '';
  return `番型:${ps.map((k: string) => nameMap[k] || k).join('+')}`;
}

function buildScoreFeedLines(state: LobbyViewState, latestRound: any) {
  const players = state.players || [];
  const nameOf = (seat: number | null | undefined) => {
    if (seat == null) return '-';
    return players.find((p) => p.seat === seat)?.name || `S${seat}`;
  };

  const lines: string[] = [];
  const events = (state.settlementEvents || []).slice().reverse();
  for (const e of events) {
    if (e.type === 'hu') {
      const fanPart = e.fan != null ? `，${e.fan}番` : '';
      const patternPart = formatPatternDetail(e);
      if (e.winMode === 'zi_mo') {
        lines.push(`${nameOf(e.winnerSeat)} 自摸，每家 ${e.amount} 分${fanPart}${patternPart ? `，${patternPart}` : ''}`);
      } else {
        lines.push(`${nameOf(e.winnerSeat)} 胡 ${nameOf(e.fromSeat)}，${e.amount} 分${fanPart}${patternPart ? `，${patternPart}` : ''}`);
      }
    } else if (e.type === 'gang') {
      const gType = e.gangType === 'an_gang' ? '暗杠' : e.gangType === 'bu_gang' ? '补杠' : '明杠';
      if (e.fromSeat == null) {
        lines.push(`${nameOf(e.winnerSeat)} ${gType}，每家 ${e.amount} 分`);
      } else {
        lines.push(`${nameOf(e.winnerSeat)} ${gType}，${nameOf(e.fromSeat)} 支付 ${e.amount} 分`);
      }
    }
  }

  if (latestRound?.scoreChanges?.length) {
    lines.unshift(`本局汇总：${latestRound.scoreChanges.map((x: any) => `${x.name} ${x.delta >= 0 ? '+' : ''}${x.delta}`).join(' | ')}`);
  }

  return lines;
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: theme.bgApp },
    wrap: { padding: 16, alignItems: 'flex-start' },
    card: {
      width: '100%',
      backgroundColor: theme.bgApp,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.borderSoft,
      shadowColor: theme.cardShadow,
      shadowOpacity: 0.12,
      shadowRadius: 14
    },
    contentRow: { flexDirection: 'row', alignItems: 'flex-start', columnGap: 14 },
    managePanel: { width: 280, borderWidth: 1, borderColor: theme.borderSoft, borderRadius: 14, padding: 12, backgroundColor: theme.bgPanel },
    manageSection: { marginTop: 8, borderWidth: 1, borderColor: theme.borderSoft, borderRadius: 12, padding: 10, backgroundColor: theme.bgCard },
    panelTitle: { color: theme.textPrimary, fontWeight: '700', marginBottom: 2, fontSize: 17 },
    scoreFeedPanel: { marginTop: 10, borderWidth: 1, borderColor: theme.borderSoft, borderRadius: 12, padding: 10, backgroundColor: theme.bgCard, maxHeight: 360 },
    scoreFeedTitle: { color: theme.textPrimary, fontWeight: '700', marginBottom: 6 },
    scoreFeedItem: { color: theme.textSecondary, fontSize: 12, marginTop: 3 },
    scoreFeedGain: { color: '#16A34A' },
    scoreFeedLose: { color: '#DC2626' },
    scoreFeedFan: { color: '#D97706' },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    input: { borderWidth: 1, borderColor: theme.borderSoft, borderRadius: 10, color: theme.textPrimary, paddingHorizontal: 10, paddingVertical: 10, marginTop: 8, backgroundColor: theme.inputBg },
    nameInput: { minWidth: 180, flex: 1 },
    btn: { minHeight: 36, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: theme.brand, backgroundColor: theme.brand, justifyContent: 'center' },
    btnSecondary: { backgroundColor: theme.btnSecondaryBg, borderColor: theme.borderSoft },
    btnDanger: { backgroundColor: theme.btnDangerBg, borderColor: theme.danger },
    btnGhost: { backgroundColor: 'transparent', borderColor: 'transparent' },
    btnPressed: { opacity: 0.85, transform: [{ translateY: 1 }] },
    btnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
    btnTextSecondary: { color: theme.btnSecondaryText },
    btnTextDanger: { color: theme.btnDangerText },
    btnTextGhost: { color: theme.btnGhostText },
    btnDisabled: { opacity: 0.55 },
    btnTextDisabled: { color: '#9CA3AF' },
    meta: { color: theme.textSecondary, marginTop: 4, fontSize: 12 },
    metaCompact: { marginTop: 2, fontSize: 11, lineHeight: 13 },

    tablePanel: { flex: 1, borderWidth: 1, borderColor: theme.borderSoft, borderRadius: 14, padding: 12, backgroundColor: theme.bgPanel },
    tableHeader: { marginBottom: 10 },
    tableTitle: { color: theme.textPrimary, fontWeight: '700', fontSize: 24, lineHeight: 30 },
    tableSurface: {
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 18,
      minHeight: 680,
      backgroundColor: theme.bgTable,
      alignItems: 'stretch'
    },
    middleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8, columnGap: 10 },
    riversRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', columnGap: 10, marginTop: 10 },

    seatPanel: { minWidth: 210, minHeight: 86, borderWidth: 1, borderColor: theme.borderSoft, borderRadius: 12, backgroundColor: theme.bgPanel, padding: 10, alignSelf: 'center' },
    seatPanelOpponent: {
      minWidth: 184,
      minHeight: 64,
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderRadius: 10,
      backgroundColor: theme.inputBg
    },
    seatPanelVertical: { minWidth: 136, width: 136 },
    seatPanelOpponentVertical: { minWidth: 124, width: 124 },
    seatPanelLeft: { marginTop: 0, alignSelf: 'center' },
    seatPanelRight: { marginTop: 0, alignSelf: 'center' },
    seatPanelTurn: { borderColor: 'rgba(59,130,246,0.7)', shadowColor: theme.brand, shadowOpacity: 0.3, shadowRadius: 8 },
    seatNameTurn: { color: '#BFDBFE' },
    seatName: { color: theme.textPrimary, fontWeight: '700', fontSize: 16, lineHeight: 20 },
    seatNameCompact: { fontSize: 12, lineHeight: 15 },
    meldGroupWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
    meldGroupWrapCompact: { gap: 4, marginTop: 4 },
    meldGroup: { borderWidth: 1, borderColor: theme.borderSoft, borderRadius: 8, padding: 3, backgroundColor: theme.inputBg },
    meldTilesRow: { flexDirection: 'row', gap: 2 },

    centerHud: { width: '94%', maxWidth: 900, alignSelf: 'center', borderWidth: 1, borderColor: theme.borderSoft, borderRadius: 12, backgroundColor: theme.bgPanel, padding: 10, alignItems: 'center' },
    centerTitle: { color: theme.textPrimary, fontWeight: '700', fontSize: 18, lineHeight: 24 },
    centerHudLine: { textAlign: 'center', width: '100%' },
    lastDiscardBadge: { marginTop: 6, borderWidth: 1, borderColor: theme.borderSoft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: theme.inputBg },
    lastDiscardBadgeFlash: { borderColor: theme.warning, backgroundColor: '#3A2A10' },
    lastDiscardText: { color: '#FEF3C7', fontWeight: '700', fontSize: 12 },

    riversWrap: { width: '74%', minHeight: 300, alignSelf: 'center', marginTop: 14, borderWidth: 1, borderColor: theme.riverBorder, borderRadius: 12, padding: 10, backgroundColor: theme.riverBg },
    bottomSeatWrap: { marginTop: 14, alignItems: 'center' },
    riverGrid: { alignItems: 'center', marginVertical: 2 },
    riverGridCompact: { width: '48%' },
    riverGridVertical: { width: '48%', alignItems: 'center' },
    riverRow: { flexDirection: 'row', gap: 4, minHeight: 30, justifyContent: 'center' },
    riverRowVertical: { flexDirection: 'column', minHeight: 0, gap: 4 },
    riverMiddle: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 6 },
    riverPlaceholder: { width: 24, height: 34, borderRadius: 5, borderWidth: 1, borderColor: theme.riverBorder, backgroundColor: theme.riverBg },

    actionBarWrap: { marginTop: 12, backgroundColor: theme.bgCard, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: theme.borderSoft },
    actionBarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    actionTitle: { color: theme.textPrimary, fontWeight: '700' },
    actionTimer: { color: theme.success, fontWeight: '700' },
    actionTimerWarn: { color: theme.warning },
    actionTimerDanger: { color: '#FCA5A5' },
    countdownBar: { height: 4, borderRadius: 999, backgroundColor: theme.success, marginBottom: 6 },
    countdownBarWarn: { backgroundColor: theme.warning },
    countdownBarDanger: { backgroundColor: theme.danger },
    actionBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
    handArea: { marginTop: 12, borderTopWidth: 1, borderTopColor: theme.borderSoft, paddingTop: 10 },
    actionToast: { alignSelf: 'center', marginTop: 8, backgroundColor: theme.toastBg, borderColor: theme.brand, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
    actionToastText: { color: theme.toastText, fontWeight: '700' },
    settlementOverlay: { marginTop: 10, borderWidth: 1, borderColor: theme.borderSoft, borderRadius: 10, padding: 10, backgroundColor: theme.bgCard },
    settlementModalMask: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: theme.modalMask, justifyContent: 'center', alignItems: 'center', zIndex: 30 },
    settlementModalCard: { width: '86%', maxWidth: 820, borderWidth: 1, borderColor: theme.borderSoft, borderRadius: 14, padding: 14, backgroundColor: theme.bgCard },
    settlementTitle: { color: theme.textPrimary, fontWeight: '800', fontSize: 18 },
    settlementItem: { color: theme.textSecondary, marginTop: 5 },
    settlementItemTop: { color: '#FDE68A', fontWeight: '800' },
    revealPanel: { marginTop: 8, borderWidth: 1, borderColor: theme.borderSoft, borderRadius: 10, padding: 8, backgroundColor: theme.bgCard },
    revealTitle: { color: theme.textPrimary, fontWeight: '700' },
    revealRow: { marginTop: 6 },
    revealName: { color: theme.textSecondary, marginBottom: 4, fontSize: 12 },
    revealTiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    revealGap: { width: 14 },
    revealItem: { color: theme.textSecondary, marginTop: 4, fontSize: 12 },

    panel: { marginTop: 10, borderWidth: 1, borderColor: theme.borderSoft, borderRadius: 10, padding: 8, backgroundColor: theme.bgPanel },
    title: { color: theme.textPrimary, fontWeight: '700' },

    tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, justifyContent: 'center' },
    tileRowDisabled: { opacity: 0.55 },
    tile: { width: 38, height: 58, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, backgroundColor: '#FFFFFF', padding: 4, justifyContent: 'space-between' },
    tileSmall: { width: 24, height: 34, borderRadius: 5, padding: 2 },
    tileSel: { borderColor: theme.warning, transform: [{ translateY: -2 }] },
    tileHighlight: { borderColor: '#FDE047', borderWidth: 2, shadowColor: '#FDE047', shadowOpacity: 0.45, shadowRadius: 4 },
    tilePressed: { transform: [{ translateY: 1 }] },
    tileInactive: { opacity: 0.72, backgroundColor: '#F3F4F6' },
    corner: { fontSize: 9, fontWeight: '700' },
    rank: { fontSize: 20, fontWeight: '800', textAlign: 'center' }
  });
}
