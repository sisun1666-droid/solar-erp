import { getState, setState, markDeleted, on } from "../store/index.js";
import { genId, today, nowStamp, esc, toast, $ } from "../utils/index.js";

let _editing = null;
const PHASES = ["검수중", "보완필요", "합격", "재검수"];

// 업무일지에서 완료(합격) 시점을 잡아낼 수 있도록, 단계가 "합격"으로 바뀐 시각을 기록한다.
function stampCompletion(item, oldPhase) {
  if (item.phase === "합격" && oldPhase !== "합격") item.completedAt = nowStamp();
  else if (item.phase !== "합격") item.completedAt = null;
  return item;
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
          <div class="row-actions" style="margin-top:8px">
            <button class="btn icon" data-insp-edit="${i}">수정</button>
            <button class="btn icon danger" data-insp-delete="${i}">삭제</button>
          </div>
        </div>`).join("")
      : `<div class="meta">등록된 검수 기록이 없습니다.</div>`}
    </div>`;

  $("inspAddBtn")?.addEventListener("click", () => openInspectionModal());
  el.querySelectorAll("[data-insp-edit]").forEach(btn =>
    btn.addEventListener("click", () => openInspectionModal(Number(btn.dataset.inspEdit)))
  );
  el.querySelectorAll("[data-insp-delete]").forEach(btn =>
    btn.addEventListener("click", () => deleteInspection(Number(btn.dataset.inspDelete)))
  );
}

export function openInspectionById(id) {
  const idx = (getState().structureInspections || []).findIndex(i => i.id === id);
  if (idx >= 0) openInspectionModal(idx);
}

function openInspectionModal(idx = null) {
  _editing = idx;
  const st = getState();
  const item = idx === null
    ? { plantName: "", date: today(), inspector: "", address: "", phase: PHASES[0] }
    : { ...st.structureInspections[idx] };

  const phaseOpts = PHASES.map(p => `<option${p === item.phase ? " selected" : ""}>${esc(p)}</option>`).join("");

  $("inspectionFormGrid").innerHTML = `
    <div class="form-row full"><label>현장명</label><input class="field" id="inspPlantName" value="${esc(item.plantName)}" placeholder="현장명"></div>
    <div class="form-row"><label>검수일</label><input class="field" type="date" id="inspDate" value="${esc(item.date)}"></div>
    <div class="form-row"><label>검수자</label><input class="field" id="inspInspector" value="${esc(item.inspector||"")}"></div>
    <div class="form-row full"><label>주소</label><input class="field" id="inspAddress" value="${esc(item.address||"")}"></div>
    <div class="form-row"><label>검수 단계</label><select class="field" id="inspPhase">${phaseOpts}</select></div>`;

  $("deleteInspectionBtn")?.classList.toggle("hidden", idx === null);
  const m = $("inspectionModal");
  m?.classList.remove("hidden");
  m?.classList.add("open");
}

function closeInspectionModal() {
  const m = $("inspectionModal");
  m?.classList.remove("open");
  m?.classList.add("hidden");
}

function saveInspectionModal() {
  const items = [...(getState().structureInspections || [])];
  const item = {
    plantName: $("inspPlantName")?.value || "",
    date:      $("inspDate")?.value || today(),
    inspector: $("inspInspector")?.value || "",
    address:   $("inspAddress")?.value || "",
    phase:     $("inspPhase")?.value || PHASES[0],
  };
  if (_editing !== null) {
    item.id = items[_editing].id;
    item.completedAt = items[_editing].completedAt ?? null;
    stampCompletion(item, items[_editing].phase);
    items[_editing] = item;
  } else {
    item.id = genId("insp");
    stampCompletion(item, null);
    items.unshift(item);
  }
  setState({ structureInspections: items });
  closeInspectionModal();
  toast("저장됐습니다.");
  renderInspection();
}

function deleteInspection(idx) {
  if (!confirm("삭제할까요?")) return;
  const items = [...(getState().structureInspections || [])];
  if (items[idx]?.id) markDeleted("structureInspections", items[idx].id);
  items.splice(idx, 1);
  setState({ structureInspections: items });
  toast("삭제됐습니다.");
  renderInspection();
}

function onDocClick(e) {
  const t = e.target.closest("button") || e.target;
  if (t.id === "saveInspectionBtn") { saveInspectionModal(); return; }
  if (t.id === "deleteInspectionBtn") { deleteInspection(_editing); closeInspectionModal(); return; }
}

export function initInspection() {
  document.addEventListener("click", onDocClick);
  on("viewChanged", ({ view }) => { if (view === "inspection") renderInspection(); });
  on("stateChange", () => {
    const panel = $("inspectionView");
    if (panel && !panel.classList.contains("hidden")) renderInspection();
  });
}
