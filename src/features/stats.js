import { getState, on } from "../store/index.js";
import { esc, kwDisplay } from "../utils/index.js";

// 카테고리 팔레트 8슬롯(검증된 세트, dataviz 스킬 references/palette.md) — 순서 고정,
// 팀이 늘어나도 순환 배정하지 않고 8개를 넘기면 나머지를 "기타"로 접는다.
const PALETTE = [
  { light: "#2a78d6", dark: "#3987e5" }, // blue
  { light: "#1baf7a", dark: "#199e70" }, // aqua
  { light: "#eda100", dark: "#c98500" }, // yellow
  { light: "#008300", dark: "#008300" }, // green
  { light: "#4a3aa7", dark: "#9085e9" }, // violet
  { light: "#e34948", dark: "#e66767" }, // red
  { light: "#e87ba4", dark: "#d55181" }, // magenta
  { light: "#eb6834", dark: "#d95926" }, // orange
];
const MAX_SERIES = PALETTE.length;

let _selMonth = "";     // 하단 팀별 상세 테이블에서 선택한 월 (빈 값이면 최신월)
let _showTable = false; // 추이 차트 대신/함께 표로 보기
let _hoverIdx = -1;

function isDark() { return document.documentElement.dataset.theme === "dark"; }
function seriesColor(i) { return isDark() ? PALETTE[i % MAX_SERIES].dark : PALETTE[i % MAX_SERIES].light; }

function monthsBack(n) {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d); x.setMonth(d.getMonth() - i);
    const key = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
    out.push({ key, label: `${x.getMonth() + 1}월` });
  }
  return out;
}

// 완료 시점 — 상태변경 시각(completedAt)이 있으면 그걸, 없으면 완료일(end)을 쓴다.
function completionKey(c) {
  const raw = c.completedAt || c.end || "";
  return raw.slice(0, 7);
}

// 설정된 팀 이름과 안 맞는 company(공백, 오타, 삭제된 팀 등)가 하나라도 있으면
// "기타" 묶음을 만든다 — 팀 수가 8개 이하라서 안 만들면, teamOf()가 그 기록들을
// "기타"로 분류해놓고도 series에는 "기타" 행이 없어 합계에서 조용히 빠지게 된다.
function pickTeams(configuredTeams, done) {
  const hasOther = done.some(c => !configuredTeams.includes(c.company));
  if (configuredTeams.length + (hasOther ? 1 : 0) <= MAX_SERIES) {
    return hasOther ? [...configuredTeams, "기타"] : configuredTeams;
  }
  const volume = t => done.filter(c => c.company === t).length;
  const top = [...configuredTeams].sort((a, b) => volume(b) - volume(a)).slice(0, MAX_SERIES - 1);
  return [...top, "기타"];
}

function buildData() {
  const st = getState();
  const con = st.construction || [];
  const done = con.filter(c => c.status === "완료");
  const months = monthsBack(12);
  const teams = pickTeams(st.constructionTeams || [], done);
  const teamOf = c => teams.includes(c.company) ? c.company : "기타";

  const series = teams.map(team => ({
    team,
    counts: months.map(m => done.filter(c => completionKey(c) === m.key && teamOf(c) === team).length),
  }));
  const totals = months.map((m, i) => series.reduce((s, sr) => s + sr.counts[i], 0));
  const kwByMonth = months.map(m =>
    Math.round(done.filter(c => completionKey(c) === m.key).reduce((s, c) => s + (Number(c.kw) || 0), 0) * 100) / 100);

  return { months, teams, series, totals, kwByMonth, done };
}

// ── SVG 추이 차트 ────────────────────────────────────────────────────────────
function niceMax(v) {
  if (v <= 0) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / step;
  const mul = n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return Math.ceil(v / (step * mul / 4)) * (step * mul / 4);
}

