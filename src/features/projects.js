import { getState, setState, markDeleted, on } from "../store/index.js";
import { genId, today, esc, toast, $ } from "../utils/index.js";

function statusBadge(s) {
  return `<span class="badge">${esc(s)}</span>`;
}

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
  const panel = $("dbView");
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

function onDocClick(e) {
  const t = e.target.closest("button") || e.target;
  if (t.id === "projAddBtn") { openProjectModal(); return; }
  if (t.dataset.projEdit !== undefined) { openProjectModal(Number(t.dataset.projEdit)); return; }
  if (t.dataset.projSort) {
    if (_projSortKey === t.dataset.projSort) _projSortDir = _projSortDir === "asc" ? "desc" : "asc";
    else { _projSortKey = t.dataset.projSort; _projSortDir = "asc"; }
    const panel = $("dbView");
    if (panel && !panel.classList.contains("hidden")) renderProjectTable(panel);
  }
}

export function initProjects() {
  document.addEventListener("click", onDocClick);
  on("viewChanged", ({ view }) => { if (view === "db") renderProjects(); });
  on("stateChange", () => {
    const panel = $("dbView");
    if (panel && !panel.classList.contains("hidden")) renderProjectTable(panel);
  });
}
