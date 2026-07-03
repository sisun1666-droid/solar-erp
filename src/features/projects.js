import { getState, setState, markDeleted, on } from "../store/index.js";
import { genId, today, esc, toast, $, onSearchInput } from "../utils/index.js";
import * as XLSX from "xlsx";

function statusBadge(s) {
  return `<span class="badge">${esc(s)}</span>`;
}

let _editProject = null;
let _projSearch  = "";
let _projPhase   = "전체";
let _projSortKey = "";
let _projSortDir = "asc";
let _projPage    = 1;
const PROJ_PAGE_SIZE = 100;

function normProject(p) {
  if (!p.id)    p.id    = genId("project");
  if (!p.phase) p.phase = "고객상담";
  if (!p.due)   p.due   = today();
  return p;
}

function renderProjects() {
  const panel = $("dbView");
  if (!panel) return;
  ensureProjectShell(panel);
  renderProjectResults(panel);
}

// 검색창을 포함한 툴바는 최초 1번만 만들고 다시는 손대지 않는다.
// (배경 동기화 등으로 인한 재렌더 때마다 통째로 다시 그리면, 그 순간 한글
// 조합 중이던 input이 파괴되어 타자가 끊기기 때문 — 결과 영역만 갱신한다.)
function ensureProjectShell(panel) {
  if (panel.dataset.projShellReady) return;
  panel.dataset.projShellReady = "1";

  panel.innerHTML = `
    <div class="toolbar" style="margin-bottom:12px">
      <input class="search" id="projSearch" placeholder="고객/현장 검색" value="${esc(_projSearch)}" style="max-width:240px">
      <div id="projPhaseSlot"></div>
      <button class="btn primary" id="projAddBtn">현장 추가</button>
      <button class="btn" id="projImportBtn">엑셀/CSV 가져오기</button>
      <input type="file" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" id="projCsvInput" style="display:none">
    </div>
    <div id="projResultsWrap"></div>`;

  onSearchInput(panel.querySelector("#projSearch"), e => {
    _projSearch = e.target.value; _projPage = 1; renderProjectResults(panel);
  });
  panel.querySelector("#projImportBtn")?.addEventListener("click", () => {
    panel.querySelector("#projCsvInput")?.click();
  });
  panel.querySelector("#projCsvInput")?.addEventListener("change", async e => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const isExcel = /\.xlsx?$/i.test(file.name);
    const rows = isExcel ? await parseExcel(file) : parseCSV(await file.text());
    if (rows.length < 2) { toast("파일에 데이터가 없습니다."); return; }
    openCsvMapModal(rows[0], rows.slice(1));
  });
}

