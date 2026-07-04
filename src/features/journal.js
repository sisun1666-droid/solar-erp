import { getState, on } from "../store/index.js";
import { esc, today, $ } from "../utils/index.js";
import { openTodoModal } from "./todos.js";
import { openConstructionById } from "./construction.js";
import { openInspectionById } from "./inspection.js";
import { openMeetingById } from "./meetings.js";
import { openKakaoShare } from "./kakaoShare.js";

let _date = today();
let _owner = "전체";
let _data = null; // 마지막 render() 시점의 필터링 결과 - 공유 텍스트 생성에 재사용

function shiftDate(n) {
  const d = new Date(_date);
  d.setDate(d.getDate() + n);
  _date = d.toISOString().slice(0, 10);
  render();
}

// completedAt은 "YYYY-MM-DDTHH:MM"(신규) 또는 "YYYY-MM-DD"(과거 데이터) 형식 - 날짜만 비교.
function completedOn(completedAt, date) {
  return (completedAt || "").startsWith(date);
}
function completedTime(completedAt) {
  return completedAt && completedAt.includes("T") ? completedAt.slice(11, 16) : "";
}
function metaLine(...parts) {
  return parts.filter(Boolean).join(" · ");
}

function itemCard(kind, id, title, meta, detail, color) {
  return `<div class="todo-card" style="border-left:4px solid ${color};cursor:pointer" data-journal-kind="${kind}" data-journal-id="${esc(id)}">
    <div class="todo-card-title">${esc(title)}</div>
    <div class="todo-card-meta">${esc(meta)}</div>
    ${detail ? `<div class="todo-card-meta" style="margin-top:2px">${esc(detail.length > 60 ? detail.slice(0, 60) + "…" : detail)}</div>` : ""}
  </div>`;
}

function computeData(st) {
  const todos = st.todos || [];
  const construction = st.construction || [];
  const inspections = st.structureInspections || [];
  const meetings = st.meetings || [];
  const ownerMatch = name => _owner === "전체" || name === _owner;
  const meetingMatch = m => _owner === "전체" || m.host === _owner || (m.attendees || []).includes(_owner);

  return {
    completedTodos: todos.filter(t => completedOn(t.completedAt, _date) && ownerMatch(t.owner)),
    completedCons:  construction.filter(c => completedOn(c.completedAt, _date) && ownerMatch(c.owner)),
    completedInsp:  inspections.filter(i => completedOn(i.completedAt, _date) && ownerMatch(i.inspector)),

    inProgTodos: todos.filter(t =>
      t.status !== "완료" && t.status !== "취소" &&
      t.start && t.due && t.start <= _date && _date <= t.due && ownerMatch(t.owner)),
    inProgCons: construction.filter(c =>
      c.status !== "완료" &&
      c.start && c.end && c.start <= _date && _date <= c.end && ownerMatch(c.owner)),

    delayedTodos: todos.filter(t =>
      t.status !== "완료" && t.status !== "취소" && t.due && t.due < _date && ownerMatch(t.owner)),
    delayedCons: construction.filter(c =>
      c.status !== "완료" && c.end && c.end < _date && ownerMatch(c.owner)),

    meetingsToday: meetings.filter(m => m.date === _date && meetingMatch(m)),
    owners: ["전체", ...(st.people || []).map(p => p.name)],
  };
}

function buildShareText(d) {
  const lines = [`[${_date} 업무일지]${_owner !== "전체" ? ` - ${_owner}` : ""}`, ""];
  const completedTotal = d.completedTodos.length + d.completedCons.length + d.completedInsp.length;
  lines.push(`■ 완료 ${completedTotal}건`);
  d.completedTodos.forEach(t => lines.push(`- ${t.title} (${t.owner || "담당 미정"})`));
  d.completedCons.forEach(c => lines.push(`- ${c.site} (${c.owner || "담당 미정"}, 시공)`));
  d.completedInsp.forEach(i => lines.push(`- ${i.plantName} (${i.inspector || "담당 미정"}, 구조물검수)`));
  if (!completedTotal) lines.push("- 없음");

  const inProgTotal = d.inProgTodos.length + d.inProgCons.length;
  lines.push("", `■ 진행중 ${inProgTotal}건`);
  d.inProgTodos.forEach(t => lines.push(`- ${t.title} (${t.owner || "담당 미정"}, ${t.status})`));
  d.inProgCons.forEach(c => lines.push(`- ${c.site} (${c.owner || "담당 미정"}, 시공 ${c.status})`));
  if (!inProgTotal) lines.push("- 없음");

  const delayedTotal = d.delayedTodos.length + d.delayedCons.length;
  lines.push("", `■ 지연 ${delayedTotal}건`);
  d.delayedTodos.forEach(t => lines.push(`- ${t.title} (${t.owner || "담당 미정"}, 마감 ${t.due})`));
  d.delayedCons.forEach(c => lines.push(`- ${c.site} (${c.owner || "담당 미정"}, 마감 ${c.end})`));
  if (!delayedTotal) lines.push("- 없음");

  if (d.meetingsToday.length) {
    lines.push("", `■ 회의 ${d.meetingsToday.length}건`);
    d.meetingsToday.forEach(m => lines.push(`- ${m.title} (${m.time || ""})`));
  }
  return lines.join("\n");
}

