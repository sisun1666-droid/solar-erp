const URL  = "https://cldlugowplsswabyqxdh.supabase.co";
const KEY  = "sb_publishable_Lik-AfYlzrW4eCWTZaPW5Q_OP1r0yk6";
const HDR  = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function q(path, opts = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { ...opts, headers: { ...HDR, ...opts.headers } });
  if (res.status === 204) return null;
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body));
  return body;
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

// ── 개별 테이블 (기존 TABLE_KEYS 그대로) ──────────────────────
export const TABLES = ["todos", "assignments", "construction", "projects", "meetings", "fieldworkLogs", "structureInspections"];

export async function loadAllTables() {
  const results = await Promise.all(TABLES.map(t => db.get(t, "select=id,data")));
  return Object.fromEntries(TABLES.map((t, i) => [t, (results[i] ?? []).map(r => r.data)]));
}

export async function saveTable(table, items, deletedIds = []) {
  const rows = items.filter(x => x?.id).map(x => ({ id: x.id, data: x }));
  await Promise.all([
    rows.length    ? db.upsert(table, rows)         : null,
    deletedIds.length ? db.delete(table, deletedIds) : null,
  ].filter(Boolean));
}
