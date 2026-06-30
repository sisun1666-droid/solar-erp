/**
 * 나머지 뷰: 회의록, 프로젝트DB, 메시지, 보고서, MW, 구조물검수
 * 공통 패턴: on("viewChanged") → 뷰 진입 시 render()
 */
import { getState, setState, markDeleted, on } from "../store/index.js";
import { genId, today, esc, toast } from "../utils/index.js";

// ── 공통 유틸 ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function statusBadge(s, cls = "") {
  return `<span class="badge ${cls}">${esc(s)}</span>`;
}

function ifVisible(viewId, fn) {
  const el = $(viewId);
  if (el && !el.classList.contains("hidden")) fn(el);
}

// ────────────────────────────────────────────────────────────────────────────
// 회의록 (meetings)
// ────────────────────────────────────────────────────────────────────────────
let _editMeeting = null;

function normMeeting(m) {
  if (!m.id) m.id = genId("meeting");
  if (!m.date) m.date = today();
  if (!m.title) m.title = "회의 제목";
  if (!m.attendees) m.attendees = [];
  return m;
}

function renderMeetings() {
  const panel = $("meetingsView");
  if (!panel) return;
  const st = getState();
  const meetings = [...(st.meetings || [])].sort((a, b) => b.date?.localeCompare(a.date || "") || 0);

  panel.innerHTML = `
    <div class="toolbar" style="margin-bottom:12px">
      <h1 style="margin:0;font-size:20px;font-weight:700">회의록</h1>
      <button class="btn primary" id="meetingAddBtn">+ 회의록 추가</button>
    </div>
    <div class="stack">
      ${meetings.length ? meetings.map((m, i) => `
        <div class="card">
          <div class="card-top">
            <span class="name">${esc(m.title)}</span>
            <span class="badge blue">${esc(m.type || "일반회의")}</span>
          </div>
          <div class="meta">${esc(m.date)} ${esc(m.time || "")} · 주재: ${esc(m.host || "")} · ${esc((m.attendees || []).join(", "))}</div>
          ${m.summary ? `<div class="meta" style="margin-top:4px">${esc(m.summary.length > 80 ? m.summary.slice(0,80)+"…" : m.summary)}</div>` : ""}
          ${m.decisions?.length ? `<div class="meta" style="margin-top:4px;color:var(--teal)">결정: ${esc(m.decisions.slice(0,2).join(" / "))}</div>` : ""}
          <div class="row-actions" style="margin-top:8px">
            <button class="btn icon" data-meeting-edit="${i}">수정</button>
            <button class="btn icon danger" data-meeting-delete="${i}">삭제</button>
          </div>
        </div>`).join("")
      : `<div class="meta">등록된 회의록이 없습니다.</div>`}
    </div>`;
}

