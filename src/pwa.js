// PWA 초기화 진입점
export function initPwa() {
  // serviceWorker 미지원 브라우저는 무시
  if ("serviceWorker" in navigator) {
    // 등록 실패해도 앱은 SW 없이 계속 동작해야 하므로 에러를 무시
    // sw.js는 BASE_URL 기준 경로
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  }
}
