// 매일 완료된 업무를 Supabase에서 읽어 Google Sheets 웹 앱으로 전송한다.
// GitHub Actions 예약 실행(cron)에서 호출됨 - 사람 개입 없이 자동 실행.
const SUPABASE_URL = "https://cldlugowplsswabyqxdh.supabase.co";
const SUPABASE_KEY = "sb_publishable_Lik-AfYlzrW4eCWTZaPW5Q_OP1r0yk6";
const HDR = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

async function getTable(name) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${name}?select=id,data`, { headers: HDR });
  if (!res.ok) throw new Error(`${name} fetch failed: ${res.status}`);
  const rows = await res.json();
  return rows.map(r => r.data);
}

async function getConfig() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/app_config?id=eq.shared&select=data`, { headers: HDR });
  if (!res.ok) throw new Error(`config fetch failed: ${res.status}`);
  const rows = await res.json();
  return rows[0]?.data || {};
}

function todayKST() {
  const kst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const y = kst.getFullYear();
  const m = String(kst.getMonth() + 1).padStart(2, "0");
  const d = String(kst.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function completedOn(completedAt, date) {
  return (completedAt || "").startsWith(date);
}

async function main() {
  const [todos, construction, structureInspections, cfg] = await Promise.all([
    getTable("todos"),
    getTable("construction"),
    getTable("structure_inspections"),
    getConfig(),
  ]);

  const sheetsUrl = cfg.sheetsWebAppUrl;
  if (!sheetsUrl) {
    console.log("sheetsWebAppUrl 미설정 - 건너뜀");
    return;
  }

  const date = todayKST();

  const completedTodos = todos.filter(t => completedOn(t.completedAt, date));
  const completedCons  = construction.filter(c => completedOn(c.completedAt, date));
  const completedInsp  = structureInspections.filter(i => completedOn(i.completedAt, date));

  const rowsByPerson = {};
  const push = (person, row) => { if (person) (rowsByPerson[person] ??= []).push(row); };
  completedTodos.forEach(t => push(t.owner, { title: t.title, type: "할일", project: t.project || "", status: t.status, priority: t.priority, result: t.detail || "" }));
  completedCons.forEach(c => push(c.owner, { title: c.site, type: "시공", project: c.site || "", status: c.status, priority: "", result: c.next || "" }));
  completedInsp.forEach(i => push(i.inspector, { title: i.plantName, type: "구조물검수", project: i.plantName || "", status: i.phase, priority: "", result: i.address || "" }));

  const people = (cfg.people || []).map(p => p.name).filter(Boolean);
  const targets = people.length ? people : Object.keys(rowsByPerson);
  if (!targets.length) {
    console.log("등록된 담당자가 없어 건너뜀");
    return;
  }

  for (const person of targets) {
    const rows = rowsByPerson[person] || [];
    const payload = { action: "save", date, person, rows };
    const res = await fetch(sheetsUrl, {
      method: "POST",
      body: new URLSearchParams({ payload: JSON.stringify(payload) }),
    });
    const body = await res.json().catch(() => ({}));
    console.log(`${person} ${date} ${rows.length}건 - ${body.ok ? "저장 성공" : `실패: ${body.error}`}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
