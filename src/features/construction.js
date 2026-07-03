import { getState, setState, markDeleted, on } from "../store/index.js";
import { genId, today, esc, toast, $, onSearchInput } from "../utils/index.js";

let _editing = null;
let _search  = "";
let _phase   = "전체";
let _sortKey = "";
let _sortDir = "asc";

// ── 유틸 ────────────────────────────────────────────────────────────────────
function durationDays(start, end) {
  if (!start || !end) return 0;
  const s = new Date(start), e = new Date(end);
  if (isNaN(s) || isNaN(e) || e < s) return 0;
  return Math.round((e - s) / 86400000) + 1;
}
function completionMonth(end) {
  return end && /^\d{4}-\d{2}/.test(end) ? end.slice(0, 7) : "";
}
function statusBadge(s) {
  const cls = s?.includes("지연") || s?.includes("긴급") ? "red"
    : s?.includes("예정") || s?.includes("대기") ? "amber"
    : s?.includes("진행") || s?.includes("시공중") ? "blue" : "green";
  return `<span class="badge ${cls}">${esc(s)}</span>`;
}

// ── 정규화 ──────────────────────────────────────────────────────────────────
function normConstruction(c) {
  if (!c.id) c.id = genId("construction");
  if (!c.start) c.start = today();
  if (!c.status) c.status = "예정";
  if (!c.phase) c.phase = "착공";
  if (!c.kw) c.kw = 0;
  return c;
}

function defaultItem() {
  const st = getState();
  return {
    company: st.constructionTeams?.[0] || "",
    structureTeam: st.structureTeams?.[0] || "",
    site: "", address: "", kw: 0, sales: "", customer: "",
    phase: st.constructionPhases?.[0] || "착공",
    owner: "", start: today(), end: "", status: "예정", next: "",
  };
}

// ── 테이블 렌더 ─────────────────────────────────────────────────────────────
function sortRows(rows) {
  if (!_sortKey) return rows;
  return [...rows].sort((a, b) => {
    const av = String(a[_sortKey] ?? ""), bv = String(b[_sortKey] ?? "");
    const n = /^\d+$/.test(av) && /^\d+$/.test(bv);
    let r = n ? Number(av) - Number(bv) : av.localeCompare(bv, "ko", { numeric: true });
    return _sortDir === "asc" ? r : -r;
  });
}

function filterRows(list) {
  return list.filter(c => {
    if (_phase !== "전체" && c.phase !== _phase) return false;
    if (_search) {
      const hay = Object.values(c).join(" ").toLowerCase();
      if (!hay.includes(_search.toLowerCase())) return false;
    }
    return true;
  });
}

function renderTable(panel) {
  const st = getState();
  const list = st.construction || [];
  const phases = ["전체", ...(st.constructionPhases || [])];
  const teams  = st.constructionTeams || [];

  const phaseOpts = phases.map(p =>
    `<option${p === _phase ? " selected" : ""}>${esc(p)}</option>`).join("");

  const rows = sortRows(filterRows(list.map((c, i) => ({ ...c, _i: i }))));

  function sortHead(key, label) {
    const mark = _sortKey === key ? (_sortDir === "asc" ? " ▲" : " ▼") : "";
    return `<button class="sort-head" data-con-sort="${key}">${esc(label)}${mark}</button>`;
  }

  panel.innerHTML = `
    <div class="toolbar" style="margin-bottom:12px">
      <input class="search" id="conSearch" placeholder="현장, 시공사, 고객 검색" value="${esc(_search)}" style="max-width:260px">
      <select class="field" id="conPhase" style="max-width:160px">${phaseOpts}</select>
      <button class="btn primary" id="conAddBtn">시공일정 추가</button>
    </div>
    <div class="table-wrap">
      <table style="min-width:1600px">
        <thead>
          <tr>
            <th style="width:120px">${sortHead("company","시공사")}</th>
            <th style="width:120px">${sortHead("structureTeam","구조물팀")}</th>
            <th style="width:160px">${sortHead("site","현장")}</th>
            <th style="width:70px">${sortHead("kw","kW")}</th>
            <th style="width:100px">${sortHead("sales","영업자")}</th>
            <th style="width:120px">${sortHead("customer","고객")}</th>
            <th style="width:130px">${sortHead("phase","업무단계")}</th>
            <th style="width:100px">${sortHead("owner","담당")}</th>
            <th style="width:110px">${sortHead("start","시작일")}</th>
            <th style="width:110px">${sortHead("end","완료일")}</th>
            <th style="width:70px">소요일</th>
            <th style="width:90px">완료월</th>
            <th style="width:110px">${sortHead("status","상태")}</th>
            <th>다음 액션</th>
            <th style="width:60px">관리</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(c => `<tr>
            <td>${esc(c.company)}</td>
            <td>${esc(c.structureTeam||"")}</td>
            <td><button class="cell-link" data-con-edit="${c._i}">${esc(c.site)}</button></td>
            <td>${esc(c.kw)}</td>
            <td>${esc(c.sales)}</td>
            <td>${esc(c.customer)}</td>
            <td>${esc(c.phase)}</td>
            <td>${esc(c.owner)}</td>
            <td>${esc(c.start)}</td>
            <td>${esc(c.end)}</td>
            <td>${durationDays(c.start, c.end)}일</td>
            <td>${esc(completionMonth(c.end))}</td>
            <td>${statusBadge(c.status)}</td>
            <td title="${esc(c.next)}">${esc((c.next||"").length>30?c.next.slice(0,30)+"…":c.next)}</td>
            <td><button class="btn icon" data-con-edit="${c._i}">수정</button></td>
          </tr>`).join("")}
          ${rows.length === 0 ? `<tr><td colspan="15" style="text-align:center;padding:24px;color:var(--muted)">시공일정이 없습니다.</td></tr>` : ""}
        </tbody>
      </table>
    </div>
    <div class="grid" style="margin-top:16px;grid-template-columns:1fr 1fr">
      <div class="panel">
        <div class="panel-title"><h2 class="label">시공중</h2></div>
        <div id="conCurrentPlants" class="stack"></div>
      </div>
      <div class="panel">
        <div class="panel-title"><h2 class="label">시공 예정</h2></div>
        <div id="conUpcomingPlants" class="stack"></div>
      </div>
    </div>`;

  renderPlantCards();

  onSearchInput(panel.querySelector("#conSearch"), e => {
    _search = e.target.value; renderTable(panel);
  });
  panel.querySelector("#conPhase")?.addEventListener("change", e => {
    _phase = e.target.value; renderTable(panel);
  });
}

