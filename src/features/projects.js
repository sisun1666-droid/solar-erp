import { getState, setState, markDeleted, on } from "../store/index.js";
import { genId, today, esc, toast, $, onSearchInput } from "../utils/index.js";
import * as XLSX from "xlsx";

function statusBadge(s) {
  return `<span class="badge">${esc(s)}</span>`;
}

// 시공 착수 5대 허가/납부 항목 (construction.js 상세 체크리스트에서도 재사용)
export const PERMIT_FIELDS = [
  { key: "permitPower",        label: "발전사업허가일" },
  { key: "permitDev",          label: "개발행위허가일" },
  { key: "permitPpa",          label: "PPA필증" },
  { key: "permitFee",          label: "시설부담금납부일" },
  { key: "permitConstruction", label: "공사계획필증수령일" },
];

// 시공 착수 5대 허가/납부 항목 중 아직 안 채워진 항목 라벨만 뽑아준다.
export function missingPermits(p) {
  return PROJECT_FIELDS.filter(f => f.key.startsWith("permit") && !p[f.key]).map(f => f.label.replace(" 완료", "").replace("공사계획필증 허가일", "공사계획필증"));
}
function permitBadge(p) {
  const missing = missingPermits(p);
  return missing.length
    ? `<span class="badge amber" title="미완료: ${esc(missing.join(", "))}">허가대기 ${missing.length}</span>`
    : `<span class="badge green">시공가능</span>`;
}

let _editProject = null;
let _projSearch  = "";
let _projPhase   = "전체";
let _projSortKey = "";
let _projSortDir = "asc";
let _projPage    = 1;
let _projGroupView = false;
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
      <button class="btn" id="projGroupToggle">같은 부지 묶어보기</button>
      <input type="file" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" id="projCsvInput" style="display:none">
    </div>
    <div id="projResultsWrap"></div>`;

  onSearchInput(panel.querySelector("#projSearch"), e => {
    _projSearch = e.target.value; _projPage = 1; renderProjectResults(panel);
  });
  panel.querySelector("#projGroupToggle")?.addEventListener("click", () => {
    _projGroupView = !_projGroupView; _projPage = 1; renderProjectResults(panel);
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

  const groupToggle = panel.querySelector("#projGroupToggle");
  if (groupToggle) groupToggle.classList.toggle("primary", _projGroupView);

  const filtered = (st.projects || []).filter(p => {
    if (_projPhase !== "전체" && p.phase !== _projPhase) return false;
    if (_projSearch) {
      const hay = Object.values(p).join(" ").toLowerCase();
      if (!hay.includes(_projSearch.toLowerCase())) return false;
    }
    return true;
  });

  // 같은 부지(정규화한 주소) 기준으로 몇 건이 묶이는지 미리 세어둔다.
  const groupCount = new Map();
  for (const p of filtered) {
    const key = addressGroupKey(p.address);
    if (!key) continue;
    groupCount.set(key, (groupCount.get(key) || 0) + 1);
  }

  if (_projGroupView) {
    filtered.sort((a, b) => {
      const ka = addressGroupKey(a.address), kb = addressGroupKey(b.address);
      const ga = groupCount.get(ka) > 1, gb = groupCount.get(kb) > 1;
      if (ga !== gb) return ga ? -1 : 1;       // 묶이는 그룹을 위로
      if (ga && ka !== kb) return ka.localeCompare(kb);
      return a.name.localeCompare(b.name);
    });
  } else if (_projSortKey) {
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

  // 인접한 다른 그룹을 구분하기 쉽도록 그룹 순서에 따라 배경을 번갈아 칠한다.
  let lastGroupKey = null, bandToggle = false;

  const wrap = panel.querySelector("#projResultsWrap");
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th style="width:16%">${sortHead("name","고객/현장")}</th>
          ${_projGroupView ? `<th style="width:9%">묶임</th><th style="width:20%">현장 주소</th><th style="width:11%">사업주</th>` : ""}
          <th style="width:12%">${sortHead("phase","업무단계")}</th>
          <th style="width:10%">${sortHead("owner","담당")}</th>
          <th style="width:11%">${sortHead("due","마감일")}</th>
          <th style="width:11%">${sortHead("status","상태")}</th>
          <th style="width:9%">허가현황</th>
          <th>다음 액션</th>
          <th style="width:70px">관리</th>
        </tr></thead>
        <tbody>
          ${rows.map(p => {
            const key = addressGroupKey(p.address);
            const count = key ? (groupCount.get(key) || 1) : 1;
            if (_projGroupView && key !== lastGroupKey) { bandToggle = !bandToggle; lastGroupKey = key; }
            const rowStyle = _projGroupView && count > 1 ? ` style="background:${bandToggle ? "#f0f9ff" : "#f5f3ff"}"` : "";
            return `<tr${rowStyle}>
              <td title="${esc(p.name)}">${esc(p.name)}</td>
              ${_projGroupView ? `
                <td>${count > 1 ? `<span class="badge">${count}건</span>` : ""}</td>
                <td title="${esc(p.address||"")}">${esc(p.address||"")}</td>
                <td>${esc(p.bizOwner||"")}</td>` : ""}
              <td>${esc(p.phase)}</td>
              <td>${esc(p.owner)}</td>
              <td>${esc(p.due)}</td>
              <td>${statusBadge(p.status)}</td>
              <td>${permitBadge(p)}</td>
              <td title="${esc(p.next)}">${esc((p.next||"").length>40?p.next.slice(0,40)+"…":p.next)}</td>
              <td><button class="btn icon" data-proj-edit="${esc(p.id)}">수정</button></td>
            </tr>`;
          }).join("")}
          ${rows.length === 0 ? `<tr><td colspan="${_projGroupView ? 11 : 8}" style="text-align:center;padding:24px;color:var(--muted)">현장이 없습니다.</td></tr>` : ""}
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
  { key: "name",     label: "현장명 (필수)" },
  { key: "phase",    label: "업무단계" },
  { key: "owner",    label: "담당자" },
  { key: "bizOwner", label: "사업주" },
  { key: "address",  label: "현장 주소" },
  { key: "due",      label: "마감일" },
  { key: "status",   label: "상태" },
  { key: "next",     label: "다음 액션" },
  { key: "kw",                 label: "발전용량(kW)" },
  { key: "permitPower",        label: "발전사업허가 완료" },
  { key: "permitDev",          label: "개발행위 완료" },
  { key: "permitPpa",          label: "PPA 완료" },
  { key: "permitFee",          label: "시설부담금 납부일" },
  { key: "permitConstruction", label: "공사계획필증 허가일" },
];

