import { getState, setState, on } from "../store/index.js";
import { esc, genId, toast } from "../utils/index.js";
import { isConnected, requestToken, clearToken } from "./gcal.js";

// ── 기본값 ───────────────────────────────────────────────────────────────────
export const DEFAULTS = {
  brand:              "기술지원팀",
  title:              "기술지원팀 업무관리",
  subtitle:           "태양광 EPC 업무를 한 화면에서 관리합니다.",
  adminPin:           "1234",
  phases:             ["고객상담","현장조사","인허가","한전접수","설계검토","자재발주","시공중","준공"],
  statuses:           ["정상","대기","보완","지연","완료"],
  assignmentStatuses: ["지시","진행","검토요청","완료","보류"],
  constructionPhases: ["자재입고완료","구조물시공","전기시공","보강공사","완료"],
  constructionTeams:  ["남해","다온","다호","동광","금태양","JW","보강"],
  structureTeams:     ["보틸","쇼후르","잠시드","일고르","아와즈벡","마흐무드","살도르벡"],
  people:             [{ name:"이재강", role:"과장", area:"", monthlyTarget:30, yearlyTarget:360 }],
  gcalClientId:       "",
  gcalCalendarId:     "primary",
};

// 브랜드/제목을 헤더·탭 제목에 반영 (원격 기기의 admin 수정도 stateChange로 실시간 반영)
export function applyBranding() {
  const st = getState();
  document.title = st.title || "업무관리";
  const titleEl = document.getElementById("pageTitle");
  const subEl   = document.getElementById("pageSub");
  const brandEl = document.getElementById("brandName");
  if (titleEl) titleEl.textContent = st.title || "업무관리";
  if (subEl)   subEl.textContent   = st.subtitle || "";
  if (brandEl) brandEl.textContent = st.brand || "";
}

// 상태 정규화 (store 초기 로드 후 1회 실행)
export function normalizeState() {
  const st = getState();
  const patch = {};
  const keys = ["phases","statuses","assignmentStatuses","constructionPhases","constructionTeams","structureTeams","people"];
  keys.forEach(k => { if (!st[k]?.length) patch[k] = DEFAULTS[k]; });
  if (!st.brand)    patch.brand    = DEFAULTS.brand;
  if (!st.title)    patch.title    = DEFAULTS.title;
  if (!st.adminPin) patch.adminPin = DEFAULTS.adminPin;
  if (Object.keys(patch).length) setState(patch, { silent: true });
}

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────
function listHtml(arr, attr, placeholder) {
  return (arr || []).map((v, i) => `
    <div class="admin-item single">
      <input class="field" data-alist="${attr}" data-idx="${i}" value="${esc(v)}" placeholder="${esc(placeholder)}">
      <button class="btn icon danger" data-alist-del="${attr}" data-idx="${i}">×</button>
    </div>`).join("");
}

function card(title, attr, placeholder, addLabel = "추가") {
  const st = getState();
  const arr = st[attr] || [];
  return `
    <div class="card">
      <div class="panel-title">
        <h2>${esc(title)}</h2>
        <button class="btn" data-alist-add="${attr}" data-placeholder="${esc(placeholder)}">${addLabel}</button>
      </div>
      <div class="admin-list">${listHtml(arr, attr, placeholder)}</div>
    </div>`;
}

// ── 직원 카드 ────────────────────────────────────────────────────────────────
function peopleCard() {
  const st = getState();
  const people = st.people || [];
  return `
    <div class="card">
      <div class="panel-title"><h2>담당자 / 직원</h2><button class="btn primary" id="adminAddPersonBtn">+ 직원 추가</button></div>
      <div class="admin-list" id="adminPeopleList">
        ${people.map((p, i) => `
          <div class="admin-item" style="grid-template-columns:minmax(0,1fr) minmax(0,.7fr) auto auto">
            <input class="field" data-person-name="${i}" value="${esc(p.name)}" placeholder="이름">
            <input class="field" data-person-role="${i}" value="${esc(p.role||"")}" placeholder="직책">
            <input class="field" data-person-pin="${i}"  value="${esc(p.pin||"")}"  placeholder="PIN" style="max-width:80px;font-family:monospace">
            <button class="btn icon danger" data-person-del="${i}">×</button>
          </div>`).join("")}
      </div>
    </div>`;
}

// ── Google Calendar 설정 카드 ─────────────────────────────────────────────────
function gcalCard() {
  const st = getState();
  const connected = isConnected();
  return `
    <div class="card">
      <div class="panel-title"><h2>📅 Google 캘린더 연동</h2></div>
      <p class="meta" style="margin:0 0 12px">모든 기기에서 공유됩니다. 한 기기에서 연결하면 자동으로 전파됩니다.</p>
      <div class="form-grid">
        <div class="form-row full">
          <label>OAuth Client ID</label>
          <input class="field" id="gcalClientIdInput" value="${esc(st.gcalClientId||"")}" placeholder="123-xxx.apps.googleusercontent.com">
        </div>
        <div class="form-row full">
          <label>캘린더 ID (기본: primary)</label>
          <input class="field" id="gcalCalendarInput" value="${esc(st.gcalCalendarId||"primary")}" placeholder="primary">
        </div>
      </div>
      <div class="toolbar" style="margin-top:12px">
        <button class="btn primary" id="gcalSaveBtn">Client ID 저장</button>
        ${connected
          ? `<button class="btn danger" id="gcalDisconnectBtn">연결 해제</button>`
          : `<button class="btn" id="gcalConnectBtn">Google 연결</button>`}
      </div>
      <div class="meta" style="margin-top:8px">상태: ${connected
        ? `<strong style="color:#16a34a">✅ 연결됨</strong>`
        : `<span style="color:#94a3b8">미연결</span>`}
      </div>
    </div>`;
}

