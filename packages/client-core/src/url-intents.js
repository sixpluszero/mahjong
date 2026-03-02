/**
 * 中文：URL 意图解析与邀请链接工具。
 * EN: URL intent parsing and invite-link helpers.
 */

export function getRoomIdFromUrlSearch(search) {
  const qsRoomId = new URLSearchParams(search || '').get('room');
  if (!qsRoomId) return '';
  return String(qsRoomId).trim().toUpperCase();
}

export function buildInviteLink(origin, roomId) {
  if (!roomId) return '';
  return `${origin}?room=${encodeURIComponent(roomId)}`;
}