// "발전_허가용량"이 비어있는 행을 위한 대체 용량 컬럼 (우선순위 순).
// 마스터 트래킹 시트에서 실측으로 이 세 컬럼 중 하나라도 채워진 값이면
// 발전_허가용량이 빈 1838건 중 1249건을 추가로 커버함(나머지는 시트 자체에 값 없음).
const KW_FALLBACK_HEADERS = ["공사계획_허가용량", "구조물_발주용량", "공사_용량"];

// 시공 착수에 필요한 5개 허가/납부 항목이 전부 채워졌는지 (값이 있으면 완료로 간주)
export function permitsReady(p) {
  return !!(p.permitPower && p.permitDev && p.permitPpa && p.permitFee && p.permitConstruction);
}

function guessColumn(headers, key) {
  const hints = {
    name: ["현장", "고객", "발전소", "이름"], phase: ["단계", "phase"],
    owner: ["담당"], bizOwner: ["사업주"], address: ["주소", "지번"],
    due: ["마감", "일자", "날짜"], status: ["상태"], next: ["액션", "메모", "비고"],
    kw: ["발전_허가용량"],
    permitPower: ["발전_완료"], permitDev: ["개발_완료"], permitPpa: ["PPA_완료"],
    permitFee: ["불입금납부일"], permitConstruction: ["공사계획_허가일"],
  };
  const idx = headers.findIndex(h => hints[key]?.some(k => h.includes(k)));
  return idx;
}

// 시/도 정식명칭 ↔ 약칭 표기 차이("경상남도"/"경남" 등)를 하나로 통일한다.
// 문자열 맨 앞(시/도 자리)에서만 치환 — 뒤에 나오는 시/군/구 이름과 헷갈리지 않도록.
const REGION_ALIASES = [
  [/^서울(특별시)?/, "서울"], [/^부산(광역시)?/, "부산"], [/^대구(광역시)?/, "대구"],
  [/^인천(광역시)?/, "인천"], [/^광주(광역시)?/, "광주"], [/^대전(광역시)?/, "대전"],
  [/^울산(광역시)?/, "울산"], [/^세종(특별자치시)?/, "세종"], [/^경기(도)?/, "경기"],
  [/^강원(특별자치도|도)?/, "강원"], [/^충청북도|^충북/, "충북"], [/^충청남도|^충남/, "충남"],
  [/^전라북도|^전북특별자치도|^전북/, "전북"], [/^전라남도|^전남/, "전남"],
  [/^경상북도|^경북/, "경북"], [/^경상남도|^경남/, "경남"],
  [/^제주(특별자치도|도)?/, "제주"],
];

