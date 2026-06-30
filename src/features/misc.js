/**
 * 나머지 뷰: 회의록, 프로젝트DB, 메시지, 보고서, MW, 구조물검수
 * 공통 패턴: on("viewChanged") → 뷰 진입 시 render()
 */
import { getState, setState, markDeleted, on } from "../store/index.js";
import { genId, today, esc, toast } from "../utils/index.js";

// ── 공통 유틸 ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function statusBadge(s, cls = "") {
  return `<span class="badge ${cls}">${esc(s)}</span>`;
}

function ifVisible(viewId, fn) {
  const el = $(viewId);
  if (el && !el.classList.contains("hidden")) fn(el);
}

// ────────────────────────────────────────────────────────────────────────────
// 회의록 (meetings)
// ────────────────────────────────────────────────────────────────────────────
let _editMeeting = null;

function normMeeting(m) {
  if (!m.id) m.id = genId("meeting");
  if (!m.date) m.date = today();
  if (!m.title) m.title = "회의 제목";
  if (!m.attendees) m.attendees = [];
  return m;
}

function renderMeetings() {
  const panel = $("meetingsView");
  if (!panel) return;
  const st = getState();
  const meetings = [...(st.meetings || [])].sort((a, b) => b.date?.localeCompare(a.date || "") || 0);

  panel.innerHTML = `
    <div class="toolbar" style="margin-bottom:12px">
      <h1 style="margin:0;font-size:20px;font-weight:700">회의록</h1>
      <button class="btn primary" id="meetingAddBtn">+ 회의록 추가</button>
    </div>
    <div class="stack">
      ${meetings.length ? meetings.map((m, i) => `
        <div class="card">
          <div class="card-top">
            <span class="name">${esc(m.title)}</span>
            <span class="badge blue">${esc(m.type || "일반회의")}</span>
          </div>
          <div class="meta">${esc(m.date)} ${esc(m.time || "")} · 주재: ${esc(m.host || "")} · ${esc((m.attendees || []).join(", "))}</div>
          ${m.summary ? `<div class="meta" style="margin-top:4px">${esc(m.summary.length > 80 ? m.summary.slice(0,80)+"…" : m.summary)}</div>` : ""}
          ${m.decisions?.length ? `<div class="meta" style="margin-top:4px;color:var(--teal)">결정: ${esc(m.decisions.slice(0,2).join(" / "))}</div>` : ""}
          <div class="row-actions" style="margin-top:8px">
            <button class="btn icon" data-meeting-edit="${i}">수정</button>
            <button class="btn icon danger" data-meeting-delete="${i}">삭제</button>
          </div>
        </div>`).join("")
      : `<div class="meta">등록된 회의록이 없습니다.</div>`}
    </div>`;
}

