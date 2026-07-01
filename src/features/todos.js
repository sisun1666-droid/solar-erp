import { getState, setState, markDeleted, on } from "../store/index.js";
import { genId, today, esc, toast, $ } from "../utils/index.js";
import { isConnected as gcalConnected, createEvent as gcalCreate, updateEvent as gcalUpdate, deleteEvent as gcalDelete } from "./gcal.js";
import { goTo } from "../router.js";

// ── 상태 ───────────────────────────────────────────────────────────────────
let _editingTodo = null;       // null = 새 항목, number = 인덱스
let _editingAssign = null;
let _statusFilter = "전체";
let _ownerFilter  = "전체";
let _completedExpanded = false;

const STATUSES  = ["백로그", "할 일", "진행중", "완료", "취소"];
const PRIORITIES = ["보통", "높음", "긴급", "낮음"];
const ASSIGN_STATUSES = ["지시", "진행", "검토요청", "완료", "보류"];
const ASSIGN_TYPES    = ["일반업무", "서류요청", "현장방문", "외부미팅", "기타"];
const REPEAT_OPTIONS   = ["없음", "매일", "매주", "매월"];

// ── 정규화 ──────────────────────────────────────────────────────────────────
function normTodo(t) {
  if (!t.id)       t.id       = genId("todo");
  if (!t.status)   t.status   = "할 일";
  if (!t.priority) t.priority = "보통";
  if (!t.due)      t.due      = today();
  if (!t.title)    t.title    = "제목 없는 할일";
  if (!t.start)    t.start    = t.due;
  return t;
}
function normAssign(a) {
  if (!a.id)       a.id       = genId("assignment");
  if (!a.start)    a.start    = a.due || today();
  if (!a.due)      a.due      = a.start || today();
  if (!a.priority) a.priority = "보통";
  if (!a.status)   a.status   = "지시";
  if (!a.type)     a.type     = "일반업무";
  if (!a.project)  a.project  = "일반업무";
  if (!a.title)    a.title    = "제목 없는 일정";
  return a;
}

// ── 상태 ↔ 상태 변환 ────────────────────────────────────────────────────────
function assignStatusToTodo(s) {
  if (s === "완료") return "완료";
  if (s === "보류") return "백로그";
  if (s === "진행" || s === "검토요청") return "진행중";
  return "할 일";
}
function todoStatusToAssign(s) {
  if (s === "완료") return "완료";
  if (s === "취소") return "보류";
  if (s === "진행중") return "진행";
  return "지시";
}

// ── 연결 동기화 ─────────────────────────────────────────────────────────────
function assignToTodo(a, old = {}) {
  return normTodo({ ...old,
    id: a.linkedTodoId || old.id || genId("todo"),
    linkedAssignmentId: a.id,
    title: a.title, owner: a.owner, status: assignStatusToTodo(a.status),
    priority: a.priority, start: a.start, due: a.due, detail: a.detail || "",
    project: a.project, type: a.type,
  });
}
function todoToAssign(t, old = {}) {
  return normAssign({ ...old,
    id: t.linkedAssignmentId || old.id || genId("assignment"),
    linkedTodoId: t.id,
    owner: t.owner, project: t.project || "일반업무", priority: t.priority,
    status: todoStatusToAssign(t.status), start: t.start || t.due || today(),
    due: t.due || today(), type: t.type || "일반업무", title: t.title, detail: t.detail || "",
  });
}

function syncAssignToTodo(state, assignIdx) {
  const a = state.assignments[assignIdx];
  if (!a) return;
  normAssign(a);
  let ti = state.todos.findIndex(t => t.id === a.linkedTodoId || t.linkedAssignmentId === a.id);
  if (ti < 0) {
    const t = assignToTodo(a);
    a.linkedTodoId = t.id;
    state.todos.unshift(t);
  } else {
    const t = assignToTodo(a, state.todos[ti]);
    a.linkedTodoId = t.id;
    state.todos[ti] = t;
  }
}
function syncTodoToAssign(state, todoIdx) {
  const t = state.todos[todoIdx];
  if (!t) return;
  normTodo(t);
  let ai = state.assignments.findIndex(a => a.id === t.linkedAssignmentId || a.linkedTodoId === t.id);
  if (ai < 0) {
    const a = todoToAssign(t);
    t.linkedAssignmentId = a.id;
    state.assignments.unshift(a);
  } else {
    const a = todoToAssign(t, state.assignments[ai]);
    t.linkedAssignmentId = a.id;
    state.assignments[ai] = a;
  }
}

