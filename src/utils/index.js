// HTML 이스케이프
export const esc = s => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

// 날짜
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
// 완료 시각 기록용 - "YYYY-MM-DDTHH:MM" (분까지, 로컬 시각)
export const nowStamp = () => { const d = new Date(); return `${today()}T${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };
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

// DOM 헬퍼 (feature 파일들이 실제로 쓰는 건 id 기반 조회라 이 시그니처로 통일)
export const $ = id => document.getElementById(id);
export const $$ = sel => [...document.querySelectorAll(sel)];

// 검색창 입력 핸들러 — 매 키 입력마다 전체 재렌더가 돌면 한글 조합(IME) 중인
// input이 통째로 재생성되어 타자가 끊기므로, 조합이 끝난 시점에만 실행하고
// 재렌더로 새로 생긴 입력창에 포커스·커서를 되돌려준다.
export function onSearchInput(el, fn) {
  if (!el) return;
  const id = el.id;
  const handler = e => {
    fn(e);
    if (!id) return;
    const fresh = document.getElementById(id);
    if (fresh) { fresh.focus(); const len = fresh.value.length; fresh.setSelectionRange(len, len); }
  };
  el.addEventListener("input", e => { if (!e.isComposing) handler(e); });
  el.addEventListener("compositionend", handler);
}

// kW → MW 변환
export function kwDisplay(kw) {
  if (!kw) return "0kW";
  return kw >= 1000 ? `${(kw / 1000).toFixed(2)}MW` : `${kw}kW`;
}
