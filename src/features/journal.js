import { getState, on } from "../store/index.js";
import { esc, today, $ } from "../utils/index.js";

let _date = today();

function shiftDate(n) {
  const d = new Date(_date);
  d.setDate(d.getDate() + n);
  _date = d.toISOString().slice(0, 10);
  render();
}

function itemCard(t, color) {
  return `<div class="todo-card" style="border-left:4px solid ${color}">
    <div class="todo-card-title">${esc(t.title)}</div>
    <div class="todo-card-meta">${esc(t.owner || "담당 미정")} · ${esc(t.status)}</div>
    ${t.detail ? `<div class="todo-card-meta" style="margin-top:2px">${esc(t.detail.length > 60 ? t.detail.slice(0, 60) + "…" : t.detail)}</div>` : ""}
  </div>`;
}

function render() {
  const panel = $("journalView");
  if (!panel) return;
  const st = getState();
  const todos = st.todos || [];

  const completed = todos.filter(t => t.completedAt === _date);
  const inProgress = todos.filter(t =>
    t.status !== "완료" && t.status !== "취소" &&
    t.start && t.due && t.start <= _date && _date <= t.due
  );

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
      ${completed.length ? completed.map(t => itemCard(t, "#22c55e")).join("") : `<div class="meta">완료된 항목이 없습니다.</div>`}
    </div>
    <div class="card">
      <div class="panel-title"><h2>진행 중이던 업무 (${inProgress.length})</h2></div>
      ${inProgress.length ? inProgress.map(t => itemCard(t, "#3b82f6")).join("") : `<div class="meta">해당하는 항목이 없습니다.</div>`}
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
