const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
const ws = new WebSocket(wsUrl);

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
  rematchRequested: false,
  lastSocketError: '',
  lastCloseCode: '',
  lastCloseReason: '',
  lastOpenAt: 0,
  lastMessageAt: 0,
  activeRooms: [],
  lastGeneratedName: ''
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
  gameInfo: document.querySelector('#gameInfo'),
  actionBar: document.querySelector('#actionBar'),
  hand: document.querySelector('#hand'),
  melds: document.querySelector('#melds'),
  discards: document.querySelector('#discards'),
  events: document.querySelector('#events')
};

el.nameInput.value = state.name;

ws.addEventListener('open', () => {
  state.connected = true;
  state.lastOpenAt = Date.now();
  state.lastSocketError = '';
  state.lastCloseCode = '';
  state.lastCloseReason = '';
  safeRender();

  if (state.name) {
    send('hello', { name: state.name });
  }
  send('list_rooms', {});
});

ws.addEventListener('close', (event) => {
  state.connected = false;
  state.lastCloseCode = String(event.code ?? '');
  state.lastCloseReason = event.reason || '';
  setNotice(`连接已断开 code=${event.code} reason=${event.reason || '(none)'}`);
  safeRender();
});

ws.addEventListener('error', (event) => {
  state.lastSocketError = event?.message || 'WebSocket error';
  safeRender();
});

ws.addEventListener('message', (event) => {
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
      trackLatestDraw();
      onPhaseChange(prevPhase, state.gameState?.phase);
    }

    if (type === 'error') {
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
});

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
  location.reload();
});

setInterval(() => {
  safeRender();
}, 1000);

setInterval(() => {
  if (ws.readyState === 1) {
    send('list_rooms', {});
  }
}, 3000);

function render() {
  const seat = state.you?.seat;
  const phase = state.gameState?.phase || '未开局';
  const roomStatus = state.roomState?.hasGame ? '已开局' : '等待准备';
  const rematchReady = state.roomState?.rematchReadySeats?.length ?? 0;
  const occupiedSeats = (state.roomState?.players || []).filter((p) => p.occupied).length;
  const canAddBot = Boolean(state.roomState && !state.roomState.hasGame && occupiedSeats < 4);
  const mySeatState = (state.roomState?.players || []).find((p) => p.occupied && p.seat === seat);

  const base = state.connected
    ? `已连接 ${wsUrl} | clientId=${state.clientId || '-'} | 昵称=${state.name || '-'}`
    : '未连接';
  el.status.textContent = state.notice ? `${base}\n${state.notice}` : base;
  el.diag.textContent = [
    `wsUrl: ${wsUrl}`,
    `readyState: ${socketStateText(ws.readyState)} (${ws.readyState})`,
    `lastOpenAt: ${formatTime(state.lastOpenAt)}`,
    `lastMessageAt: ${formatTime(state.lastMessageAt)}`,
    `lastClose: code=${state.lastCloseCode || '-'} reason=${state.lastCloseReason || '-'}`,
    `lastError: ${state.lastSocketError || '-'}`
  ].join('\n');

  el.roomInfo.textContent = `房间号：${state.roomId || '-'} | 房间状态：${roomStatus} | 阶段：${phase} | 当前局次：${state.roomState?.roundNo || 0} | 我的座位：${seat ?? '-'} | 本局分数：${state.you?.score ?? '-'} | 我的总分：${mySeatState?.totalScore ?? '-'} | 再来一局确认：${rematchReady}/${occupiedSeats || 4}`;
  el.addBotBtn.disabled = !canAddBot;

  renderPlayers();
  renderTotals();
  renderHistory();
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
      if (hasGame) {
        const role = p.isBot ? '机器人' : '玩家';
        return `座位 ${p.seat}: ${p.name}(${role}) | 总分=${p.totalScore ?? 0} | 缺门=${lackText} | ${huText} | 碰杠=${meldText}`;
      }
      const role = p.isBot ? '机器人' : '玩家';
      return `座位 ${p.seat}: ${p.name}(${role}) | 总分=${p.totalScore ?? 0} | 准备=${p.ready ? '已准备' : '未准备'}`;
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
      return `第${item.roundNo}局 [${item.settlementReason || '-'}] ${detail}`;
    })
    .join('\n');
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
    `我是否已胡: ${me.hasHu}`,
    `我的定缺: ${me.lackSuit ? suitName(me.lackSuit) : '-'}`,
    `剩余牌墙: ${state.gameState.wallRemaining}`,
    `终局原因: ${state.gameState.settlementReason || '-'}`
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

  const renderHand = reorderHandByLatestDraw(hand);
  const highlightLatest = shouldHighlightLatestDraw();

  for (const tile of renderHand) {
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
  if (ws.readyState !== 1) {
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
  }

  if (state.latestDrawTileId && !currentIds.includes(state.latestDrawTileId)) {
    state.latestDrawTileId = null;
    state.latestDrawAt = 0;
  }

  state.lastKnownHandIds = currentIds;
}

function reorderHandByLatestDraw(hand) {
  if (!state.latestDrawTileId) {
    return hand;
  }

  const idx = hand.findIndex((tile) => tile.id === state.latestDrawTileId);
  if (idx === -1) {
    return hand;
  }

  const arr = [...hand];
  const [latest] = arr.splice(idx, 1);
  arr.push(latest);
  return arr;
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

safeRender();
