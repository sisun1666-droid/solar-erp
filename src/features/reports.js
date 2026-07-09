import { getState, setState, on } from "../store/index.js";
import { today, esc, $, genId, toast } from "../utils/index.js";

let _reportTab = "as";
let _beforePhotos = [], _afterPhotos = [], _genericPhotos = [];
let _reportMonth = today().slice(0, 7);
let _issues = [];

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

function renderIssuePreview() {
  const riskColor = { "상": "#d84a38", "중": "#e0932c", "하": "#2f9e57" };
  return `
    <div style="width:720px;border:1px solid #ddd;padding:16px 18px;background:#fff;font-size:13px">
      <div style="border-bottom:3px solid #111;padding-bottom:7px;margin-bottom:12px">
        <div style="font-size:10px;font-weight:700;color:#555;letter-spacing:.5px">기술지원팀</div>
        <h2 style="margin:0;font-size:18px;font-weight:900">구조물 이슈 점검 보고서</h2>
      </div>
      ${_issues.map((it, i) => `
        <div style="border:1px solid #ccc;margin-bottom:10px">
          <div style="display:grid;grid-template-columns:32px 1fr auto;align-items:center;border-bottom:1px solid #ccc">
            <div style="background:#333;color:#fff;text-align:center;font-weight:900;padding:6px 0">${i + 1}</div>
            <div style="padding:6px 8px;font-weight:700">${esc(it.title || "(제목 없음)")}</div>
            <div style="padding:6px 8px;text-align:right;font-size:11px">
              위험도: <strong style="color:${riskColor[it.risk] || "#333"}">${esc(it.risk || "-")}</strong><br>${esc(it.status || "-")}
            </div>
          </div>
          <div style="display:grid;grid-template-columns:80px 1fr 80px 1fr;font-size:11px;border-bottom:1px solid #ddd">
            <div style="padding:5px 8px;background:#f5f5f5;font-weight:700">분 류</div><div style="padding:5px 8px">${esc(it.category || "-")}</div>
            <div style="padding:5px 8px;background:#f5f5f5;font-weight:700">긴 급 도</div><div style="padding:5px 8px">${"★".repeat(Number(it.urgency) || 0)}${"☆".repeat(3 - (Number(it.urgency) || 0))}</div>
          </div>
          <div style="display:grid;grid-template-columns:220px 1fr">
            <div style="padding:8px;border-right:1px solid #ddd">
              ${it.photo ? `<img src="${it.photo}" style="width:100%;height:150px;object-fit:cover">` : `<div style="height:150px;background:#f8f8f8;text-align:center;line-height:150px;font-size:11px;color:#aaa">사진 없음</div>`}
            </div>
            <div style="padding:8px;font-size:12px;white-space:pre-wrap">${esc(it.desc || "")}</div>
          </div>
        </div>`).join("")}
      ${!_issues.length ? `<div style="color:#aaa;text-align:center;padding:20px">이슈를 추가해주세요.</div>` : ""}
    </div>`;
}

// ponytail: dashboard.js의 smallBar와 같은 패턴 — 뷰 소유 파일 간 교차 import를 피하려고 8줄 복제.
// 3번째 소비자가 생기면 utils로 옮길 것.
function statSmallBar(label, val, total, color = "#0d9488") {
  const pct = total ? Math.round(val / total * 100) : 0;
  return `<div class="chart-row">
    <span>${esc(label)}</span>
    <div class="chart-track"><div class="chart-fill" style="width:${pct}%;background:${color}"></div></div>
    <strong>${val}</strong>
  </div>`;
}

