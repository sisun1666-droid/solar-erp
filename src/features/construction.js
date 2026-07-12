import { getState, setState, markDeleted, on } from "../store/index.js";
import { genId, today, nowStamp, esc, toast, $, onSearchInput } from "../utils/index.js";
import { permitsReady, PERMIT_FIELDS } from "./projects.js";

let _editing = null;
let _search  = "";
let _phase   = "전체";
let _sortKey = "";
let _sortDir = "asc";
let _hideDone = true; // 계속 쌓이는 완료 항목을 기본으로 접어둔다 — 검색/단계 필터와는 별개로 항상 적용
let _modalProjectIds = []; // 모달에서 지금까지 연결한 프로젝트DB 현장 id들 (도면상 한 부지를 호기별로 나눠 등록한 경우 kW 합산용)

// ── 유틸 ────────────────────────────────────────────────────────────────────
function durationDays(start, end) {
  if (!start || !end) return 0;
  const s = new Date(start), e = new Date(end);
  if (isNaN(s) || isNaN(e) || e < s) return 0;
  return Math.round((e - s) / 86400000) + 1;
}
function statusBadge(s) {
  const cls = s?.includes("지연") || s?.includes("긴급") ? "red"
    : s?.includes("예정") || s?.includes("대기") ? "amber"
    : s?.includes("진행") || s?.includes("시공중") ? "blue" : "green";
  return `<span class="badge ${cls}">${esc(s)}</span>`;
}
// yyyy-mm-dd → yy.mm.dd, 한눈에 훑기 쉽도록 표에서만 짧게 표기 (원본 값은 그대로 저장/편집됨)
function fmtDate(d) {
  return d && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(2).replace(/-/g, ".") : (d || "-");
}
// 상태별 정렬 우선순위: 지연이 가장 먼저 눈에 띄어야 함
const STATUS_RANK = { "지연": 0, "시공중": 1, "예정": 2, "보류": 3, "완료": 4 };
function statusRank(s) { return STATUS_RANK[s] ?? 5; }

// ── 정규화 ──────────────────────────────────────────────────────────────────
function normConstruction(c) {
  if (!c.id) c.id = genId("construction");
  if (!c.start) c.start = today();
  if (!c.status) c.status = "예정";
  if (!c.phase) c.phase = "착공";
  if (!c.kw) c.kw = 0;
  return c;
}
// 업무일지에서 완료 시점을 잡아낼 수 있도록, 상태가 "완료"로 바뀐 시각을 기록한다.
function stampCompletion(c, oldStatus) {
  if (c.status === "완료" && oldStatus !== "완료") c.completedAt = nowStamp();
  else if (c.status !== "완료") c.completedAt = null;
  return c;
}

function defaultItem() {
  const st = getState();
  return {
    company: st.constructionTeams?.[0] || "",
    structureTeam: st.structureTeams?.[0] || "",
    projectId: "", projectIds: [], site: "", address: "", kw: 0, sales: "", customer: "", bizOwnerPhone: "",
    phase: st.constructionPhases?.[0] || "착공",
    owner: "", start: today(), end: "", status: "예정", next: "",
  };
}

// 레거시 단일 projectId만 있던 기록도 배열로 다뤄서 이후 로직을 하나로 통일한다.
export function linkedProjectIdsOf(c) {
  if (c.projectIds?.length) return c.projectIds;
  return c.projectId ? [c.projectId] : [];
}