function openMeetingModal(idx = null) {
  _editMeeting = idx;
  const st = getState();
  const meetings = st.meetings || [];
  const m = idx === null
    ? { title: "", date: today(), time: "09:00", host: "", type: "일반회의", attendees: [], summary: "", decisions: [] }
    : { ...meetings[idx] };

  const types = ["일반회의", "주간회의", "현장회의", "기획회의", "검토회의"];
  const typeOpts = types.map(t => `<option${t === m.type ? " selected" : ""}>${esc(t)}</option>`).join("");

  $("todoFormGrid").innerHTML = "";  // 할일 모달 재사용 없이 직접

  // 회의록 전용 모달 없으므로 간단한 overlay 생성
  let overlay = $("meetingEditOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "meetingEditOverlay";
    overlay.className = "overlay";
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div class="modal" style="width:min(600px,100%)">
      <div class="modal-head">
        <h2>${idx === null ? "회의록 추가" : "회의록 수정"}</h2>
        <button class="btn icon" id="meetingModalClose">×</button>
      </div>
      <div class="form-grid">
        <div class="form-row full"><label>제목</label><input class="field" id="mtgTitle" value="${esc(m.title)}" placeholder="회의 제목"></div>
        <div class="form-row"><label>날짜</label><input class="field" type="date" id="mtgDate" value="${esc(m.date)}"></div>
        <div class="form-row"><label>시간</label><input class="field" type="time" id="mtgTime" value="${esc(m.time||"09:00")}"></div>
        <div class="form-row"><label>구분</label><select class="field" id="mtgType">${typeOpts}</select></div>
        <div class="form-row"><label>주재자</label><input class="field" id="mtgHost" value="${esc(m.host||"")}"></div>
        <div class="form-row full"><label>참석자 (쉼표 구분)</label><input class="field" id="mtgAttendees" value="${esc((m.attendees||[]).join(", "))}"></div>
        <div class="form-row full"><label>회의 요약</label><textarea class="field" id="mtgSummary">${esc(m.summary||"")}</textarea></div>
        <div class="form-row full"><label>결정사항 (줄바꿈 구분)</label><textarea class="field" id="mtgDecisions">${esc((m.decisions||[]).join("\n"))}</textarea></div>
      </div>
      <div class="toolbar" style="margin-top:14px">
        <button class="btn primary" id="mtgSaveBtn">저장</button>
        ${idx !== null ? `<button class="btn danger" id="mtgDeleteBtn">삭제</button>` : ""}
      </div>
    </div>`;
  overlay.classList.remove("hidden");
  overlay.classList.add("open");

  $("meetingModalClose")?.addEventListener("click", closeMeetingModal);
  $("mtgSaveBtn")?.addEventListener("click", saveMeeting);
  $("mtgDeleteBtn")?.addEventListener("click", () => deleteMeeting(idx));
  overlay.addEventListener("click", e => { if (e.target === overlay) closeMeetingModal(); });
}

function closeMeetingModal() {
  const o = $("meetingEditOverlay");
  o?.classList.remove("open");
  o?.classList.add("hidden");
}

function saveMeeting() {
  const st = getState();
  const meetings = [...(st.meetings || [])];
  const m = normMeeting({
    title:     $("mtgTitle")?.value || "회의 제목",
    date:      $("mtgDate")?.value  || today(),
    time:      $("mtgTime")?.value  || "09:00",
    type:      $("mtgType")?.value  || "일반회의",
    host:      $("mtgHost")?.value  || "",
    attendees: ($("mtgAttendees")?.value || "").split(",").map(s => s.trim()).filter(Boolean),
    summary:   $("mtgSummary")?.value || "",
    decisions: ($("mtgDecisions")?.value || "").split("\n").map(s => s.trim()).filter(Boolean),
  });
  if (_editMeeting !== null) {
    m.id = meetings[_editMeeting].id;
    meetings[_editMeeting] = m;
  } else {
    meetings.unshift(m);
  }
  setState({ meetings });
  closeMeetingModal();
  toast("저장됐습니다.");
  renderMeetings();
}

function deleteMeeting(idx) {
  if (!confirm("이 회의록을 삭제할까요?")) return;
  const st = getState();
  const meetings = [...(st.meetings || [])];
  const m = meetings[idx];
  if (m?.id) markDeleted("meetings", m.id);
  meetings.splice(idx, 1);
  setState({ meetings });
  closeMeetingModal();
  toast("삭제됐습니다.");
  renderMeetings();
}

// ────────────────────────────────────────────────────────────────────────────
// 프로젝트 DB (현장·공무 진행표)
// ────────────────────────────────────────────────────────────────────────────
let _editProject = null;
let _projSearch  = "";
let _projPhase   = "전체";
let _projSortKey = "";
let _projSortDir = "asc";

function normProject(p) {
  if (!p.id)    p.id    = genId("project");
  if (!p.phase) p.phase = "고객상담";
  if (!p.due)   p.due   = today();
  return p;
}

function renderProjects() {
  const panel = $("dbView") || $("projectsView");
  if (!panel) return;
  renderProjectTable(panel);
}

function renderProjectTable(panel) {
  const st = getState();
  const phases = ["전체", ...(st.phases || [])];
  const phaseOpts = phases.map(p => `<option${p === _projPhase ? " selected" : ""}>${esc(p)}</option>`).join("");

  const rows = (st.projects || [])
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => {
      if (_projPhase !== "전체" && p.phase !== _projPhase) return false;
      if (_projSearch) {
        const hay = Object.values(p).join(" ").toLowerCase();
        if (!hay.includes(_projSearch.toLowerCase())) return false;
      }
      return true;
    });

  function sortHead(key, label) {
    const mark = _projSortKey === key ? (_projSortDir === "asc" ? " ▲" : " ▼") : "";
    return `<button class="sort-head" data-proj-sort="${key}">${esc(label)}${mark}</button>`;
  }

  panel.innerHTML = `
    <div class="toolbar" style="margin-bottom:12px">
      <input class="search" id="projSearch" placeholder="고객/현장 검색" value="${esc(_projSearch)}" style="max-width:240px">
      <select class="field" id="projPhase" style="max-width:150px">${phaseOpts}</select>
      <button class="btn primary" id="projAddBtn">현장 추가</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th style="width:20%">${sortHead("name","고객/현장")}</th>
          <th style="width:14%">${sortHead("phase","업무단계")}</th>
          <th style="width:12%">${sortHead("owner","담당")}</th>
          <th style="width:13%">${sortHead("due","마감일")}</th>
          <th style="width:13%">${sortHead("status","상태")}</th>
          <th>다음 액션</th>
          <th style="width:70px">관리</th>
        </tr></thead>
        <tbody>
          ${rows.map(({ p, i }) => `<tr>
            <td title="${esc(p.name)}">${esc(p.name)}</td>
            <td>${esc(p.phase)}</td>
            <td>${esc(p.owner)}</td>
            <td>${esc(p.due)}</td>
            <td>${statusBadge(p.status)}</td>
            <td title="${esc(p.next)}">${esc((p.next||"").length>40?p.next.slice(0,40)+"…":p.next)}</td>
            <td><button class="btn icon" data-proj-edit="${i}">수정</button></td>
          </tr>`).join("")}
          ${rows.length === 0 ? `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">현장이 없습니다.</td></tr>` : ""}
        </tbody>
      </table>
    </div>`;

  panel.querySelector("#projSearch")?.addEventListener("input", e => {
    _projSearch = e.target.value; renderProjectTable(panel);
  });
  panel.querySelector("#projPhase")?.addEventListener("change", e => {
    _projPhase = e.target.value; renderProjectTable(panel);
  });
}

function openProjectModal(idx = null) {
  _editProject = idx;
  const st = getState();
  const p = idx === null
    ? { name: "", phase: (st.phases||[])[0]||"고객상담", owner: "", due: today(), status: "정상", next: "" }
    : { ...(st.projects[idx]) };

  const phaseOpts = (st.phases || []).map(x => `<option${x === p.phase ? " selected" : ""}>${esc(x)}</option>`).join("");
  const statOpts  = (st.statuses || ["정상","대기","보완","지연","완료"]).map(s =>
    `<option${s === p.status ? " selected" : ""}>${esc(s)}</option>`).join("");

  let overlay = $("projectEditOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "projectEditOverlay";
    overlay.className = "overlay";
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <h2>${idx === null ? "현장 추가" : "현장 수정"}</h2>
        <button class="btn icon" id="projModalClose">×</button>
      </div>
      <div class="form-grid">
        <div class="form-row full"><label>고객/현장명</label><input class="field" id="projName" value="${esc(p.name)}" placeholder="현장명"></div>
        <div class="form-row"><label>업무단계</label><select class="field" id="projPhaseModal">${phaseOpts}</select></div>
        <div class="form-row"><label>담당자</label><input class="field" id="projOwner" value="${esc(p.owner||"")}"></div>
        <div class="form-row"><label>마감일</label><input class="field" type="date" id="projDue" value="${esc(p.due)}"></div>
        <div class="form-row"><label>상태</label><select class="field" id="projStatus">${statOpts}</select></div>
        <div class="form-row full"><label>다음 액션</label><textarea class="field" id="projNext">${esc(p.next||"")}</textarea></div>
      </div>
      <div class="toolbar" style="margin-top:14px">
        <button class="btn primary" id="projSaveBtn">저장</button>
        ${idx !== null ? `<button class="btn danger" id="projDeleteBtn">삭제</button>` : ""}
      </div>
    </div>`;
  overlay.classList.remove("hidden");
  overlay.classList.add("open");

  $("projModalClose")?.addEventListener("click", () => { overlay.classList.remove("open"); overlay.classList.add("hidden"); });
  $("projSaveBtn")?.addEventListener("click", saveProject);
  $("projDeleteBtn")?.addEventListener("click", () => deleteProject(idx));
  overlay.addEventListener("click", e => { if (e.target === overlay) { overlay.classList.remove("open"); overlay.classList.add("hidden"); } });
}

function saveProject() {
  const st = getState();
  const projects = [...(st.projects || [])];
  const p = normProject({
    name:  $("projName")?.value || "",
    phase: $("projPhaseModal")?.value || "",
    owner: $("projOwner")?.value || "",
    due:   $("projDue")?.value || today(),
    status:$("projStatus")?.value || "정상",
    next:  $("projNext")?.value || "",
  });
  if (_editProject !== null) {
    p.id = projects[_editProject].id;
    projects[_editProject] = p;
  } else {
    projects.unshift(p);
  }
  setState({ projects });
  const o = $("projectEditOverlay");
  o?.classList.remove("open"); o?.classList.add("hidden");
  toast("저장됐습니다.");
  renderProjects();
}

function deleteProject(idx) {
  if (!confirm("이 현장을 삭제할까요?")) return;
  const st = getState();
  const projects = [...(st.projects || [])];
  if (projects[idx]?.id) markDeleted("projects", projects[idx].id);
  projects.splice(idx, 1);
  setState({ projects });
  const o = $("projectEditOverlay");
  o?.classList.remove("open"); o?.classList.add("hidden");
  toast("삭제됐습니다.");
  renderProjects();
}

// ────────────────────────────────────────────────────────────────────────────
// 단순 뷰 스텁 (보고서, 메시지, MW, 구조물검수)
// ────────────────────────────────────────────────────────────────────────────
function renderPlaceholder(viewId, title, desc) {
  const el = $(viewId);
  if (!el) return;
  el.innerHTML = `
    <div style="padding:32px;text-align:center;color:var(--muted)">
      <div style="font-size:48px;margin-bottom:16px">🚧</div>
      <h2 style="margin:0 0 8px;font-size:20px;color:var(--ink)">${esc(title)}</h2>
      <p style="margin:0;font-size:14px">${esc(desc)}</p>
    </div>`;
}

function renderMessages()  { renderPlaceholder("messagesView",  "메시지", "카카오 메시지 발송 기능 — 준비 중"); }
function renderReports()   { renderPlaceholder("reportsView",   "보고서", "A/S 보고서·시공월별보고서·기타 보고서 — 준비 중"); }
function renderMw()        {
  const el = $("mwView");
  if (!el) return;
  const st = getState();
  const con = st.construction || [];
  const totalKw = con.reduce((s, c) => s + (Number(c.kw)||0), 0);
  const mw = (totalKw / 1000).toFixed(3);
  el.innerHTML = `
    <div class="kpis" style="margin-bottom:16px">
      <div class="kpi"><div class="label">총 시공 용량</div><div class="value">${totalKw}kW</div><div class="delta">${mw}MW</div></div>
      <div class="kpi"><div class="label">총 현장 수</div><div class="value">${con.length}</div><div class="delta">시공일정 기준</div></div>
      <div class="kpi"><div class="label">완료 현장</div><div class="value">${con.filter(c=>c.status==="완료").length}</div></div>
      <div class="kpi"><div class="label">시공중</div><div class="value">${con.filter(c=>c.status==="시공중").length}</div></div>
    </div>
    <div class="panel" style="padding:16px">
      <div class="panel-title"><h2>현장별 용량 목록</h2></div>
      <div class="table-wrap">
        <table><thead><tr><th>현장</th><th>시공사</th><th>kW</th><th>MW</th><th>상태</th></tr></thead>
        <tbody>${con.map(c => `<tr>
          <td>${esc(c.site)}</td><td>${esc(c.company)}</td><td>${esc(c.kw)}</td>
          <td>${((Number(c.kw)||0)/1000).toFixed(3)}</td>
          <td><span class="badge">${esc(c.status)}</span></td>
        </tr>`).join("")}</tbody></table>
      </div>
    </div>`;
}
function renderInspection() {
  const el = $("inspectionView");
  if (!el) return;
  const st = getState();
  const items = st.structureInspections || [];
  el.innerHTML = `
    <div class="toolbar" style="margin-bottom:12px">
      <h1 style="margin:0;font-size:20px;font-weight:700">구조물 검수</h1>
      <button class="btn primary" id="inspAddBtn">+ 검수 추가</button>
    </div>
    <div class="stack">
      ${items.length ? items.map((item, i) => `
        <div class="card">
          <div class="card-top"><span class="name">${esc(item.plantName||"현장명")}</span><span class="badge blue">${esc(item.phase||"검수중")}</span></div>
          <div class="meta">${esc(item.date||"")} · ${esc(item.inspector||"")} · ${esc(item.address||"")}</div>
          <button class="btn icon danger" style="margin-top:8px" data-insp-delete="${i}">삭제</button>
        </div>`).join("")
      : `<div class="meta">등록된 검수 기록이 없습니다.</div>`}
    </div>`;

  $("inspAddBtn")?.addEventListener("click", () => {
    const site = prompt("현장명을 입력하세요.");
    if (!site) return;
    const newItem = { id: genId("insp"), plantName: site, date: today(), inspector: "", address: "", phase: "검수중" };
    const items2 = [newItem, ...(getState().structureInspections || [])];
    setState({ structureInspections: items2 });
    toast("추가됐습니다.");
    renderInspection();
  });

  el.querySelectorAll("[data-insp-delete]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!confirm("삭제할까요?")) return;
      const idx = Number(btn.dataset.inspDelete);
      const items2 = [...(getState().structureInspections || [])];
      if (items2[idx]?.id) markDeleted("structureInspections", items2[idx].id);
      items2.splice(idx, 1);
      setState({ structureInspections: items2 });
      toast("삭제됐습니다.");
      renderInspection();
    });
  });
}