function renderStats() {
  const st = getState();
  const con = st.construction || [];
  const total = con.length;
  const done = con.filter(c => c.status === "완료").length;
  const rate = total ? Math.round(done / total * 100) : 0;
  const statuses = ["시공중", "예정", "지연", "완료"];
  const statusColor = { 시공중:"#0d9488", 예정:"#7aa7d9", 지연:"#d87568", 완료:"#0d9488" };
  const phases = st.constructionPhases || [];
  const teams  = st.constructionTeams  || [];
  const maxPhase = Math.max(1, ...phases.map(p => con.filter(c => c.phase === p).length));
  const maxTeam  = Math.max(1, ...teams.map(t => con.filter(c => c.company === t).length));

  const months = [...Array(6)].map((_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - (5 - i));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const reportsByMonth = months.map(m => (st.reports || []).filter(r => (r.savedAt || "").startsWith(m)).length);
  const maxMonthly = Math.max(1, ...reportsByMonth);

  return `
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px">
      <div class="panel" style="padding:16px">
        <div class="panel-title"><h2>시공 상태별 분포</h2></div>
        <div class="donut" style="--p:${rate}%;margin:10px auto"><span>${rate}%</span></div>
        <div class="meta" style="text-align:center;margin-bottom:8px">완료 ${done} / 전체 ${total}</div>
        ${statuses.map(s => statSmallBar(s, con.filter(c => c.status === s).length, total, statusColor[s])).join("")}
      </div>
      <div class="panel" style="padding:16px">
        <div class="panel-title"><h2>업무단계별 분포</h2></div>
        ${phases.length ? phases.map(p => statSmallBar(p, con.filter(c => c.phase === p).length, maxPhase)).join("") : `<div class="meta">단계 데이터가 없습니다.</div>`}
      </div>
      <div class="panel" style="padding:16px">
        <div class="panel-title"><h2>시공사별 물량</h2></div>
        ${teams.length ? teams.map(t => statSmallBar(t, con.filter(c => c.company === t).length, maxTeam)).join("") : `<div class="meta">시공사 데이터가 없습니다.</div>`}
      </div>
      <div class="panel" style="padding:16px">
        <div class="panel-title"><h2>월별 보고서 저장 추이</h2></div>
        ${months.map((m, i) => statSmallBar(m, reportsByMonth[i], maxMonthly)).join("")}
      </div>
    </div>`;
}

function saveCurrentReport() {
  const html = $("reportPreview")?.innerHTML || "";
  if (!html) { toast("저장할 내용이 없습니다."); return; }
  const tabLabel = { as: "A/S 보고서", monthly: "시공월별보고서", generic: "기타 보고서", issue: "구조물 이슈 점검 보고서" };
  const meta = _reportTab === "monthly" ? _reportMonth
    : _reportTab === "as" ? ($("as-site")?.value || $("as-client")?.value || "")
    : _reportTab === "issue" ? (_issues[0]?.title || `이슈 ${_issues.length}건`)
    : ($("gen-title")?.value || "");
  const reports = [
    { id: genId("report"), type: _reportTab, typeLabel: tabLabel[_reportTab], meta, savedAt: today(), html },
    ...(getState().reports || []),
  ];
  setState({ reports });
  toast("보고서를 저장했습니다.");
}

function updateReportPreview() {
  const preEl = $("reportPreview");
  if (!preEl) return;
  if (_reportTab === "as")      preEl.innerHTML = renderAsPreview();
  if (_reportTab === "monthly") preEl.innerHTML = renderMonthlyPreview();
  if (_reportTab === "generic") preEl.innerHTML = renderGenericPreview();
  if (_reportTab === "issue")   preEl.innerHTML = renderIssuePreview();
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

  } else if (_reportTab === "issue") {
    if (!_issues.length) _issues.push({ id: genId("issue"), title: "", category: "", risk: "상", urgency: "2", status: "조치 필요", desc: "", photo: "" });
    formEl.innerHTML = `
      <div style="display:grid;gap:14px">
        ${_issues.map((it, i) => `
          <div style="border:1px solid #ddd;border-radius:8px;padding:10px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <strong style="font-size:12px">이슈 ${i + 1}</strong>
              <button class="btn" data-remove-issue="${it.id}" style="padding:2px 8px;font-size:11px">삭제</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
              <input class="field issue-field" data-issue="${it.id}" data-key="title" placeholder="제목" value="${esc(it.title)}" style="grid-column:1/-1">
              <input class="field issue-field" data-issue="${it.id}" data-key="category" placeholder="분류 (예: 구조물)" value="${esc(it.category)}">
              <select class="field issue-field" data-issue="${it.id}" data-key="status">
                ${["조치 필요","단기 조치","즉시 조치","조치완료"].map(s => `<option ${it.status === s ? "selected" : ""}>${s}</option>`).join("")}
              </select>
              <select class="field issue-field" data-issue="${it.id}" data-key="risk">
                ${["상","중","하"].map(s => `<option ${it.risk === s ? "selected" : ""}>${s}</option>`).join("")}
              </select>
              <select class="field issue-field" data-issue="${it.id}" data-key="urgency">
                ${[1,2,3].map(n => `<option value="${n}" ${Number(it.urgency) === n ? "selected" : ""}>${"★".repeat(n)}</option>`).join("")}
              </select>
              <textarea class="field issue-field" data-issue="${it.id}" data-key="desc" placeholder="현상 설명 (줄바꿈으로 구분)" style="grid-column:1/-1;min-height:56px">${esc(it.desc)}</textarea>
            </div>
            <label class="issue-drop" data-issue-drop="${it.id}" style="display:block;margin-top:8px;border:2px dashed #b8c8cf;border-radius:8px;padding:10px;text-align:center;cursor:pointer;background:#fbfdfe">
              <div style="font-size:11px;color:var(--muted)">${it.photo ? "사진 1장 첨부됨 (클릭 또는 드래그로 교체)" : "사진을 드래그하거나 클릭해서 첨부"}</div>
              <input type="file" accept="image/*" data-issue-photo="${it.id}" style="display:none">
            </label>
          </div>`).join("")}
        <button class="btn" id="addIssueBtn">+ 이슈 추가</button>
      </div>`;

    formEl.querySelectorAll(".issue-field").forEach(el => el.addEventListener("input", e => {
      const it = _issues.find(x => x.id === e.target.dataset.issue);
      if (it) { it[e.target.dataset.key] = e.target.value; updateReportPreview(); }
    }));
    formEl.querySelectorAll("[data-remove-issue]").forEach(btn => btn.addEventListener("click", () => {
      _issues = _issues.filter(x => x.id !== btn.dataset.removeIssue);
      renderReportForm(); updateReportPreview();
    }));
    $("addIssueBtn")?.addEventListener("click", () => {
      _issues.push({ id: genId("issue"), title: "", category: "", risk: "상", urgency: "2", status: "조치 필요", desc: "", photo: "" });
      renderReportForm(); updateReportPreview();
    });
    formEl.querySelectorAll("[data-issue-photo]").forEach(input => input.addEventListener("change", async e => {
      const it = _issues.find(x => x.id === e.target.dataset.issuePhoto);
      if (it && e.target.files[0]) { it.photo = await photoDataUrl(e.target.files[0]); renderReportForm(); updateReportPreview(); }
    }));
    formEl.querySelectorAll("[data-issue-drop]").forEach(zone => {
      zone.addEventListener("dragover", e => { e.preventDefault(); zone.style.background = "#eef6f5"; });
      zone.addEventListener("dragleave", () => { zone.style.background = "#fbfdfe"; });
      zone.addEventListener("drop", async e => {
        e.preventDefault(); zone.style.background = "#fbfdfe";
        const file = e.dataTransfer.files[0];
        const it = _issues.find(x => x.id === zone.dataset.issueDrop);
        if (it && file) { it.photo = await photoDataUrl(file); renderReportForm(); updateReportPreview(); }
      });
    });

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

  const tabLabel = { as:"A/S 보고서", monthly:"시공월별보고서", generic:"기타 보고서", issue:"구조물 이슈 점검", stats:"통계" };
  const printLabel = { as:"보고서 인쇄", monthly:"A4 출력", generic:"A4 출력", issue:"A4 출력" };

  if (_reportTab === "stats") {
    el.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:14px;align-items:center">
        ${Object.entries(tabLabel).map(([k, v]) =>
          `<button class="btn${_reportTab === k ? " primary" : ""}" data-report-tab="${k}">${v}</button>`
        ).join("")}
      </div>
      ${renderStats()}`;
    el.querySelectorAll("[data-report-tab]").forEach(btn =>
      btn.addEventListener("click", () => { _reportTab = btn.dataset.reportTab; renderReports(); })
    );
    return;
  }

  el.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:14px;align-items:center">
      ${Object.entries(tabLabel).map(([k, v]) =>
        `<button class="btn${_reportTab === k ? " primary" : ""}" data-report-tab="${k}">${v}</button>`
      ).join("")}
      <div style="flex:1"></div>
      <button class="btn" id="saveReportBtn">저장</button>
      <button class="btn primary" id="printReportBtn">${printLabel[_reportTab]}</button>
    </div>
    <div style="display:grid;grid-template-columns:360px minmax(0,1fr);gap:16px;align-items:start">
      <div class="panel" style="padding:16px;display:grid;gap:10px" id="reportForm"></div>
      <div style="overflow:auto" id="reportPreview"></div>
    </div>`;

  el.querySelectorAll("[data-report-tab]").forEach(btn =>
    btn.addEventListener("click", () => { _reportTab = btn.dataset.reportTab; renderReports(); })
  );
  $("saveReportBtn")?.addEventListener("click", saveCurrentReport);
  $("printReportBtn")?.addEventListener("click", () => {
    const html = $("reportPreview")?.innerHTML || "";
    printHtml(html, tabLabel[_reportTab]);
  });

  renderReportForm();
}

export function initReports() {
  on("viewChanged", ({ view }) => { if (view === "reports") renderReports(); });
  // 보고서는 폼 입력값이 있어서 stateChange 재렌더 대상에서 제외 (기존 동작 유지)
}