function openMeetingModal(idx = null) {
  _editMeeting = idx;
  const st = getState();
  const meetings = st.meetings || [];
  const m = idx === null
    ? { title: "", date: today(), time: "09:00", host: "", type: "일반회의", attendees: [], summary: "", decisions: [] }
    : { ...meetings[idx] };

  const types = ["일반회의", "주간회의", "현장회의", "기획회의", "검토회의"];
  const typeOpts = types.map(t => `<option${t === m.type ? " selected" : ""}>${esc(t)}</option>`).join("");

  $("todoFormGrid").innerHTML = "";  // 할일 모달 재사용 없이 직접

  // 회의록 전용 모달 없으므로 간단한 overlay 생성
  let overlay = $("meetingEditOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "meetingEditOverlay";
    overlay.className = "overlay";
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div class="modal" style="width:min(600px,100%)">
      <div class="modal-head">
        <h2>${idx === null ? "회의록 추가" : "회의록 수정"}</h2>
        <button class="btn icon" id="meetingModalClose">×</button>
      </div>
      <div class="form-grid">
        <div class="form-row full"><label>제목</label><input class="field" id="mtgTitle" value="${esc(m.title)}" placeholder="회의 제목"></div>
        <div class="form-row"><label>날짜</label><input class="field" type="date" id="mtgDate" value="${esc(m.date)}"></div>
        <div class="form-row"><label>시간</label><input class="field" type="time" id="mtgTime" value="${esc(m.time||"09:00")}"></div>
        <div class="form-row"><label>구분</label><select class="field" id="mtgType">${typeOpts}</select></div>
        <div class="form-row"><label>주재자</label><input class="field" id="mtgHost" value="${esc(m.host||"")}"></div>
        <div class="form-row full"><label>참석자 (쉼표 구분)</label><input class="field" id="mtgAttendees" value="${esc((m.attendees||[]).join(", "))}"></div>
        <div class="form-row full"><label>회의 요약</label><textarea class="field" id="mtgSummary">${esc(m.summary||"")}</textarea></div>
        <div class="form-row full"><label>결정사항 (줄바꿈 구분)</label><textarea class="field" id="mtgDecisions">${esc((m.decisions||[]).join("\n"))}</textarea></div>
      </div>
      <div class="toolbar" style="margin-top:14px">
        <button class="btn primary" id="mtgSaveBtn">저장</button>
        ${idx !== null ? `<button class="btn danger" id="mtgDeleteBtn">삭제</button>` : ""}
      </div>
    </div>`;
  overlay.classList.remove("hidden");
  overlay.classList.add("open");

  $("meetingModalClose")?.addEventListener("click", closeMeetingModal);
  $("mtgSaveBtn")?.addEventListener("click", saveMeeting);
  $("mtgDeleteBtn")?.addEventListener("click", () => deleteMeeting(idx));
  overlay.addEventListener("click", e => { if (e.target === overlay) closeMeetingModal(); });
}

function closeMeetingModal() {
  const o = $("meetingEditOverlay");
  o?.classList.remove("open");
  o?.classList.add("hidden");
}

function saveMeeting() {
  const st = getState();
  const meetings = [...(st.meetings || [])];
  const m = normMeeting({
    title:     $("mtgTitle")?.value || "회의 제목",
    date:      $("mtgDate")?.value  || today(),
    time:      $("mtgTime")?.value  || "09:00",
    type:      $("mtgType")?.value  || "일반회의",
    host:      $("mtgHost")?.value  || "",
    attendees: ($("mtgAttendees")?.value || "").split(",").map(s => s.trim()).filter(Boolean),
    summary:   $("mtgSummary")?.value || "",
    decisions: ($("mtgDecisions")?.value || "").split("\n").map(s => s.trim()).filter(Boolean),
  });
  if (_editMeeting !== null) {
    m.id = meetings[_editMeeting].id;
    meetings[_editMeeting] = m;
  } else {
    meetings.unshift(m);
  }
  setState({ meetings });
  closeMeetingModal();
  toast("저장됐습니다.");
  renderMeetings();
}

function deleteMeeting(idx) {
  if (!confirm("이 회의록을 삭제할까요?")) return;
  const st = getState();
  const meetings = [...(st.meetings || [])];
  const m = meetings[idx];
  if (m?.id) markDeleted("meetings", m.id);
  meetings.splice(idx, 1);
  setState({ meetings });
  closeMeetingModal();
  toast("삭제됐습니다.");
  renderMeetings();
}

// ────────────────────────────────────────────────────────────────────────────
// 프로젝트 DB (현장·공무 진행표)
// ────────────────────────────────────────────────────────────────────────────
let _editProject = null;
let _projSearch  = "";
let _projPhase   = "전체";
let _projSortKey = "";
let _projSortDir = "asc";

function normProject(p) {
  if (!p.id)    p.id    = genId("project");
  if (!p.phase) p.phase = "고객상담";
  if (!p.due)   p.due   = today();
  return p;
}

function renderProjects() {
  const panel = $("dbView") || $("projectsView");
  if (!panel) return;
  renderProjectTable(panel);
}

function renderProjectTable(panel) {
  const st = getState();
  const phases = ["전체", ...(st.phases || [])];
  const phaseOpts = phases.map(p => `<option${p === _projPhase ? " selected" : ""}>${esc(p)}</option>`).join("");

  const rows = (st.projects || [])
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => {
      if (_projPhase !== "전체" && p.phase !== _projPhase) return false;
      if (_projSearch) {
        const hay = Object.values(p).join(" ").toLowerCase();
        if (!hay.includes(_projSearch.toLowerCase())) return false;
      }
      return true;
    });

  function sortHead(key, label) {
    const mark = _projSortKey === key ? (_projSortDir === "asc" ? " ▲" : " ▼") : "";
    return `<button class="sort-head" data-proj-sort="${key}">${esc(label)}${mark}</button>`;
  }

  panel.innerHTML = `
    <div class="toolbar" style="margin-bottom:12px">
      <input class="search" id="projSearch" placeholder="고객/현장 검색" value="${esc(_projSearch)}" style="max-width:240px">
      <select class="field" id="projPhase" style="max-width:150px">${phaseOpts}</select>
      <button class="btn primary" id="projAddBtn">현장 추가</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th style="width:20%">${sortHead("name","고객/현장")}</th>
          <th style="width:14%">${sortHead("phase","업무단계")}</th>
          <th style="width:12%">${sortHead("owner","담당")}</th>
          <th style="width:13%">${sortHead("due","마감일")}</th>
          <th style="width:13%">${sortHead("status","상태")}</th>
          <th>다음 액션</th>
          <th style="width:70px">관리</th>
        </tr></thead>
        <tbody>
          ${rows.map(({ p, i }) => `<tr>
            <td title="${esc(p.name)}">${esc(p.name)}</td>
            <td>${esc(p.phase)}</td>
            <td>${esc(p.owner)}</td>
            <td>${esc(p.due)}</td>
            <td>${statusBadge(p.status)}</td>
            <td title="${esc(p.next)}">${esc((p.next||"").length>40?p.next.slice(0,40)+"…":p.next)}</td>
            <td><button class="btn icon" data-proj-edit="${i}">수정</button></td>
          </tr>`).join("")}
          ${rows.length === 0 ? `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">현장이 없습니다.</td></tr>` : ""}
        </tbody>
      </table>
    </div>`;

  panel.querySelector("#projSearch")?.addEventListener("input", e => {
    _projSearch = e.target.value; renderProjectTable(panel);
  });
  panel.querySelector("#projPhase")?.addEventListener("change", e => {
    _projPhase = e.target.value; renderProjectTable(panel);
  });
}

function openProjectModal(idx = null) {
  _editProject = idx;
  const st = getState();
  const p = idx === null
    ? { name: "", phase: (st.phases||[])[0]||"고객상담", owner: "", due: today(), status: "정상", next: "" }
    : { ...(st.projects[idx]) };

  const phaseOpts = (st.phases || []).map(x => `<option${x === p.phase ? " selected" : ""}>${esc(x)}</option>`).join("");
  const statOpts  = (st.statuses || ["정상","대기","보완","지연","완료"]).map(s =>
    `<option${s === p.status ? " selected" : ""}>${esc(s)}</option>`).join("");

  let overlay = $("projectEditOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "projectEditOverlay";
    overlay.className = "overlay";
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <h2>${idx === null ? "현장 추가" : "현장 수정"}</h2>
        <button class="btn icon" id="projModalClose">×</button>
      </div>
      <div class="form-grid">
        <div class="form-row full"><label>고객/현장명</label><input class="field" id="projName" value="${esc(p.name)}" placeholder="현장명"></div>
        <div class="form-row"><label>업무단계</label><select class="field" id="projPhaseModal">${phaseOpts}</select></div>
        <div class="form-row"><label>담당자</label><input class="field" id="projOwner" value="${esc(p.owner||"")}"></div>
        <div class="form-row"><label>마감일</label><input class="field" type="date" id="projDue" value="${esc(p.due)}"></div>
        <div class="form-row"><label>상태</label><select class="field" id="projStatus">${statOpts}</select></div>
        <div class="form-row full"><label>다음 액션</label><textarea class="field" id="projNext">${esc(p.next||"")}</textarea></div>
      </div>
      <div class="toolbar" style="margin-top:14px">
        <button class="btn primary" id="projSaveBtn">저장</button>
        ${idx !== null ? `<button class="btn danger" id="projDeleteBtn">삭제</button>` : ""}
      </div>
    </div>`;
  overlay.classList.remove("hidden");
  overlay.classList.add("open");

  $("projModalClose")?.addEventListener("click", () => { overlay.classList.remove("open"); overlay.classList.add("hidden"); });
  $("projSaveBtn")?.addEventListener("click", saveProject);
  $("projDeleteBtn")?.addEventListener("click", () => deleteProject(idx));
  overlay.addEventListener("click", e => { if (e.target === overlay) { overlay.classList.remove("open"); overlay.classList.add("hidden"); } });
}

function saveProject() {
  const st = getState();
  const projects = [...(st.projects || [])];
  const p = normProject({
    name:  $("projName")?.value || "",
    phase: $("projPhaseModal")?.value || "",
    owner: $("projOwner")?.value || "",
    due:   $("projDue")?.value || today(),
    status:$("projStatus")?.value || "정상",
    next:  $("projNext")?.value || "",
  });
  if (_editProject !== null) {
    p.id = projects[_editProject].id;
    projects[_editProject] = p;
  } else {
    projects.unshift(p);
  }
  setState({ projects });
  const o = $("projectEditOverlay");
  o?.classList.remove("open"); o?.classList.add("hidden");
  toast("저장됐습니다.");
  renderProjects();
}

function deleteProject(idx) {
  if (!confirm("이 현장을 삭제할까요?")) return;
  const st = getState();
  const projects = [...(st.projects || [])];
  if (projects[idx]?.id) markDeleted("projects", projects[idx].id);
  projects.splice(idx, 1);
  setState({ projects });
  const o = $("projectEditOverlay");
  o?.classList.remove("open"); o?.classList.add("hidden");
  toast("삭제됐습니다.");
  renderProjects();
}

// ────────────────────────────────────────────────────────────────────────────
// 메시지 (민원 자동분류 + 답변초안)
// ────────────────────────────────────────────────────────────────────────────
const MSG_CATS = [
  { type:"안전·긴급", badge:"red",   keys:["긴급","위험","화재","누전","감전","정전","사고","파손","연기","탄냄새","침수","낙뢰"], reply:"안전과 직결될 수 있는 내용이라 우선 확인하겠습니다. 설비 주변 접근은 잠시 피하시고, 차단기·인버터 화면·현장 상태 사진을 보내주시면 1차로 위험 여부를 확인하겠습니다." },
  { type:"누수 A/S",   badge:"amber", keys:["누수","물이새","물 새","빗물","방수","지붕","물떨어","샘","새는"], reply:"누수 위치, 물이 떨어지는 지점, 구조물 주변 사진을 보내주시면 담당자가 1차 확인 후 보수 범위와 가능한 일정을 조율해 안내드리겠습니다." },
  { type:"인버터 A/S", badge:"amber", keys:["인버터","에러","오류","알람","발전량","발전 안","정지","접속반","차단기","전압","통신"], reply:"인버터 화면, 에러코드, 차단기 상태, 발생 시간을 사진으로 보내주시면 원격 확인 후 방문 필요 여부와 일정을 안내드리겠습니다." },
  { type:"축사 보강",  badge:"blue",  keys:["축사","보강","추가보강","처짐","흔들","보강재","브라켓","구조보강"], reply:"보강이 필요한 위치 사진, 전체 지붕 사진, 요청 범위를 보내주시면 담당자가 검토 후 작업 방향과 일정을 안내드리겠습니다." },
  { type:"기타 A/S",   badge:"amber", keys:["하자","as","a/s","고장","불량","소음","파손","문제","이상","봐줘","확인요청"], reply:"증상과 위치가 보이도록 사진 또는 짧은 영상을 보내주시면 담당자가 1차 확인 후 조치 방향과 가능한 일정을 안내드리겠습니다." },
  { type:"일정 문의",  badge:"blue",  keys:["언제","일정","방문","착공","준공","공사","시공","완료","도착","몇시","늦","지연"], reply:"현재 현장 진행상황, 담당자 일정, 자재 및 날씨 여건을 함께 확인한 뒤 가능한 일정으로 안내드리겠습니다." },
  { type:"서류/인허가",badge:"green", keys:["서류","계약서","도면","인허가","허가","한전","ppa","접수","신청","사용전검사"], reply:"필요한 서류명, 제출처, 희망 기한을 알려주시면 현재 준비 상태와 누락 여부를 확인해 처리 방향을 안내드리겠습니다." },
  { type:"비용/정산",  badge:"amber", keys:["견적","금액","비용","입금","정산","세금계산서","미수","잔금","추가비"], reply:"계약 기준, 추가 발생 항목, 입금/세금계산서 상태를 확인한 뒤 안내드리겠습니다." },
  { type:"불만 민원",  badge:"red",   keys:["불만","항의","민원","짜증","화남","책임","약속","연락없","연락 안","왜 이렇게"], reply:"불편을 드려 죄송합니다. 발생 내용과 원하시는 조치 방향을 정리해 주시면, 현장 상황 확인 후 처리 방향을 안내드리겠습니다." },
];

function analyzeMsg(text) {
  const low = String(text || "").toLowerCase();
  const scored = MSG_CATS.map(c => ({ c, s: c.keys.reduce((n, k) => n + (low.includes(k) ? 1 : 0), 0) })).sort((a, b) => b.s - a.s);
  const best = scored[0]?.s ? scored[0].c : { type:"일반 문의", badge:"blue", reply:"문의 내용 확인했습니다. 담당자가 검토한 뒤 처리 방향을 안내드리겠습니다." };
  const urgent = /오늘|즉시|빨리|급|당장/.test(text);
  const acts = [];
  if (urgent) acts.push("담당자 즉시 확인");
  if (/하자|고장|불량|누수|에러|인버터|발전량|사진|축사|처짐|흔들/.test(text)) acts.push("현장·증상 사진 요청");
  if (/일정|언제|방문|공사|시공|착공|준공/.test(text)) acts.push("방문·처리 일정 확인");
  if (/비용|견적|입금|정산|계산서|미수|잔금/.test(text)) acts.push("금액·계약 기준 확인");
  if (/서류|허가|한전|ppa|사용전검사/.test(low)) acts.push("서류 진행상태 확인");
  if (!acts.length) acts.push("담당자 내용 검토");
  return { type: best.type, badge: best.badge, urgency: urgent ? "긴급" : "보통", reply: best.reply, actions: [...new Set(acts)] };
}

function buildMsgReply(sender, site, tone, a) {
  const hello = tone === "간단" ? "안녕하세요." : `안녕하세요, ${sender}님.`;
  const lines = [hello];
  if (site) lines.push(`현장: ${site}`);
  lines.push("", `[${a.type} 접수 안내]`, a.reply, "", "확인 요청 사항");
  a.actions.forEach((x, i) => lines.push(`${i + 1}. ${x}`));
  lines.push("");
  if (tone === "강한사과") {
    lines.push("불편을 드린 점 다시 한번 죄송합니다.", "내부 확인 후 처리 방향을 최대한 빠르게 안내드리겠습니다.");
  } else {
    lines.push("확인 후 가능한 처리 방향을 안내드리겠습니다.");
  }
  return lines.join("\n");
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); }
  catch { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
  toast("복사했습니다.");
}

