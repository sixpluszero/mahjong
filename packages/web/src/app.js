const wsUrl = resolveWsUrl();
let ws = null;
let reconnectTimer = null;
let connectTimeoutTimer = null;
const RESUME_STORAGE_KEY = 'mj_resume_session';
const WS_CONNECT_TIMEOUT_MS = 12000;
const WS_CONNECT_TIMEOUT_MAX_MS = 30000;

registerServiceWorker();

const state = {
  clientId: null,
  name: localStorage.getItem('mj_name') || '',
  roomId: '',
  roomState: null,
  gameState: null,
  you: null,
  pendingReaction: null,
  connected: false,
  notice: '',
  exchangeSelection: [],
  exchangeSubmitted: false,
  lackSubmitted: false,
  lastKnownHandIds: [],
  latestDrawTileId: null,
  latestDrawAt: 0,
  pendingDiscardTileId: null,
  rematchRequested: false,
  lastSocketError: '',
  lastCloseCode: '',
  lastCloseReason: '',
  lastOpenAt: 0,
  lastMessageAt: 0,
  wsReadyState: 3,
  reconnectAttempts: 0,
  nextReconnectAt: 0,
  connectStartedAt: 0,
  lastConnectDurationMs: 0,
  connectTimeouts: 0,
  connectTimeoutStreak: 0,
  activeRooms: [],
  lastGeneratedName: '',
  resumeSession: readResumeSession(),
  resumePending: false
};

const el = {
  nameInput: document.querySelector('#nameInput'),
  randomNameBtn: document.querySelector('#randomNameBtn'),
  helloBtn: document.querySelector('#helloBtn'),
  createRoomBtn: document.querySelector('#createRoomBtn'),
  roomIdInput: document.querySelector('#roomIdInput'),
  joinRoomBtn: document.querySelector('#joinRoomBtn'),
  addBotBtn: document.querySelector('#addBotBtn'),
  readyBtn: document.querySelector('#readyBtn'),
  refreshRoomsBtn: document.querySelector('#refreshRoomsBtn'),
  reconnectBtn: document.querySelector('#reconnectBtn'),
  status: document.querySelector('#status'),
  diag: document.querySelector('#diag'),
  roomInfo: document.querySelector('#roomInfo'),
  activeRooms: document.querySelector('#activeRooms'),
  players: document.querySelector('#players'),
  totals: document.querySelector('#totals'),
  history: document.querySelector('#history'),
  trend: document.querySelector('#trend'),
  finalStats: document.querySelector('#finalStats'),
  gameInfo: document.querySelector('#gameInfo'),
  actionBar: document.querySelector('#actionBar'),
  hand: document.querySelector('#hand'),
  melds: document.querySelector('#melds'),
  discards: document.querySelector('#discards'),
  events: document.querySelector('#events')
};

el.nameInput.value = state.name;