function renderPlantCards() {
  const st = getState();
  const con = st.construction || [];
  const current  = con.filter(c => c.status === "시공중");
  const upcoming = con.filter(c => c.status === "예정");

  function plantCard(c) {
    const i = con.indexOf(c);
    return `<div class="card">
      <div class="card-top"><span class="name">${esc(c.site)}</span>${statusBadge(c.status)}</div>
      <div class="meta">${esc(c.company)} · ${esc(c.kw)}kW · ${esc(c.customer||"고객")}</div>
      <div class="meta">${esc(c.phase)} · ${esc(c.owner||"담당 미입력")} · ${esc(c.start)} ~ ${esc(c.end||"")}</div>
      <div class="meta">완료월 ${esc(completionMonth(c.end)||"-")} · 소요일 ${durationDays(c.start,c.end)}일</div>
      <button class="btn icon" data-con-edit="${i}" style="margin-top:8px">수정</button>
    </div>`;
  }

  const cur = document.getElementById("conCurrentPlants");
  if (cur) cur.innerHTML = current.length ? current.map(plantCard).join("") : `<div class="meta">시공중인 현장 없음</div>`;
  const up  = document.getElementById("conUpcomingPlants");
  if (up)  up.innerHTML  = upcoming.length ? upcoming.map(plantCard).join("") : `<div class="meta">시공 예정 현장 없음</div>`;
}

// ── 모달 ────────────────────────────────────────────────────────────────────
function withStatusLine(text, status) {
  if (!status) return text || "";
  const line = `진행상태: ${status}`;
  const lines = (text || "").split(/\r?\n/);
  const idx = lines.findIndex(x => /^\s*진행상태\s*:/.test(x));
  if (idx >= 0) { lines[idx] = line; return lines.join("\n"); }
  return text?.trim() ? `${text.replace(/\s+$/, "")}\n${line}` : line;
}