function getMsgForm() {
  return {
    sender:   ($("msgSender")?.value || "").trim(),
    site:     ($("msgSite")?.value   || "").trim(),
    tone:     $("msgTone")?.value    || "기본",
    incoming: ($("msgIncoming")?.value || "").trim(),
  };
}

function updateMsgPreview() {
  const { sender, site, tone, incoming } = getMsgForm();
  const a = analyzeMsg(incoming);
  const reply = buildMsgReply(sender || "고객", site, tone, a);
  const badge = $("msgTypeBadge");
  if (badge) { badge.className = `badge ${a.badge}`; badge.textContent = a.type; }
  const urgEl = $("msgUrgency"); if (urgEl) urgEl.textContent = a.urgency;
  const actEl = $("msgAction");  if (actEl) actEl.textContent = a.actions[0] || "";
  const outEl = $("msgOutput");  if (outEl) outEl.textContent = reply;
}

function saveMsgFromForm() {
  const { sender, site, tone, incoming } = getMsgForm();
  if (!incoming) { toast("메시지 내용을 먼저 입력하세요."); return; }
  const a = analyzeMsg(incoming);
  const reply = buildMsgReply(sender || "고객", site, tone, a);
  const msgs = [
    { id: genId("msg"), date: today(), time: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
      sender: sender || "고객", site, incoming, reply,
      type: a.type, badge: a.badge, urgency: a.urgency, actions: a.actions, status: "대기" },
    ...(getState().messages || []),
  ];
  setState({ messages: msgs });
  toast("접수 저장됐습니다.");
  renderMessages();
}

