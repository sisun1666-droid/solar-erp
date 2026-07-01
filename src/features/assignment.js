import { getState, on } from "../store/index.js";
import { esc, today, $ } from "../utils/index.js";
import { openAssignModal } from "./todos.js";
import { goTo } from "../router.js";

const PASTEL = ["#8ecae6","#ffb5a7","#b8e0d2","#f6d186","#cdb4db","#a7c7e7","#ffd6a5","#caffbf","#bde0fe","#ffc8dd"];
const DAY_NAMES = ["일","월","화","수","목","금","토"];
const URGENCY_COLORS = { overdue: "#ef4444", today: "#f59e0b", normal: "#0d9488" };
const CELL_CAP = 3;

let _personFilter = "전체";
let _calYear  = new Date().getFullYear();
let _calMonth = new Date().getMonth() + 1;  // 1-indexed
let _view = "month";  // "month" | "week" | "day"
let _expandedDays = new Set();

function personColor(name) {
  const st = getState();
  const people = st.people || [];
  const p = people.find(x => x.name === name);
  if (p?.color) return p.color;
  const idx = people.findIndex(x => x.name === name);
  return PASTEL[Math.max(0, idx) % PASTEL.length];
}

function urgencyColor(a) {
  if (a.status === "완료" || !a.due) return URGENCY_COLORS.normal;
  if (a.due < today())  return URGENCY_COLORS.overdue;
  if (a.due === today()) return URGENCY_COLORS.today;
  return URGENCY_COLORS.normal;
}

