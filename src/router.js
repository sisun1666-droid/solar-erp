import { emit, on } from "./store/index.js";

const VIEWS = [
  "dashboard", "todos", "messages", "reports", "meetings",
  "construction", "assignment", "db", "projects", "mw",
  "inspection", "knowledge", "admin",
];

let _current = "dashboard";

export function currentView() { return _current; }

export function goTo(view) {
  if (!VIEWS.includes(view)) return;
  const prev = _current;
  _current = view;
  localStorage.setItem("solar-erp-view", view);

  // 모든 패널 숨김
  document.querySelectorAll("[data-view]").forEach(el => {
    el.classList.toggle("hidden", el.dataset.view !== view);
  });

  // 네비 하이라이트
  document.querySelectorAll("[data-nav]").forEach(el => {
    el.classList.toggle("active", el.dataset.nav === view);
  });

  emit("viewChanged", { view, prev });
}

export function initRouter() {
  // 저장된 뷰 복원
  const saved = localStorage.getItem("solar-erp-view");
  if (saved && VIEWS.includes(saved)) _current = saved;

  // 네비 클릭 이벤트 (이벤트 위임)
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-nav]");
    if (el) { e.preventDefault(); goTo(el.dataset.nav); }
  });

  // 초기 뷰 설정
  goTo(_current);
}