function renderMessages() {
  const el = $("messagesView");
  if (!el) return;
  const msgs = (getState().messages || []).slice(0, 30);

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:400px minmax(0,1fr);gap:14px;align-items:start">
      <div class="panel" style="display:grid;gap:10px;padding:16px">
        <div class="panel-title"><h2>메시지 자동응답</h2><button class="btn primary" id="msgSaveBtn">접수 저장</button></div>
        <input class="field" id="msgSender" placeholder="고객명 또는 업체명">
        <input class="field" id="msgSite"   placeholder="현장/발전소명">
        <select class="field" id="msgTone">
          <option value="기본">기본 응대</option>
          <option value="간단">간단 답변</option>
          <option value="강한사과">불만/사과 강조</option>
        </select>
        <textarea class="field" id="msgIncoming" placeholder="고객 민원, 카톡, 문자 내용을 붙여넣으세요." style="min-height:160px"></textarea>
        <div style="display:flex;gap:8px">
          <button class="btn" id="msgClearBtn">비우기</button>
          <button class="btn primary" id="msgCopyBtn">답변 복사</button>
        </div>
      </div>
      <div style="display:grid;gap:12px">
        <div class="panel" style="padding:16px">
          <div class="panel-title"><h2>자동 인식 결과</h2><span class="badge blue" id="msgTypeBadge">대기중</span></div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0">
            <div class="kpi compact"><div class="label">긴급도</div><div class="value" id="msgUrgency">-</div></div>
            <div class="kpi compact"><div class="label">필요 조치</div><div class="value" style="font-size:13px" id="msgAction">-</div></div>
            <div class="kpi compact"><div class="label">저장 건수</div><div class="value">${msgs.length}</div></div>
          </div>
          <div class="label" style="margin-bottom:6px">답변 초안</div>
          <div id="msgOutput" style="border:1px solid #cfe3d8;background:#f7fffb;border-radius:8px;padding:14px;white-space:pre-wrap;line-height:1.7;font-size:13px;min-height:100px;color:var(--muted)">메시지를 입력하면 답변 초안이 여기에 표시됩니다.</div>
        </div>
        <div class="panel" style="padding:16px">
          <div class="panel-title"><h2>접수 이력</h2><span class="meta">최근 30건</span></div>
          <div style="display:grid;gap:8px;margin-top:8px">
            ${msgs.length ? msgs.map((m, i) => `
              <div style="display:grid;grid-template-columns:110px 1fr 80px auto;gap:8px;align-items:center;border:1px solid var(--line);border-radius:8px;padding:10px;background:#fff">
                <span class="badge ${esc(m.badge || "blue")}">${esc(m.type || "일반")}</span>
                <div>
                  <strong style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.sender)}${m.site ? ` · ${esc(m.site)}` : ""}</strong>
                  <p style="margin:3px 0 0;color:var(--muted);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.incoming)}</p>
                </div>
                <span class="badge ${m.status === "완료" ? "green" : "amber"}">${esc(m.status || "대기")}</span>
                <div style="display:flex;gap:4px">
                  <button class="btn icon" data-msg-copy="${i}">복사</button>
                  <button class="btn icon" data-msg-done="${i}">완료</button>
                  <button class="btn icon danger" data-msg-del="${i}">삭제</button>
                </div>
              </div>`).join("")
            : `<div class="meta">저장된 메시지가 없습니다.</div>`}
          </div>
        </div>
      </div>
    </div>`;

  $("msgSaveBtn")?.addEventListener("click", saveMsgFromForm);
  $("msgClearBtn")?.addEventListener("click", () => {
    ["msgSender","msgSite","msgIncoming"].forEach(id => { const e = $(id); if (e) e.value = ""; });
    updateMsgPreview();
  });
  $("msgCopyBtn")?.addEventListener("click", () => copyText($("msgOutput")?.textContent || ""));

  el.querySelectorAll("[data-msg-copy]").forEach(btn =>
    btn.addEventListener("click", () => copyText(getState().messages[Number(btn.dataset.msgCopy)]?.reply || ""))
  );
  el.querySelectorAll("[data-msg-done]").forEach(btn =>
    btn.addEventListener("click", () => {
      const msgs2 = [...(getState().messages || [])];
      if (msgs2[Number(btn.dataset.msgDone)]) { msgs2[Number(btn.dataset.msgDone)] = { ...msgs2[Number(btn.dataset.msgDone)], status: "완료" }; setState({ messages: msgs2 }); renderMessages(); }
    })
  );
  el.querySelectorAll("[data-msg-del]").forEach(btn =>
    btn.addEventListener("click", () => {
      if (!confirm("이 메시지 이력을 삭제할까요?")) return;
      const i = Number(btn.dataset.msgDel);
      const msgs2 = [...(getState().messages || [])];
      if (msgs2[i]?.id) markDeleted("messages", msgs2[i].id);
      msgs2.splice(i, 1);
      setState({ messages: msgs2 });
      renderMessages();
    })
  );

  ["msgSender","msgSite","msgIncoming"].forEach(id =>
    $(id)?.addEventListener("input", updateMsgPreview)
  );
  $("msgTone")?.addEventListener("change", updateMsgPreview);
}

// ────────────────────────────────────────────────────────────────────────────
// 보고서 (A/S · 시공월별보고서 · 기타)
// ────────────────────────────────────────────────────────────────────────────
let _reportTab = "as";
let _beforePhotos = [], _afterPhotos = [], _genericPhotos = [];
let _reportMonth = today().slice(0, 7);

function printHtml(html, title) {
  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>${title}</title>
    <style>
      body{margin:20px;font-family:"Malgun Gothic","Noto Sans KR",Arial,sans-serif;color:#111}
      @media print{body{margin:0}@page{margin:12mm}}
      table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #ccc;padding:5px 8px;font-size:12px}
      th{background:#f5f5f5;font-weight:700;text-align:center}
      h2{font-size:20px;text-align:center;margin:0 0 16px}
      .section-title{background:#f0f0f0;font-weight:700;padding:5px 8px;border-top:2px solid #333;border-bottom:1px solid #ccc;font-size:13px;margin-top:0}
      img{max-width:100%;object-fit:cover}
    </style></head><body>${html}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}

function photoDataUrl(file) {
  return new Promise(res => { const r = new FileReader(); r.onload = e => res(e.target.result); r.readAsDataURL(file); });
}

function photoSlots(photos, max = 3) {
  const slots = [...photos]; while (slots.length < max) slots.push(null);
  return slots.slice(0, max).map((src, i) =>
    src ? `<img src="${src}" style="width:100%;height:90px;object-fit:cover;display:block">`
        : `<div style="height:90px;background:#f8f8f8;display:grid;place-items:center;color:#aaa;font-size:11px">사진 없음</div>`
  ).join("");
}

function renderAsPreview() {
  const v = id => ($("as-" + id)?.value || "").trim();
  return `
    <div style="width:720px;border:1px solid #ddd;padding:16px 18px;background:#fff;font-size:13px">
      <div style="display:grid;grid-template-columns:1fr auto;align-items:center;border-bottom:3px solid #111;padding-bottom:7px;margin-bottom:12px">
        <div><div style="font-size:10px;font-weight:700;color:#555;letter-spacing:.5px">기술지원팀</div><h2 style="margin:0;font-size:18px;font-weight:900">A/S 처리완료 보고서</h2></div>
        <div style="text-align:right;font-size:11px;color:#555;line-height:1.8">
          <div>접수번호: <strong>${esc(v("no") || "-")}</strong></div>
          <div>접수일: ${esc(v("received") || "-")} / 완료일: ${esc(v("completed") || "-")}</div>
        </div>
      </div>
      <div class="section-title">고객 정보</div>
      <table style="margin-bottom:8px"><tbody>
        <tr><th style="width:80px">고객명</th><td>${esc(v("client"))}</td><th style="width:80px">연락처</th><td>${esc(v("phone"))}</td></tr>
        <tr><th>현장명</th><td>${esc(v("site"))}</td><th>주소</th><td>${esc(v("address"))}</td></tr>
        <tr><th>설비용량</th><td>${esc(v("kw"))} kW</td><th>지붕형태</th><td>${esc(v("roof"))}</td></tr>
        <tr><th>설치년도</th><td colspan="3">${esc(v("built"))}</td></tr>
      </tbody></table>
      <div class="section-title">하자 정보</div>
      <table style="margin-bottom:8px"><tbody>
        <tr><th style="width:80px">하자구분</th><td>${esc(v("defect-type"))}</td><th style="width:80px">하자부위</th><td>${esc(v("defect-area"))}</td></tr>
        <tr><th>증상</th><td colspan="3">${esc(v("symptom"))}</td></tr>
        <tr><th>원인</th><td colspan="3">${esc(v("cause"))}</td></tr>
      </tbody></table>
      <div class="section-title">처리 내역</div>
      <table style="margin-bottom:8px"><tbody>
        <tr><th style="width:80px">처리 내용</th><td colspan="3">${esc(v("action"))}</td></tr>
        <tr><th>투입 자재</th><td>${esc(v("material"))}</td><th style="width:80px">마감 상태</th><td>${esc(v("finish"))}</td></tr>
        <tr><th>고객 확인</th><td>${esc(v("customer-check"))}</td><th>특이사항</th><td>${esc(v("notice"))}</td></tr>
      </tbody></table>
      <div class="section-title">작업 사진</div>
      <table style="margin-bottom:8px"><thead><tr>
        ${["작업 전 1","작업 전 2","작업 전 3"].map(l => `<th>${l}</th>`).join("")}
        ${["작업 후 1","작업 후 2","작업 후 3"].map(l => `<th>${l}</th>`).join("")}
      </tr></thead><tbody><tr>
        ${[..._beforePhotos.slice(0,3)].concat(Array(3)).slice(0,3).map((s,i) => `<td style="padding:0">${s ? `<img src="${s}" style="width:100%;height:80px;object-fit:cover">` : `<div style="height:80px;background:#f8f8f8;text-align:center;line-height:80px;font-size:11px;color:#aaa">없음</div>`}</td>`).join("")}
        ${[..._afterPhotos.slice(0,3)].concat(Array(3)).slice(0,3).map((s,i) => `<td style="padding:0">${s ? `<img src="${s}" style="width:100%;height:80px;object-fit:cover">` : `<div style="height:80px;background:#f8f8f8;text-align:center;line-height:80px;font-size:11px;color:#aaa">없음</div>`}</td>`).join("")}
      </tr></tbody></table>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid #ddd;margin-top:12px">
        ${["작성자","검토","승인"].map(l => `<div style="height:40px;border-right:1px solid #ddd;text-align:center;padding-top:6px;font-weight:700;font-size:12px">${l}</div>`).join("")}
      </div>
    </div>`;
}

function renderMonthlyPreview() {
  const st = getState();
  const ym = _reportMonth;
  const rows = (st.construction || []).filter(c => c.start?.startsWith(ym) || c.end?.startsWith(ym) || (c.start <= ym + "-31" && c.end >= ym + "-01"));
  const totalKw = Math.round(rows.reduce((s, c) => s + (Number(c.kw) || 0), 0) * 100) / 100;
  const done = rows.filter(c => c.status === "완료").length;
  const active = rows.filter(c => c.status === "시공중").length;
  const [y, m] = ym.split("-");
  return `
    <div style="width:720px;border:1px solid #ddd;padding:20px 24px;background:#fff;font-size:12px">
      <div style="border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:10px">
        <div style="font-size:10px;font-weight:700;color:#555;letter-spacing:.5px">기술지원팀</div>
        <h2 style="margin:0;font-size:20px;font-weight:900">${y}년 ${m}월 시공 월별보고서</h2>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px">
        ${[["총 공사", rows.length + "건"], ["총 용량", totalKw + "kW"], ["완료", done + "건"], ["시공중", active + "건"]].map(([l, v]) =>
          `<div style="border:1px solid #ddd;padding:8px;text-align:center"><div style="font-size:10px;color:#555">${l}</div><div style="font-size:16px;font-weight:900;margin-top:2px">${v}</div></div>`
        ).join("")}
      </div>
      <table style="margin-bottom:12px;font-size:11.5px">
        <thead><tr>
          <th style="text-align:left">현장명</th><th>시공사</th><th>용량(kW)</th><th>공사상태</th><th>업무단계</th><th>착공</th><th>완공</th>
        </tr></thead>
        <tbody>${rows.length ? rows.map(c => `<tr>
          <td style="text-align:left">${esc(c.site || "-")}</td>
          <td>${esc(c.company || "-")}</td>
          <td style="text-align:right">${esc(c.kw || "-")}</td>
          <td>${esc(c.status || "-")}</td>
          <td>${esc(c.phase || "-")}</td>
          <td>${esc(c.start || "-")}</td>
          <td>${esc(c.end || "-")}</td>
        </tr>`).join("")
        : `<tr><td colspan="7" style="text-align:center;color:#aaa;padding:16px">${ym} 시공 데이터가 없습니다.</td></tr>`}
        </tbody>
        ${rows.length ? `<tfoot><tr><td style="font-weight:900;text-align:left">합계</td><td></td><td style="font-weight:900;text-align:right">${totalKw}</td><td colspan="4"></td></tr></tfoot>` : ""}
      </table>
      <div style="border:1px solid #ddd;padding:8px;font-size:11px;line-height:1.6">특이사항: </div>
      <div style="margin-top:10px;text-align:right;font-size:11px;font-weight:700">작성일: ${today()} · 기술지원팀</div>
    </div>`;
}

function renderGenericPreview() {
  const v = id => ($("gen-" + id)?.value || "").trim();
  return `
    <div style="width:720px;border:1px solid #ddd;padding:20px 24px;background:#fff;font-size:13px">
      <div style="border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:12px">
        <div style="font-size:10px;font-weight:700;color:#555;letter-spacing:.5px">기술지원팀</div>
        <h2 style="margin:0;font-size:20px;font-weight:900">${esc(v("title") || "업무 보고서")}</h2>
        <div style="font-size:12px;color:#555;margin-top:4px">${esc(v("date"))} · ${esc(v("dept"))} · ${esc(v("reporter"))}</div>
      </div>
      <table style="margin-bottom:10px"><tbody>
        <tr><th style="width:80px">구분</th><td>${esc(v("category"))}</td><th style="width:80px">대상</th><td>${esc(v("target"))}</td></tr>
        <tr><th>현장</th><td colspan="3">${esc(v("site"))}</td></tr>
      </tbody></table>
      ${[["요약",v("summary")],["배경",v("background")],["현황",v("issue")],["조치 내용",v("action")],["결과",v("result")],["요청사항",v("request")],["향후 일정",v("next")]].filter(([,val]) => val).map(([label, val]) =>
        `<div class="section-title">${label}</div><div style="border:1px solid #ccc;padding:8px;white-space:pre-wrap;font-size:12px;min-height:36px">${esc(val)}</div>`
      ).join("")}
      ${_genericPhotos.length ? `
        <div class="section-title">첨부 사진</div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:8px">
          ${_genericPhotos.map(src => `<img src="${src}" style="width:100%;height:180px;object-fit:cover;border:1px solid #ddd">`).join("")}
        </div>` : ""}
      <div style="margin-top:12px;text-align:right;font-size:11px;font-weight:700">작성일: ${today()}</div>
    </div>`;
}

function updateReportPreview() {
  const preEl = $("reportPreview");
  if (!preEl) return;
  if (_reportTab === "as")      preEl.innerHTML = renderAsPreview();
  if (_reportTab === "monthly") preEl.innerHTML = renderMonthlyPreview();
  if (_reportTab === "generic") preEl.innerHTML = renderGenericPreview();
}

function renderReportForm() {
  const formEl = $("reportForm");
  if (!formEl) return;

  if (_reportTab === "as") {
    const fields = [
      ["접수번호","no",""],["접수일","received","date"],["완료일","completed","date"],
      ["고객명","client",""],["연락처","phone","tel"],["현장명","site",""],
      ["주소","address",""],["설비용량(kW)","kw",""],["지붕형태","roof",""],["설치년도","built",""],
      ["하자구분","defect-type",""],["하자부위","defect-area",""],
    ];
    const textareas = [["증상","symptom"],["원인","cause"],["처리 내용","action"],["투입 자재","material"],["마감 상태","finish"],["고객 확인","customer-check"],["특이사항","notice"]];
    formEl.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${fields.map(([label, id, type]) => `
          <div>
            <label style="font-size:12px;font-weight:700;display:block;margin-bottom:3px">${label}</label>
            <input class="field" id="as-${id}" type="${type || "text"}" style="width:100%;box-sizing:border-box">
          </div>`).join("")}
        ${textareas.map(([label, id]) => `
          <div style="grid-column:1/-1">
            <label style="font-size:12px;font-weight:700;display:block;margin-bottom:3px">${label}</label>
            <textarea class="field" id="as-${id}" style="width:100%;box-sizing:border-box;min-height:56px"></textarea>
          </div>`).join("")}
      </div>
      <div style="margin-top:12px">
        <div style="font-size:12px;font-weight:700;margin-bottom:6px">작업 사진 (각 최대 3장)</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <label style="border:2px dashed #b8c8cf;border-radius:8px;padding:12px;text-align:center;cursor:pointer;background:#fbfdfe">
            <div style="font-weight:700;margin-bottom:4px">작업 전 사진</div>
            <div style="font-size:11px;color:var(--muted)">${_beforePhotos.length}/3장</div>
            <input type="file" accept="image/*" multiple id="beforePhotoInput" style="display:none">
          </label>
          <label style="border:2px dashed #b8c8cf;border-radius:8px;padding:12px;text-align:center;cursor:pointer;background:#fbfdfe">
            <div style="font-weight:700;margin-bottom:4px">작업 후 사진</div>
            <div style="font-size:11px;color:var(--muted)">${_afterPhotos.length}/3장</div>
            <input type="file" accept="image/*" multiple id="afterPhotoInput" style="display:none">
          </label>
        </div>
        ${_beforePhotos.length + _afterPhotos.length ? `<button class="btn" id="clearPhotosBtn" style="margin-top:8px">사진 초기화</button>` : ""}
      </div>`;

    formEl.querySelectorAll("input,textarea").forEach(el => el.addEventListener("input", updateReportPreview));
    $("beforePhotoInput")?.addEventListener("change", async e => {
      const files = [...e.target.files].slice(0, 3 - _beforePhotos.length);
      _beforePhotos = [..._beforePhotos, ...await Promise.all(files.map(photoDataUrl))].slice(0, 3);
      renderReportForm(); updateReportPreview();
    });
    $("afterPhotoInput")?.addEventListener("change", async e => {
      const files = [...e.target.files].slice(0, 3 - _afterPhotos.length);
      _afterPhotos = [..._afterPhotos, ...await Promise.all(files.map(photoDataUrl))].slice(0, 3);
      renderReportForm(); updateReportPreview();
    });
    $("clearPhotosBtn")?.addEventListener("click", () => { _beforePhotos = []; _afterPhotos = []; renderReportForm(); updateReportPreview(); });

  } else if (_reportTab === "monthly") {
    formEl.innerHTML = `
      <div>
        <label style="font-size:12px;font-weight:700;display:block;margin-bottom:6px">보고서 기준 월</label>
        <input class="field" type="month" id="reportMonth" value="${_reportMonth}" style="width:100%">
      </div>
      <div style="margin-top:10px;font-size:12px;color:var(--muted)">시공일정 데이터를 기준으로 자동 생성됩니다.</div>`;
    $("reportMonth")?.addEventListener("change", e => { _reportMonth = e.target.value; updateReportPreview(); });

  } else {
    const fields = [
      ["보고서 제목","title"],["작성일","date"],["작성자","reporter"],
      ["부서","dept"],["구분/카테고리","category"],["대상","target"],["현장","site"],
    ];
    const textareas = [["요약","summary"],["배경","background"],["현황","issue"],["조치 내용","action"],["결과","result"],["요청사항","request"],["향후 일정","next"]];
    formEl.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${fields.map(([label, id]) => `
          <div>
            <label style="font-size:12px;font-weight:700;display:block;margin-bottom:3px">${label}</label>
            <input class="field" id="gen-${id}" style="width:100%;box-sizing:border-box" ${id==="date"?`value="${today()}"`:""}>
          </div>`).join("")}
        ${textareas.map(([label, id]) => `
          <div style="grid-column:1/-1">
            <label style="font-size:12px;font-weight:700;display:block;margin-bottom:3px">${label}</label>
            <textarea class="field" id="gen-${id}" style="width:100%;box-sizing:border-box;min-height:60px"></textarea>
          </div>`).join("")}
      </div>
      <div style="margin-top:10px">
        <label style="border:2px dashed #b8c8cf;border-radius:8px;padding:12px;text-align:center;cursor:pointer;display:block">
          <div style="font-weight:700;margin-bottom:4px">첨부 사진 (선택)</div>
          <div style="font-size:11px;color:var(--muted)">${_genericPhotos.length}장 첨부됨</div>
          <input type="file" accept="image/*" multiple id="genericPhotoInput" style="display:none">
        </label>
        ${_genericPhotos.length ? `<button class="btn" id="clearGenericBtn" style="margin-top:6px">사진 초기화</button>` : ""}
      </div>`;

    formEl.querySelectorAll("input,textarea").forEach(el => el.addEventListener("input", updateReportPreview));
    $("genericPhotoInput")?.addEventListener("change", async e => {
      _genericPhotos = [..._genericPhotos, ...await Promise.all([...e.target.files].map(photoDataUrl))];
      renderReportForm(); updateReportPreview();
    });
    $("clearGenericBtn")?.addEventListener("click", () => { _genericPhotos = []; renderReportForm(); updateReportPreview(); });
  }

  updateReportPreview();
}

function renderReports() {
  const el = $("reportsView");
  if (!el) return;

  const tabLabel = { as:"A/S 보고서", monthly:"시공월별보고서", generic:"기타 보고서" };
  const printLabel = { as:"보고서 인쇄", monthly:"A4 출력", generic:"A4 출력" };

  el.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:14px;align-items:center">
      ${Object.entries(tabLabel).map(([k, v]) =>
        `<button class="btn${_reportTab === k ? " primary" : ""}" data-report-tab="${k}">${v}</button>`
      ).join("")}
      <div style="flex:1"></div>
      <button class="btn primary" id="printReportBtn">${printLabel[_reportTab]}</button>
    </div>
    <div style="display:grid;grid-template-columns:360px minmax(0,1fr);gap:16px;align-items:start">
      <div class="panel" style="padding:16px;display:grid;gap:10px" id="reportForm"></div>
      <div style="overflow:auto" id="reportPreview"></div>
    </div>`;

  el.querySelectorAll("[data-report-tab]").forEach(btn =>
    btn.addEventListener("click", () => { _reportTab = btn.dataset.reportTab; renderReports(); })
  );
  $("printReportBtn")?.addEventListener("click", () => {
    const html = $("reportPreview")?.innerHTML || "";
    printHtml(html, tabLabel[_reportTab]);
  });

  renderReportForm();
}
function renderMw()        {
  const el = $("mwView");
  if (!el) return;
  const st = getState();
  const con = st.construction || [];
  const totalKw = Math.round(con.reduce((s, c) => s + (Number(c.kw)||0), 0) * 100) / 100;
  const mw = (totalKw / 1000).toFixed(3);
  el.innerHTML = `
    <div class="kpis" style="margin-bottom:16px">
      <div class="kpi"><div class="label">총 시공 용량</div><div class="value">${totalKw}kW</div><div class="delta">${mw}MW</div></div>
      <div class="kpi"><div class="label">총 현장 수</div><div class="value">${con.length}</div><div class="delta">시공일정 기준</div></div>
      <div class="kpi"><div class="label">완료 현장</div><div class="value">${con.filter(c=>c.status==="완료").length}</div></div>
      <div class="kpi"><div class="label">시공중</div><div class="value">${con.filter(c=>c.status==="시공중").length}</div></div>
    </div>
    <div class="panel" style="padding:16px">
      <div class="panel-title"><h2>현장별 용량 목록</h2></div>
      <div class="table-wrap">
        <table><thead><tr><th>현장</th><th>시공사</th><th>kW</th><th>MW</th><th>상태</th></tr></thead>
        <tbody>${con.map(c => `<tr>
          <td>${esc(c.site)}</td><td>${esc(c.company)}</td><td>${esc(c.kw)}</td>
          <td>${((Number(c.kw)||0)/1000).toFixed(3)}</td>
          <td><span class="badge">${esc(c.status)}</span></td>
        </tr>`).join("")}</tbody></table>
      </div>
    </div>`;
}
function renderInspection() {
  const el = $("inspectionView");
  if (!el) return;
  const st = getState();
  const items = st.structureInspections || [];
  el.innerHTML = `
    <div class="toolbar" style="margin-bottom:12px">
      <h1 style="margin:0;font-size:20px;font-weight:700">구조물 검수</h1>
      <button class="btn primary" id="inspAddBtn">+ 검수 추가</button>
    </div>
    <div class="stack">
      ${items.length ? items.map((item, i) => `
        <div class="card">
          <div class="card-top"><span class="name">${esc(item.plantName||"현장명")}</span><span class="badge blue">${esc(item.phase||"검수중")}</span></div>
          <div class="meta">${esc(item.date||"")} · ${esc(item.inspector||"")} · ${esc(item.address||"")}</div>
          <button class="btn icon danger" style="margin-top:8px" data-insp-delete="${i}">삭제</button>
        </div>`).join("")
      : `<div class="meta">등록된 검수 기록이 없습니다.</div>`}
    </div>`;

  $("inspAddBtn")?.addEventListener("click", () => {
    const site = prompt("현장명을 입력하세요.");
    if (!site) return;
    const newItem = { id: genId("insp"), plantName: site, date: today(), inspector: "", address: "", phase: "검수중" };
    const items2 = [newItem, ...(getState().structureInspections || [])];
    setState({ structureInspections: items2 });
    toast("추가됐습니다.");
    renderInspection();
  });

  el.querySelectorAll("[data-insp-delete]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!confirm("삭제할까요?")) return;
      const idx = Number(btn.dataset.inspDelete);
      const items2 = [...(getState().structureInspections || [])];
      if (items2[idx]?.id) markDeleted("structureInspections", items2[idx].id);
      items2.splice(idx, 1);
      setState({ structureInspections: items2 });
      toast("삭제됐습니다.");
      renderInspection();
    });
  });
}

