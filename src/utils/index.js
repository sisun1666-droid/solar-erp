// HTML 이스케이프
export const esc = s => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

// 날짜
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
export const localDate = d => new Date(d + "T00:00:00+09:00").toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit", weekday: "short" });

// ID 생성
export const genId = prefix => `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 8)}`;

// 간단한 토스트 알림
let _toastTimer;
export function toast(msg, duration = 2500) {
  let el = document.getElementById("_toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "_toast";
    el.style.cssText = "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1e293b;color:#fff;padding:10px 20px;border-radius:10px;font-size:14px;z-index:9999;pointer-events:none;opacity:0;transition:opacity .2s";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = "1";
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.style.opacity = "0"; }, duration);
}

// DOM 헬퍼
export const $ = sel => document.querySelector(sel);
export const $$ = sel => [...document.querySelectorAll(sel)];

// 날짜 포맷
export function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00+09:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// kW → MW 변환
export function kwDisplay(kw) {
  if (!kw) return "0kW";
  return kw >= 1000 ? `${(kw / 1000).toFixed(2)}MW` : `${kw}kW`;
}

// 상태 색상
export const STATUS_COLORS = {
  "예정":   { bg: "#e0f2fe", text: "#0369a1" },
  "시공중": { bg: "#fef9c3", text: "#854d0e" },
  "완료":   { bg: "#dcfce7", text: "#166534" },
  "지연":   { bg: "#fee2e2", text: "#991b1b" },
  "취소":   { bg: "#f1f5f9", text: "#64748b" },
  "할 일":  { bg: "#e0f2fe", text: "#0369a1" },
  "진행중": { bg: "#fef9c3", text: "#854d0e" },
  "백로그": { bg: "#f1f5f9", text: "#64748b" },
};