// ── Google 캘린더 동기화 ────────────────────────────────────────────────────
const addDays   = (dateStr, n) => { const d = new Date(dateStr); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const addMonths = (dateStr, n) => { const d = new Date(dateStr); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); };
function shiftDate(dateStr, repeat, times) {
  if (repeat === "매일") return addDays(dateStr, times);
  if (repeat === "매주") return addDays(dateStr, times * 7);
  if (repeat === "매월") return addMonths(dateStr, times);
  return dateStr;
}

async function pushAssignToGcal(a) {
  if (!gcalConnected()) return a.gcalEventId || null;
  const body = { summary: a.title, description: a.detail || "", start: { date: a.start }, end: { date: addDays(a.due, 1) } };
  try {
    if (a.gcalEventId) { await gcalUpdate(a.gcalEventId, body); return a.gcalEventId; }
    return await gcalCreate(body);
  } catch {
    toast("Google 캘린더 동기화에 실패했습니다.");
    return a.gcalEventId || null;
  }
}

// ── 삭제 ────────────────────────────────────────────────────────────────────
function deleteTodo(idx) {
  const st = getState();
  const todos = [...st.todos], assigns = [...st.assignments];
  const t = todos[idx];
  if (!t) return;
  const linked = assigns.find(a => a.id === t.linkedAssignmentId);
  markDeleted("todos", t.id);
  if (t.linkedAssignmentId) markDeleted("assignments", t.linkedAssignmentId);
  todos.splice(idx, 1);
  const newAssigns = assigns.filter(a => a.id !== t.linkedAssignmentId);
  setState({ todos, assignments: newAssigns });
  if (linked?.gcalEventId) gcalDelete(linked.gcalEventId).catch(() => {});
}
function deleteAssign(idx) {
  const st = getState();
  const todos = [...st.todos], assigns = [...st.assignments];
  const a = assigns[idx];
  if (!a) return;
  markDeleted("assignments", a.id);
  if (a.linkedTodoId) markDeleted("todos", a.linkedTodoId);
  assigns.splice(idx, 1);
  const newTodos = todos.filter(t => t.id !== a.linkedTodoId);
  setState({ assignments: assigns, todos: newTodos });
  if (a.gcalEventId) gcalDelete(a.gcalEventId).catch(() => {});
}

// ── 마감 임박 표시 ──────────────────────────────────────────────────────────
function dueBadge(t) {
  if (["완료", "취소"].includes(t.status) || !t.due) return "";
  if (t.due < today())  return `<span class="todo-due-badge overdue">지연</span>`;
  if (t.due === today()) return `<span class="todo-due-badge today">오늘마감</span>`;
  return "";
}

// ── 드래그로 상태 변경 ──────────────────────────────────────────────────────
function moveTodoStatus(idx, newStatus) {
  const st = getState();
  const todos = [...(st.todos || [])];
  const assigns = [...(st.assignments || [])];
  const t = todos[idx];
  if (!t || t.status === newStatus) return;
  todos[idx] = { ...t, status: newStatus };
  const tmpState = { ...st, todos, assignments: assigns };
  syncTodoToAssign(tmpState, idx);
  setState({ todos: tmpState.todos, assignments: tmpState.assignments });
  renderBoard();
}

function initDragEvents(panel) {
  panel.addEventListener("dragstart", e => {
    const card = e.target.closest(".todo-card");
    if (!card) return;
    e.dataTransfer.setData("text/plain", card.dataset.todoIdx);
    card.classList.add("dragging");
  });
  panel.addEventListener("dragend", e => {
    e.target.closest(".todo-card")?.classList.remove("dragging");
  });
  panel.addEventListener("dragover", e => {
    const col = e.target.closest(".todo-column");
    if (!col) return;
    e.preventDefault();
    col.classList.add("drag-over");
  });
  panel.addEventListener("dragleave", e => {
    e.target.closest(".todo-column")?.classList.remove("drag-over");
  });
  panel.addEventListener("drop", e => {
    const col = e.target.closest(".todo-column");
    if (!col) return;
    e.preventDefault();
    col.classList.remove("drag-over");
    const idx = Number(e.dataTransfer.getData("text/plain"));
    if (!Number.isNaN(idx)) moveTodoStatus(idx, col.dataset.todoDropStatus);
  });
}

