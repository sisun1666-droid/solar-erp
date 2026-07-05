import { getState, setState, markDeleted, on } from "../store/index.js";
import { genId, today, esc, toast, $ } from "../utils/index.js";

// 관리자 화면에서 직접 수정할 수 있는 기본값 — 사용자가 한 번도 손대지 않았으면 이 값을 쓴다.
export const DEFAULT_MSG_CATS = [
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

function msgCategories() {
  const cats = getState().msgCategories;
  return cats?.length ? cats : DEFAULT_MSG_CATS;
}

function analyzeMsg(text) {
  const low = String(text || "").toLowerCase();
  const scored = msgCategories().map(c => ({ c, s: (c.keys||[]).reduce((n, k) => n + (low.includes(k) ? 1 : 0), 0) })).sort((a, b) => b.s - a.s);
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

// 초안을 직접 손으로 고친 뒤에는, 다른 입력칸(고객명/현장/말투)을 건드려도
// 그 수정본을 덮어쓰지 않는다 — "다시 생성" 버튼을 눌러야만 초기화된다.
let _draftEdited = false;

function updateMsgPreview({ force = false } = {}) {
  const { sender, site, tone, incoming } = getMsgForm();
  const a = analyzeMsg(incoming);
  const badge = $("msgTypeBadge");
  if (badge) { badge.className = `badge ${a.badge}`; badge.textContent = a.type; }
  const urgEl = $("msgUrgency"); if (urgEl) urgEl.textContent = a.urgency;
  const actEl = $("msgAction");  if (actEl) actEl.textContent = a.actions[0] || "";
  if (!force && _draftEdited) return;
  const reply = buildMsgReply(sender || "고객", site, tone, a);
  const outEl = $("msgOutput"); if (outEl) outEl.value = reply;
}

function saveMsgFromForm() {
  const { sender, site, incoming } = getMsgForm();
  if (!incoming) { toast("메시지 내용을 먼저 입력하세요."); return; }
  const a = analyzeMsg(incoming);
  const reply = $("msgOutput")?.value || "";
  const msgs = [
    { id: genId("msg"), date: today(), time: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
      sender: sender || "고객", site, incoming, reply,
      type: a.type, badge: a.badge, urgency: a.urgency, actions: a.actions, status: "대기" },
    ...(getState().messages || []),
  ];
  setState({ messages: msgs });
  _draftEdited = false;
  toast("접수 저장됐습니다.");
  renderMessages();
}

function renderMessages() {
  const el = $("messagesView");
  if (!el) return;
  _draftEdited = false; // 폼 전체가 다시 그려지므로 이전 편집 상태를 들고 있을 이유가 없다
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
          <div class="dash-title" style="margin-bottom:6px"><h2 class="label" style="margin:0">답변 초안 (직접 수정 가능)</h2><button class="btn" id="msgRegenBtn">다시 생성</button></div>
          <textarea id="msgOutput" class="field" style="border:1px solid #cfe3d8;background:#f7fffb;white-space:pre-wrap;line-height:1.7;font-size:13px;min-height:160px;width:100%;box-sizing:border-box" placeholder="메시지를 입력하면 답변 초안이 여기에 표시됩니다."></textarea>
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
    _draftEdited = false;
    updateMsgPreview({ force: true });
  });
  $("msgRegenBtn")?.addEventListener("click", () => {
    _draftEdited = false;
    updateMsgPreview({ force: true });
  });
  $("msgOutput")?.addEventListener("input", () => { _draftEdited = true; });
  $("msgCopyBtn")?.addEventListener("click", () => copyText($("msgOutput")?.value || ""));

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

export function initMessages() {
  on("viewChanged", ({ view }) => { if (view === "messages") renderMessages(); });
  // 메시지는 폼 입력값이 있어서 stateChange 재렌더 대상에서 제외 (기존 동작 유지)
}
