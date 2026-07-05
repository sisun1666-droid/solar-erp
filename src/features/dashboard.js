import { getState, setState, on } from "../store/index.js";
import { esc, today, kwDisplay, onSearchInput } from "../utils/index.js";
import { openTodoModal } from "./todos.js";
import { openAssignModal } from "./todos.js";
import { openConstructionModal, linkedProjectIdsOf } from "./construction.js";
import { permitsReady } from "./projects.js";

let _calYear  = new Date().getFullYear();
let _calMonth = new Date().getMonth() + 1;
let _selDate  = today();
let _projSearch = "";
let _clockTimer = null;

// ── 유틸 ─────────────────────────────────────────────────────────────────────
function localDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function monthStr() {
  return `${_calYear}년 ${String(_calMonth).padStart(2,"0")}월`;
}

function durationDays(s, e) {
  if (!s || !e) return 0;
  const diff = new Date(e) - new Date(s);
  return diff < 0 ? 0 : Math.round(diff / 86400000) + 1;
}

// ── 미니 캘린더 ──────────────────────────────────────────────────────────────
function miniCalendar() {
  const st = getState();
  const assigns = st.assignments || [];
  const todos   = st.todos || [];
  const y = _calYear, m = _calMonth - 1;
  const first = new Date(y, m, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const todayStr = today();

  const days = ["일","월","화","수","목","금","토"].map(n =>
    `<div class="mini-day-name">${n}</div>`).join("");

  let cells = "";
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = localDate(d);
    const inMonth = d.getMonth() === m;
    const isToday = iso === todayStr;
    const isSel   = iso === _selDate;
    const hasWork = assigns.some(a => a.start === iso || a.due === iso) ||
                    todos.some(t => t.due === iso);
    const cls = [
      "mini-day",
      !inMonth ? "muted" : "",
      isToday ? "today" : isSel ? "active" : "",
      hasWork ? "has-work" : "",
    ].filter(Boolean).join(" ");
    cells += `<div class="${cls}" data-dash-date="${iso}">${d.getDate()}</div>`;
  }
  return days + cells;
}

// ── KPI 바 ───────────────────────────────────────────────────────────────────
function smallBar(label, val, total, color = "#0d9488") {
  const pct = total ? Math.round(val / total * 100) : 0;
  return `<div class="chart-row">
    <span>${esc(label)}</span>
    <div class="chart-track"><div class="chart-fill" style="width:${pct}%;background:${color}"></div></div>
    <strong>${val}</strong>
  </div>`;
}

function kpiSection(rows, allRows = rows) {
  const total = rows.length;
  const done  = rows.filter(c => c.status === "완료").length;
  const active = rows.filter(c => c.status === "시공중").length;
  const late  = rows.filter(c => c.status === "지연").length;
  const kw    = Math.round(rows.reduce((s, c) => s + (Number(c.kw) || 0), 0) * 100) / 100;
  const totalKw = Math.round(allRows.reduce((s, c) => s + (Number(c.kw) || 0), 0) * 100) / 100;
  const rate = total ? Math.round(done / total * 100) : 0;

  return `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
    <div class="dash-section compact">
      <div class="label">시공 진행률</div>
      <div class="donut" style="--p:${rate}%"><span>${rate}%</span></div>
      <div class="meta">완료 ${done} / 전체 ${total}</div>
    </div>
    <div class="dash-section compact">
      <div class="label">상태별 발전소</div>
      ${smallBar("시공중", active, total)}
      ${smallBar("예정", rows.filter(c => c.status === "예정").length, total, "#7aa7d9")}
      ${smallBar("지연", late, total, "#d87568")}
    </div>
    <div class="dash-section compact">
      <div class="label">월간 시공 물량</div>
      <div class="value" style="font-size:22px">${kwDisplay(kw)}</div>
      <div class="meta">누적 ${kwDisplay(totalKw)}</div>
      <button class="btn" data-nav="stats" style="margin-top:8px;width:100%;white-space:nowrap;padding:0 6px">통계 →</button>
    </div>
  </div>`;
}