// 연결된 프로젝트DB 현장들의 5대 허가 현황을 합쳐서 판단한다.
// 시트 동기화로 들어온 항목은 대부분 수동 연결이 안 돼 있으므로, 명시적 연결이
// 없으면 현장명이 정확히 같은 프로젝트로 자동 매칭한다(저장은 하지 않고 표시만).
// 그래도 못 찾으면 null(판단 불가)로 배지를 아예 안 보여준다.
// 완료된 항목만 조용히 숨기면 "왜 이 항목만 보이지"라는 오해가 생기므로,
// 5개 항목을 항상 발전사업허가→개발행위→PPA→시설부담금→공사계획필증 순서 그대로
// ✓/✗로 보여준다(완료된 항목만 골라 숨기지 않음).
function permitStatusOf(c) {
  const st = getState();
  const projects = st.projects || [];
  let linked = linkedProjectIdsOf(c).map(id => projects.find(p => p.id === id)).filter(Boolean);
  if (!linked.length && c.site) linked = projects.filter(p => p.name === c.site);
  if (!linked.length) return null;
  const items = PERMIT_FIELDS.map(f => ({ label: f.label, done: linked.every(p => !!p[f.key]) }));
  return { ready: items.every(i => i.done), items };
}
// 사업주 연락처도 허가현황과 같은 방식으로 자동 매칭한다(저장 없이 표시만).
// 연결된 현장이 여럿이면 전화번호가 서로 다를 수 있어 중복 제거 후 나열한다.
function bizOwnerPhoneOf(c) {
  const st = getState();
  const projects = st.projects || [];
  let linked = linkedProjectIdsOf(c).map(id => projects.find(p => p.id === id)).filter(Boolean);
  if (!linked.length && c.site) linked = projects.filter(p => p.name === c.site);
  const phones = [...new Set(linked.map(p => p.bizOwnerPhone).filter(Boolean))];
  return phones.join(" / ");
}
// 표에서 바로 눈에 띄어야 하는 항목이라 hover 툴팁 뒤에 숨기지 않고,
// 5개 항목을 정해진 순서대로 전부 ✓/✗ 칩으로 늘어놓는다.
function permitStatusCell(c) {
  const s = permitStatusOf(c);
  if (!s) return `<span class="badge" style="opacity:.55">DB 미연동</span>`;
  return s.items.map(i => `<span class="badge ${i.done ? "green" : "amber"}">${i.done ? "✓" : "✗"} ${esc(i.label)}</span>`).join(" ");
}

// ── 테이블 렌더 ─────────────────────────────────────────────────────────────
function sortRows(rows) {
  // 정렬 기준을 직접 누르기 전까지는 상태 우선순위(지연→시공중→예정→보류→완료)로
  // 기본 정렬해서 지연/시공중 현장이 항상 위쪽에 먼저 보이게 한다.
  if (!_sortKey) {
    return [...rows].sort((a, b) =>
      statusRank(a.status) - statusRank(b.status) || String(a.site || "").localeCompare(String(b.site || ""), "ko"));
  }
  return [...rows].sort((a, b) => {
    const av = String(a[_sortKey] ?? ""), bv = String(b[_sortKey] ?? "");
    const n = /^\d+$/.test(av) && /^\d+$/.test(bv);
    let r = n ? Number(av) - Number(bv) : av.localeCompare(bv, "ko", { numeric: true });
    return _sortDir === "asc" ? r : -r;
  });
}

function filterRows(list) {
  return list.filter(c => {
    if (_hideDone && !_search && _phase === "전체" && c.status === "완료") return false;
    if (_phase !== "전체" && c.phase !== _phase) return false;
    if (_search) {
      const hay = Object.values(c).join(" ").toLowerCase();
      if (!hay.includes(_search.toLowerCase())) return false;
    }
    return true;
  });
}

// 검색창은 최초 1번만 만들고 다시 그리지 않는다 — 재렌더 때마다 통째로
// 다시 그리면 한글 조합 중이던 input이 파괴되어 타자가 끊기기 때문.
function ensureConstructionShell(panel) {
  if (panel.dataset.conShellReady) return;
  panel.dataset.conShellReady = "1";
  panel.innerHTML = `
    <div id="conSummary" class="con-summary"></div>
    <div class="toolbar" style="margin-bottom:12px">
      <input class="search" id="conSearch" placeholder="현장, 시공사, 고객 검색" value="${esc(_search)}" style="max-width:260px">
      <div id="conPhaseSlot"></div>
      <label style="display:flex;align-items:center;gap:5px;font-size:13px;color:var(--muted);white-space:nowrap">
        <input type="checkbox" id="conHideDone"${_hideDone ? " checked" : ""}> 완료 숨기기
      </label>
      <button class="btn primary" id="conAddBtn">시공일정 추가</button>
    </div>
    <div id="conResultsWrap"></div>`;

  panel.querySelector("#conHideDone")?.addEventListener("change", e => {
    _hideDone = e.target.checked; renderTable(panel);
  });

  onSearchInput(panel.querySelector("#conSearch"), e => {
    _search = e.target.value; renderTable(panel);
  });
}

