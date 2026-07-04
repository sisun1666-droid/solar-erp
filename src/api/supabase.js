const URL  = "https://cldlugowplsswabyqxdh.supabase.co";
const KEY  = "sb_publishable_Lik-AfYlzrW4eCWTZaPW5Q_OP1r0yk6";
const HDR  = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function q(path, opts = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { ...opts, headers: { ...HDR, ...opts.headers } });
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  const body = JSON.parse(text);
  if (!res.ok) throw new Error(JSON.stringify(body));
  return body;
}

// PostgREST는 요청당 최대 1000행만 돌려준다 (db-max-rows 설정). 그 이상인 테이블은
// Range 헤더로 페이지를 넘겨가며 끝까지 읽어야 전체 데이터를 놓치지 않는다.
const PAGE_SIZE = 1000;
async function getAllPages(path) {
  let all = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await q(path, { headers: { Range: `${offset}-${offset + PAGE_SIZE - 1}` } });
    all = all.concat(page || []);
    if (!page || page.length < PAGE_SIZE) break;
  }
  return all;
}

// ── 범용 CRUD ──────────────────────────────────────────────────
export const db = {
  get:    (table, qs = "")          => q(`${table}?${qs}`),
  upsert: (table, rows)             => q(table, { method: "POST", body: JSON.stringify(rows), headers: { Prefer: "resolution=merge-duplicates,return=minimal" } }),
  delete: (table, ids)              => ids.length ? q(`${table}?id=in.(${ids.map(id => `"${id}"`).join(",")})`, { method: "DELETE" }) : null,
};

// ── app_config (공유 상태 저장소) ──────────────────────────────
export const config = {
  get:  (id)       => q(`app_config?id=eq.${id}&select=data`).then(r => r?.[0]?.data ?? null),
  set:  (id, data) => q("app_config", { method: "POST", body: JSON.stringify({ id, data }), headers: { Prefer: "resolution=merge-duplicates,return=minimal" } }),
};

// ── 개별 테이블 (state key → Supabase table name) ─────────────
const TABLE_MAP = {
  todos:               "todos",
  assignments:         "assignments",
  construction:        "construction",
  projects:            "projects",
  meetings:            "meetings",
  messages:            "messages",
  reports:             "reports",
  fieldworkLogs:       "fieldwork_logs",
  structureInspections:"structure_inspections",
};

export const TABLES = Object.keys(TABLE_MAP);

export async function loadAllTables() {
  // order=id 없이 페이지를 나누면 서버의 기본 정렬이 요청마다 달라져 행이 누락/중복될 수 있다.
  const results = await Promise.all(TABLES.map(t => getAllPages(`${TABLE_MAP[t]}?select=id,data&order=id`).catch(() => [])));
  return Object.fromEntries(TABLES.map((t, i) => [t, (results[i] ?? []).map(r => r.data)]));
}

// 한 번에 너무 많은 행을 올리면 요청이 조용히 일부만 반영될 수 있어(관찰됨),
// 큰 테이블은 묶음으로 나눠서 순차적으로 올린다.
const UPSERT_CHUNK = 500;

export async function saveTable(table, items, deletedIds = []) {
  const dbTable = TABLE_MAP[table] || table;
  const rows = items.filter(x => x?.id).map(x => ({ id: x.id, data: x }));
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    await db.upsert(dbTable, rows.slice(i, i + UPSERT_CHUNK));
  }
  if (deletedIds.length) await db.delete(dbTable, deletedIds);
}
