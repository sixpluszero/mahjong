/**
 * 中文：重连策略工具。
 * EN: Reconnect policy helpers.
 */

export function computeReconnectDelayMs(attempt) {
  return Math.min(12000, 800 * (2 ** Math.min(attempt, 4)));
}

export function computeConnectTimeoutMs(baseMs, maxMs, timeoutStreak) {
  return Math.min(maxMs, baseMs + timeoutStreak * 4000);
}