// ── 메인 렌더 ────────────────────────────────────────────────────────────────
function render() {
  const panel = document.getElementById("adminView");
  if (!panel) return;
  const st = getState();

  panel.innerHTML = `
    <!-- 기본 설정 -->
    <div class="panel" style="margin-bottom:16px">
      <div class="panel-title"><h2>기본 설정</h2><button class="btn primary" id="adminBasicSaveBtn">저장</button></div>
      <div class="form-grid">
        <div class="form-row"><label>브랜드명</label><input class="field" id="adminBrand" value="${esc(st.brand||"")}"></div>
        <div class="form-row"><label>서비스 제목</label><input class="field" id="adminTitle" value="${esc(st.title||"")}"></div>
        <div class="form-row"><label>부제목</label><input class="field" id="adminSubtitle" value="${esc(st.subtitle||"")}"></div>
        <div class="form-row"><label>관리자 PIN</label><input class="field" id="adminPin" type="password" value="${esc(st.adminPin||"")}"></div>
      </div>
    </div>

    <!-- 구성 목록 + GCal -->
    <div class="admin-grid">
      ${peopleCard()}
      ${gcalCard()}
      ${card("현장 업무단계", "phases", "새 단계", "단계 추가")}
      ${card("현장 상태", "statuses", "새 상태", "상태 추가")}
      ${card("일정/업무 상태", "assignmentStatuses", "새 상태", "상태 추가")}
      ${card("시공 단계", "constructionPhases", "새 단계", "단계 추가")}
      ${card("시공사", "constructionTeams", "새 시공사", "시공사 추가")}
      ${card("구조물팀", "structureTeams", "새 팀", "팀 추가")}
    </div>`;

  bindEvents(panel);
}

// ── 이벤트 바인딩 ─────────────────────────────────────────────────────────────
function bindEvents(panel) {
  // 기본 설정 저장
  panel.querySelector("#adminBasicSaveBtn")?.addEventListener("click", () => {
    setState({
      brand:    document.getElementById("adminBrand")?.value || "",
      title:    document.getElementById("adminTitle")?.value || "",
      subtitle: document.getElementById("adminSubtitle")?.value || "",
      adminPin: document.getElementById("adminPin")?.value || "1234",
    });
    toast("기본 설정을 저장했습니다.");
  });

  // 직원 추가
  panel.querySelector("#adminAddPersonBtn")?.addEventListener("click", () => {
    const st = getState();
    const people = [...(st.people || []), { name: "새 직원", role: "직원", area: "", monthlyTarget: 30, yearlyTarget: 360, id: genId("person") }];
    setState({ people });
    render();
  });

  // GCal
  panel.querySelector("#gcalSaveBtn")?.addEventListener("click", () => {
    setState({
      gcalClientId:    document.getElementById("gcalClientIdInput")?.value.trim() || "",
      gcalCalendarId:  document.getElementById("gcalCalendarInput")?.value.trim() || "primary",
    });
    toast("Google 설정을 저장했습니다.");
    render();
  });
  panel.querySelector("#gcalConnectBtn")?.addEventListener("click", () => requestToken(true).then(() => render()));
  panel.querySelector("#gcalDisconnectBtn")?.addEventListener("click", () => { clearToken(); render(); });

  // 동적 목록 이벤트 위임 (input 변경)
  panel.addEventListener("input", e => {
    const t = e.target;
    const st = getState();

    if (t.dataset.alist !== undefined) {
      const arr = [...(st[t.dataset.alist] || [])];
      arr[Number(t.dataset.idx)] = t.value;
      setState({ [t.dataset.alist]: arr }, { silent: true });
    }
    if (t.dataset.personName !== undefined) {
      const people = [...(st.people || [])];
      people[Number(t.dataset.personName)] = { ...people[Number(t.dataset.personName)], name: t.value };
      setState({ people }, { silent: true });
    }
    if (t.dataset.personRole !== undefined) {
      const people = [...(st.people || [])];
      people[Number(t.dataset.personRole)] = { ...people[Number(t.dataset.personRole)], role: t.value };
      setState({ people }, { silent: true });
    }
    if (t.dataset.personPin !== undefined) {
      const people = [...(st.people || [])];
      people[Number(t.dataset.personPin)] = { ...people[Number(t.dataset.personPin)], pin: t.value };
      setState({ people }, { silent: true });
    }
  });

  panel.addEventListener("click", e => {
    const t = e.target.closest("button") || e.target;
    const st = getState();

    if (t.dataset.alistAdd) {
      const arr = [...(st[t.dataset.alistAdd] || []), t.dataset.placeholder || "새 항목"];
      setState({ [t.dataset.alistAdd]: arr });
      render(); return;
    }
    if (t.dataset.alistDel) {
      const arr = [...(st[t.dataset.alistDel] || [])];
      arr.splice(Number(t.dataset.idx), 1);
      setState({ [t.dataset.alistDel]: arr });
      render(); return;
    }
    if (t.dataset.personDel !== undefined) {
      if (!confirm("이 직원을 삭제할까요?")) return;
      const people = [...(st.people || [])];
      people.splice(Number(t.dataset.personDel), 1);
      setState({ people });
      render(); return;
    }
  });
}

// ── 초기화 ───────────────────────────────────────────────────────────────────
export function initAdmin() {
  applyBranding();
  on("stateChange", applyBranding);
  on("viewChanged", ({ view }) => { if (view === "admin") render(); });
}
