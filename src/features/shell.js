import { getState, on } from "../store/index.js";
import { esc, $ } from "../utils/index.js";
import { goTo } from "../router.js";

// ── 다크모드 ─────────────────────────────────────────────────────────────
const THEME_KEY = "solar-erp-theme";

function initDarkMode() {
  if (localStorage.getItem(THEME_KEY) === "dark") document.documentElement.dataset.theme = "dark";
  $("darkModeBtn")?.addEventListener("click", () => {
    const isDark = document.documentElement.dataset.theme === "dark";
    if (isDark) { delete document.documentElement.dataset.theme; localStorage.removeItem(THEME_KEY); }
    else { document.documentElement.dataset.theme = "dark"; localStorage.setItem(THEME_KEY, "dark"); }
  });
}

// ── 마스킹 모드 ──────────────────────────────────────────────────────────
function initMasking() {
  $("maskToggleBtn")?.addEventListener("click", () => {
    document.body.classList.toggle("masking-mode");
    const active = document.body.classList.contains("masking-mode");
    const el = $("maskToggleBtn");
    if (el) el.textContent = active ? "마스킹 ON" : "마스킹 OFF";
  });
}

// ── 관리자 바로가기 ──────────────────────────────────────────────────────
function initAdminShortcut() {
  $("adminTopBtn")?.addEventListener("click", () => goTo("admin"));
}

// ── 오프라인 배너 ────────────────────────────────────────────────────────
function initOfflineBanner() {
  const update = () => $("offlineBanner")?.classList.toggle("hidden", navigator.onLine);
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
}

// ── 동기화 상태 표시 ─────────────────────────────────────────────────────
function initSyncStatus() {
  const el = $("syncStatus");
  if (!el) return;
  on("saveStart",    () => { el.textContent = "저장 중..."; });
  on("saveComplete", () => { el.textContent = "저장됨"; });
  on("syncComplete", () => { el.textContent = "동기화됨"; });
}

// ── 모바일 사이드바 ──────────────────────────────────────────────────────
function initMobileNav() {
  const sidebar = $("sidebar");
  const overlay = $("sidebarOverlay");
  const open  = () => { sidebar?.classList.add("mobile-open"); overlay?.classList.add("show"); };
  const close = () => { sidebar?.classList.remove("mobile-open"); overlay?.classList.remove("show"); };

  $("mobileMenuBtn")?.addEventListener("click", open);
  overlay?.addEventListener("click", close);
  sidebar?.querySelectorAll("[data-nav]").forEach(a => a.addEventListener("click", close));
}

// ── 전역 검색 ────────────────────────────────────────────────────────────
const SEARCH_SOURCES = [
  { table: "todos",        view: "todos",        fields: c => [c.title, c.owner] },
  { table: "assignments",  view: "assignment",   fields: c => [c.title, c.owner] },
  { table: "construction", view: "construction", fields: c => [c.site, c.company, c.owner] },
  { table: "projects",     view: "db",           fields: c => [c.name, c.owner] },
  { table: "meetings",     view: "meetings",     fields: c => [c.title, c.host] },
];

function runSearch(q) {
  const resEl = $("searchResults");
  if (!resEl) return;
  const query = q.trim().toLowerCase();
  if (!query) { resEl.innerHTML = ""; return; }

  const st = getState();
  const hits = [];
  for (const src of SEARCH_SOURCES) {
    for (const item of st[src.table] || []) {
      const text = src.fields(item).filter(Boolean).join(" ").toLowerCase();
      if (text.includes(query)) hits.push({ view: src.view, label: src.fields(item).filter(Boolean).join(" · ") || "(제목 없음)" });
      if (hits.length >= 30) break;
    }
    if (hits.length >= 30) break;
  }

  resEl.innerHTML = hits.length
    ? hits.map(h => `<button class="search-result-item" data-search-goto="${h.view}">${esc(h.label)}</button>`).join("")
    : `<div class="meta" style="padding:10px">검색 결과가 없습니다.</div>`;

  resEl.querySelectorAll("[data-search-goto]").forEach(btn =>
    btn.addEventListener("click", () => { goTo(btn.dataset.searchGoto); closeSearch(); })
  );
}

function openSearch() {
  $("searchOverlay")?.classList.remove("hidden");
  $("searchInput")?.focus();
}
function closeSearch() {
  $("searchOverlay")?.classList.add("hidden");
  const input = $("searchInput"); if (input) input.value = "";
  const res = $("searchResults"); if (res) res.innerHTML = "";
}

function initSearch() {
  $("searchBtn")?.addEventListener("click", openSearch);
  $("searchInput")?.addEventListener("input", e => runSearch(e.target.value));
  $("searchOverlay")?.addEventListener("click", e => { if (e.target.id === "searchOverlay") closeSearch(); });
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); openSearch(); }
    if (e.key === "Escape") closeSearch();
  });
}

export function initShell() {
  initDarkMode();
  initMasking();
  initAdminShortcut();
  initOfflineBanner();
  initSyncStatus();
  initMobileNav();
  initSearch();
}
