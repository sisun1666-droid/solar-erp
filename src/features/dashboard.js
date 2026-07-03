import { getState, on } from "../store/index.js";
import { esc, today, kwDisplay } from "../utils/index.js";
import { openTodoModal } from "./todos.js";
import { openAssignModal } from "./todos.js";
import { openConstructionModal } from "./construction.js";

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
  const st = getState();
  const total = rows.length;
  const done  = rows.filter(c => c.status === "완료").length;
  const active = rows.filter(c => c.status === "시공중").length;
  const late  = rows.filter(c => c.status === "지연").length;
  const kw    = Math.round(rows.reduce((s, c) => s + (Number(c.kw) || 0), 0) * 100) / 100;
  const totalKw = Math.round(allRows.reduce((s, c) => s + (Number(c.kw) || 0), 0) * 100) / 100;
  const phases = st.constructionPhases || [];
  const teams  = st.constructionTeams  || [];
  const maxPhase = Math.max(1, ...phases.map(p => rows.filter(c => c.phase === p).length));
  const maxTeam  = Math.max(1, ...teams.map(t => rows.filter(c => c.company === t).length));
  const rate = total ? Math.round(done / total * 100) : 0;

  return `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
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
      <div class="label">업무단계 분포</div>
      ${phases.slice(0,4).map(p => smallBar(p, rows.filter(c => c.phase === p).length, maxPhase)).join("")}
    </div>
    <div class="dash-section compact">
      <div class="label">월간 시공 물량</div>
      <div class="value" style="font-size:22px">${kwDisplay(kw)}</div>
      <div class="meta">누적 ${kwDisplay(totalKw)}</div>
      ${teams.slice(0,3).map(t => smallBar(t, rows.filter(c => c.company === t).length, maxTeam)).join("")}
    </div>
  </div>`;
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

// ── 시계 ─────────────────────────────────────────────────────────────────────
function startClock() {
  if (_clockTimer) clearInterval(_clockTimer);
  function tick() {
    const el = document.getElementById("dashClock");
    if (!el) { clearInterval(_clockTimer); _clockTimer = null; return; }
    const now = new Date();
    el.textContent = now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const dateEl = document.getElementById("dashClockDate");
    if (dateEl) dateEl.textContent = now.toLocaleDateString("ko-KR", { year:"numeric", month:"long", day:"numeric", weekday:"long" });
  }
  tick();
  _clockTimer = setInterval(tick, 1000);
}

// ── 메인 렌더 ────────────────────────────────────────────────────────────────
function render() {
  const panel = document.getElementById("dashboardView");
  if (!panel) return;
  if (panel.classList.contains("hidden")) return;

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

  // 최근 지연/주목
  const needAttention = allCon
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.status === "지연" || (c.next && c.status === "시공중"))
    .slice(0, 8);

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
          <div class="dash-link-row">
            <span class="dash-pill">${ym}</span>
            <span class="dash-pill">공사 ${rows.length}</span>
            <span class="dash-pill">지연 ${rows.filter(c=>c.status==="지연").length}</span>
          </div>
          <div class="project-list">
            ${rows.length
              ? rows.map(c => {
                  const ci = allCon.indexOf(c);
                  return `<button class="project-item" data-dash-con="${ci}">
                    <span class="project-name">${esc(c.site || "이름 없는 발전소")}</span>
                    <span class="project-meta">${esc(c.company||"-")} · ${esc(c.kw||0)}kW · ${esc(c.status||"예정")}</span>
                    <span class="project-meta">${esc(c.phase||"-")} · ${esc(c.start||"-")} ~ ${esc(c.end||"")}</span>
                  </button>`;
                }).join("")
              : `<div class="dash-empty">${ym} 공사가 없습니다.</div>`}
          </div>
        </section>
      </aside>

      <!-- 가운데: KPI + 지연 목록 -->
      <div class="dash-main">
        <section class="dash-section">
          <div class="dash-title">
            <h2>📊 ${ym} 시공관리 현황</h2>
          </div>
          ${kpiSection(rows, allCon)}
        </section>

        <!-- 날씨 + 시계 -->
        <div class="dash-top-grid">
          <section class="dash-section compact" style="margin:0">
            <div class="dash-title"><h2>🏗️ 시공 기상정보</h2><button class="btn" data-refresh-weather>새로고침</button></div>
            <div id="dashWeatherContent" class="weather-grid"><div class="meta">기상 정보를 불러오는 중...</div></div>
            <div class="label" style="margin-top:10px">대구 7일 시공 예보</div>
            <div id="dashForecastContent" class="forecast-strip"></div>
          </section>
          <section class="weather-clock-box" style="margin:0;position:relative;overflow:hidden;min-height:180px">
            <div id="dashClockBg" style="position:absolute;inset:0;background-size:cover;background-position:center;opacity:0.75;pointer-events:none"></div>
            <div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.18),rgba(0,0,0,.38));pointer-events:none"></div>
            <div style="position:relative;z-index:2;width:100%;text-align:center;padding:16px 0">
              <div id="dashClockDate" style="font-size:13px;font-weight:700;color:rgba(255,255,255,.85);letter-spacing:.6px;margin-bottom:8px;text-shadow:0 1px 4px rgba(0,0,0,.6)"></div>
              <div id="dashClock" style="font-size:44px;font-weight:800;letter-spacing:-2px;color:#fff;line-height:1;text-shadow:0 3px 12px rgba(0,0,0,.75)"></div>
              <div style="font-size:12px;color:rgba(255,255,255,.75);margin-top:10px;font-weight:600;text-shadow:0 1px 4px rgba(0,0,0,.5)">Asia/Seoul 기준</div>
            </div>
          </section>
        </div>

        <section class="dash-section compact">
          <div class="dash-title"><h2>⚠️ 지연/확인 필요</h2></div>
          <div class="linked-list">
            ${needAttention.length
              ? needAttention.map(({ c, i }) =>
                  `<button class="linked-item" data-dash-con="${i}">
                    <strong>${esc(c.site)}</strong>
                    <div class="meta">${esc(c.status||"-")} · ${esc(c.next||"다음 액션 없음")}</div>
                  </button>`).join("")
              : `<div class="meta">이번 달 특이사항이 없습니다.</div>`}
          </div>
        </section>
      </div>

      <!-- 오른쪽: 미니 캘린더 + 날짜별 할일 -->
      <aside class="dash-side">
        <section class="dash-section">
          <div class="mini-calendar-head">
            <button class="btn icon" data-dash-month="-1">‹</button>
            <strong>${monthStr()}</strong>
            <button class="btn icon" data-dash-month="1">›</button>
          </div>
          <div class="mini-calendar">${miniCalendar()}</div>
        </section>

        <section class="dash-section">
          <div class="dash-title">
            <h2>${esc(_selDate)} 할일·일정</h2>
            <button class="btn" data-dash-today>오늘</button>
          </div>
          <div class="today-list">
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
              ? `<div class="meta">선택한 날짜에 항목이 없습니다.</div>` : ""}
          </div>
        </section>
      </aside>
    </div>`;

  // 검색 이벤트
  panel.querySelector("#dashProjSearch")?.addEventListener("input", e => {
    _projSearch = e.target.value;
    render();
  });

  startClock();
  loadWeather();
  const saved = localStorage.getItem("clockBgImage");
  if (saved) { const el = document.getElementById("dashClockBg"); if (el) el.style.backgroundImage = `url(${saved})`; }
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
