import { loadAllTables, saveTable, config, TABLES } from "../api/supabase.js";

// ── 기본 상태 ────────────────────────────────────────────────────────────
const DEFAULT = {
  todos: [], assignments: [], construction: [], projects: [],
  meetings: [], messages: [], reports: [], fieldworkLogs: [], structureInspections: [],
  gcalClientId: "", gcalCalendarId: "", gcalSyncColor: "",
  gcalToken: "", gcalTokenExpiry: 0,
  currentUser: "", userRole: "",
};

let _state   = { ...DEFAULT };
let _pending = {};            // 어떤 테이블이 dirty한지 추적
let _configDirty = false;     // TABLES 밖의 필드(관리자 설정 등)가 dirty한지 추적

// ── 이벤트 버스 (IIFE 래핑 대체) ────────────────────────────────────────
const _listeners = {};

export function on(event, fn)  { (_listeners[event] ??= []).push(fn); }
export function off(event, fn) { _listeners[event] = (_listeners[event] ?? []).filter(f => f !== fn); }
export function emit(event, payload) { (_listeners[event] ?? []).forEach(fn => fn(payload)); }

// ── 상태 읽기/쓰기 ───────────────────────────────────────────────────────
export function getState()           { return _state; }

// skipSave: 서버에서 막 받아온 데이터를 반영할 때(syncFromServer)처럼, 저장이 아니라
// "반영"만 하면 되는 경우 true로 넘긴다. 이게 없으면 동기화 직후마다 방금 받은 데이터를
// 다시 서버로 재업로드 예약을 하게 되어, 대용량 테이블 저장과 겹칠 때 레이스가 생긴다.
export function setState(patch, { silent = false, skipSave = false } = {}) {
  const prev = _state;
  _state = { ...prev, ...patch };

  if (!skipSave) {
    // 어떤 테이블이 변경됐는지 추적
    TABLES.forEach(t => { if (patch[t] && patch[t] !== prev[t]) _pending[t] = true; });
    // TABLES 밖의 필드(brand/adminPin/people 등 관리자 설정 전부)가 바뀌면 config 저장 대상
    if (Object.keys(patch).some(k => !TABLES.includes(k))) _configDirty = true;
    scheduleSave();
  }

  if (!silent) emit("stateChange", { state: _state, patch });
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
let _tombsDirty = false;

function loadTombs() {
  try { _tombs = JSON.parse(localStorage.getItem(TOMB_KEY) || "{}"); } catch (e) {}
}
function saveTombs() {
  try { localStorage.setItem(TOMB_KEY, JSON.stringify(_tombs)); } catch (e) {}
}

export function markDeleted(table, id) {
  (_tombs[table] ??= {})[id] = Date.now();
  saveTombs();
  _tombsDirty = true;
  scheduleSave();
}

export function wasDeleted(table, id) {
  const ts = _tombs[table]?.[id];
  return ts && Date.now() - ts < TOMB_TTL;
}

// ── Supabase 저장 (디바운스) ─────────────────────────────────────────────
let _saveTimer = null;
let _svrIds    = {};         // 서버에 있는 ID 추적 (DELETE용)
let _lastSig     = {};       // 테이블별 마지막 동기화 내용 서명 (변경 감지용)
let _lastMetaSig = null;
// syncFromServer는 _saveTimer(디바운스 대기 중)나 _flushing(업로드 진행 중) 둘 중 하나라도
// 참이면 건너뛴다. _saving을 단일 bool로 두면, 업로드 도중 새 수정이 들어와 다음 타이머가
// 잡혀도 "먼저 시작한" flushSave가 끝나는 순간 그 사실을 모른 채 false로 되돌려버려서,
// 새로 예약된 저장이 실제로 서버에 반영되기 전 틈에 동기화가 끼어들 수 있었다.
// _saveTimer(예약 여부)는 scheduleSave가, _flushing(업로드 여부)은 flushSave 자신이 관리하므로
// 이 둘을 OR로 보면 "로컬 수정이 예약된 순간부터 업로드가 끝날 때까지" 구간을 빈틈없이 덮는다.
let _flushing = false;

function scheduleSave() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(flushSave, 800);
}