function render() {
  const panel = $("journalView");
  if (!panel) return;
  const st = getState();
  const d = computeData(st);
  _data = d;

  const ownerOpts = d.owners.map(o => `<option${o === _owner ? " selected" : ""}>${esc(o)}</option>`).join("");

  const completedCards = [
    ...d.completedTodos.map(t => itemCard("todo", t.id, t.title,
      metaLine(t.owner || "담당 미정", "할일", t.project && `현장:${t.project}`, completedTime(t.completedAt)), t.detail, "#22c55e")),
    ...d.completedCons.map(c => itemCard("construction", c.id, c.site,
      metaLine(c.owner || "담당 미정", "시공", completedTime(c.completedAt)), c.next, "#0ea5e9")),
    ...d.completedInsp.map(i => itemCard("inspection", i.id, i.plantName,
      metaLine(i.inspector || "담당 미정", "구조물검수", completedTime(i.completedAt)), i.address, "#a855f7")),
  ];

  const delayedCards = [
    ...d.delayedTodos.map(t => itemCard("todo", t.id, t.title,
      metaLine(t.owner || "담당 미정", "할일", t.project && `현장:${t.project}`, `지연 (마감 ${t.due})`), t.detail, "#ef4444")),
    ...d.delayedCons.map(c => itemCard("construction", c.id, c.site,
      metaLine(c.owner || "담당 미정", "시공", `지연 (마감 ${c.end})`), c.next, "#f97316")),
  ];

  const inProgressCards = [
    ...d.inProgTodos.map(t => itemCard("todo", t.id, t.title,
      metaLine(t.owner || "담당 미정", `할일 · ${t.status}`, t.project && `현장:${t.project}`), t.detail, "#3b82f6")),
    ...d.inProgCons.map(c => itemCard("construction", c.id, c.site,
      metaLine(c.owner || "담당 미정", `시공 · ${c.status}`), c.next, "#38bdf8")),
  ];

  const meetingCards = d.meetingsToday.map(m => itemCard("meeting", m.id, m.title,
    metaLine(m.host || "주재 미정", "회의", m.time), (m.attendees || []).join(", "), "#eab308"));

  panel.innerHTML = `
    <div class="schedule-toolbar">
      <div class="schedule-left">
        <button class="btn icon" id="journalPrevBtn">◀</button>
        <span class="schedule-month">${esc(_date)}</span>
        <button class="btn icon" id="journalNextBtn">▶</button>
        <button class="btn" id="journalTodayBtn">오늘</button>
      </div>
      <select class="field" id="journalOwner" style="max-width:140px">${ownerOpts}</select>
      <button class="btn" id="journalShareBtn">카톡/복사 공유</button>
    </div>
    <div class="card" style="margin-bottom:14px">
      <div class="panel-title"><h2>완료한 업무 (${completedCards.length})</h2></div>
      ${completedCards.length ? completedCards.join("") : `<div class="meta">완료된 항목이 없습니다.</div>`}
    </div>
    <div class="card" style="margin-bottom:14px">
      <div class="panel-title"><h2>지연 (${delayedCards.length})</h2></div>
      ${delayedCards.length ? delayedCards.join("") : `<div class="meta">지연된 항목이 없습니다.</div>`}
    </div>
    <div class="card" style="margin-bottom:14px">
      <div class="panel-title"><h2>진행 중이던 업무 (${inProgressCards.length})</h2></div>
      ${inProgressCards.length ? inProgressCards.join("") : `<div class="meta">해당하는 항목이 없습니다.</div>`}
    </div>
    <div class="card">
      <div class="panel-title"><h2>회의 (${meetingCards.length})</h2></div>
      ${meetingCards.length ? meetingCards.join("") : `<div class="meta">해당 날짜에 회의가 없습니다.</div>`}
    </div>`;

  panel.querySelector("#journalOwner")?.addEventListener("change", e => {
    _owner = e.target.value; render();
  });
}

function onDocClick(e) {
  const panel = document.getElementById("journalView");
  if (!panel || !panel.contains(e.target)) return;

  const btn = e.target.closest("button");
  if (btn) {
    if (btn.id === "journalPrevBtn")  return shiftDate(-1);
    if (btn.id === "journalNextBtn")  return shiftDate(1);
    if (btn.id === "journalTodayBtn") { _date = today(); return render(); }
    if (btn.id === "journalShareBtn") return _data && openKakaoShare(buildShareText(_data));
    return;
  }

  const card = e.target.closest("[data-journal-kind]");
  if (!card) return;
  const { journalKind: kind, journalId: id } = card.dataset;
  if (kind === "todo")         return openTodoModal(id);
  if (kind === "construction") return openConstructionById(id);
  if (kind === "inspection")   return openInspectionById(id);
  if (kind === "meeting")      return openMeetingById(id);
}

export function initJournal() {
  document.addEventListener("click", onDocClick);
  on("viewChanged", ({ view }) => { if (view === "journal") render(); });
  on("stateChange", () => {
    const panel = $("journalView");
    if (panel && !panel.classList.contains("hidden")) render();
  });
}
