const AJYAL_SESSION_KEY = "ajyal_session_id";
const SCHOOL_USER_KEY = "ajyal_school_user_id";

export function hasAjyalSession(userId) {
  return Boolean(userId && sessionStorage.getItem(AJYAL_SESSION_KEY) && sessionStorage.getItem(SCHOOL_USER_KEY) === userId);
}

export function saveAjyalSession(sessionId, userId) {
  sessionStorage.setItem(AJYAL_SESSION_KEY, sessionId);
  sessionStorage.setItem(SCHOOL_USER_KEY, userId);
}

export function clearAjyalSession() {
  sessionStorage.removeItem(AJYAL_SESSION_KEY);
  sessionStorage.removeItem(SCHOOL_USER_KEY);
}