// ────────────────────────────────────────────────────────────────────────────
// 이벤트 위임
// ────────────────────────────────────────────────────────────────────────────
function onDocClick(e) {
  const t = e.target.closest("button") || e.target;

  // 회의록
  if (t.id === "meetingAddBtn") { openMeetingModal(); return; }
  if (t.dataset.meetingEdit !== undefined) { openMeetingModal(Number(t.dataset.meetingEdit)); return; }
  if (t.dataset.meetingDelete !== undefined) { deleteMeeting(Number(t.dataset.meetingDelete)); return; }

  // 프로젝트
  if (t.id === "projAddBtn") { openProjectModal(); return; }
  if (t.dataset.projEdit !== undefined) { openProjectModal(Number(t.dataset.projEdit)); return; }
  if (t.dataset.projSort) {
    if (_projSortKey === t.dataset.projSort) _projSortDir = _projSortDir === "asc" ? "desc" : "asc";
    else { _projSortKey = t.dataset.projSort; _projSortDir = "asc"; }
    ifVisible("dbView", renderProjectTable);
    ifVisible("projectsView", renderProjectTable);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 초기화
// ────────────────────────────────────────────────────────────────────────────
export function initMisc() {
  document.addEventListener("click", onDocClick);

  const map = {
    meetings:   renderMeetings,
    db:         renderProjects,
    projects:   renderProjects,
    messages:   renderMessages,
    reports:    renderReports,
    mw:         renderMw,
    inspection: renderInspection,
  };

  on("viewChanged", ({ view }) => { map[view]?.(); });

  on("stateChange", () => {
    Object.entries(map).forEach(([viewId, fn]) => {
      // 메시지·보고서는 폼 입력값이 있어서 stateChange 재렌더 제외
      if (viewId === "messages" || viewId === "reports") return;
      ifVisible(viewId + "View", fn);
    });
  });
}