function renderChart({ months, teams, series, totals }) {
  const W = 900, H = 300, padL = 34, padR = 12, padT = 14, padB = 26;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const maxVal = niceMax(Math.max(1, ...totals));
  const n = months.length;
  const x = i => padL + (n === 1 ? 0 : (innerW * i) / (n - 1));
  const y = v => padT + innerH - (innerH * v) / maxVal;

  const gridColor = "var(--line)";
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(maxVal * f));
  const gridLines = ticks.map(t => `
    <line x1="${padL}" y1="${y(t)}" x2="${W - padR}" y2="${y(t)}" stroke="${gridColor}" stroke-width="1" />
    <text x="${padL - 6}" y="${y(t) + 3}" text-anchor="end" font-size="10" fill="var(--muted)">${t}</text>`).join("");

  const xLabels = months.map((m, i) =>
    `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--muted)">${esc(m.label)}</text>`).join("");

  function pathOf(counts) {
    return counts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  }

  const teamPaths = series.map((sr, i) => `
    <path d="${pathOf(sr.counts)}" fill="none" stroke="${seriesColor(i)}" stroke-width="2" stroke-linecap="round" />
    ${sr.counts.map((v, j) => `<circle cx="${x(j).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" fill="${seriesColor(i)}" />`).join("")}
  `).join("");

  const totalPath = `<path d="${pathOf(totals)}" fill="none" stroke="var(--ink)" stroke-width="2" stroke-dasharray="5,4" opacity="0.55" />`;

  // 호버용 투명 컬럼 + 크로스헤어
  const colW = innerW / n;
  const hoverCols = months.map((m, i) => `
    <rect data-stats-col="${i}" x="${(x(i) - colW / 2).toFixed(1)}" y="${padT}" width="${colW.toFixed(1)}" height="${innerH}" fill="transparent" style="cursor:pointer" />
  `).join("");
  const crosshair = _hoverIdx >= 0
    ? `<line x1="${x(_hoverIdx)}" y1="${padT}" x2="${x(_hoverIdx)}" y2="${padT + innerH}" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3,3" />`
    : "";

  const legend = `
    <div class="stats-legend">
      ${series.map((sr, i) => `<span class="stats-legend-item"><i style="background:${seriesColor(i)}"></i>${esc(sr.team)}</span>`).join("")}
      <span class="stats-legend-item"><i style="background:var(--ink);opacity:.55"></i>합계(점선)</span>
    </div>`;

  const tooltip = _hoverIdx >= 0 ? `
    <div class="stats-tooltip">
      <strong>${esc(months[_hoverIdx].label)} · 합계 ${totals[_hoverIdx]}건</strong>
      ${series.map((sr, i) => sr.counts[_hoverIdx] > 0
        ? `<div><i style="background:${seriesColor(i)}"></i>${esc(sr.team)} ${sr.counts[_hoverIdx]}건</div>` : "").join("")}
    </div>` : "";

  return `
    <div class="stats-chart-wrap">
      <svg viewBox="0 0 ${W} ${H}" class="stats-svg">
        ${gridLines}
        ${totalPath}
        ${teamPaths}
        ${hoverCols}
        ${crosshair}
        ${xLabels}
      </svg>
      ${tooltip}
    </div>
    ${legend}`;
}