// ── 보드 렌더 ───────────────────────────────────────────────────────────────
const COL_STYLE = {
  bg:  { 백로그:"#f5f3ff", "할 일":"#fffbeb", 진행중:"#eff6ff", 완료:"#f0fdf4", 취소:"#fef2f2" },
  bd:  { 백로그:"#c4b5fd", "할 일":"#fcd34d", 진행중:"#93c5fd", 완료:"#86efac", 취소:"#fca5a5" },
  hbg: { 백로그:"#ede9fe", "할 일":"#fef3c7", 진행중:"#dbeafe", 완료:"#dcfce7", 취소:"#fee2e2" },
  htx: { 백로그:"#5b21b6", "할 일":"#92400e", 진행중:"#1e40af", 완료:"#15803d", 취소:"#991b1b" },
  cbr: { 백로그:"#8b5cf6", "할 일":"#f59e0b", 진행중:"#3b82f6", 완료:"#22c55e", 취소:"#ef4444" },
};

function renderBoard() {
  const panel = $("todosView");
  if (!panel) return;
  const st = getState();
  const q = panel.querySelector("#todoSearch")?.value || "";
  const todos = st.todos || [];
  const people = st.people || [];
  const owners = ["전체", ...people.map(p => p.name)];

  function matches(t) {
    return [t.title, t.detail, t.owner, t.status, t.priority].join(" ").toLowerCase().includes(q.toLowerCase());
  }
  const filtered = todos
    .map((t, i) => ({ t, i }))
    .filter(({ t }) =>
      (_statusFilter === "전체" || t.status === _statusFilter) &&
      (_ownerFilter  === "전체" || t.owner  === _ownerFilter) &&
      matches(t)
    );

  const statusChips = ["전체", ...STATUSES].map(s =>
    `<button class="todo-chip${_statusFilter === s ? " active" : ""}" data-todo-status-filter="${esc(s)}">
      ${esc(s)} <strong>${s === "전체" ? todos.length : todos.filter(t => t.status === s).length}</strong>
    </button>`
  ).join("");

  const ownerChips = owners.map(o =>
    `<button class="todo-chip${_ownerFilter === o ? " active" : ""}" data-todo-owner-filter="${esc(o)}">
      ${esc(o)} <strong>${o === "전체" ? todos.length : todos.filter(t => t.owner === o).length}</strong>
    </button>`
  ).join("");

  const columns = STATUSES.map(s => {
    const rows = filtered.filter(x => x.t.status === s);
    const cards = rows.length
      ? rows.map(({ t, i }) => `
          <div class="todo-card" draggable="true" data-todo-idx="${i}" style="border-left:4px solid ${COL_STYLE.cbr[s]||"#cbd5e1"}">
            <div class="todo-card-title">${esc(t.title)} ${dueBadge(t)}</div>
            <div class="todo-card-meta">${esc(t.owner||"담당 미정")} · ${esc(t.priority||"보통")} · ${esc(t.due||"")}</div>
            ${t.detail ? `<div class="todo-card-meta" style="margin-top:2px">${esc(t.detail.length > 40 ? t.detail.slice(0, 40) + "…" : t.detail)}</div>` : ""}
            <div class="row-actions" style="margin-top:7px">
              <button class="btn icon" data-edit-todo="${i}">수정</button>
              <button class="btn icon danger" data-delete-todo="${i}">삭제</button>
            </div>
          </div>`).join("")
      : `<div class="meta" style="font-size:12px;padding:8px 4px">비어 있음</div>`;

    const isDone = s === "완료";
    return `
      <div class="todo-column${isDone && _completedExpanded ? " expanded" : ""}" data-status="${esc(s)}" data-todo-drop-status="${esc(s)}">
        <div class="todo-column-head${isDone ? " todo-column-toggle" : ""}"
          ${isDone ? `data-todo-toggle-completed="1"` : ""}
          style="background:${COL_STYLE.hbg[s]};color:${COL_STYLE.htx[s]}">
          ${isDone ? `<span class="todo-column-toggle-icon">▶</span>` : ""}
          <span>${esc(s)}</span>
          <span class="count">${rows.length}</span>
        </div>
        <div class="todo-cards-wrap">${cards}</div>
        <button class="btn" style="width:100%;font-size:12px;margin-top:4px"
          data-add-todo-status="${esc(s)}">+ 빠른 추가</button>
      </div>`;
  }).join("");

  panel.innerHTML = `
    <div class="todo-toolbar">
      <div class="todo-view">
        <button class="active">보드</button>
      </div>
      <button class="btn" id="todoGoCalendarBtn">캘린더 보기</button>
      <button class="btn primary" id="todoAddBtn">할일 추가</button>
    </div>
    <div class="todo-filters">
      <input class="search" id="todoSearch" placeholder="제목, 담당자, 우선순위 검색" value="${esc(q)}">
      <div class="todo-chips">${statusChips}</div>
      <div class="todo-chips">${ownerChips}</div>
    </div>
    <div class="todo-board">${columns}</div>`;

  panel.querySelector("#todoSearch")?.addEventListener("input", renderBoard);
}