function localDate(d) {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,"0"), dd = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${dd}`;
}

function taskHtml(a, idx) {
  const c = urgencyColor(a);
  return `<div class="calendar-task" style="border-left-color:${esc(c)};background:${esc(c)}1c"
    data-open-assignment="${idx}" title="${esc(a.owner)} · ${esc(a.title)} · ${esc(a.status)} · ${esc(a.priority)}">
    <span class="color-dot" style="background:${esc(c)}"></span>${esc(a.title)}
  </div>`;
}

function dayCellHtml(iso, tasks, extraClass = "") {
  const cls = ["day-cell", extraClass, iso === today() ? "today" : ""].filter(Boolean).join(" ");
  const expanded = _expandedDays.has(iso);
  const shown = expanded ? tasks : tasks.slice(0, CELL_CAP);
  const rest = tasks.length - shown.length;
  const toggle = expanded
    ? (tasks.length > CELL_CAP ? `<button class="cal-more" data-cal-collapse="${esc(iso)}">접기</button>` : "")
    : (rest > 0 ? `<button class="cal-more" data-cal-expand="${esc(iso)}">+${rest}개 더</button>` : "");
  return `<div class="${cls}">
    <div class="day-number">${Number(iso.slice(-2))}</div>
    ${shown.map(t => taskHtml(t, t.__idx)).join("")}
    ${toggle}
  </div>`;
}

function tasksFor(assigns, iso) {
  return assigns
    .map((a, i) => ({ ...a, __idx: i }))
    .filter(a =>
      (_personFilter === "전체" || a.owner === _personFilter) &&
      (a.start === iso || a.due === iso)
    );
}

function buildCalendar() {
  const st = getState();
  const assigns = st.assignments || [];
  const y = _calYear, m = _calMonth - 1;
  const first = new Date(y, m, 1);

  let days, html = "";

  if (_view === "month") {
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    days = 42;
    html = DAY_NAMES.map(n => `<div class="day-name">${n}</div>`).join("");
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = localDate(d);
      html += dayCellHtml(iso, tasksFor(assigns, iso), d.getMonth() !== m ? "muted" : "");
    }
  } else if (_view === "week") {
    const now = new Date(y, m, 1);
    const weekStart = new Date(now);
    weekStart.setDate(1 - now.getDay());
    html = DAY_NAMES.map(n => `<div class="day-name">${n}</div>`).join("");
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const iso = localDate(d);
      html += dayCellHtml(iso, tasksFor(assigns, iso));
    }
  } else {
    const iso = `${y}-${String(m+1).padStart(2,"0")}-01`;
    html = `<div class="day-name">일정</div>` + dayCellHtml(iso, tasksFor(assigns, iso), "day-view");
  }

  return { html, cols: _view === "day" ? "1fr" : "repeat(7,minmax(0,1fr))" };
}

function renderPeopleChips(panel) {
  const st = getState();
  const people = ["전체", ...(st.people || []).map(p => p.name)];
  const assigns = st.assignments || [];

  panel.querySelector(".schedule-people").innerHTML = people.map(p => {
    const count = p === "전체" ? assigns.length : assigns.filter(a => a.owner === p).length;
    const dot = p !== "전체" ? `<span class="color-dot" style="background:${esc(personColor(p))}"></span>` : "";
    return `<button class="person-chip ${_personFilter === p ? "active" : ""}" data-assign-person="${esc(p)}">
      ${dot}${esc(p)} <strong>${count}</strong>
    </button>`;
  }).join("");
}

function monthLabel() {
  return `${_calYear}년 ${String(_calMonth).padStart(2,"0")}월`;
}

function render() {
  const panel = $("assignmentView");
  if (!panel) return;

  const { html, cols } = buildCalendar();
  const viewBtns = ["month","week","day"].map(v =>
    `<button class="schedule-view-btn${_view === v ? " active" : ""}" data-assign-view="${v}">
      ${v === "month" ? "월" : v === "week" ? "주" : "일"}
    </button>`
  ).join("");

  panel.innerHTML = `
    <div class="schedule-toolbar">
      <div class="schedule-left">
        <button class="btn icon" id="assignPrevBtn">◀</button>
        <span class="schedule-month">${monthLabel()}</span>
        <button class="btn icon" id="assignNextBtn">▶</button>
        <button class="btn" id="assignTodayBtn">오늘</button>
      </div>
      <div class="schedule-right">
        <div class="schedule-view">${viewBtns}</div>
        <button class="btn" id="assignGoTodoBtn">할일 보드 보기</button>
        <button class="btn primary" id="assignAddBtn">일정 등록</button>
      </div>
    </div>
    <div class="schedule-people"></div>
    <div id="assignCalGrid" class="calendar-grid" style="grid-template-columns:${cols}">${html}</div>`;

  renderPeopleChips(panel);
}

function shiftMonth(delta) {
  _calMonth += delta;
  if (_calMonth > 12) { _calMonth = 1;  _calYear++; }
  if (_calMonth < 1)  { _calMonth = 12; _calYear--; }
  render();
}

function onDocClick(e) {
  const t = e.target.closest("button,[data-open-assignment],[data-assign-person],[data-assign-view]") || e.target;
  if (!document.getElementById("assignmentView")?.contains(t) && !t.dataset.openAssignment) return;

  if (t.id === "assignPrevBtn")  { shiftMonth(-1); return; }
  if (t.id === "assignNextBtn")  { shiftMonth(1);  return; }
  if (t.id === "assignTodayBtn") {
    const n = new Date();
    _calYear = n.getFullYear(); _calMonth = n.getMonth() + 1;
    render(); return;
  }
  if (t.id === "assignAddBtn")   { openAssignModal(); return; }
  if (t.id === "assignGoTodoBtn") { goTo("todos"); return; }
  if (t.dataset.assignPerson)    { _personFilter = t.dataset.assignPerson; render(); return; }
  if (t.dataset.assignView)      { _view = t.dataset.assignView; render(); return; }
  if (t.dataset.calExpand)       { _expandedDays.add(t.dataset.calExpand); render(); return; }
  if (t.dataset.calCollapse)     { _expandedDays.delete(t.dataset.calCollapse); render(); return; }
  if (t.dataset.openAssignment !== undefined) {
    openAssignModal(Number(t.dataset.openAssignment));
  }
}

export function initAssignment() {
  document.addEventListener("click", onDocClick);
  on("viewChanged", ({ view }) => { if (view === "assignment") render(); });
  on("stateChange", () => {
    const panel = $("assignmentView");
    if (panel && !panel.classList.contains("hidden")) render();
  });
}