function openModal(idx = null) {
  _editing = idx;
  const st = getState();
  const c = idx === null ? defaultItem() : normConstruction({ ...st.construction[idx] });

  const teamOpts = (st.constructionTeams || []).map(t =>
    `<option${t === c.company ? " selected" : ""}>${esc(t)}</option>`).join("");
  const strOpts  = (st.structureTeams || []).map(t =>
    `<option${t === (c.structureTeam||"") ? " selected" : ""}>${esc(t)}</option>`).join("");
  const phaseOpts = (st.constructionPhases || []).map(p =>
    `<option${p === c.phase ? " selected" : ""}>${esc(p)}</option>`).join("");
  const statusList = ["예정","시공중","완료","지연","보류"];
  const statusOpts = statusList.map(s =>
    `<option${s === c.status ? " selected" : ""}>${esc(s)}</option>`).join("");

  document.getElementById("constructionFormGrid").innerHTML = `
    <div class="form-row">
      <label>시공사</label>
      <select class="field" id="conCompany">${teamOpts}</select>
    </div>
    <div class="form-row">
      <label>구조물팀</label>
      <select class="field" id="conStructureTeam">${strOpts}</select>
    </div>
    <div class="form-row full">
      <label>현장명</label>
      <input class="field" id="conSite" value="${esc(c.site)}" placeholder="발전소명 / 현장명">
    </div>
    <div class="form-row">
      <label>용량(kW)</label>
      <input class="field" type="number" id="conKw" value="${esc(c.kw)}">
    </div>
    <div class="form-row">
      <label>영업자</label>
      <input class="field" id="conSales" value="${esc(c.sales)}">
    </div>
    <div class="form-row">
      <label>고객명</label>
      <input class="field" id="conCustomer" value="${esc(c.customer)}">
    </div>
    <div class="form-row">
      <label>담당자</label>
      <input class="field" id="conOwner" value="${esc(c.owner)}">
    </div>
    <div class="form-row">
      <label>업무단계</label>
      <select class="field" id="conPhaseModal">${phaseOpts}</select>
    </div>
    <div class="form-row">
      <label>시작일</label>
      <input class="field" type="date" id="conStart" value="${esc(c.start)}">
    </div>
    <div class="form-row">
      <label>완료일</label>
      <input class="field" type="date" id="conEnd" value="${esc(c.end||"")}">
    </div>
    <div class="form-row">
      <label>상태</label>
      <select class="field" id="conStatus">${statusOpts}</select>
    </div>
    <div class="form-row">
      <label>주소</label>
      <input class="field" id="conAddress" value="${esc(c.address||"")}">
    </div>
    <div class="form-row full">
      <label>다음 액션</label>
      <textarea class="field" id="conNext">${esc(c.next||"")}</textarea>
    </div>`;

  // 상태 변경 시 next에 진행상태 자동 삽입
  document.getElementById("conStatus")?.addEventListener("change", e => {
    const next = document.getElementById("conNext");
    if (next) next.value = withStatusLine(next.value, e.target.value);
  });

  document.getElementById("deleteConstructionBtn")?.classList.toggle("hidden", idx === null);
  const m = document.getElementById("constructionModal");
  m?.classList.remove("hidden");
  m?.classList.add("open");
}

function saveModal() {
  const st = getState();
  const construction = [...(st.construction || [])];
  const c = normConstruction({
    company:       document.getElementById("conCompany")?.value || "",
    structureTeam: document.getElementById("conStructureTeam")?.value || "",
    site:          document.getElementById("conSite")?.value || "",
    kw:            Number(document.getElementById("conKw")?.value) || 0,
    sales:         document.getElementById("conSales")?.value || "",
    customer:      document.getElementById("conCustomer")?.value || "",
    owner:         document.getElementById("conOwner")?.value || "",
    phase:         document.getElementById("conPhaseModal")?.value || "",
    start:         document.getElementById("conStart")?.value || today(),
    end:           document.getElementById("conEnd")?.value || "",
    status:        document.getElementById("conStatus")?.value || "예정",
    address:       document.getElementById("conAddress")?.value || "",
    next:          document.getElementById("conNext")?.value || "",
  });
  if (_editing !== null) {
    c.id = construction[_editing].id;
    construction[_editing] = c;
  } else {
    construction.unshift(c);
  }
  setState({ construction });
  closeModal();
  toast("시공일정을 저장했습니다.");
  render();
}

function closeModal() {
  const m = document.getElementById("constructionModal");
  m?.classList.remove("open");
  m?.classList.add("hidden");
}

function deleteItem() {
  if (_editing === null) return;
  if (!confirm("이 시공일정을 삭제할까요?")) return;
  const st = getState();
  const construction = [...st.construction];
  const c = construction[_editing];
  if (c?.id) markDeleted("construction", c.id);
  construction.splice(_editing, 1);
  setState({ construction });
  closeModal();
  toast("삭제했습니다.");
  render();
}

// ── 뷰 전체 렌더 ─────────────────────────────────────────────────────────────
function render() {
  const panel = document.getElementById("constructionView");
  if (!panel) return;
  renderTable(panel);
}

// ── 이벤트 위임 ─────────────────────────────────────────────────────────────
function onDocClick(e) {
  const t = e.target.closest("button,.cell-link") || e.target;
  const inView = document.getElementById("constructionView")?.contains(t);
  const inModal = document.getElementById("constructionModal")?.contains(t);
  if (!inView && !inModal) return;

  if (t.id === "conAddBtn")           { openModal(); return; }
  if (t.dataset.conEdit !== undefined){ openModal(Number(t.dataset.conEdit)); return; }
  if (t.id === "saveConstructionBtn") { saveModal(); return; }
  if (t.id === "deleteConstructionBtn"){ deleteItem(); return; }
  if (t.dataset.conSort) {
    if (_sortKey === t.dataset.conSort) {
      _sortDir = _sortDir === "asc" ? "desc" : "asc";
    } else {
      _sortKey = t.dataset.conSort;
      _sortDir = "asc";
    }
    render();
  }
}

export const openConstructionModal = openModal;

export function initConstruction() {
  document.addEventListener("click", onDocClick);
  on("viewChanged", ({ view }) => { if (view === "construction") render(); });
  on("stateChange", () => {
    const panel = document.getElementById("constructionView");
    if (panel && !panel.classList.contains("hidden")) render();
  });
}