// ── 할일 모달 ───────────────────────────────────────────────────────────────
function openTodoModal(idx = null, defaultStatus = "할 일") {
  _editingTodo = idx;
  const st = getState();
  const t = idx === null
    ? { title: "", owner: st.people?.[0]?.name || "", status: defaultStatus,
        priority: "보통", start: today(), due: today(), detail: "" }
    : normTodo({ ...st.todos[idx] });

  const ownerOpts = (st.people || []).map(p =>
    `<option${p.name === t.owner ? " selected" : ""}>${esc(p.name)}</option>`
  ).join("") || `<option>${esc(t.owner || "담당 미정")}</option>`;

  const statusOpts = STATUSES.map(s =>
    `<option${s === t.status ? " selected" : ""}>${esc(s)}</option>`).join("");
  const prioOpts = PRIORITIES.map(p =>
    `<option${p === t.priority ? " selected" : ""}>${esc(p)}</option>`).join("");

  $("todoFormGrid").innerHTML = `
    <div class="form-row full">
      <label>제목</label>
      <input class="field" id="todoTitle" value="${esc(t.title)}" placeholder="할일 제목">
    </div>
    <div class="form-row">
      <label>담당자</label>
      <select class="field" id="todoOwner">${ownerOpts}</select>
    </div>
    <div class="form-row">
      <label>상태</label>
      <select class="field" id="todoStatus">${statusOpts}</select>
    </div>
    <div class="form-row">
      <label>우선순위</label>
      <select class="field" id="todoPriority">${prioOpts}</select>
    </div>
    <div class="form-row">
      <label>마감일</label>
      <input class="field" type="date" id="todoDue" value="${esc(t.due)}">
    </div>
    <div class="form-row full">
      <label>설명</label>
      <textarea class="field" id="todoDetail">${esc(t.detail || "")}</textarea>
    </div>`;

  $("deleteTodoBtn")?.classList.toggle("hidden", idx === null);
  $("todoModal")?.classList.remove("hidden");
  $("todoModal")?.classList.add("open");
}

async function saveTodo() {
  const st = getState();
  const todos = [...(st.todos || [])];
  const assigns = [...(st.assignments || [])];
  const t = normTodo({
    title: $("todoTitle")?.value || "제목 없는 할일",
    owner: $("todoOwner")?.value || "",
    status: $("todoStatus")?.value || "할 일",
    priority: $("todoPriority")?.value || "보통",
    due: $("todoDue")?.value || today(),
    start: $("todoDue")?.value || today(),
    detail: $("todoDetail")?.value || "",
  });
  if (_editingTodo !== null) {
    t.id = todos[_editingTodo].id;
    t.linkedAssignmentId = todos[_editingTodo].linkedAssignmentId;
    todos[_editingTodo] = t;
  } else {
    todos.unshift(t);
  }
  const tmpState = { ...st, todos, assignments: assigns };
  const todoIdx = _editingTodo !== null ? _editingTodo : 0;
  syncTodoToAssign(tmpState, todoIdx);
  const assignIdx = tmpState.assignments.findIndex(a => a.id === tmpState.todos[todoIdx].linkedAssignmentId);
  if (assignIdx >= 0) {
    const gcalId = await pushAssignToGcal(tmpState.assignments[assignIdx]);
    if (gcalId) tmpState.assignments[assignIdx] = { ...tmpState.assignments[assignIdx], gcalEventId: gcalId };
  }
  setState({ todos: tmpState.todos, assignments: tmpState.assignments });
  closeTodoModal();
  toast("할일과 일정을 함께 저장했습니다.");
  renderBoard();
}

