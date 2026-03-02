/**
 * 中文：恢复会话快照工具。
 * EN: Resume-session snapshot helpers.
 */

export function validateResumeSession(value) {
  if (!value || typeof value !== 'object') return null;
  if (!value.roomId || value.seat === undefined || !value.resumeToken) return null;
  return value;
}

export function readResumeSession(storage, key) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return validateResumeSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function persistResumeSession(storage, key, session) {
  if (!session) {
    storage.removeItem(key);
    return;
  }
  storage.setItem(key, JSON.stringify(session));
}

export function clearResumeSession(storage, key) {
  storage.removeItem(key);
}