function renderTableView({ months, series, totals }) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>월</th>${series.map(sr => `<th>${esc(sr.team)}</th>`).join("")}<th>합계</th></tr></thead>
        <tbody>
          ${months.map((m, i) => `<tr>
            <td>${esc(m.label)}</td>
            ${series.map(sr => `<td style="text-align:right">${sr.counts[i] || "-"}</td>`).join("")}
            <td style="text-align:right;font-weight:800">${totals[i]}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

// ── 월 선택 팀별 상세 ────────────────────────────────────────────────────────
function renderMonthBreakdown(data) {
  const { months, done } = data;
  const monthKey = _selMonth || months[months.length - 1].key;
  const rows = done.filter(c => completionKey(c) === monthKey);
  const st = getState();
  const teams = [...new Set([...(st.constructionTeams || []), ...rows.map(c => c.company).filter(Boolean)])];

  const byTeam = teams.map(team => {
    const list = rows.filter(c => c.company === team);
    return {
      team, count: list.length,
      kw: Math.round(list.reduce((s, c) => s + (Number(c.kw) || 0), 0) * 100) / 100,
    };
  }).filter(r => r.count > 0).sort((a, b) => b.count - a.count);

  const maxCount = Math.max(1, ...byTeam.map(r => r.count));
  const totalCount = rows.length;
  const totalKw = Math.round(rows.reduce((s, c) => s + (Number(c.kw) || 0), 0) * 100) / 100;

  const monthOpts = months.map(m =>
    `<option value="${m.key}"${m.key === monthKey ? " selected" : ""}>${m.key}</option>`).join("");

  return `
    <div class="panel" style="padding:16px">
      <div class="panel-title" style="display:flex;align-items:center;justify-content:space-between">
        <h2>팀별 시공완료 상세</h2>
        <select class="field" id="statsMonthSel" style="max-width:140px">${monthOpts}</select>
      </div>
      <div class="meta" style="margin-bottom:10px">이 달 완료 ${totalCount}건 · ${kwDisplay(totalKw)}</div>
      ${byTeam.length ? byTeam.map(r => `
        <div class="chart-row">
          <span>${esc(r.team)}</span>
          <div class="chart-track"><div class="chart-fill" style="width:${Math.round(r.count / maxCount * 100)}%"></div></div>
          <strong>${r.count}</strong>
        </div>`).join("") : `<div class="meta">이 달 완료된 시공이 없습니다.</div>`}
    </div>`;
}

// ── 상단 KPI ────────────────────────────────────────────────────────────────
function renderKpis(data) {
  const { months, totals, kwByMonth, done } = data;
  const thisMonthCount = totals[totals.length - 1];
  const thisMonthKw = kwByMonth[kwByMonth.length - 1];
  const allTimeCount = done.length;
  const items = [
    ["이번달 완료", `${thisMonthCount}건`],
    ["이번달 완료 용량", kwDisplay(thisMonthKw)],
    ["최근 12개월 완료", `${totals.reduce((a, b) => a + b, 0)}건`],
    ["누적 전체 완료", `${allTimeCount}건`],
  ];
  return `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
    ${items.map(([l, v]) => `
      <div class="dash-section compact">
        <div class="label">${esc(l)}</div>
        <div class="value" style="font-size:22px">${esc(v)}</div>
      </div>`).join("")}
  </div>`;
}

// ── 렌더 ────────────────────────────────────────────────────────────────────
function render() {
  const panel = document.getElementById("statsView");
  if (!panel) return;
  const data = buildData();

  panel.innerHTML = `
    ${renderKpis(data)}
    <div class="panel" style="padding:16px;margin-bottom:14px">
      <div class="panel-title" style="display:flex;align-items:center;justify-content:space-between">
        <h2>월별 시공완료 추이 (최근 12개월)</h2>
        <button class="btn" id="statsTableToggle">${_showTable ? "그래프로 보기" : "표로 보기"}</button>
      </div>
      ${_showTable ? renderTableView(data) : renderChart(data)}
    </div>
    ${renderMonthBreakdown(data)}`;

  panel.querySelector("#statsTableToggle")?.addEventListener("click", () => { _showTable = !_showTable; render(); });
  panel.querySelector("#statsMonthSel")?.addEventListener("change", e => { _selMonth = e.target.value; render(); });

  if (!_showTable) {
    panel.querySelectorAll("[data-stats-col]").forEach(el => {
      el.addEventListener("mouseenter", () => { _hoverIdx = Number(el.dataset.statsCol); render(); });
    });
    const svg = panel.querySelector(".stats-svg");
    svg?.addEventListener("mouseleave", () => { _hoverIdx = -1; render(); });
  }
}

export function initStats() {
  on("viewChanged", ({ view }) => { if (view === "stats") render(); });
  on("stateChange", () => {
    const panel = document.getElementById("statsView");
    if (panel && !panel.classList.contains("hidden")) render();
  });
}
