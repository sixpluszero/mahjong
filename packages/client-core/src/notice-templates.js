/**
 * 中文：连接与恢复相关提示文案模板。
 * EN: Notice message templates for connection and resume flows.
 */

export function reconnectScheduledNotice(delayMs) {
  return `连接中断，${Math.round(delayMs / 1000)} 秒后自动重连...`;
}

export function offlineReconnectNotice() {
  return '设备离线，等待网络恢复后自动重连';
}

export function reconnectOnlineNotice() {
  return '网络已恢复，正在重连...';
}

export function disconnectedNotice() {
  return '连接未建立';
}

export function resumeFailedNotice(code) {
  return `恢复失败：${code}，请重新加入房间`;
}

export function serverErrorNotice(code) {
  return `错误：${code}`;
}

export function messageHandlerErrorNotice(message) {
  return `消息处理异常: ${message}`;
}