async function flushSave() {
  _saveTimer = null;
  const tables = Object.keys(_pending);
  if (!tables.length && !_configDirty && !_tombsDirty) return;
  _pending = {};
  _flushing = true;
  emit("saveStart");

  try {
    saveLocal();

    if (tables.length) {
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
          _pending[table] = true; // 재시도 대상으로 남겨둠
          emit("saveError", { table, error: e });
        }
      }
    }

    if (_configDirty) {
      try {
        // TABLES 밖의 필드 전부(관리자 설정, gcal, 세션 등) — 필드가 늘어나도 자동으로 동기화됨
        const configPatch = Object.fromEntries(Object.entries(_state).filter(([k]) => !TABLES.includes(k)));
        await config.set("shared", configPatch);
        _configDirty = false;
      } catch (e) {
        console.warn("[store] config save failed:", e);
        emit("saveError", { table: "config", error: e });
      }
    }

    if (_tombsDirty) {
      try {
        await config.set("tombstones", _tombs);
        _tombsDirty = false;
      } catch (e) {
        console.warn("[store] tombstone save failed:", e);
        emit("saveError", { table: "tombstones", error: e });
      }
    }
  } finally {
    _flushing = false;
  }
  // 실패분 재시도 예약 (계속 막혀 있는 네트워크에 800ms마다 재요청하지 않도록 10초 간격)
  if (Object.keys(_pending).length || _configDirty || _tombsDirty) {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(flushSave, 10_000);
  }
  emit("saveComplete");
}

// ── Supabase에서 최신 데이터 로드 ────────────────────────────────────────
export async function syncFromServer() {
  if (_saveTimer || _flushing) return; // 저장이 아직 서버에 반영 안 됐는데 동기화가 그 사이의 예전 값으로 로컬을 덮어쓰는 것 방지
  try {
    const [tables, meta, serverTombs] = await Promise.all([
      loadAllTables(),
      config.get("shared"),
      config.get("tombstones"),
    ]);

    // 삭제 기록(tombstone) 병합 — 테이블/id별로 더 최근 타임스탬프를 채택
    if (serverTombs) {
      for (const table of Object.keys(serverTombs)) {
        for (const [id, ts] of Object.entries(serverTombs[table] || {})) {
          const localTs = _tombs[table]?.[id];
          if (!localTs || ts > localTs) (_tombs[table] ??= {})[id] = ts;
        }
      }
      saveTombs();
    }

    // 실제로 바뀐 테이블만 patch에 담아서, 변경 없는 30초 폴링마다
    // 전체 화면이 다시 그려지고 불필요한 재저장이 도는 것을 방지
    const patch = {};

    TABLES.forEach(table => {
      const serverItems = (tables[table] ?? []).filter(item => !wasDeleted(table, item.id));
      const localItems  = _state[table] ?? [];

      // 서버 항목 + 로컬에만 있는 항목 (서버에 아직 못 올린 것)
      const serverIds = new Set(serverItems.map(x => x.id));
      const localOnly = localItems.filter(x => x.id && !serverIds.has(x.id) && !wasDeleted(table, x.id));

      const merged = [...serverItems, ...localOnly];
      _svrIds[table] = serverIds;

      const sig = JSON.stringify(merged);
      if (sig !== _lastSig[table]) {
        _lastSig[table] = sig;
        patch[table] = merged;
      }
    });

    // config에 저장된 모든 필드(관리자 설정 포함)를 복원 — 테이블(배열) 키와는 겹치지 않음
    const metaPatch = meta ? { ...meta } : {};
    const metaSig = JSON.stringify(metaPatch);
    if (metaSig !== _lastMetaSig) {
      _lastMetaSig = metaSig;
      Object.assign(patch, metaPatch);
    }

    if (Object.keys(patch).length) {
      setState(patch, { silent: true, skipSave: true });
      saveLocal();
      emit("stateChange", { state: _state, patch });
    }
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

  // 폴링 (2분마다) — 30초 주기는 여러 기기가 하루 종일 켜져 있으면
  // Supabase 무료 egress 한도(월 5GB)를 금방 넘겨 서비스가 통째로 막히는 원인이 됐음
  setInterval(syncFromServer, 120_000);
}