function connectSocket({ resetBackoff = false } = {}) {
  if (resetBackoff) {
    state.reconnectAttempts = 0;
    state.nextReconnectAt = 0;
    state.connectTimeoutStreak = 0;
  }

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  state.connectStartedAt = Date.now();
  if (connectTimeoutTimer) {
    clearTimeout(connectTimeoutTimer);
    connectTimeoutTimer = null;
  }

  ws = new WebSocket(wsUrl);
  state.wsReadyState = ws.readyState;
  safeRender();

  const connectTimeoutMs = Math.min(
    WS_CONNECT_TIMEOUT_MAX_MS,
    WS_CONNECT_TIMEOUT_MS + (state.connectTimeoutStreak * 4000)
  );

  connectTimeoutTimer = setTimeout(() => {
    if (!ws || ws.readyState !== WebSocket.CONNECTING) {
      return;
    }
    state.connectTimeouts += 1;
    state.connectTimeoutStreak += 1;
    state.lastSocketError = `连接超时(${connectTimeoutMs}ms)`;
    try {
      ws.close();
    } catch {
      // ignore
    }
  }, connectTimeoutMs);

  ws.addEventListener('open', () => {
    if (connectTimeoutTimer) {
      clearTimeout(connectTimeoutTimer);
      connectTimeoutTimer = null;
    }
    state.connected = true;
    state.wsReadyState = ws.readyState;
    state.lastOpenAt = Date.now();
    state.lastConnectDurationMs = state.connectStartedAt ? (Date.now() - state.connectStartedAt) : 0;
    state.lastSocketError = '';
    state.lastCloseCode = '';
    state.lastCloseReason = '';
    state.reconnectAttempts = 0;
    state.nextReconnectAt = 0;
    state.connectTimeoutStreak = 0;
    safeRender();

    if (state.name) {
      send('hello', { name: state.name });
    }

    if (state.resumeSession) {
      state.resumePending = true;
      send('resume_room', {
        roomId: state.resumeSession.roomId,
        seat: state.resumeSession.seat,
        resumeToken: state.resumeSession.resumeToken
      });
    }

    send('list_rooms', {});
  });

  ws.addEventListener('close', (event) => {
    if (connectTimeoutTimer) {
      clearTimeout(connectTimeoutTimer);
      connectTimeoutTimer = null;
    }
    state.connected = false;
    state.wsReadyState = ws.readyState;
    state.lastCloseCode = String(event.code ?? '');
    state.lastCloseReason = event.reason || '';
    state.resumePending = false;
    scheduleReconnect();
    safeRender();
  });

  ws.addEventListener('error', (event) => {
    if (connectTimeoutTimer) {
      clearTimeout(connectTimeoutTimer);
      connectTimeoutTimer = null;
    }
    state.wsReadyState = ws.readyState;
    state.lastSocketError = event?.message || 'WebSocket error';
    safeRender();
  });

  ws.addEventListener('message', (event) => handleMessage(event));
}

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }

  if (navigator && navigator.onLine === false) {
    state.nextReconnectAt = 0;
    setNotice('设备离线，等待网络恢复后自动重连');
    safeRender();
    return;
  }

  const delay = Math.min(12000, 800 * (2 ** Math.min(state.reconnectAttempts, 4)));
  state.reconnectAttempts += 1;
  state.nextReconnectAt = Date.now() + delay;
  setNotice(`连接中断，${Math.round(delay / 1000)} 秒后自动重连...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectSocket();
  }, delay);
}

function handleMessage(event) {
  try {
    state.lastMessageAt = Date.now();
    const { type, payload } = JSON.parse(event.data);

    if (type === 'welcome') {
      state.clientId = payload.clientId;
    }

    if (type === 'hello_ack') {
      state.name = payload.name;
      localStorage.setItem('mj_name', state.name);
      setNotice(`昵称已设置：${state.name}`);
    }

    if (type === 'seat_assigned') {
      state.roomId = payload.roomId;
      state.resumeSession = {
        roomId: payload.roomId,
        seat: payload.seat,
        resumeToken: payload.resumeToken,
        name: payload.name
      };
      persistResumeSession();
    }

    if (type === 'resume_ack') {
      state.resumePending = false;
      setNotice(`已恢复座位：房间${payload.roomId} 座位${payload.seat}`);
    }

    if (type === 'room_state') {
      state.roomState = payload;
      state.roomId = payload.roomId;
      if (payload.phase !== 'settlement') {
        state.rematchRequested = false;
      }
      send('list_rooms', {});
    }

    if (type === 'game_state') {
      const prevPhase = state.gameState?.phase;
      state.gameState = payload.state;
      state.you = payload.you;
      state.pendingReaction = payload.pendingReaction;
      state.pendingDiscardTileId = null;
      trackLatestDraw();
      onPhaseChange(prevPhase, state.gameState?.phase);
    }

    if (type === 'error') {
      if (state.resumePending) {
        state.resumePending = false;
        clearResumeSession();
        setNotice(`恢复失败：${payload.code}，请重新加入房间`);
      }
      setNotice(`错误：${payload.code}`);
    }

    if (type === 'rooms_list') {
      state.activeRooms = payload.rooms || [];
    }

    safeRender();
  } catch (err) {
    setNotice(`消息处理异常: ${err?.message || String(err)}`);
    console.error('[message_handler_error]', err);
    safeRender();
  }
}

connectSocket({ resetBackoff: true });

window.addEventListener('error', (event) => {
  setNotice(`前端异常: ${event.message}`);
  console.error('[ui_error]', event.error || event.message);
  safeRender();
});

window.addEventListener('unhandledrejection', (event) => {
  setNotice(`前端Promise异常: ${event.reason?.message || String(event.reason)}`);
  console.error('[ui_rejection]', event.reason);
  safeRender();
});

el.helloBtn.addEventListener('click', () => {
  const name = el.nameInput.value.trim();
  if (!name) {
    setNotice('请输入昵称');
    return;
  }

  send('hello', { name });
});

el.randomNameBtn.addEventListener('click', () => {
  const random = generateRandomName();
  el.nameInput.value = random;
  state.name = random;
  localStorage.setItem('mj_name', random);
  setNotice(`已生成随机昵称：${random}`);
  safeRender();
});

el.createRoomBtn.addEventListener('click', () => {
  send('create_room', {});
});

el.joinRoomBtn.addEventListener('click', () => {
  const roomId = el.roomIdInput.value.trim().toUpperCase();
  if (!roomId) {
    setNotice('请输入房间号');
    return;
  }

  send('join_room', { roomId });
});

el.addBotBtn.addEventListener('click', () => {
  if (!state.roomId) {
    setNotice('请先创建或加入房间');
    safeRender();
    return;
  }
  send('add_bot', {});
});

el.readyBtn.addEventListener('click', () => {
  send('set_ready', { ready: true });
});

el.refreshRoomsBtn.addEventListener('click', () => {
  send('list_rooms', {});
});

el.reconnectBtn.addEventListener('click', () => {
  if (ws) {
    try {
      ws.close();
    } catch {
      // ignore
    }
  }
  connectSocket({ resetBackoff: true });
});

setInterval(() => {
  safeRender();
}, 1000);

setInterval(() => {
  if (ws && ws.readyState === 1) {
    send('list_rooms', {});
  }
}, 3000);

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('[service_worker_register_failed]', error);
    });
  });
}

function render() {
  const seat = state.you?.seat;
  const phase = state.gameState?.phase || '未开局';
  const roomStatus = state.roomState?.hasGame ? '已开局' : '等待准备';
  const rematchReady = state.roomState?.rematchReadySeats?.length ?? 0;
  const occupiedSeats = (state.roomState?.players || []).filter((p) => p.occupied).length;
  const canAddBot = Boolean(state.roomState && !state.roomState.hasGame && occupiedSeats < 4);
  const mySeatState = (state.roomState?.players || []).find((p) => p.occupied && p.seat === seat);
  const maxRounds = state.roomState?.maxRounds || 8;
  const idleCloseText = formatIdleCloseCountdown(state.roomState?.idleCloseDeadlineAt);

  const base = state.connected
    ? `已连接 ${wsUrl} | clientId=${state.clientId || '-'} | 昵称=${state.name || '-'}`
    : '未连接';
  el.status.textContent = state.notice ? `${base}\n${state.notice}` : base;
  el.diag.textContent = [
    `wsUrl: ${wsUrl}`,
    `readyState: ${socketStateText(state.wsReadyState)} (${state.wsReadyState})`,
    `reconnectAttempts: ${state.reconnectAttempts}`,
    `nextReconnectAt: ${formatTime(state.nextReconnectAt)}`,
    `lastOpenAt: ${formatTime(state.lastOpenAt)}`,
    `lastMessageAt: ${formatTime(state.lastMessageAt)}`,
    `lastClose: code=${state.lastCloseCode || '-'} reason=${state.lastCloseReason || '-'}`,
    `lastError: ${state.lastSocketError || '-'}` ,
    `lastConnectDurationMs: ${state.lastConnectDurationMs || 0}`,
    `connectTimeouts: ${state.connectTimeouts || 0}` ,
    `connectTimeoutStreak: ${state.connectTimeoutStreak || 0}`
  ].join('\n');

  el.roomInfo.textContent = `房间号：${state.roomId || '-'} | 房间状态：${roomStatus} | 阶段：${phase} | 当前局次：${state.roomState?.roundNo || 0}/${maxRounds} | 我的座位：${seat ?? '-'} | 本局分数：${state.you?.score ?? '-'} | 我的总分：${mySeatState?.totalScore ?? '-'} | 再来一局确认：${rematchReady}/${occupiedSeats || 4} | 无真人在线关房：${idleCloseText}`;
  el.addBotBtn.disabled = !canAddBot;

  renderPlayers();
  renderTotals();
  renderHistory();
  renderTrend();
  renderFinalStats();
  renderActiveRooms();
  renderGameInfo();
  renderHand();
  renderMelds();
  renderDiscards();
  renderActionBar();
  renderEvents();
}

function renderActiveRooms() {
  const rooms = state.activeRooms || [];
  const frag = document.createDocumentFragment();

  if (rooms.length === 0) {
    const node = document.createElement('div');
    node.className = 'room-chip';
    node.textContent = '暂无活跃房间';
    frag.appendChild(node);
    el.activeRooms.replaceChildren(frag);
    return;
  }

  for (const room of rooms) {
    const chip = document.createElement('div');
    chip.className = 'room-chip';
    const phaseText = room.phase ? ` | ${room.phase}` : '';
    const label = document.createElement('span');
    label.textContent = `${room.roomId} (${room.occupied}/${room.capacity})${phaseText}`;
    chip.appendChild(label);

    const btn = createButton('加入');
    btn.disabled = !room.canJoin;
    btn.addEventListener('click', () => {
      el.roomIdInput.value = room.roomId;
      send('join_room', { roomId: room.roomId });
    });
    chip.appendChild(btn);
    frag.appendChild(chip);
  }

  el.activeRooms.replaceChildren(frag);
}

function renderPlayers() {
  const players = state.roomState?.players || [];
  const hasGame = Boolean(state.roomState?.hasGame);
  el.players.textContent = players
    .map((p) => {
      if (!p.occupied) {
        return `座位 ${p.seat}: 空`;
      }
      const gamePlayer = state.gameState?.players?.find((gp) => gp.seat === p.seat);
      const meldText = renderMeldSummary(gamePlayer?.melds || []);
      const lackText = gamePlayer?.lackSuit ? suitName(gamePlayer.lackSuit) : '-';
      const huText = gamePlayer?.hasHu ? '已胡' : '未胡';
      const onlineText = p.online ? '在线' : (p.auto ? '离线托管' : '离线');
      if (hasGame) {
        const role = p.isBot ? '机器人' : '玩家';
        return `座位 ${p.seat}: ${p.name}(${role}) | ${onlineText} | 总分=${p.totalScore ?? 0} | 缺门=${lackText} | ${huText} | 碰杠=${meldText}`;
      }
      const role = p.isBot ? '机器人' : '玩家';
      return `座位 ${p.seat}: ${p.name}(${role}) | ${onlineText} | 总分=${p.totalScore ?? 0} | 准备=${p.ready ? '已准备' : '未准备'}`;
    })
    .join('\n');
}

function renderTotals() {
  const players = (state.roomState?.players || []).filter((p) => p.occupied);
  if (players.length === 0) {
    el.totals.textContent = '暂无';
    return;
  }

  const lines = [...players]
    .sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0) || a.seat - b.seat)
    .map((p, idx) => `${idx + 1}. 座位${p.seat} ${p.name}：${p.totalScore ?? 0}`);
  el.totals.textContent = lines.join('\n');
}

function renderHistory() {
  const history = state.roomState?.roundHistory || [];
  const tail = history.slice(-10);
  if (tail.length === 0) {
    el.history.textContent = '暂无';
    return;
  }

  el.history.textContent = tail
    .map((item) => {
      const detail = (item.scoreChanges || [])
        .map((x) => `座位${x.seat} ${x.name} ${x.delta >= 0 ? '+' : ''}${x.delta} (总${x.totalScore})`)
        .join(' | ');
      return `第${item.roundNo}局 [${formatSettlementReason(item.settlementReason)}] ${detail}`;
    })
    .join('\n');
}

function renderTrend() {
  const players = (state.roomState?.players || []).filter((p) => p.occupied);
  const history = state.roomState?.roundHistory || [];
  if (players.length === 0 || history.length === 0) {
    el.trend.textContent = '暂无';
    return;
  }

  const seriesBySeat = new Map(players.map((p) => [p.seat, [0]]));
  for (const round of history) {
    const deltas = new Map((round.scoreChanges || []).map((x) => [x.seat, x.delta]));
    for (const p of players) {
      const arr = seriesBySeat.get(p.seat);
      const next = arr[arr.length - 1] + (deltas.get(p.seat) || 0);
      arr.push(next);
    }
  }

  const lines = players
    .sort((a, b) => a.seat - b.seat)
    .map((p) => `座位${p.seat} ${p.name}: ${seriesBySeat.get(p.seat).join(' -> ')}`);
  el.trend.textContent = lines.join('\n');
}

function renderFinalStats() {
  const finished = Boolean(state.roomState?.matchFinished);
  if (!finished) {
    el.finalStats.textContent = '未结束（默认最多8局）';
    return;
  }

  const standings = state.roomState?.finalStandings || [];
  if (standings.length === 0) {
    el.finalStats.textContent = '本房间对局已结束';
    return;
  }

  const lines = [
    `本房间已完成 ${state.roomState?.roundNo || 0}/${state.roomState?.maxRounds || 8} 局，最终排名如下：`,
    ...standings.map((x, idx) => `${idx + 1}. 座位${x.seat} ${x.name}${x.isBot ? '(机器人)' : ''}：${x.totalScore}`)
  ];
  el.finalStats.textContent = lines.join('\n');
}

function renderGameInfo() {
  if (!state.gameState) {
    el.gameInfo.textContent = '尚未开始对局';
    return;
  }

  if (!state.you) {
    el.gameInfo.textContent = '等待个人对局视图...';
    return;
  }

  const me = state.gameState.players.find((p) => p.seat === state.you.seat);
  if (!me) {
    el.gameInfo.textContent = '未找到当前座位信息';
    return;
  }
  el.gameInfo.textContent = [
    `当前出牌座位: ${state.gameState.turnSeat}`,
    `玩家胡牌状态: ${renderHuStatusOverview(state.gameState.players || [])}`,
    `我的定缺: ${me.lackSuit ? suitName(me.lackSuit) : '-'}`,
    `剩余牌墙: ${state.gameState.wallRemaining}`,
    `终局原因: ${formatSettlementReason(state.gameState.settlementReason)}`
  ].join('\n');
}

function renderHand() {
  const hand = state.you?.hand || [];
  const phase = state.gameState?.phase;
  const globalPendingReactions = Boolean(state.gameState?.pendingReactions);
  const canDiscardNow = Boolean(
    state.gameState
    && state.you
    && state.gameState.phase === 'play'
    && state.gameState.turnSeat === state.you.seat
    && !globalPendingReactions
    && !state.pendingReaction
  );
  const frag = document.createDocumentFragment();

  const highlightLatest = shouldHighlightLatestDraw();

  for (const tile of hand) {
    const btn = createButton('');
    btn.className = 'tile';
    btn.appendChild(createTileVisual(tile, { compact: false }));
    const isSelected = state.exchangeSelection.includes(tile.id);
    if (isSelected) {
      btn.classList.add('selected');
    }
    if (highlightLatest && tile.id === state.latestDrawTileId) {
      btn.classList.add('new-draw');
    }
    if (tile.id === state.pendingDiscardTileId) {
      btn.classList.add('pending-discard');
    }
    btn.disabled = !(canDiscardNow || phase === 'exchange');
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      if (phase === 'exchange') {
        toggleExchangeTile(tile);
        safeRender();
        return;
      }
      if (!canDiscardNow) {
        if (globalPendingReactions) {
          setNotice('当前有他人操作响应中，请等待');
        } else {
          setNotice(`当前阶段为 ${state.gameState?.phase || 'unknown'}，不能出牌`);
        }
        safeRender();
        return;
      }
      state.latestDrawTileId = null;
      state.latestDrawAt = 0;
      state.pendingDiscardTileId = tile.id;
      setNotice(`已出牌：${tileLabel(tile)}，等待服务器确认`);
      send('discard', { tileId: tile.id });
    });
    frag.appendChild(btn);
  }
  el.hand.replaceChildren(frag);
}

function renderMelds() {
  const melds = state.you?.melds || [];
  if (melds.length === 0) {
    el.melds.textContent = '无';
    return;
  }

  el.melds.textContent = melds.map(formatMeld).join('\n');
}

function renderDiscards() {
  const discards = state.gameState?.discardPool || [];
  const reversed = [...discards].reverse();
  const frag = document.createDocumentFragment();

  for (const item of reversed) {
    const node = document.createElement('div');
    node.className = `discard${item.claimed ? ' claimed' : ''}`;
    const claimedText = item.claimed ? '（已被响应）' : '';
    const seatText = document.createElement('span');
    seatText.textContent = `座位${item.seat}: `;
    node.appendChild(seatText);
    node.appendChild(createTileVisual(item.tile, { compact: true }));
    if (claimedText) {
      const claimNode = document.createElement('span');
      claimNode.textContent = claimedText;
      node.appendChild(claimNode);
    }
    frag.appendChild(node);
  }

  if (reversed.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'discard';
    empty.textContent = '暂无弃牌';
    frag.appendChild(empty);
  }

  el.discards.replaceChildren(frag);
}

function renderActionBar() {
  el.actionBar.innerHTML = '';

  if (!state.gameState || !state.you) {
    return;
  }

  if (state.gameState.phase === 'exchange') {
    const submit = createButton(`提交换三张 (${state.exchangeSelection.length}/3)`);
    submit.className = 'primary';
    submit.disabled = state.exchangeSubmitted || !isValidExchangeSelection(state.you.hand, state.exchangeSelection);
    submit.addEventListener('click', () => {
      if (!isValidExchangeSelection(state.you.hand, state.exchangeSelection)) {
        setNotice('换三张必须选择 3 张同花色手牌');
        safeRender();
        return;
      }
      send('submit_exchange', { tileIds: [...state.exchangeSelection] });
      state.exchangeSubmitted = true;
      setNotice('已提交换三张，等待其他玩家');
      safeRender();
    });
    el.actionBar.appendChild(submit);
    return;
  }

  if (state.gameState.phase === 'lack') {
    for (const lackSuit of ['wan', 'tiao', 'tong']) {
      const btn = createButton(`定缺 ${suitName(lackSuit)}`);
      btn.disabled = state.lackSubmitted;
      btn.addEventListener('click', () => {
        send('set_lack', { lackSuit });
        state.lackSubmitted = true;
        setNotice(`已提交定缺 ${suitName(lackSuit)}，等待其他玩家`);
        safeRender();
      });
      el.actionBar.appendChild(btn);
    }
    return;
  }

  if (state.gameState.phase === 'settlement') {
    if (state.roomState?.matchFinished) {
      const done = createButton('本房间已达局数上限');
      done.disabled = true;
      el.actionBar.appendChild(done);
      return;
    }

    if (!hasOnlineHumanPlayer()) {
      const waitBtn = createButton('等待真人玩家回到房间后再继续');
      waitBtn.disabled = true;
      el.actionBar.appendChild(waitBtn);
      return;
    }

    const acceptedSeats = state.roomState?.rematchReadySeats || [];
    const accepted = acceptedSeats.includes(state.you.seat);
    const btn = createButton(accepted ? '已确认再来一局' : '再来一局');
    btn.className = accepted ? '' : 'primary';
    btn.disabled = accepted || state.rematchRequested;
    btn.addEventListener('click', () => {
      send('request_rematch', {});
      state.rematchRequested = true;
      setNotice('已发送再来一局请求，等待其他玩家');
      safeRender();
    });
    el.actionBar.appendChild(btn);
    return;
  }

  if (state.pendingReaction) {
    const pendingInfo = document.createElement('div');
    pendingInfo.className = 'pending-reaction-info';
    const fromSeat = document.createElement('span');
    fromSeat.textContent = `座位${state.pendingReaction.fromSeat} 打出：`;
    pendingInfo.appendChild(fromSeat);
    pendingInfo.appendChild(createTileVisual(state.pendingReaction.tile, { compact: false }));
    el.actionBar.appendChild(pendingInfo);

    for (const action of ['hu', 'gang', 'peng', 'pass']) {
      if (action === 'hu' && !state.pendingReaction.canHu) continue;
      if (action === 'gang' && !state.pendingReaction.canGang) continue;
      if (action === 'peng' && !state.pendingReaction.canPeng) continue;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = `响应: ${actionText(action)}`;
      btn.className = `reaction-btn ${action === 'hu' ? 'primary' : ''}`.trim();
      btn.addEventListener('click', () => send('react', { action }));
      el.actionBar.appendChild(btn);
    }
    return;
  }

  if (state.gameState.turnSeat !== state.you.seat) {
    return;
  }

  const selfHuBtn = createButton('自摸胡');
  selfHuBtn.className = 'primary';
  if (state.you.canSelfHu) {
    selfHuBtn.addEventListener('click', () => send('self_hu', {}));
    el.actionBar.appendChild(selfHuBtn);
  }

  for (const candidate of findAnGangCandidates(state.you.hand)) {
    const btn = createButton(`暗杠 ${tileLabel(candidate)}`);
    btn.addEventListener('click', () => send('an_gang', { tileId: candidate.id }));
    el.actionBar.appendChild(btn);
  }

  for (const candidate of findBuGangCandidates(state.you.hand, state.you.melds || [])) {
    const btn = createButton(`补杠 ${tileLabel(candidate)}`);
    btn.addEventListener('click', () => send('bu_gang', { tileId: candidate.id }));
    el.actionBar.appendChild(btn);
  }
}

function renderEvents() {
  const events = state.gameState?.settlementEvents || [];
  const tail = events.slice(-10);
  el.events.textContent = tail.length === 0
    ? '暂无'
    : tail.map((event, idx) => `${idx + 1}. ${formatSettlementEvent(event)}`).join('\n');
}

function findAnGangCandidates(hand) {
  const map = new Map();
  for (const tile of hand) {
    const key = `${tile.suit}-${tile.rank}`;
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(tile);
  }

  return [...map.values()].filter((tiles) => tiles.length >= 4).map((tiles) => tiles[0]);
}

function findBuGangCandidates(hand, melds) {
  const candidates = [];
  const pengKinds = melds
    .filter((m) => m.type === 'peng')
    .map((m) => `${m.tile.suit}-${m.tile.rank}`);

  for (const tile of hand) {
    const key = `${tile.suit}-${tile.rank}`;
    if (pengKinds.includes(key) && !candidates.some((t) => t.suit === tile.suit && t.rank === tile.rank)) {
      candidates.push(tile);
    }
  }

  return candidates;
}

function toggleExchangeTile(tile) {
  if (state.exchangeSubmitted) {
    return;
  }

  const id = tile.id;
  const selected = state.exchangeSelection;
  if (selected.includes(id)) {
    state.exchangeSelection = selected.filter((x) => x !== id);
    return;
  }

  if (selected.length >= 3) {
    setNotice('最多只能选 3 张');
    return;
  }

  const selectedTiles = state.you.hand.filter((t) => selected.includes(t.id));
  if (selectedTiles.length > 0 && selectedTiles[0].suit !== tile.suit) {
    setNotice('换三张必须同花色');
    return;
  }

  state.exchangeSelection = [...selected, id];
}

function isValidExchangeSelection(hand, ids) {
  if (ids.length !== 3) return false;
  const tiles = hand.filter((t) => ids.includes(t.id));
  if (tiles.length !== 3) return false;
  return tiles.every((t) => t.suit === tiles[0].suit);
}

function onPhaseChange(prevPhase, nextPhase) {
  if (prevPhase === nextPhase) return;
  if (nextPhase === 'exchange') {
    state.exchangeSelection = [];
    state.exchangeSubmitted = false;
    state.lackSubmitted = false;
    state.latestDrawTileId = null;
    state.latestDrawAt = 0;
    state.pendingDiscardTileId = null;
    state.lastKnownHandIds = state.you?.hand?.map((t) => t.id) || [];
    return;
  }
  if (nextPhase === 'lack') {
    state.exchangeSelection = [];
    state.exchangeSubmitted = true;
    state.lackSubmitted = false;
    return;
  }
  if (nextPhase === 'play') {
    state.exchangeSelection = [];
    state.exchangeSubmitted = false;
    state.lackSubmitted = false;
  }
}

function suitName(suit) {
  return suit === 'wan' ? '万' : suit === 'tiao' ? '条' : '筒';
}

function actionText(action) {
  const map = {
    hu: '胡',
    gang: '杠',
    peng: '碰',
    pass: '过'
  };
  return map[action] || action;
}

function formatSettlementEvent(event) {
  if (event.type === 'hu') {
    const winModeMap = {
      dian_pao: '点炮胡',
      zi_mo: '自摸胡',
      qiang_gang_hu: '抢杠胡'
    };
    const mode = winModeMap[event.winMode] || event.winMode;
    const fanDetail = formatFanDetail(event);
    if (event.winMode === 'zi_mo') {
      return `${mode}: 座位${event.winnerSeat} 获得 ${event.amount} x ${event.payerCount || 0}，番数=${event.fan}；${fanDetail}`;
    }
    return `${mode}: 座位${event.winnerSeat} <- 座位${event.fromSeat}，${event.amount} 分，番数=${event.fan}；${fanDetail}`;
  }

  if (event.type === 'gang') {
    const typeMap = {
      ming_gang: '明杠',
      an_gang: '暗杠',
      bu_gang: '补杠'
    };
    const gangType = typeMap[event.gangType] || event.gangType;
    if (event.fromSeat === null || event.fromSeat === undefined) {
      return `${gangType}: 座位${event.winnerSeat} 获得 ${event.amount} x ${event.payerCount || 0}`;
    }
    return `${gangType}: 座位${event.winnerSeat} <- 座位${event.fromSeat}，${event.amount} 分`;
  }

  return JSON.stringify(event);
}

function formatFanDetail(event) {
  const fanByPattern = {
    ping_hu: 1,
    peng_peng_hu: 2,
    qi_dui: 2,
    long_qi_dui: 4,
    jiang_dui: 4,
    yao_jiu: 4,
    qing_yi_se: 4,
    zi_mo: 1,
    men_qing: 1,
    gang_shang_hua: 1,
    gang_shang_pao: 1,
    qiang_gang_hu: 1,
    hai_di_lao_yue: 1,
    hai_di_pao: 1,
    tian_hu: 6,
    di_hu: 6
  };

  const patternName = {
    ping_hu: '平胡',
    peng_peng_hu: '碰碰胡',
    qi_dui: '七对',
    long_qi_dui: '龙七对',
    jiang_dui: '将对',
    yao_jiu: '幺九',
    qing_yi_se: '清一色',
    zi_mo: '自摸',
    men_qing: '门清',
    gang_shang_hua: '杠上花',
    gang_shang_pao: '杠上炮',
    qiang_gang_hu: '抢杠胡',
    hai_di_lao_yue: '海底捞月',
    hai_di_pao: '海底炮',
    tian_hu: '天胡',
    di_hu: '地胡'
  };

  const patterns = event.patterns || [];
  if (patterns.length === 0) {
    return `牌型明细：未知，按 ${event.fan} 番结算`;
  }

  const terms = patterns.map((key) => {
    const name = patternName[key] || key;
    const fan = fanByPattern[key];
    return fan ? `${name}(${fan}番)` : name;
  });
  const rawFan = event.rawFan ?? event.fan;
  const cappedFan = event.fan;
  if (rawFan !== cappedFan) {
    return `牌型：${terms.join(' + ')} => 原始${rawFan}番，封顶后${cappedFan}番`;
  }
  return `牌型：${terms.join(' + ')} => 合计${cappedFan}番`;
}


function formatSettlementReason(reason) {
  const map = {
    all_but_one_hu: '三家已胡（血战结束）',
    wall_exhausted: '牌墙耗尽（流局）',
    no_active_players: '无可行动玩家'
  };
  if (!reason) {
    return '-';
  }
  return map[reason] || reason;
}

function renderHuStatusOverview(players) {
  if (!players || players.length === 0) {
    return '-';
  }
  return players
    .map((player) => `座位${player.seat}:${player.hasHu ? '已胡' : '未胡'}`)
    .join(' | ');
}

function formatMeld(meld) {
  const typeMap = {
    peng: '碰',
    ming_gang: '明杠',
    bu_gang: '补杠',
    an_gang: '暗杠'
  };
  const typeText = typeMap[meld.type] || meld.type;
  if (meld.type === 'an_gang') {
    return `${typeText}`;
  }
  return `${typeText}: ${tileLabel(meld.tile)}`;
}

function renderMeldSummary(melds) {
  if (!melds || melds.length === 0) {
    return '无';
  }
  return melds.map(formatMeld).join('、');
}

function tileLabel(tile) {
  const suitMap = {
    wan: '万',
    tiao: '条',
    tong: '筒'
  };
  return `${tileGlyph(tile)} ${tile.rank}${suitMap[tile.suit]}`;
}

function tileGlyph(tile) {
  const offsets = {
    wan: 0x1F007,
    tiao: 0x1F010,
    tong: 0x1F019
  };
  const start = offsets[tile.suit];
  if (!start || tile.rank < 1 || tile.rank > 9) {
    return '🀫';
  }
  return String.fromCodePoint(start + tile.rank - 1);
}

function createTileVisual(tile, { compact }) {
  const wrap = document.createElement('span');
  wrap.className = `tile-visual${compact ? ' compact' : ''}`;

  const glyph = document.createElement('span');
  glyph.className = 'tile-glyph';
  glyph.textContent = tileGlyph(tile);
  wrap.appendChild(glyph);

  if (!compact) {
    const text = document.createElement('span');
    text.className = 'tile-text';
    text.textContent = `${tile.rank}${suitName(tile.suit)}`;
    wrap.appendChild(text);
  }

  return wrap;
}

function logStatus(message) {
  setNotice(message);
  safeRender();
}

function send(type, payload) {
  if (!ws || ws.readyState !== 1) {
    setNotice('连接未建立');
    safeRender();
    return;
  }

  ws.send(JSON.stringify({ type, payload }));
}

function setNotice(message) {
  state.notice = message;
}

function safeRender() {
  try {
    render();
  } catch (err) {
    state.notice = `渲染异常: ${err?.message || String(err)}`;
    console.error('[render_error]', err);
    el.status.textContent = state.notice;
  }
}

function trackLatestDraw() {
  if (!state.you?.hand) {
    return;
  }

  const currentIds = state.you.hand.map((t) => t.id);
  const prevSet = new Set(state.lastKnownHandIds);
  const added = currentIds.filter((id) => !prevSet.has(id));

  if (added.length === 1) {
    state.latestDrawTileId = added[0];
    state.latestDrawAt = Date.now();
  } else if (added.length === 0) {
    // hand size may stay the same during replacement-like updates, keep current marker.
  } else {
    // phase switch / sync jump, avoid wrong marker.
    state.latestDrawTileId = null;
    state.latestDrawAt = 0;
    state.pendingDiscardTileId = null;
  }

  if (state.latestDrawTileId && !currentIds.includes(state.latestDrawTileId)) {
    state.latestDrawTileId = null;
    state.latestDrawAt = 0;
    state.pendingDiscardTileId = null;
  }

  state.lastKnownHandIds = currentIds;
}

function shouldHighlightLatestDraw() {
  if (!state.latestDrawTileId || !state.latestDrawAt) {
    return false;
  }
  return Date.now() - state.latestDrawAt <= 5000;
}

function createButton(text) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = text;
  return btn;
}

function pickRandom(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

function socketStateText(stateCode) {
  if (stateCode === 0) return 'CONNECTING';
  if (stateCode === 1) return 'OPEN';
  if (stateCode === 2) return 'CLOSING';
  if (stateCode === 3) return 'CLOSED';
  return 'UNKNOWN';
}

function formatTime(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleTimeString();
}

function formatIdleCloseCountdown(ts) {
  if (!ts) {
    return '-';
  }
  const remainMs = ts - Date.now();
  if (remainMs <= 0) {
    return '即将关闭';
  }
  const mins = Math.floor(remainMs / 60000);
  const secs = Math.floor((remainMs % 60000) / 1000);
  return `${mins}分${secs.toString().padStart(2, '0')}秒`;
}

function hasOnlineHumanPlayer() {
  return (state.roomState?.players || []).some((p) => p.occupied && !p.isBot && p.online);
}

function generateRandomName() {
  const prefixes = ['雀友', '牌侠', '听牌王', '川麻客', '杠上花'];
  const suffixes = ['东风', '南风', '西风', '北风', '红中', '发财', '白板'];

  let name = `${pickRandom(prefixes)}${pickRandom(suffixes)}${randomInt(1000, 9999)}`;
  if (name === state.lastGeneratedName) {
    name = `${pickRandom(prefixes)}${pickRandom(suffixes)}${randomInt(1000, 9999)}`;
  }
  state.lastGeneratedName = name;
  return name;
}

function randomInt(min, max) {
  if (window.crypto?.getRandomValues) {
    const buf = new Uint32Array(1);
    window.crypto.getRandomValues(buf);
    const span = max - min + 1;
    return min + (buf[0] % span);
  }
  return min + Math.floor(Math.random() * (max - min + 1));
}


function isIOSSafari() {
  const ua = navigator.userAgent || '';
  const isIOS = /iP(hone|ad|od)/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  return isIOS && isSafari;
}

function resolveWsUrl() {
  const qs = new URLSearchParams(location.search);
  const qsWs = qs.get('ws');
  if (qsWs && /^wss?:\/\//i.test(qsWs)) {
    return qsWs;
  }
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
}

function readResumeSession() {
  try {
    const raw = localStorage.getItem(RESUME_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed?.roomId || parsed?.seat === undefined || !parsed?.resumeToken) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function persistResumeSession() {
  if (!state.resumeSession) {
    localStorage.removeItem(RESUME_STORAGE_KEY);
    return;
  }
  localStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify(state.resumeSession));
}

function clearResumeSession() {
  state.resumeSession = null;
  localStorage.removeItem(RESUME_STORAGE_KEY);
}

window.addEventListener('online', () => {
  setNotice('网络已恢复，正在重连...');
  connectSocket({ resetBackoff: true });
});

window.addEventListener('offline', () => {
  setNotice('设备离线，请检查 Wi‑Fi');
  safeRender();
});

safeRender();