// 시/도 표기가 아예 빠진 주소("구미시 산동면...")를 위한 시/군 → 시/도 역추론표.
// 여러 시/도에 이름이 겹치는 자치구(중구/동구 등)나 고성군(강원·경남 중복)은
// 잘못 추론할 위험이 있어 일부러 제외 — 못 맞히는 게 잘못 맞히는 것보다 낫다.
const CITY_TO_REGION = {
  경기: ["수원시","성남시","의정부시","안양시","부천시","광명시","평택시","동두천시","안산시","고양시","과천시","구리시","남양주시","오산시","시흥시","군포시","의왕시","하남시","용인시","파주시","이천시","안성시","김포시","화성시","광주시","양주시","포천시","여주시","연천군","가평군","양평군"],
  강원: ["춘천시","원주시","강릉시","동해시","태백시","속초시","삼척시","홍천군","횡성군","영월군","평창군","정선군","철원군","화천군","양구군","인제군","양양군"],
  충북: ["청주시","충주시","제천시","보은군","옥천군","영동군","증평군","진천군","괴산군","음성군","단양군"],
  충남: ["천안시","공주시","보령시","아산시","서산시","논산시","계룡시","당진시","금산군","부여군","서천군","청양군","홍성군","예산군","태안군"],
  전북: ["전주시","군산시","익산시","정읍시","남원시","김제시","완주군","진안군","무주군","장수군","임실군","순창군","고창군","부안군"],
  전남: ["목포시","여수시","순천시","나주시","광양시","담양군","곡성군","구례군","고흥군","보성군","화순군","장흥군","강진군","해남군","영암군","무안군","함평군","영광군","장성군","완도군","진도군","신안군"],
  경북: ["포항시","경주시","김천시","안동시","구미시","영주시","영천시","상주시","문경시","경산시","군위군","의성군","청송군","영양군","영덕군","청도군","고령군","성주군","칠곡군","예천군","봉화군","울진군","울릉군"],
  경남: ["창원시","진주시","통영시","사천시","김해시","밀양시","거제시","양산시","의령군","함안군","창녕군","남해군","하동군","산청군","함양군","거창군","합천군"],
  제주: ["제주시","서귀포시"],
};
const CITY_TO_REGION_FLAT = new Map(
  Object.entries(CITY_TO_REGION).flatMap(([region, cities]) => cities.map(c => [c, region]))
);