// ────────────────────────────────────────────────────────────────────────────
// 이벤트 위임
// ────────────────────────────────────────────────────────────────────────────
function onDocClick(e) {
  const t = e.target.closest("button") || e.target;

  // 회의록
  if (t.id === "meetingAddBtn") { openMeetingModal(); return; }
  if (t.dataset.meetingEdit !== undefined) { openMeetingModal(Number(t.dataset.meetingEdit)); return; }
  if (t.dataset.meetingDelete !== undefined) { deleteMeeting(Number(t.dataset.meetingDelete)); return; }

  // 프로젝트
  if (t.id === "projAddBtn") { openProjectModal(); return; }
  if (t.dataset.projEdit !== undefined) { openProjectModal(Number(t.dataset.projEdit)); return; }
  if (t.dataset.projSort) {
    if (_projSortKey === t.dataset.projSort) _projSortDir = _projSortDir === "asc" ? "desc" : "asc";
    else { _projSortKey = t.dataset.projSort; _projSortDir = "asc"; }
    ifVisible("dbView", renderProjectTable);
    ifVisible("projectsView", renderProjectTable);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 초기화
// ────────────────────────────────────────────────────────────────────────────
export function initMisc() {
  document.addEventListener("click", onDocClick);

  const map = {
    meetings:   renderMeetings,
    db:         renderProjects,
    projects:   renderProjects,
    messages:   renderMessages,
    reports:    renderReports,
    mw:         renderMw,
    inspection: renderInspection,
  };

  on("viewChanged", ({ view }) => { map[view]?.(); });

  on("stateChange", () => {
    Object.entries(map).forEach(([viewId, fn]) => {
      ifVisible(viewId + "View", fn);
    });
  });
}
