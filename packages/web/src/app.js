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
  connected: false
};

const el = {
  nameInput: document.querySelector('#nameInput'),
  helloBtn: document.querySelector('#helloBtn'),
  createRoomBtn: document.querySelector('#createRoomBtn'),
  roomIdInput: document.querySelector('#roomIdInput'),
  joinRoomBtn: document.querySelector('#joinRoomBtn'),
  readyBtn: document.querySelector('#readyBtn'),
  status: document.querySelector('#status'),
  roomInfo: document.querySelector('#roomInfo'),
  players: document.querySelector('#players'),
  gameInfo: document.querySelector('#gameInfo'),
  actionBar: document.querySelector('#actionBar'),
  hand: document.querySelector('#hand'),
  melds: document.querySelector('#melds'),
  events: document.querySelector('#events')
};

el.nameInput.value = state.name;

ws.addEventListener('open', () => {
  state.connected = true;
  render();

  if (state.name) {
    send('hello', { name: state.name });
  }
});

ws.addEventListener('close', (event) => {
  state.connected = false;
  logStatus(`连接已断开 code=${event.code} reason=${event.reason || '(none)'}`);
  render();
});

ws.addEventListener('message', (event) => {
  const { type, payload } = JSON.parse(event.data);

  if (type === 'welcome') {
    state.clientId = payload.clientId;
  }

  if (type === 'hello_ack') {
    state.name = payload.name;
    localStorage.setItem('mj_name', state.name);
    logStatus(`昵称已设置：${state.name}`);
  }

  if (type === 'room_state') {
    state.roomState = payload;
    state.roomId = payload.roomId;
  }

  if (type === 'game_state') {
    state.gameState = payload.state;
    state.you = payload.you;
    state.pendingReaction = payload.pendingReaction;
  }

  if (type === 'error') {
    logStatus(`错误：${payload.code}`);
  }

  render();
});

window.addEventListener('error', (event) => {
  logStatus(`前端异常: ${event.message}`);
  console.error('[ui_error]', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  logStatus(`前端Promise异常: ${event.reason?.message || String(event.reason)}`);
  console.error('[ui_rejection]', event.reason);
});

el.helloBtn.addEventListener('click', () => {
  const name = el.nameInput.value.trim();
  if (!name) {
    logStatus('请输入昵称');
    return;
  }

  send('hello', { name });
});

el.createRoomBtn.addEventListener('click', () => {
  send('create_room', {});
});

el.joinRoomBtn.addEventListener('click', () => {
  const roomId = el.roomIdInput.value.trim().toUpperCase();
  if (!roomId) {
    logStatus('请输入房间号');
    return;
  }

  send('join_room', { roomId });
});

el.readyBtn.addEventListener('click', () => {
  send('set_ready', { ready: true });
});

function render() {
  const seat = state.you?.seat;
  const phase = state.gameState?.phase || '未开局';

  el.status.textContent = state.connected
    ? `已连接 ${wsUrl} | clientId=${state.clientId || '-'} | 昵称=${state.name || '-'}`
    : '未连接';

  el.roomInfo.textContent = `房间号：${state.roomId || '-'} | 阶段：${phase} | 我的座位：${seat ?? '-'} | 我的分数：${state.you?.score ?? '-'}`;

  renderPlayers();
  renderGameInfo();
  renderHand();
  renderMelds();
  renderActionBar();
  renderEvents();
}

function renderPlayers() {
  const players = state.roomState?.players || [];
  el.players.textContent = players
    .map((p) => {
      if (!p.occupied) {
        return `座位 ${p.seat}: 空`;
      }
      return `座位 ${p.seat}: ${p.name} | ready=${p.ready}`;
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
    `我的定缺: ${me.lackSuit || '-'}`,
    `剩余牌墙: ${state.gameState.wallRemaining}`,
    `终局原因: ${state.gameState.settlementReason || '-'}`
  ].join('\n');
}

function renderHand() {
  el.hand.innerHTML = '';
  const hand = state.you?.hand || [];

  for (const tile of hand) {
    const btn = createButton(tileLabel(tile));
    btn.className = 'tile';
    btn.addEventListener('click', () => send('discard', { tileId: tile.id }));
    el.hand.appendChild(btn);
  }
}

function renderMelds() {
  const melds = state.you?.melds || [];
  if (melds.length === 0) {
    el.melds.textContent = '无';
    return;
  }

  el.melds.textContent = melds.map((m) => `${m.type}: ${tileLabel(m.tile)}`).join('\n');
}

function renderActionBar() {
  el.actionBar.innerHTML = '';

  if (!state.gameState || !state.you) {
    return;
  }

  if (state.pendingReaction) {
    for (const action of ['hu', 'gang', 'peng', 'pass']) {
      if (action === 'hu' && !state.pendingReaction.canHu) continue;
      if (action === 'gang' && !state.pendingReaction.canGang) continue;
      if (action === 'peng' && !state.pendingReaction.canPeng) continue;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = `响应: ${action}`;
      btn.className = action === 'hu' ? 'primary' : '';
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
  selfHuBtn.addEventListener('click', () => send('self_hu', {}));
  el.actionBar.appendChild(selfHuBtn);

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
  el.events.textContent = tail.length === 0 ? '暂无' : JSON.stringify(tail, null, 2);
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

function tileLabel(tile) {
  const suitMap = {
    wan: '万',
    tiao: '条',
    tong: '筒'
  };
  return `${tile.rank}${suitMap[tile.suit]}`;
}

function logStatus(message) {
  el.status.textContent = message;
}

function send(type, payload) {
  if (ws.readyState !== 1) {
    logStatus('连接未建立');
    return;
  }

  ws.send(JSON.stringify({ type, payload }));
}

function createButton(text) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = text;
  return btn;
}
