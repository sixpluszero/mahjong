/**
 * 中文：浏览器侧可复用实时连接运行时。
 * 负责：WebSocket 连接、超时防护、指数退避重连与消息收发。
 * EN: Reusable browser realtime runtime.
 * Handles websocket connect, timeout guard, exponential-backoff reconnect, and message transport.
 */

export function createRealtimeClient(options) {
  const {
    wsUrl,
    connectTimeoutMs = 12000,
    connectTimeoutMaxMs = 30000,
    isOnline = () => true,
    onOpen,
    onClose,
    onError,
    onMessage,
    onReconnectScheduled,
    onReconnectSkippedOffline,
    onConnectTimeout
  } = options;

  let ws = null;
  let reconnectTimer = null;
  let connectTimeoutTimer = null;
  let connectStartedAt = 0;
  let reconnectAttempts = 0;
  let connectTimeoutStreak = 0;

  function clearTimers() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (connectTimeoutTimer) {
      clearTimeout(connectTimeoutTimer);
      connectTimeoutTimer = null;
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    if (!isOnline()) {
      onReconnectSkippedOffline?.();
      return;
    }

    const delayMs = Math.min(12000, 800 * (2 ** Math.min(reconnectAttempts, 4)));
    reconnectAttempts += 1;
    const nextReconnectAt = Date.now() + delayMs;
    onReconnectScheduled?.({ delayMs, attempt: reconnectAttempts, nextReconnectAt });

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delayMs);
  }

  function connect({ resetBackoff = false } = {}) {
    if (resetBackoff) {
      reconnectAttempts = 0;
      connectTimeoutStreak = 0;
    }

    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    clearTimers();
    connectStartedAt = Date.now();
    ws = new WebSocket(wsUrl);

    const timeoutMs = Math.min(connectTimeoutMaxMs, connectTimeoutMs + connectTimeoutStreak * 4000);
    connectTimeoutTimer = setTimeout(() => {
      if (!ws || ws.readyState !== WebSocket.CONNECTING) return;
      connectTimeoutStreak += 1;
      onConnectTimeout?.({ timeoutMs, streak: connectTimeoutStreak });
      try { ws.close(); } catch {}
    }, timeoutMs);

    ws.addEventListener('open', () => {
      if (connectTimeoutTimer) {
        clearTimeout(connectTimeoutTimer);
        connectTimeoutTimer = null;
      }
      reconnectAttempts = 0;
      connectTimeoutStreak = 0;
      onOpen?.({ readyState: ws.readyState, connectDurationMs: Date.now() - connectStartedAt });
    });

    ws.addEventListener('close', (event) => {
      if (connectTimeoutTimer) {
        clearTimeout(connectTimeoutTimer);
        connectTimeoutTimer = null;
      }
      onClose?.({ code: event.code, reason: event.reason, readyState: ws?.readyState ?? WebSocket.CLOSED });
      scheduleReconnect();
    });

    ws.addEventListener('error', (event) => {
      onError?.({ message: event?.message || 'WebSocket error', readyState: ws?.readyState ?? WebSocket.CLOSED });
    });

    ws.addEventListener('message', (event) => onMessage?.(event));
  }

  function send(type, payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    ws.send(JSON.stringify({ type, payload }));
    return true;
  }

  function close() {
    if (!ws) return;
    try { ws.close(); } catch {}
  }

  function isOpen() {
    return !!ws && ws.readyState === WebSocket.OPEN;
  }

  function getReadyState() {
    return ws?.readyState ?? WebSocket.CLOSED;
  }

  return { connect, send, close, isOpen, getReadyState };
}
