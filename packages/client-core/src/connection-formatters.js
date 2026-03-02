/**
 * 中文：连接状态展示格式化工具。
 * EN: Connection-status formatting helpers.
 */

export function socketStateText(stateCode) {
  if (stateCode === 0) return 'CONNECTING';
  if (stateCode === 1) return 'OPEN';
  if (stateCode === 2) return 'CLOSING';
  if (stateCode === 3) return 'CLOSED';
  return 'UNKNOWN';
}

export function formatTime(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleTimeString();
}