function renderProjectResults(panel) {
  const st = getState();
  const phases = ["전체", ...(st.phases || [])];
  const phaseOpts = phases.map(p => `<option${p === _projPhase ? " selected" : ""}>${esc(p)}</option>`).join("");
  const phaseSlot = panel.querySelector("#projPhaseSlot");
  if (phaseSlot) {
    phaseSlot.innerHTML = `<select class="field" id="projPhase" style="max-width:150px">${phaseOpts}</select>`;
    phaseSlot.querySelector("#projPhase")?.addEventListener("change", e => {
      _projPhase = e.target.value; _projPage = 1; renderProjectResults(panel);
    });
  }

  const filtered = (st.projects || []).filter(p => {
    if (_projPhase !== "전체" && p.phase !== _projPhase) return false;
    if (_projSearch) {
      const hay = Object.values(p).join(" ").toLowerCase();
      if (!hay.includes(_projSearch.toLowerCase())) return false;
    }
    return true;
  });

  if (_projSortKey) {
    const dir = _projSortDir === "asc" ? 1 : -1;
    filtered.sort((a, b) => (a[_projSortKey] || "").localeCompare(b[_projSortKey] || "") * dir);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PROJ_PAGE_SIZE));
  _projPage = Math.min(Math.max(1, _projPage), totalPages);
  const rows = filtered.slice((_projPage - 1) * PROJ_PAGE_SIZE, _projPage * PROJ_PAGE_SIZE);

  function sortHead(key, label) {
    const mark = _projSortKey === key ? (_projSortDir === "asc" ? " ▲" : " ▼") : "";
    return `<button class="sort-head" data-proj-sort="${key}">${esc(label)}${mark}</button>`;
  }

  const wrap = panel.querySelector("#projResultsWrap");
  if (!wrap) return;
  wrap.innerHTML = `
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
          ${rows.map(p => `<tr>
            <td title="${esc(p.name)}">${esc(p.name)}</td>
            <td>${esc(p.phase)}</td>
            <td>${esc(p.owner)}</td>
            <td>${esc(p.due)}</td>
            <td>${statusBadge(p.status)}</td>
            <td title="${esc(p.next)}">${esc((p.next||"").length>40?p.next.slice(0,40)+"…":p.next)}</td>
            <td><button class="btn icon" data-proj-edit="${esc(p.id)}">수정</button></td>
          </tr>`).join("")}
          ${rows.length === 0 ? `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">현장이 없습니다.</td></tr>` : ""}
        </tbody>
      </table>
    </div>
    <div class="toolbar" style="justify-content:center;margin-top:12px">
      <button class="btn icon" id="projPagePrev" ${_projPage <= 1 ? "disabled" : ""}>‹</button>
      <span class="meta">${filtered.length === 0 ? "0건" : `${_projPage} / ${totalPages} 페이지 (총 ${filtered.length}건)`}</span>
      <button class="btn icon" id="projPageNext" ${_projPage >= totalPages ? "disabled" : ""}>›</button>
    </div>`;

  wrap.querySelector("#projPagePrev")?.addEventListener("click", () => { _projPage--; renderProjectResults(panel); });
  wrap.querySelector("#projPageNext")?.addEventListener("click", () => { _projPage++; renderProjectResults(panel); });
}

// ── CSV 가져오기 ────────────────────────────────────────────────────────────
function parseCSV(text) {
  text = text.replace(/^﻿/, "");
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function parseExcel(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
}

function normDate(s) {
  s = (s || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d) ? today() : d.toISOString().slice(0, 10);
}

const PROJECT_FIELDS = [
  { key: "name",   label: "현장명 (필수)" },
  { key: "phase",  label: "업무단계" },
  { key: "owner",  label: "담당자" },
  { key: "due",    label: "마감일" },
  { key: "status", label: "상태" },
  { key: "next",   label: "다음 액션" },
];

function guessColumn(headers, key) {
  const hints = {
    name: ["현장", "고객", "발전소", "이름"], phase: ["단계", "phase"],
    owner: ["담당"], due: ["마감", "일자", "날짜"], status: ["상태"], next: ["액션", "메모", "비고"],
  };
  const idx = headers.findIndex(h => hints[key]?.some(k => h.includes(k)));
  return idx;
}

function openCsvMapModal(headers, dataRows) {
  let overlay = $("csvImportOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "csvImportOverlay";
    overlay.className = "overlay";
    document.body.appendChild(overlay);
  }
  const colOpts = (selected) => [`<option value="-1">-- 없음 --</option>`]
    .concat(headers.map((h, i) => `<option value="${i}"${i === selected ? " selected" : ""}>${esc(h)}</option>`))
    .join("");

  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <h2>CSV 열 매칭</h2>
        <button class="btn icon" id="csvModalClose">×</button>
      </div>
      <p style="color:var(--muted);margin:0 0 12px">${dataRows.length}개 행을 발견했습니다. 각 항목을 CSV의 어느 열에서 가져올지 선택하세요.</p>
      <div class="form-grid">
        ${PROJECT_FIELDS.map(f => `
          <div class="form-row">
            <label>${esc(f.label)}</label>
            <select class="field" data-csv-map="${f.key}">${colOpts(guessColumn(headers, f.key))}</select>
          </div>`).join("")}
      </div>
      <div class="toolbar" style="margin-top:14px">
        <button class="btn primary" id="csvImportConfirm">가져오기</button>
      </div>
    </div>`;
  overlay.classList.remove("hidden");
  overlay.classList.add("open");

  const close = () => { overlay.classList.remove("open"); overlay.classList.add("hidden"); };
  $("csvModalClose")?.addEventListener("click", close);
  overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
  $("csvImportConfirm")?.addEventListener("click", () => {
    const map = {};
    overlay.querySelectorAll("[data-csv-map]").forEach(sel => { map[sel.dataset.csvMap] = Number(sel.value); });
    if (map.name === -1) { toast("현장명 열을 선택해주세요."); return; }
    const st = getState();
    const projects = [...(st.projects || [])];
    const byName = new Map(projects.map((p, i) => [p.name, i]));
    let added = 0, updated = 0;
    for (const row of dataRows) {
      const name = (row[map.name] || "").trim();
      if (!name) continue;
      const fields = {};
      if (map.phase  >= 0) fields.phase  = (row[map.phase]  || "").trim();
      if (map.owner  >= 0) fields.owner  = (row[map.owner]  || "").trim();
      if (map.due    >= 0) fields.due    = normDate(row[map.due]);
      if (map.status >= 0) fields.status = (row[map.status] || "").trim();
      if (map.next   >= 0) fields.next   = (row[map.next]   || "").trim();

      const existingIdx = byName.get(name);
      if (existingIdx !== undefined) {
        projects[existingIdx] = normProject({ ...projects[existingIdx], ...fields, name });
        updated++;
      } else {
        const p = normProject({ name, status: "정상", ...fields });
        projects.push(p);
        byName.set(name, projects.length - 1);
        added++;
      }
    }
    setState({ projects });
    close();
    toast(`신규 ${added}건, 갱신 ${updated}건 반영했습니다.`);
    renderProjects();
  });
}

