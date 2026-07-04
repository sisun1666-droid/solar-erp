import { getState, on } from "../store/index.js";
import { esc, today, $ } from "../utils/index.js";

let _date = today();

function shiftDate(n) {
  const d = new Date(_date);
  d.setDate(d.getDate() + n);
  _date = d.toISOString().slice(0, 10);
  render();
}

// completedAt은 "YYYY-MM-DDTHH:MM" 형식 - 날짜만 비교하고, 있으면 시각도 같이 보여준다.
function completedOn(completedAt, date) {
  return (completedAt || "").startsWith(date);
}
function completedTime(completedAt) {
  return completedAt && completedAt.includes("T") ? completedAt.slice(11, 16) : "";
}

function itemCard(title, meta, detail, color) {
  return `<div class="todo-card" style="border-left:4px solid ${color}">
    <div class="todo-card-title">${esc(title)}</div>
    <div class="todo-card-meta">${esc(meta)}</div>
    ${detail ? `<div class="todo-card-meta" style="margin-top:2px">${esc(detail.length > 60 ? detail.slice(0, 60) + "…" : detail)}</div>` : ""}
  </div>`;
}

function render() {
  const panel = $("journalView");
  if (!panel) return;
  const st = getState();
  const todos = st.todos || [];
  const construction = st.construction || [];
  const inspections = st.structureInspections || [];

  const completed = [
    ...todos.filter(t => completedOn(t.completedAt, _date)).map(t => {
      const time = completedTime(t.completedAt);
      return itemCard(t.title, `${t.owner || "담당 미정"} · 할일${time ? " · " + time : ""}`, t.detail, "#22c55e");
    }),
    ...construction.filter(c => completedOn(c.completedAt, _date)).map(c => {
      const time = completedTime(c.completedAt);
      return itemCard(c.site, `${c.owner || "담당 미정"} · 시공${time ? " · " + time : ""}`, c.next, "#0ea5e9");
    }),
    ...inspections.filter(i => completedOn(i.completedAt, _date)).map(i => {
      const time = completedTime(i.completedAt);
      return itemCard(i.plantName, `${i.inspector || "담당 미정"} · 구조물검수${time ? " · " + time : ""}`, i.address, "#a855f7");
    }),
  ];

  const inProgress = [
    ...todos.filter(t =>
      t.status !== "완료" && t.status !== "취소" &&
      t.start && t.due && t.start <= _date && _date <= t.due
    ).map(t => itemCard(t.title, `${t.owner || "담당 미정"} · ${t.status}`, t.detail, "#3b82f6")),
    ...construction.filter(c =>
      c.status !== "완료" &&
      c.start && c.end && c.start <= _date && _date <= c.end
    ).map(c => itemCard(c.site, `${c.owner || "담당 미정"} · 시공 ${c.status}`, c.next, "#38bdf8")),
  ];

  panel.innerHTML = `
    <div class="schedule-toolbar">
      <div class="schedule-left">
        <button class="btn icon" id="journalPrevBtn">◀</button>
        <span class="schedule-month">${esc(_date)}</span>
        <button class="btn icon" id="journalNextBtn">▶</button>
        <button class="btn" id="journalTodayBtn">오늘</button>
      </div>
    </div>
    <div class="card" style="margin-bottom:14px">
      <div class="panel-title"><h2>완료한 업무 (${completed.length})</h2></div>
      ${completed.length ? completed.join("") : `<div class="meta">완료된 항목이 없습니다.</div>`}
    </div>
    <div class="card">
      <div class="panel-title"><h2>진행 중이던 업무 (${inProgress.length})</h2></div>
      ${inProgress.length ? inProgress.join("") : `<div class="meta">해당하는 항목이 없습니다.</div>`}
    </div>`;
}

function onDocClick(e) {
  const t = e.target.closest("button") || e.target;
  if (!document.getElementById("journalView")?.contains(t)) return;
  if (t.id === "journalPrevBtn")  return shiftDate(-1);
  if (t.id === "journalNextBtn")  return shiftDate(1);
  if (t.id === "journalTodayBtn") { _date = today(); render(); }
}

export function initJournal() {
  document.addEventListener("click", onDocClick);
  on("viewChanged", ({ view }) => { if (view === "journal") render(); });
  on("stateChange", () => {
    const panel = $("journalView");
    if (panel && !panel.classList.contains("hidden")) render();
  });
}
