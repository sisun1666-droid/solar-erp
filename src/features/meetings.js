import { getState, setState, markDeleted, on } from "../store/index.js";
import { genId, today, esc, toast, $ } from "../utils/index.js";

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

function onDocClick(e) {
  const t = e.target.closest("button") || e.target;
  if (t.id === "meetingAddBtn") { openMeetingModal(); return; }
  if (t.dataset.meetingEdit !== undefined) { openMeetingModal(Number(t.dataset.meetingEdit)); return; }
  if (t.dataset.meetingDelete !== undefined) { deleteMeeting(Number(t.dataset.meetingDelete)); return; }
}

export function initMeetings() {
  document.addEventListener("click", onDocClick);
  on("viewChanged", ({ view }) => { if (view === "meetings") renderMeetings(); });
  on("stateChange", () => {
    const panel = $("meetingsView");
    if (panel && !panel.classList.contains("hidden")) renderMeetings();
  });
}
