import { getState, setState, on } from "../store/index.js";
import { toast } from "../utils/index.js";

const CAL_API = "https://www.googleapis.com/calendar/v3";
const SCOPE    = "https://www.googleapis.com/auth/calendar";

let _token      = null;
let _expiresAt  = 0;
let _client     = null;
let _refreshTimer = null;

// ── 토큰 관리 ─────────────────────────────────────────────────────────────
export function isConnected() { return !!_token && Date.now() < _expiresAt; }

function loadToken() {
  const s = getState();
  if (s.gcalToken && s.gcalTokenExpiry > Date.now() + 5000) {
    _token     = s.gcalToken;
    _expiresAt = s.gcalTokenExpiry;
    scheduleRefresh(Math.round((_expiresAt - Date.now()) / 1000));
    return true;
  }
  return false;
}

function saveToken(t, expiresIn) {
  _token     = t;
  _expiresAt = Date.now() + (expiresIn - 60) * 1000;
  setState({ gcalToken: _token, gcalTokenExpiry: _expiresAt });
  scheduleRefresh(expiresIn);
  updateUI();
}

export function clearToken() {
  _token = null; _expiresAt = 0;
  setState({ gcalToken: "", gcalTokenExpiry: 0 });
  if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
  updateUI();
}

function scheduleRefresh(expiresIn) {
  if (_refreshTimer) clearTimeout(_refreshTimer);
  const delay = Math.max((expiresIn - 600) * 1000, 5000);
  _refreshTimer = setTimeout(() => requestToken(false).then(ok => { if (!ok) clearToken(); }), delay);
}

// ── OAuth (GIS) ───────────────────────────────────────────────────────────
function initClient() {
  const { gcalClientId } = getState();
  if (!window.google?.accounts?.oauth2 || !gcalClientId) return false;
  if (_client?.__cid === gcalClientId) return true;
  _client = google.accounts.oauth2.initTokenClient({
    client_id: gcalClientId,
    scope: SCOPE,
    callback: r => {
      if (r.access_token) { saveToken(r.access_token, r.expires_in || 3600); _client.__resolve?.(true); }
      else                { _client.__resolve?.(false); }
      _client.__resolve = null;
    },
    error_callback: () => { _client.__resolve?.(false); _client.__resolve = null; },
  });
  _client.__cid = gcalClientId;
  return true;
}

export function requestToken(interactive = true) {
  const { gcalClientId } = getState();
  if (!gcalClientId) { toast("관리자 설정에서 Google Client ID를 먼저 등록해주세요."); return Promise.resolve(false); }
  if (isConnected()) return Promise.resolve(true);
  if (!window.google?.accounts?.oauth2) return Promise.resolve(false);
  if (!initClient()) return Promise.resolve(false);
  return new Promise(resolve => {
    _client.__resolve = resolve;
    try { _client.requestAccessToken({ prompt: interactive ? "select_account" : "" }); }
    catch { resolve(false); }
  });
}

// ── Calendar API ──────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch(CAL_API + path, {
    ...opts,
    headers: { Authorization: `Bearer ${_token}`, "Content-Type": "application/json", ...opts.headers },
  });
  if (res.status === 204) return null;
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body));
  return body;
}

export async function createEvent(body)      { const r = await api(`/calendars/${encodeURIComponent(calId())}/events`, { method: "POST", body: JSON.stringify(body) }); return r?.id; }
export async function updateEvent(id, body)  { await api(`/calendars/${encodeURIComponent(calId())}/events/${id}`, { method: "PUT",  body: JSON.stringify(body) }); }
export async function deleteEvent(id)        { await api(`/calendars/${encodeURIComponent(calId())}/events/${id}`, { method: "DELETE" }); }

function calId() { return getState().gcalCalendarId || "primary"; }

// ── UI 업데이트 ───────────────────────────────────────────────────────────
function updateUI() {
  document.querySelectorAll("[data-gcal-status]").forEach(el => {
    el.textContent     = isConnected() ? "☁ 연결됨 ✓" : "☁ Google 연결";
    el.dataset.connected = isConnected() ? "1" : "";
  });
}

// ── 초기화 ───────────────────────────────────────────────────────────────
export function initGcal() {
  // 상태 변경 시 토큰 재확인 (다른 기기에서 연결한 경우 자동 인식)
  on("syncComplete", () => {
    if (!isConnected() && loadToken()) updateUI();
  });

  // GIS 라이브러리 로드 완료 콜백
  window._onGisLoaded = () => {
    if (isConnected()) { updateUI(); return; }
    const { gcalClientId } = getState();
    if (!gcalClientId) return;
    initClient();
    setTimeout(() => {
      if (!isConnected()) requestToken(false).then(ok => { if (ok) updateUI(); });
    }, 800);
  };

  loadToken();
  updateUI();
}
