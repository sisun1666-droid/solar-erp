import { getState, setState, on } from "../store/index.js";
import { toast } from "../utils/index.js";

// ponytail: 클라이언트 시크릿 없이(콘솔에서 비활성화) 프론트엔드 단독으로 처리 — 서버가 없는 정적 사이트라 시크릿을 숨길 곳이 없음
const REST_KEY = "028a04dc3ea9bf8a6e7c96df6ee0c232";

function redirectUri() { return location.origin + location.pathname; }

// ── 토큰 관리 ─────────────────────────────────────────────────────────────
export function isConnected() { return !!getState().kakaoRefreshToken; }

function saveTokens(data) {
  setState({
    kakaoAccessToken:  data.access_token,
    kakaoRefreshToken: data.refresh_token || getState().kakaoRefreshToken,
    kakaoTokenExpiry:  Date.now() + (data.expires_in - 60) * 1000,
  });
  updateUI();
}

export function disconnectKakao() {
  setState({ kakaoAccessToken: "", kakaoRefreshToken: "", kakaoTokenExpiry: 0 });
  updateUI();
}

export function startKakaoLogin() {
  const url = `https://kauth.kakao.com/oauth/authorize?client_id=${REST_KEY}`
    + `&redirect_uri=${encodeURIComponent(redirectUri())}&response_type=code&scope=talk_message`;
  location.href = url;
}

async function tokenRequest(params) {
  const res = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || "카카오 인증 실패");
  return data;
}

async function refreshAccessToken() {
  const st = getState();
  if (!st.kakaoRefreshToken) return false;
  try {
    saveTokens(await tokenRequest({
      grant_type: "refresh_token", client_id: REST_KEY, refresh_token: st.kakaoRefreshToken,
    }));
    return true;
  } catch {
    disconnectKakao();
    return false;
  }
}

async function getValidAccessToken() {
  const st = getState();
  if (!st.kakaoRefreshToken) return null;
  if (st.kakaoAccessToken && st.kakaoTokenExpiry > Date.now()) return st.kakaoAccessToken;
  return (await refreshAccessToken()) ? getState().kakaoAccessToken : null;
}

// ── 메시지 발송 ("나에게 보내기") ────────────────────────────────────────────
export async function sendKakaoMemo(text) {
  const token = await getValidAccessToken();
  if (!token) return false;
  const res = await fetch("https://kapi.kakao.com/v2/api/talk/memo/default/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      template_object: JSON.stringify({
        object_type: "text", text,
        link: { web_url: redirectUri(), mobile_web_url: redirectUri() },
      }),
    }),
  });
  return res.ok;
}

// ── 시작일 하루 전 알림 ───────────────────────────────────────────────────────
// ponytail: 정적 사이트라 진짜 크론이 없음 — 그 날 사이트를 한 번은 열어야 발송됨. 서버 크론 필요해지면 그때 옮길 것.
function checkTomorrowStarts() {
  const st = getState();
  if (!isConnected()) return;
  const todayStr = new Date().toISOString().slice(0, 10);
  if (st.kakaoLastCheckedDate === todayStr) return;
  setState({ kakaoLastCheckedDate: todayStr }, { silent: true });

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  const items = (st.construction || []).filter(c => c.start === tomorrowStr);
  if (!items.length) return;

  const text = `[내일 시공 시작]\n` + items.map(c => `- ${c.site} · ${c.company} · ${c.kw}kW`).join("\n");
  sendKakaoMemo(text);
}

// ── UI 업데이트 ───────────────────────────────────────────────────────────
function updateUI() {
  document.querySelectorAll("[data-kakao-status]").forEach(el => {
    el.textContent = isConnected() ? "💬 연결됨 ✓" : "💬 카카오 연결";
    el.dataset.connected = isConnected() ? "1" : "";
  });
}

// ── 초기화 ───────────────────────────────────────────────────────────────
export function initKakao() {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  if (code) {
    tokenRequest({ grant_type: "authorization_code", client_id: REST_KEY, redirect_uri: redirectUri(), code })
      .then(data => { saveTokens(data); toast("카카오 알림 연결 완료"); })
      .catch(e => toast("카카오 연결 실패: " + e.message))
      .finally(() => {
        params.delete("code"); params.delete("state");
        const clean = location.pathname + (params.toString() ? "?" + params : "") + location.hash;
        history.replaceState(null, "", clean);
      });
  }
  updateUI();
  on("syncComplete", checkTomorrowStarts);
  checkTomorrowStarts();
}