// ── 파이프라인 퍼널 (프로젝트DB 업무단계별 현황) ────────────────────────────
function pipelineFunnel() {
  const st = getState();
  const projects = st.projects || [];
  const phases = st.phases || [];
  const linkedIds = new Set((st.construction || []).flatMap(linkedProjectIdsOf));
  const readyCount = projects.filter(p => permitsReady(p) && !linkedIds.has(p.id)).length;
  const maxPhase = Math.max(1, ...phases.map(ph => projects.filter(p => p.phase === ph).length));

  return `<div class="dash-section compact">
    <div class="dash-title"><h2>🧭 프로젝트 파이프라인</h2><span class="meta">전체 ${projects.length}건</span></div>
    ${phases.map(ph => smallBar(ph, projects.filter(p => p.phase === ph).length, maxPhase)).join("")}
    <button class="btn primary" data-nav="construction" style="margin-top:10px;width:100%">
      ${readyCount ? `시공 등록 대기 ${readyCount}건 →` : "시공일정으로 이동 →"}
    </button>
  </div>`;
}

// ── 팀별 워크로드 (진행중+예정 시공 건수로 현재 부하 확인) ──────────────────
function workloadSection() {
  const st = getState();
  const con = st.construction || [];
  const active = con.filter(c => c.status === "시공중" || c.status === "예정");
  const teams = st.constructionTeams || [];
  const strTeams = st.structureTeams || [];
  const maxTeam = Math.max(1, ...teams.map(t => active.filter(c => c.company === t).length));
  const maxStr  = Math.max(1, ...strTeams.map(t => active.filter(c => c.structureTeam === t).length));

  return `
    <div class="label">시공사</div>
    ${teams.length ? teams.map(t => smallBar(t, active.filter(c => c.company === t).length, maxTeam)).join("")
      : `<div class="meta">시공사 데이터가 없습니다.</div>`}
    <div class="label" style="margin-top:10px">구조물팀</div>
    ${strTeams.length ? strTeams.map(t => smallBar(t, active.filter(c => c.structureTeam === t).length, maxStr)).join("")
      : `<div class="meta">구조물팀 데이터가 없습니다.</div>`}`;
}

// ── 지금 처리 필요 (지연 시공 + 마감 초과 할일 통합) ────────────────────────
function priorityList() {
  const st = getState();
  const todayStr = today();
  const lateCon = (st.construction || [])
    .map((c, i) => ({ i, c }))
    .filter(({ c }) => c.status === "지연");
  const overdueTodos = (st.todos || [])
    .filter(t => t.due && t.due < todayStr && !["완료", "취소"].includes(t.status));

  const items = [
    ...lateCon.map(({ c, i }) => ({
      kind: "con", i, title: c.site || "이름 없는 발전소",
      meta: `시공 지연 · ${c.company || "-"} · ${c.next || "다음 액션 없음"}`,
    })),
    ...overdueTodos.map(t => ({
      kind: "todo", id: t.id, title: t.title,
      meta: `할일 마감초과(${t.due}) · ${t.owner || "담당 미정"}`,
    })),
  ];

  if (!items.length) return `<div class="meta">지금 처리할 지연 항목이 없습니다.</div>`;
  return items.map(it => it.kind === "con"
    ? `<button class="linked-item" data-dash-con="${it.i}"><strong>${esc(it.title)}</strong><div class="meta">${esc(it.meta)}</div></button>`
    : `<button class="linked-item" data-edit-todo="${esc(it.id)}"><strong>${esc(it.title)}</strong><div class="meta">${esc(it.meta)}</div></button>`
  ).join("");
}

