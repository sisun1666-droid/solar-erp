import { loadAllTables, saveTable, config, TABLES } from "../api/supabase.js";

// ── 기본 상태 ────────────────────────────────────────────────────────────
const DEFAULT = {
  todos: [], assignments: [], construction: [], projects: [],
  meetings: [], fieldworkLogs: [], structureInspections: [],
  gcalClientId: "", gcalCalendarId: "", gcalSyncColor: "",
  gcalToken: "", gcalTokenExpiry: 0,
  currentUser: "", userRole: "",
};

let _state   = { ...DEFAULT };
let _pending = {};            // 어떤 테이블이 dirty한지 추적

// ── 이벤트 버스 (IIFE 래핑 대체) ────────────────────────────────────────
const _listeners = {};

export function on(event, fn)  { (_listeners[event] ??= []).push(fn); }
export function off(event, fn) { _listeners[event] = (_listeners[event] ?? []).filter(f => f !== fn); }
export function emit(event, payload) { (_listeners[event] ?? []).forEach(fn => fn(payload)); }

// ── 상태 읽기/쓰기 ───────────────────────────────────────────────────────
export function getState()           { return _state; }

export function setState(patch, { silent = false } = {}) {
  const prev = _state;
  _state = { ...prev, ...patch };

  // 어떤 테이블이 변경됐는지 추적
  TABLES.forEach(t => { if (patch[t] && patch[t] !== prev[t]) _pending[t] = true; });

  if (!silent) emit("stateChange", { state: _state, patch });
  scheduleSave();
}

// ── 로컬스토리지 (초기 로드용) ────────────────────────────────────────────
const LS_KEY = "solar-erp-state-v2";

function saveLocal() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(_state)); } catch (e) {}
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) { _state = { ...DEFAULT, ...JSON.parse(raw) }; }
  } catch (e) {}
}

// ── 삭제 tombstone ────────────────────────────────────────────────────────
const TOMB_KEY = "solar-erp-tombs-v1";
const TOMB_TTL = 365 * 24 * 60 * 60 * 1000;
let _tombs = {};

function loadTombs() {
  try { _tombs = JSON.parse(localStorage.getItem(TOMB_KEY) || "{}"); } catch (e) {}
}
function saveTombs() {
  try { localStorage.setItem(TOMB_KEY, JSON.stringify(_tombs)); } catch (e) {}
}

export function markDeleted(table, id) {
  (_tombs[table] ??= {})[id] = Date.now();
  saveTombs();
}

export function wasDeleted(table, id) {
  const ts = _tombs[table]?.[id];
  return ts && Date.now() - ts < TOMB_TTL;
}

// ── Supabase 저장 (디바운스) ─────────────────────────────────────────────
let _saveTimer = null;
let _svrIds    = {};         // 서버에 있는 ID 추적 (DELETE용)

function scheduleSave() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(flushSave, 800);
}

async function flushSave() {
  _saveTimer = null;
  const tables = Object.keys(_pending);
  if (!tables.length) return;
  _pending = {};

  saveLocal();

  for (const table of tables) {
    const items     = _state[table] ?? [];
    const currentIds = new Set(items.map(x => x.id).filter(Boolean));
    const prevIds    = _svrIds[table] ?? new Set();
    const deletedIds = [...prevIds].filter(id => !currentIds.has(id) && wasDeleted(table, id));

    try {
      await saveTable(table, items, deletedIds);
      _svrIds[table] = currentIds;
    } catch (e) {
      console.warn(`[store] save failed for ${table}:`, e);
    }
  }

  // config (gcal 토큰 등 메타 필드)도 저장
  await config.set("shared", {
    gcalClientId:    _state.gcalClientId,
    gcalCalendarId:  _state.gcalCalendarId,
    gcalSyncColor:   _state.gcalSyncColor,
    gcalToken:       _state.gcalToken,
    gcalTokenExpiry: _state.gcalTokenExpiry,
    currentUser:     _state.currentUser,
    userRole:        _state.userRole,
  }).catch(() => {});
}

// ── Supabase에서 최신 데이터 로드 ────────────────────────────────────────
export async function syncFromServer() {
  try {
    const [tables, meta] = await Promise.all([
      loadAllTables(),
      config.get("shared"),
    ]);

    const merged = {};

    TABLES.forEach(table => {
      const serverItems = (tables[table] ?? []).filter(item => !wasDeleted(table, item.id));
      const localItems  = _state[table] ?? [];
      const localMap    = Object.fromEntries(localItems.map(x => [x.id, x]));

      // 서버 항목 + 로컬에만 있는 항목 (서버에 아직 못 올린 것)
      const serverIds = new Set(serverItems.map(x => x.id));
      const localOnly = localItems.filter(x => x.id && !serverIds.has(x.id) && !wasDeleted(table, x.id));

      merged[table] = [...serverItems, ...localOnly];
      _svrIds[table] = new Set(serverItems.map(x => x.id));
    });

    const metaPatch = meta ? {
      gcalClientId:    meta.gcalClientId    ?? _state.gcalClientId,
      gcalCalendarId:  meta.gcalCalendarId  ?? _state.gcalCalendarId,
      gcalSyncColor:   meta.gcalSyncColor   ?? _state.gcalSyncColor,
      gcalToken:       meta.gcalToken       ?? _state.gcalToken,
      gcalTokenExpiry: meta.gcalTokenExpiry ?? _state.gcalTokenExpiry,
    } : {};

    setState({ ...merged, ...metaPatch }, { silent: true });
    saveLocal();
    emit("stateChange", { state: _state, patch: merged });
    emit("syncComplete", { state: _state });
  } catch (e) {
    console.warn("[store] sync failed:", e);
  }
}

// ── 초기화 ───────────────────────────────────────────────────────────────
export async function initStore() {
  loadLocal();
  loadTombs();
  emit("stateChange", { state: _state, patch: _state }); // 로컬 상태로 첫 렌더

  await syncFromServer();                                  // 서버 동기화

  // 폴링 (30초마다)
  setInterval(syncFromServer, 30_000);
}