// 상단 요약 스트립 — 한눈에 전체 현황을 파악하도록 상태별 건수만 보여준다.
// 각 카드는 클릭하면 해당 상태만 모아 보여주는 팝업을 연다 (renderPlantRows/openStatusModal 참고).
function renderSummary(list) {
  const el = document.getElementById("conSummary");
  if (!el) return;
  const count = s => list.filter(c => c.status === s).length;
  const items = [
    { label: "전체",   n: list.length, cls: "", status: "" },
    { label: "시공중", n: count("시공중"), cls: "blue",  status: "시공중" },
    { label: "예정",   n: count("예정"),  cls: "amber", status: "예정" },
    { label: "지연",   n: count("지연"),  cls: "red",   status: "지연" },
    { label: "완료",   n: count("완료"),  cls: "green", status: "완료" },
  ];
  el.innerHTML = items.map(it => `
    <button type="button" class="con-summary-item ${it.cls}" data-con-status="${esc(it.status)}">
      <span class="con-summary-n">${it.n}</span>
      <span class="con-summary-label">${esc(it.label)}</span>
    </button>`).join("");
}

function renderTable(panel) {
  ensureConstructionShell(panel);
  const st = getState();
  const list = st.construction || [];
  renderSummary(list);
  const phases = ["전체", ...(st.constructionPhases || [])];

  const phaseOpts = phases.map(p =>
    `<option${p === _phase ? " selected" : ""}>${esc(p)}</option>`).join("");
  const phaseSlot = panel.querySelector("#conPhaseSlot");
  if (phaseSlot) {
    phaseSlot.innerHTML = `<select class="field" id="conPhase" style="max-width:160px">${phaseOpts}</select>`;
    phaseSlot.querySelector("#conPhase")?.addEventListener("change", e => {
      _phase = e.target.value; renderTable(panel);
    });
  }

  const indexed = list.map((c, i) => ({ ...c, _i: i }));
  const rows = sortRows(filterRows(indexed));
  const hiddenDoneCount = indexed.length - rows.length > 0 && _hideDone && !_search && _phase === "전체"
    ? indexed.filter(c => c.status === "완료").length : 0;

  function sortHead(key, label) {
    const mark = _sortKey === key ? (_sortDir === "asc" ? " ▲" : " ▼") : "";
    return `<button class="sort-head" data-con-sort="${key}">${esc(label)}${mark}</button>`;
  }

  const wrap = panel.querySelector("#conResultsWrap");
  if (!wrap) return;
  const linkedIds = new Set(list.flatMap(linkedProjectIdsOf));
  const candidates = (st.projects || []).filter(p => permitsReady(p) && !linkedIds.has(p.id));

  wrap.innerHTML = `
    ${candidates.length ? `
      <div class="panel con-candidates" style="margin-bottom:16px">
        <div class="panel-title"><h2 class="label">시공 등록 대기 (허가 완료) · ${candidates.length}건</h2></div>
        <div class="con-candidate-list">
          ${candidates.map(p => `<div class="con-candidate-row">
            <div class="con-candidate-info">
              <span class="name">${esc(p.name)}</span>
              <span class="meta">${esc(p.bizOwner||"")} · ${esc(p.address||"")}</span>
            </div>
            <button class="btn primary" data-con-new-from-project="${esc(p.id)}">시공일정 추가</button>
          </div>`).join("")}
        </div>
      </div>` : ""}
    ${hiddenDoneCount ? `<div class="meta" style="margin-bottom:8px">완료 ${hiddenDoneCount}건 숨김 (체크박스 해제 시 표시)</div>` : ""}
    <div class="table-wrap con-table-wrap">
      <table class="con-table">
        <thead>
          <tr>
            <th style="width:15%">${sortHead("site","현장")}</th>
            <th style="width:9%">${sortHead("customer","고객")}</th>
            <th class="num" style="width:7%">용량</th>
            <th style="width:8%">${sortHead("phase","업무단계")}</th>
            <th style="width:7%">${sortHead("sales","영업자")}</th>
            <th style="width:11%">기간</th>
            <th style="width:7%">${sortHead("status","상태")}</th>
            <th style="width:28%">허가현황</th>
            <th style="width:60px">관리</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(c => {
            const rowCls = c.status === "지연" ? "con-row-late" : c.status === "시공중" ? "con-row-active" : "";
            return `<tr class="${rowCls}" title="${esc(c.next)}">
            <td>
              <button class="cell-link" data-con-edit="${c._i}">${esc(c.site)}</button>
              <div class="meta">${esc(c.company)} · ${esc(c.structureTeam||"")}</div>
            </td>
            <td>
              ${esc(c.customer)}
              <div class="meta">${esc(c.sales)}</div>
              ${bizOwnerPhoneOf(c) ? `<div class="meta">${esc(bizOwnerPhoneOf(c))}</div>` : ""}
            </td>
            <td class="num">${esc(c.kw)}kW</td>
            <td>${esc(c.phase)}</td>
            <td>${esc(c.sales)}</td>
            <td>
              ${fmtDate(c.start)} ~ ${fmtDate(c.end)}
              <div class="meta">${durationDays(c.start, c.end)}일</div>
            </td>
            <td>${statusBadge(c.status)}</td>
            <td style="white-space:normal;overflow:visible">${permitStatusCell(c)}</td>
            <td><button class="btn icon" data-con-edit="${c._i}">수정</button></td>
          </tr>`;
          }).join("")}
          ${rows.length === 0 ? `<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--muted)">시공일정이 없습니다.</td></tr>` : ""}
        </tbody>
      </table>
    </div>`;
}

// 시공일정 한 건을 리스트 행으로 그린다 — 요약 카드 팝업(openStatusModal)에서 재사용.
function plantRow(c, i) {
  return `<div class="con-plant-row">
    <div class="con-plant-main">
      <span class="name">${esc(c.site)}</span>
      <span class="meta">${esc(c.company)} · <span class="num">${esc(c.kw)}kW</span> · ${esc(c.customer||"고객")}</span>
      <span class="meta">${esc(c.phase)} · ${esc(c.sales||"영업자 미입력")} · ${fmtDate(c.start)} ~ ${fmtDate(c.end||"")}</span>
      ${permitStatusOf(c) ? `<div style="margin-top:2px">${permitStatusCell(c)}</div>` : ""}
    </div>
    <div class="con-plant-side">
      ${statusBadge(c.status)}
      <button class="btn icon" data-con-edit="${i}">수정</button>
    </div>
  </div>`;
}

// 요약 카드를 눌렀을 때: 해당 상태(빈 문자열이면 전체)만 모아 팝업으로 보여준다.
function openStatusModal(status) {
  const st = getState();
  const con = st.construction || [];
  const list = (status ? con.filter(c => c.status === status) : con)
    .slice()
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || String(a.site || "").localeCompare(String(b.site || ""), "ko"));

  const title = document.getElementById("conStatusModalTitle");
  if (title) title.textContent = `${status || "전체"} · ${list.length}건`;

  const body = document.getElementById("conStatusModalBody");
  if (body) {
    body.innerHTML = list.length
      ? list.map(c => plantRow(c, con.indexOf(c))).join("")
      : `<div class="meta" style="padding:20px 4px;text-align:center">해당하는 현장이 없습니다.</div>`;
  }
  const m = document.getElementById("conStatusModal");
  m?.classList.remove("hidden");
  m?.classList.add("open");
}

function closeStatusModal() {
  const m = document.getElementById("conStatusModal");
  m?.classList.remove("open");
  m?.classList.add("hidden");
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

export function openConstructionById(id) {
  const idx = (getState().construction || []).findIndex(c => c.id === id);
  if (idx >= 0) openModal(idx);
}

// "시공 등록 대기" 카드에서 바로 호출 — 새 항목을 열고 프로젝트를 연결한 상태로 시작해서
// site/address/customer/owner 자동 채움을 그대로 재사용한다.
export function openConstructionForProject(projectId) {
  openModal(null);
  addProjectLink(projectId);
}

function projectLabel(p) { return p.name + (p.address ? " · " + p.address : ""); }

function linkedProjects() {
  const projects = getState().projects || [];
  return _modalProjectIds.map(id => projects.find(p => p.id === id)).filter(Boolean);
}

function linkedProjectsKwSum(linked) {
  return Math.round(linked.reduce((s, p) => s + (Number(p.kw) || 0), 0) * 100) / 100;
}

// 새터1호/새터2호처럼 도면상 한 부지를 호기별로 나눠 등록한 현장들을 여러 개 연결하면,
// site/address/customer/sales는 첫 현장 기준으로 채우고 kW만 전부 합산한다 —
// 실제로 호기마다 주소·사업주는 같고 발전용량만 나뉘어 기재되는 경우가 대부분이라서.
function applyLinkedProjectsAutofill() {
  const linked = linkedProjects();
  if (!linked.length) return;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  const first = linked[0];
  set("conSite", linked.map(p => p.name).filter(Boolean).join("+") || first.name || "");
  set("conAddress", first.address || "");
  set("conCustomer", first.bizOwner || "");
  set("conSales", first.owner || "");
  set("conBizOwnerPhone", first.bizOwnerPhone || "");
  const kwSum = linkedProjectsKwSum(linked);
  if (kwSum) set("conKw", kwSum);
}

function renderProjectChips() {
  const wrap = document.getElementById("conProjectChips");
  if (!wrap) return;
  const linked = linkedProjects();
  wrap.innerHTML = linked.map(p => `
    <span class="stats-legend-item" style="background:var(--bg);border:1px solid var(--line);border-radius:999px;padding:3px 10px">
      ${esc(p.name)}
      <button type="button" class="btn icon" data-con-unlink-project="${esc(p.id)}" style="min-height:auto;padding:0 2px;border:0;background:none">×</button>
    </span>`).join("") || `<span class="meta">연결된 현장 없음</span>`;
  renderPermitChecklist(linked);
}

// 연결된 현장(들)의 5대 허가/납부 항목을 프로젝트별로 체크리스트로 보여준다 —
// 시공 착수 가능 여부를 판단하려고 프로젝트DB를 따로 찾아볼 필요가 없게.
function renderPermitChecklist(linked) {
  const box = document.getElementById("conPermitChecklist");
  if (!box) return;
  if (!linked.length) { box.innerHTML = ""; return; }
  box.innerHTML = linked.map(p => `
    <div style="margin-bottom:6px">
      <div class="meta">${esc(p.name)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:2px">
        ${PERMIT_FIELDS.map(f => `
          <span class="badge ${p[f.key] ? "green" : "amber"}">${p[f.key] ? "✓" : "✗"} ${esc(f.label)}</span>
        `).join("")}
      </div>
    </div>`).join("");
}

function refreshProjectDatalist() {
  const dl = document.getElementById("conProjectDatalist");
  if (!dl) return;
  const projects = (getState().projects || []).filter(p => !_modalProjectIds.includes(p.id));
  dl.innerHTML = projects.map(p => `<option value="${esc(projectLabel(p))}">`).join("");
}

function addProjectLink(id) {
  if (!id || _modalProjectIds.includes(id)) return;
  _modalProjectIds.push(id);
  renderProjectChips();
  refreshProjectDatalist();
  applyLinkedProjectsAutofill();
}

function removeProjectLink(id) {
  _modalProjectIds = _modalProjectIds.filter(x => x !== id);
  renderProjectChips();
  refreshProjectDatalist();
  const kwEl = document.getElementById("conKw");
  if (kwEl) kwEl.value = linkedProjectsKwSum(linkedProjects());
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
  const projects = st.projects || [];
  _modalProjectIds = linkedProjectIdsOf(c).filter(id => projects.some(p => p.id === id));
  const projectDatalist = projects.filter(p => !_modalProjectIds.includes(p.id)).map(p =>
    `<option value="${esc(projectLabel(p))}">`).join("");

  document.getElementById("constructionFormGrid").innerHTML = `
    <div class="form-row full">
      <label>연결된 현장 (프로젝트DB) — 여러 현장을 연결하면 kW가 합산됩니다</label>
      <div id="conProjectChips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px"></div>
      <input class="field" id="conProjectSearch" list="conProjectDatalist" autocomplete="off"
        placeholder="현장명 검색 후 선택하면 추가됩니다">
      <datalist id="conProjectDatalist">${projectDatalist}</datalist>
      <div id="conPermitChecklist" style="margin-top:8px"></div>
    </div>
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
      <label>사업주 연락처</label>
      <input class="field" id="conBizOwnerPhone" value="${esc(c.bizOwnerPhone||"")}">
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

  // 상태 변경 시 next에 진행상태 자동 삽입 + 상태를 완료로 바꾸면 업무단계도 완료로 맞춰준다
  document.getElementById("conStatus")?.addEventListener("change", e => {
    const next = document.getElementById("conNext");
    if (next) next.value = withStatusLine(next.value, e.target.value);
    if (e.target.value === "완료") {
      const phaseSel = document.getElementById("conPhaseModal");
      if (phaseSel && [...phaseSel.options].some(o => o.value === "완료")) phaseSel.value = "완료";
    }
  });

  // 프로젝트DB 현장을 검색해서 고르면 칩으로 추가하고 입력창을 비워 다음 현장을 이어서 검색할 수 있게 한다.
  document.getElementById("conProjectSearch")?.addEventListener("input", e => {
    const text = e.target.value;
    if (!text) return;
    const p = projects.find(x => projectLabel(x) === text);
    if (p) { addProjectLink(p.id); e.target.value = ""; }
  });
  document.getElementById("conProjectChips")?.addEventListener("click", e => {
    const id = e.target.closest("[data-con-unlink-project]")?.dataset.conUnlinkProject;
    if (id) removeProjectLink(id);
  });
  renderProjectChips();

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
    projectId:     _modalProjectIds[0] || "",
    projectIds:    [..._modalProjectIds],
    site:          document.getElementById("conSite")?.value || "",
    kw:            Number(document.getElementById("conKw")?.value) || 0,
    sales:         document.getElementById("conSales")?.value || "",
    customer:      document.getElementById("conCustomer")?.value || "",
    bizOwnerPhone: document.getElementById("conBizOwnerPhone")?.value || "",
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
    c.completedAt = construction[_editing].completedAt ?? null;
    stampCompletion(c, construction[_editing].status);
    construction[_editing] = c;
  } else {
    stampCompletion(c, null);
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
  const inStatusModal = document.getElementById("conStatusModal")?.contains(t);
  if (!inView && !inModal && !inStatusModal) return;

  if (t.id === "conAddBtn")           { openModal(); return; }
  if (t.dataset.conStatus !== undefined) { openStatusModal(t.dataset.conStatus); return; }
  if (t.dataset.conEdit !== undefined){ closeStatusModal(); openModal(Number(t.dataset.conEdit)); return; }
  if (t.dataset.conNewFromProject)    { openConstructionForProject(t.dataset.conNewFromProject); return; }
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
