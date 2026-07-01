import { getState, setState, on } from "../store/index.js";
import { esc, $ } from "../utils/index.js";

const SESSION_KEY = "solar-erp-session-v1";

function populateNames() {
  const sel = $("staffLoginName");
  if (!sel) return;
  const people = getState().people || [];
  sel.innerHTML = `<option value="">직원 선택</option>` +
    people.map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join("");
}

function showGate() {
  document.body.classList.add("auth-pending");
  $("authGate")?.classList.remove("hidden");
}

function hideGate() {
  document.body.classList.remove("auth-pending");
  $("authGate")?.classList.add("hidden");
}

function tryLogin() {
  const name = $("staffLoginName")?.value || "";
  const pin  = $("staffLoginPin")?.value  || "";
  const st = getState();
  const person = (st.people || []).find(p => p.name === name);
  const viaPerson = !!(person && pin && person.pin === pin);
  const viaAdmin  = !!(pin && pin === st.adminPin);

  if (!viaPerson && !viaAdmin) {
    const msg = $("authMessage");
    if (msg) msg.textContent = "이름 또는 PIN이 올바르지 않습니다.";
    return;
  }
  const loginName = viaPerson ? name : (name || "관리자");
  localStorage.setItem(SESSION_KEY, JSON.stringify({ name: loginName }));
  setState({ currentUser: loginName });
  const pinEl = $("staffLoginPin"); if (pinEl) pinEl.value = "";
  const msg = $("authMessage"); if (msg) msg.textContent = "";
  hideGate();
}

function logout() {
  localStorage.removeItem(SESSION_KEY);
  hideGate(); // 아래서 바로 showGate()로 다시 켬 — select 초기화 후 게이트 표시
  const sel = $("staffLoginName"); if (sel) sel.value = "";
  showGate();
}

export function initAuth() {
  populateNames();
  on("stateChange", populateNames);

  let session = null;
  try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch {}

  if (session?.name) hideGate();
  else showGate();

  $("staffLoginBtn")?.addEventListener("click", tryLogin);
  $("staffLoginPin")?.addEventListener("keydown", e => { if (e.key === "Enter") tryLogin(); });
  $("logoutBtn")?.addEventListener("click", logout);
}
