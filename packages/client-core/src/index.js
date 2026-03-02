/**
 * 中文：跨端共享客户端运行时入口。
 * EN: Shared cross-platform client runtime entry.
 */

export { createRealtimeClient } from './browser-runtime.js';

export { reduceServerMessage } from './protocol-reducer.js';
export { validateResumeSession, readResumeSession, persistResumeSession, clearResumeSession } from './resume-session.js';
export { getRoomIdFromUrlSearch, buildInviteLink } from './url-intents.js';
export { socketStateText, formatTime } from './connection-formatters.js';
export { computeReconnectDelayMs, computeConnectTimeoutMs } from './reconnect-policy.js';
export { reconnectScheduledNotice, offlineReconnectNotice, reconnectOnlineNotice, disconnectedNotice, resumeFailedNotice, serverErrorNotice, messageHandlerErrorNotice } from './notice-templates.js';