// 현장 주소를 정규화해서 같은 부지에 있는 발전소를 하나의 그룹으로 묶는 키.
// 사업주는 가족 명의 등으로 갈릴 수 있어 그룹 기준에서 제외하고 주소만 본다.
function addressGroupKey(address) {
  let s = (address || "").trim();
  if (!s) return "";

  let matchedAlias = false;
  for (const [re] of REGION_ALIASES) {
    if (re.test(s)) { matchedAlias = true; break; }
  }
  if (!matchedAlias) {
    const firstCity = s.split(/\s+/)[0];
    const region = CITY_TO_REGION_FLAT.get(firstCity);
    if (region) s = `${region} ${s}`;
  }

  s = s.replace(/\s+/g, "").replace(/번지|지번/g, "").replace(/[,./()\-]/g, "");
  for (const [re, short] of REGION_ALIASES) {
    if (re.test(s)) { s = s.replace(re, short); break; }
  }
  return s;
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
  $("csvImportConfirm")?.addEventListener("click", () => {
    const map = {};
    overlay.querySelectorAll("[data-csv-map]").forEach(sel => { map[sel.dataset.csvMap] = Number(sel.value); });
    if (map.name === -1) { toast("현장명 열을 선택해주세요."); return; }
    const st = getState();
    const projects = [...(st.projects || [])];
    // 발전소명이 우연히 겹치는(서로 다른 현장) 경우가 실제로 있어서, 담당자
    // 정보가 있으면 "이름+담당자"로 더 확실하게 매칭한다. 담당자를 안 가져오는
    // 파일이면 예전처럼 이름만으로 매칭한다.
    const keyOf = (name, owner) => name + " " + (owner || "");
    const byKey  = new Map(projects.map((p, i) => [keyOf(p.name, p.owner), i]));
    const byName = new Map(projects.map((p, i) => [p.name, i]));
    let added = 0, updated = 0;
    for (const row of dataRows) {
      const name = (row[map.name] || "").trim();
      if (!name) continue;
      const fields = {};
      for (const f of PROJECT_FIELDS) {
        if (f.key === "name" || !(map[f.key] >= 0)) continue;
        fields[f.key] = f.key === "due" ? normDate(row[map[f.key]]) : (row[map[f.key]] || "").trim();
      }
      // 발전_허가용량이 빈 발전소가 많아(오래된 현장 등) 다른 용량 컬럼에 있는
      // 값으로 대신 채운다. 마스터 시트에 실제 존재하는 헤더명만 대상으로 하며,
      // 매핑 화면에서 고른 열이 비어있을 때만 순서대로 시도한다.
      if (!fields.kw) {
        for (const h of KW_FALLBACK_HEADERS) {
          const hi = headers.indexOf(h);
          const v = hi >= 0 ? (row[hi] || "").trim() : "";
          if (v) { fields.kw = v; break; }
        }
      }

      const rowOwner = map.owner >= 0 ? (row[map.owner] || "").trim() : undefined;
      const existingIdx = rowOwner !== undefined ? byKey.get(keyOf(name, rowOwner)) : byName.get(name);
      if (existingIdx !== undefined) {
        projects[existingIdx] = normProject({ ...projects[existingIdx], ...fields, name });
        updated++;
      } else {
        const p = normProject({ name, status: "정상", ...fields });
        projects.push(p);
        byKey.set(keyOf(p.name, p.owner), projects.length - 1);
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
    ? { name: "", phase: (st.phases||[])[0]||"고객상담", owner: "", bizOwner: "", address: "", due: today(), status: "정상", next: "" }
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
        <div class="form-row"><label>사업주</label><input class="field" id="projBizOwner" value="${esc(p.bizOwner||"")}"></div>
        <div class="form-row full"><label>현장 주소</label><input class="field" id="projAddress" value="${esc(p.address||"")}"></div>
        <div class="form-row"><label>마감일</label><input class="field" type="date" id="projDue" value="${esc(p.due)}"></div>
        <div class="form-row"><label>상태</label><select class="field" id="projStatus">${statOpts}</select></div>
        <div class="form-row full"><label>다음 액션</label><textarea class="field" id="projNext">${esc(p.next||"")}</textarea></div>
        <div class="form-row full"><label>시공 착수 허가/납부 현황 — 5개 전부 채워져야 "시공가능"으로 표시됩니다</label></div>
        ${PROJECT_FIELDS.filter(f => f.key.startsWith("permit")).map(f => `
          <div class="form-row"><label>${esc(f.label)}</label><input class="field" id="projPermit_${f.key}" value="${esc(p[f.key]||"")}" placeholder="완료일 또는 완료 표시"></div>
        `).join("")}
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
}

function saveProject() {
  const st = getState();
  const projects = [...(st.projects || [])];
  const permitFields = {};
  for (const f of PROJECT_FIELDS) {
    if (!f.key.startsWith("permit")) continue;
    permitFields[f.key] = $(`projPermit_${f.key}`)?.value || "";
  }
  const formFields = {
    name:  $("projName")?.value || "",
    phase: $("projPhaseModal")?.value || "",
    owner: $("projOwner")?.value || "",
    bizOwner: $("projBizOwner")?.value || "",
    address:  $("projAddress")?.value || "",
    due:   $("projDue")?.value || today(),
    status:$("projStatus")?.value || "정상",
    next:  $("projNext")?.value || "",
    ...permitFields,
  };
  let p;
  if (_editProject !== null) {
    const idx = projects.findIndex(x => x.id === _editProject);
    if (idx < 0) { toast("현장을 찾을 수 없습니다. 다시 시도해주세요."); return; }
    // 폼에 없는 필드(가져오기로 들어온 값 등)는 그대로 보존 — 통째로 덮어써서 날리지 않는다.
    p = normProject({ ...projects[idx], ...formFields, id: projects[idx].id });
    projects[idx] = p;
  } else {
    p = normProject(formFields);
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