function closeTodoModal() {
  const m = $("todoModal");
  m?.classList.remove("open");
  m?.classList.add("hidden");
}

// ── 일정(assignment) 모달 ───────────────────────────────────────────────────
function openAssignModal(idx = null) {
  _editingAssign = idx;
  const st = getState();
  const a = idx === null
    ? { owner: st.people?.[0]?.name || "", project: "일반업무", priority: "보통",
        status: "지시", type: "일반업무", start: today(), due: today(), title: "", detail: "" }
    : normAssign({ ...st.assignments[idx] });

  const ownerOpts = (st.people || []).map(p =>
    `<option${p.name === a.owner ? " selected" : ""}>${esc(p.name)}</option>`
  ).join("") || `<option>${esc(a.owner || "담당 미정")}</option>`;

  const projOpts = (st.projects?.length ? st.projects : [{ name: "일반업무" }]).map(p =>
    `<option${p.name === a.project ? " selected" : ""}>${esc(p.name)}</option>`).join("");
  const prioOpts = PRIORITIES.map(p =>
    `<option${p === a.priority ? " selected" : ""}>${esc(p)}</option>`).join("");
  const statusOpts = ASSIGN_STATUSES.map(s =>
    `<option${s === a.status ? " selected" : ""}>${esc(s)}</option>`).join("");
  const typeOpts = ASSIGN_TYPES.map(t =>
    `<option${t === a.type ? " selected" : ""}>${esc(t)}</option>`).join("");

  $("assignmentFormGrid").innerHTML = `
    <div class="form-row full">
      <label>제목</label>
      <input class="field" id="assignmentTitle" value="${esc(a.title)}" placeholder="일정 제목">
    </div>
    <div class="form-row">
      <label>담당자</label>
      <select class="field" id="assignmentOwner">${ownerOpts}</select>
    </div>
    <div class="form-row">
      <label>프로젝트</label>
      <select class="field" id="assignmentProject">${projOpts}</select>
    </div>
    <div class="form-row">
      <label>구분</label>
      <select class="field" id="assignmentType">${typeOpts}</select>
    </div>
    <div class="form-row">
      <label>우선순위</label>
      <select class="field" id="assignmentPriority">${prioOpts}</select>
    </div>
    <div class="form-row">
      <label>상태</label>
      <select class="field" id="assignmentStatus">${statusOpts}</select>
    </div>
    <div class="form-row">
      <label>시작일</label>
      <input class="field" type="date" id="assignmentStart" value="${esc(a.start)}">
    </div>
    <div class="form-row">
      <label>마감일</label>
      <input class="field" type="date" id="assignmentDue" value="${esc(a.due)}">
    </div>
    <div class="form-row full">
      <label>내용</label>
      <textarea class="field" id="assignmentDetail">${esc(a.detail || "")}</textarea>
    </div>
    ${idx === null ? `
    <div class="form-row">
      <label>반복</label>
      <select class="field" id="assignmentRepeat">${REPEAT_OPTIONS.map(r => `<option>${esc(r)}</option>`).join("")}</select>
    </div>
    <div class="form-row">
      <label>반복 횟수</label>
      <input class="field" type="number" id="assignmentRepeatCount" value="4" min="2" max="52">
    </div>` : ""}`;

  $("deleteAssignmentBtn")?.classList.toggle("hidden", idx === null);
  $("assignmentModal")?.classList.remove("hidden");
  $("assignmentModal")?.classList.add("open");
}