function openProjectModal(id = null) {
  _editProject = id;
  const st = getState();
  const p = id === null
    ? { name: "", phase: (st.phases||[])[0]||"고객상담", owner: "", due: today(), status: "정상", next: "" }
    : { ...(st.projects.find(x => x.id === id)) };

  const phaseOpts = (st.phases || []).map(x => `<option${x === p.phase ? " selected" : ""}>${esc(x)}</option>`).join("");
  const knownStatuses = st.statuses || ["정상","대기","보완","지연","완료"];
  const statusList = knownStatuses.includes(p.status) || !p.status ? knownStatuses : [...knownStatuses, p.status];
  const statOpts  = statusList.map(s =>
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
        <h2>${id === null ? "현장 추가" : "현장 수정"}</h2>
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
        ${id !== null ? `<button class="btn danger" id="projDeleteBtn">삭제</button>` : ""}
      </div>
    </div>`;
  overlay.classList.remove("hidden");
  overlay.classList.add("open");

  $("projModalClose")?.addEventListener("click", () => { overlay.classList.remove("open"); overlay.classList.add("hidden"); });
  $("projSaveBtn")?.addEventListener("click", saveProject);
  $("projDeleteBtn")?.addEventListener("click", () => deleteProject(id));
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
    const idx = projects.findIndex(x => x.id === _editProject);
    if (idx < 0) { toast("현장을 찾을 수 없습니다. 다시 시도해주세요."); return; }
    p.id = projects[idx].id;
    projects[idx] = p;
  } else {
    projects.unshift(p);
  }
  setState({ projects });
  const o = $("projectEditOverlay");
  o?.classList.remove("open"); o?.classList.add("hidden");
  toast("저장됐습니다.");
  renderProjects();
}

function deleteProject(id) {
  if (!confirm("이 현장을 삭제할까요?")) return;
  const st = getState();
  const projects = [...(st.projects || [])];
  const idx = projects.findIndex(x => x.id === id);
  if (idx < 0) { toast("현장을 찾을 수 없습니다. 다시 시도해주세요."); return; }
  markDeleted("projects", id);
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
  if (t.dataset.projEdit !== undefined) { openProjectModal(t.dataset.projEdit); return; }
  if (t.dataset.projSort) {
    if (_projSortKey === t.dataset.projSort) _projSortDir = _projSortDir === "asc" ? "desc" : "asc";
    else { _projSortKey = t.dataset.projSort; _projSortDir = "asc"; }
    const panel = $("dbView");
    if (panel && !panel.classList.contains("hidden")) renderProjectResults(panel);
  }
}

export function initProjects() {
  document.addEventListener("click", onDocClick);
  on("viewChanged", ({ view }) => { if (view === "db") renderProjects(); });
  on("stateChange", () => {
    const panel = $("dbView");
    if (panel && !panel.classList.contains("hidden")) renderProjectResults(panel);
  });
}