// ── 날씨 ─────────────────────────────────────────────────────────────────────
const W_CITIES = [
  { name:"대구", lat:35.8714, lon:128.6014 },
  { name:"경북", lat:36.5759, lon:128.5056 },
  { name:"경남", lat:35.4606, lon:128.2132 },
  { name:"전남", lat:34.8679, lon:126.9910 },
  { name:"충남", lat:36.6588, lon:126.6728 },
];
function wIcon(code) {
  if (code === 0) return "☀️";
  if (code <= 3)  return "⛅";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "❄️";
  return "⛈️";
}
async function loadWeather() {
  const box = document.getElementById("dashWeatherContent");
  const fcBox = document.getElementById("dashForecastContent");
  if (!box) return;
  try {
    const results = await Promise.all(W_CITIES.map(async c => {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,wind_speed_10m,weathercode&daily=precipitation_probability_max,temperature_2m_max,temperature_2m_min&timezone=Asia%2FSeoul&forecast_days=7`);
      const j = await r.json();
      return { ...c, current: j.current, daily: j.daily };
    }));
    box.innerHTML = results.map(r =>
      `<div class="weather-city">
        <strong>${esc(r.name)}</strong>
        <div class="value" style="font-size:18px">${wIcon(r.current.weathercode)} ${Math.round(r.current.temperature_2m)}°C</div>
        <div class="meta">풍속 ${Math.round(r.current.wind_speed_10m)}m/s</div>
      </div>`
    ).join("");
    const d = results[0].daily;
    if (fcBox && d) {
      fcBox.innerHTML = d.time.map((date, i) =>
        `<div class="forecast-day${(d.precipitation_probability_max[i]||0) >= 50 ? " rain-day" : ""}">
          <div class="fc-date">${date.slice(5)}</div>
          <div class="fc-icon">${wIcon(0)}</div>
          <div class="fc-temp">${Math.round(d.temperature_2m_min[i])}/${Math.round(d.temperature_2m_max[i])}°</div>
          ${(d.precipitation_probability_max[i]||0) > 20 ? `<div class="fc-rain">💧${d.precipitation_probability_max[i]}%</div>` : ""}
        </div>`
      ).join("");
    }
  } catch {
    if (box) box.innerHTML = `<div class="meta">날씨 정보를 불러오지 못했습니다.</div>`;
    if (fcBox) fcBox.innerHTML = "";
  }
}

// ── 시계 (카드 제목 옆에 작게 표시) ──────────────────────────────────────────
function startClock() {
  if (_clockTimer) clearInterval(_clockTimer);
  function tick() {
    const el = document.getElementById("dashClockInline");
    if (!el) { clearInterval(_clockTimer); _clockTimer = null; return; }
    const now = new Date();
    const time = now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    const date = now.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
    el.textContent = `${date} · ${time}`;
  }
  tick();
  _clockTimer = setInterval(tick, 1000);
}

// ── 메인 렌더 ────────────────────────────────────────────────────────────────
// 검색창은 최초 1번만 만들고 다시 그리지 않는다 — 재렌더 때마다 통째로
// 다시 그리면 한글 조합 중이던 input이 파괴되어 타자가 끊기기 때문.
function ensureDashboardShell(panel) {
  if (panel.dataset.dashShellReady) return;
  panel.dataset.dashShellReady = "1";

  panel.innerHTML = `
    <div class="workspace-dashboard">

      <!-- 왼쪽: 시공일정 목록 -->
      <aside class="dash-column">
        <section class="dash-section">
          <div class="dash-title">
            <h2>📋 시공일정</h2>
            <button class="btn primary" data-dash-add-con>추가</button>
          </div>
          <input class="project-search" id="dashProjSearch" placeholder="현장, 시공사 검색" value="${esc(_projSearch)}">
          <div class="dash-link-row" id="dashPillRow"></div>
          <div class="project-list" id="dashProjectList"></div>
        </section>

        <section class="dash-section compact">
          <div class="dash-title"><h2>⚖️ 팀별 워크로드</h2></div>
          <div id="dashWorkload"></div>
        </section>

        <section class="dash-section compact">
          <div class="dash-title"><h2>📌 팀 공지</h2></div>
          <textarea class="dashboard-memo-box" id="dashTeamNotice" placeholder="팀 전체에 공유할 공지사항을 적어두세요 (자동 저장)"></textarea>
        </section>
      </aside>

      <!-- 가운데: 파이프라인 + 우선순위 + KPI -->
      <div class="dash-main">
        <section id="dashPipeline"></section>

        <section class="dash-section compact">
          <div class="dash-title"><h2>🔥 지금 처리 필요</h2></div>
          <div class="linked-list" id="dashAttentionList"></div>
        </section>

        <section class="dash-section">
          <div class="dash-title">
            <h2 id="dashKpiTitle"></h2>
            <span id="dashClockInline" class="meta"></span>
          </div>
          <div id="dashKpiBody"></div>
        </section>

        <section class="dash-section compact">
          <div class="dash-title"><h2>🏗️ 시공 기상정보</h2><button class="btn" data-refresh-weather>새로고침</button></div>
          <div id="dashWeatherContent" class="weather-grid"><div class="meta">기상 정보를 불러오는 중...</div></div>
          <div class="label" style="margin-top:10px">대구 7일 시공 예보</div>
          <div id="dashForecastContent" class="forecast-strip"></div>
        </section>
      </div>

      <!-- 오른쪽: 미니 캘린더 + 날짜별 할일 -->
      <aside class="dash-side">
        <section class="dash-section">
          <div class="mini-calendar-head">
            <button class="btn icon" data-dash-month="-1">‹</button>
            <strong id="dashMonthLabel"></strong>
            <button class="btn icon" data-dash-month="1">›</button>
          </div>
          <div class="mini-calendar" id="dashMiniCalendar"></div>
        </section>

        <section class="dash-section">
          <div class="dash-title">
            <h2 id="dashSelDateTitle"></h2>
            <button class="btn" data-dash-today>오늘</button>
          </div>
          <div class="today-list" id="dashTodayList"></div>
        </section>
      </aside>
    </div>`;

  onSearchInput(panel.querySelector("#dashProjSearch"), e => {
    _projSearch = e.target.value;
    renderDashboardResults(panel);
  });

  // 공지사항은 다른 직원도 같이 쓰는 공유 메모라, 키 입력마다 저장하지 않고
  // 포커스를 벗어날 때만 저장한다 (동시 편집 시 서로 덮어쓰는 걸 최소화).
  const noticeEl = panel.querySelector("#dashTeamNotice");
  noticeEl?.addEventListener("change", () => setState({ teamNotice: noticeEl.value }));

  startClock();
  loadWeather();
}

function render() {
  const panel = document.getElementById("dashboardView");
  if (!panel) return;
  if (panel.classList.contains("hidden")) return;
  ensureDashboardShell(panel);
  renderDashboardResults(panel);
}

function renderDashboardResults(panel) {
  const st = getState();
  const allCon = st.construction || [];
  const assigns = st.assignments || [];
  const todos   = st.todos || [];

  // 이번 달 시공 행
  const ym = `${_calYear}-${String(_calMonth).padStart(2,"0")}`;
  const q  = _projSearch.toLowerCase();
  const rows = allCon.filter(c =>
    (c.start?.startsWith(ym) || c.end?.startsWith(ym) || c.status === "시공중") &&
    (!q || [c.site, c.company, c.owner].join(" ").toLowerCase().includes(q))
  );

  // 오늘 선택 날짜 할일/일정
  const dateItems = {
    todos:   todos.filter(t => t.due === _selDate || t.start === _selDate),
    assigns: assigns.filter(a => a.due === _selDate || a.start === _selDate),
  };

  const pillRow = panel.querySelector("#dashPillRow");
  if (pillRow) pillRow.innerHTML = `
    <span class="dash-pill">${ym}</span>
    <span class="dash-pill">공사 ${rows.length}</span>
    <span class="dash-pill">지연 ${rows.filter(c=>c.status==="지연").length}</span>`;

  const projectList = panel.querySelector("#dashProjectList");
  if (projectList) projectList.innerHTML = rows.length
    ? rows.map(c => {
        const ci = allCon.indexOf(c);
        return `<button class="project-item" data-dash-con="${ci}">
          <span class="project-name">${esc(c.site || "이름 없는 발전소")}</span>
          <span class="project-meta">${esc(c.company||"-")} · ${esc(c.kw||0)}kW · ${esc(c.status||"예정")}</span>
          <span class="project-meta">${esc(c.phase||"-")} · ${esc(c.start||"-")} ~ ${esc(c.end||"")}</span>
        </button>`;
      }).join("")
    : `<div class="dash-empty">${ym} 공사가 없습니다.</div>`;

  const kpiTitle = panel.querySelector("#dashKpiTitle");
  if (kpiTitle) kpiTitle.textContent = `📊 ${ym} 시공관리 현황`;
  const kpiBody = panel.querySelector("#dashKpiBody");
  if (kpiBody) kpiBody.innerHTML = kpiSection(rows, allCon);

  const pipeline = panel.querySelector("#dashPipeline");
  if (pipeline) pipeline.innerHTML = pipelineFunnel();

  const workload = panel.querySelector("#dashWorkload");
  if (workload) workload.innerHTML = workloadSection();

  // 다른 직원이 저장한 공지 내용을 반영하되, 지금 이 창에서 타이핑 중이면 덮어쓰지 않는다.
  const noticeEl = panel.querySelector("#dashTeamNotice");
  if (noticeEl && document.activeElement !== noticeEl) noticeEl.value = st.teamNotice || "";

  const attentionList = panel.querySelector("#dashAttentionList");
  if (attentionList) attentionList.innerHTML = priorityList();

  const monthLabel = panel.querySelector("#dashMonthLabel");
  if (monthLabel) monthLabel.textContent = monthStr();
  const miniCal = panel.querySelector("#dashMiniCalendar");
  if (miniCal) miniCal.innerHTML = miniCalendar();

  const selDateTitle = panel.querySelector("#dashSelDateTitle");
  if (selDateTitle) selDateTitle.textContent = `${_selDate} 할일·일정`;
  const todayList = panel.querySelector("#dashTodayList");
  if (todayList) todayList.innerHTML = `
    ${dateItems.todos.map(t =>
      `<button class="today-item" data-edit-todo="${esc(t.id)}">
        <strong>${esc(t.title)}</strong>
        <div class="meta">${esc(t.owner)} · ${esc(t.status)} · 할일</div>
      </button>`).join("")}
    ${dateItems.assigns.map(a =>
      `<button class="today-item" data-open-assignment="${esc(a.id)}">
        <strong>${esc(a.title)}</strong>
        <div class="meta">${esc(a.owner)} · ${esc(a.status)} · 일정</div>
      </button>`).join("")}
    ${dateItems.todos.length + dateItems.assigns.length === 0
      ? `<div class="meta">선택한 날짜에 항목이 없습니다.</div>` : ""}`;
}

// ── 이벤트 위임 ──────────────────────────────────────────────────────────────
function onDocClick(e) {
  const t = e.target.closest("button,[data-dash-date]") || e.target;
  const panel = document.getElementById("dashboardView");
  if (!panel || panel.classList.contains("hidden")) return;

  if (t.dataset.refreshWeather !== undefined) { loadWeather(); return; }
  if (t.dataset.dashMonth) {
    let m = _calMonth + Number(t.dataset.dashMonth);
    if (m > 12) { m = 1;  _calYear++; }
    if (m < 1)  { m = 12; _calYear--; }
    _calMonth = m;
    render(); return;
  }
  if (t.dataset.dashDate)    { _selDate = t.dataset.dashDate; render(); return; }
  if (t.dataset.dashToday)   { _selDate = today(); render(); return; }
  if (t.dataset.dashAddCon)  { openConstructionModal(); return; }
  if (t.dataset.dashCon)     { openConstructionModal(Number(t.dataset.dashCon)); return; }
  if (t.dataset.editTodo !== undefined)    openTodoModal(t.dataset.editTodo);
  if (t.dataset.openAssignment !== undefined) openAssignModal(t.dataset.openAssignment);
}

export function initDashboard() {
  document.addEventListener("click", onDocClick);
  on("viewChanged", ({ view }) => { if (view === "dashboard") render(); });
  on("stateChange", () => {
    const panel = document.getElementById("dashboardView");
    if (panel && !panel.classList.contains("hidden")) render();
  });
}
