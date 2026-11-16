import axios from 'axios';
export const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const SESSION_KEY = 'docmind-document-session-v1';
let pendingSession;
export async function sessionHeaders() {
  let session;
  try { session = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { /* invalid stored session */ }
  if (!session?.token || session.expires_at <= Date.now() / 1000 + 30) {
    if (!pendingSession) {
      pendingSession = axios.post(`${API}/sessions`).then(({ data }) => {
        localStorage.setItem(SESSION_KEY, JSON.stringify(data));
        return data;
      }).finally(() => { pendingSession = null; });
    }
    session = await pendingSession;
  }
  return { Authorization: `Bearer ${session.token}` };
}
export async function apiPost(path, body, options = {}) {
  return axios.post(`${API}${path}`, body, {
    ...options, headers: { ...options.headers, ...(await sessionHeaders()) },
  });
}