async function saveAssign() {
  const st = getState();
  const todos = [...(st.todos || [])];
  const assigns = [...(st.assignments || [])];
  const a = normAssign({
    title:    $("assignmentTitle")?.value || "제목 없는 일정",
    owner:    $("assignmentOwner")?.value || "",
    project:  $("assignmentProject")?.value || "일반업무",
    type:     $("assignmentType")?.value || "일반업무",
    priority: $("assignmentPriority")?.value || "보통",
    status:   $("assignmentStatus")?.value || "지시",
    start:    $("assignmentStart")?.value || today(),
    due:      $("assignmentDue")?.value || today(),
    detail:   $("assignmentDetail")?.value || "",
  });
  const assignIdx = _editingAssign !== null ? _editingAssign : 0;
  if (_editingAssign !== null) {
    a.id = assigns[_editingAssign].id;
    a.linkedTodoId = assigns[_editingAssign].linkedTodoId;
    a.gcalEventId = assigns[_editingAssign].gcalEventId;
    assigns[_editingAssign] = a;
  } else {
    assigns.unshift(a);
  }
  const gcalId = await pushAssignToGcal(assigns[assignIdx]);
  if (gcalId) assigns[assignIdx] = { ...assigns[assignIdx], gcalEventId: gcalId };
  const tmpState = { ...st, todos, assignments: assigns };
  syncAssignToTodo(tmpState, assignIdx);

  const repeat = _editingAssign === null ? ($("assignmentRepeat")?.value || "없음") : "없음";
  const count = Math.max(2, Number($("assignmentRepeatCount")?.value) || 4);
  if (repeat !== "없음") {
    for (let i = 1; i < count; i++) {
      const occ = normAssign({
        ...a, id: undefined, linkedTodoId: undefined, gcalEventId: undefined,
        start: shiftDate(a.start, repeat, i), due: shiftDate(a.due, repeat, i),
      });
      tmpState.assignments.unshift(occ);
      const gid = await pushAssignToGcal(tmpState.assignments[0]);
      if (gid) tmpState.assignments[0] = { ...tmpState.assignments[0], gcalEventId: gid };
      syncAssignToTodo(tmpState, 0);
    }
  }

  setState({ todos: tmpState.todos, assignments: tmpState.assignments });
  closeAssignModal();
  toast(repeat !== "없음" ? `일정 ${count}건을 반복 생성했습니다.` : "일정과 할일을 함께 저장했습니다.");
  renderBoard();
}

function closeAssignModal() {
  const m = $("assignmentModal");
  m?.classList.remove("open");
  m?.classList.add("hidden");
}

// ── 이벤트 위임 ─────────────────────────────────────────────────────────────
function onDocClick(e) {
  const t = e.target.closest("button, [data-todo-toggle-completed]") || e.target;

  if (t.id === "todoAddBtn")              return openTodoModal();
  if (t.id === "todoGoCalendarBtn")       return goTo("assignment");
  if (t.dataset.addTodoStatus)            return openTodoModal(null, t.dataset.addTodoStatus);
  if (t.dataset.editTodo !== undefined)   return openTodoModal(Number(t.dataset.editTodo));
  if (t.dataset.todoStatusFilter)         { _statusFilter = t.dataset.todoStatusFilter; renderBoard(); return; }
  if (t.dataset.todoOwnerFilter)          { _ownerFilter  = t.dataset.todoOwnerFilter;  renderBoard(); return; }
  if (t.dataset.todoToggleCompleted)      { _completedExpanded = !_completedExpanded;   renderBoard(); return; }
  if (t.id === "saveTodoBtn")             return saveTodo();
  if (t.id === "deleteTodoBtn") {
    if (_editingTodo !== null && confirm("이 할일과 연결된 일정을 함께 삭제할까요?")) {
      deleteTodo(_editingTodo);
      closeTodoModal();
      toast("삭제했습니다.");
      renderBoard();
    }
    return;
  }
  if (t.dataset.deleteTodo !== undefined) {
    if (confirm("이 할일을 삭제할까요?")) {
      deleteTodo(Number(t.dataset.deleteTodo));
      toast("삭제했습니다.");
      renderBoard();
    }
    return;
  }

  if (t.id === "saveAssignmentBtn")       return saveAssign();
  if (t.id === "deleteAssignmentBtn") {
    if (_editingAssign !== null && confirm("이 일정과 할일을 함께 삭제할까요?")) {
      deleteAssign(_editingAssign);
      closeAssignModal();
      toast("삭제했습니다.");
      renderBoard();
    }
    return;
  }
  if (t.dataset.editAssignment !== undefined) return openAssignModal(Number(t.dataset.editAssignment));

  // 모달 닫기
  if (t.dataset.closeModal === "todoModal")       closeTodoModal();
  if (t.dataset.closeModal === "assignmentModal") closeAssignModal();
}

// ── 초기화 ──────────────────────────────────────────────────────────────────
export function initTodos() {
  document.addEventListener("click", onDocClick);
  const panel = $("todosView");
  if (panel) initDragEvents(panel);
  on("viewChanged", ({ view }) => { if (view === "todos") renderBoard(); });
  on("stateChange", () => {
    const panel = $("todosView");
    if (panel && !panel.classList.contains("hidden")) renderBoard();
  });
}

export { openTodoModal, openAssignModal, renderBoard as renderTodoBoard };
