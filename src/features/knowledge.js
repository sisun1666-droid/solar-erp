import { config } from "../api/supabase.js";
import { genId, today, esc, toast, onSearchInput } from "../utils/index.js";
import { on } from "../store/index.js";

const LS_KEY = "solar-knowledge-v1";
const SB_ID  = "knowledge";
const CATS   = ["업무방법", "자재/발주", "현장/고객", "법규/제도", "태양광 인허가", "시공기술", "전기/한전", "구조물"];

let _notes  = [];
let _query  = "";
let _cat    = "";
let _selId  = null;

// ── 저장/로드 ──────────────────────────────────────────────────────────────
function loadLocal() {
  try { _notes = JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch {}
}

async function loadFromServer() {
  try {
    const data = await config.get(SB_ID);
    if (data?.notes?.length) {
      _notes = data.notes;
      localStorage.setItem(LS_KEY, JSON.stringify(_notes));
    }
  } catch {}
}

async function save() {
  localStorage.setItem(LS_KEY, JSON.stringify(_notes));
  config.set(SB_ID, { notes: _notes }).catch(() => {});
}

// ── 노트 CRUD ──────────────────────────────────────────────────────────────
function newNote() {
  return {
    id: genId("kn"), title: "", content: "",
    category: CATS[0], tags: "",
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    history: [],
  };
}

function selected() { return _notes.find(n => n.id === _selId) || null; }

function commit(note) {
  const idx = _notes.findIndex(n => n.id === note.id);
  if (idx >= 0) {
    const old = _notes[idx];
    if (old.content !== note.content || old.title !== note.title) {
      note.history = [
        { content: old.content, title: old.title, savedAt: old.updatedAt },
        ...(old.history || []),
      ].slice(0, 20);
    }
    note.updatedAt = new Date().toISOString();
    _notes[idx] = note;
  } else {
    note.createdAt = note.updatedAt = new Date().toISOString();
    _notes.unshift(note);
  }
  save();
}

function deleteNote(id) {
  _notes = _notes.filter(n => n.id !== id);
  _selId = _notes[0]?.id || null;
  save();
}

function filtered() {
  const q = _query.trim().toLowerCase();
  return _notes.filter(n => {
    if (_cat && n.category !== _cat) return false;
    if (!q) return true;
    return (n.title + n.content + (n.tags || "")).toLowerCase().includes(q);
  });
}

// ── 에디터 HTML ─────────────────────────────────────────────────────────────
function editorHtml(note) {
  const catOpts = CATS.map(c =>
    `<option${c === note.category ? " selected" : ""}>${esc(c)}</option>`).join("");
  return `<div style="display:flex;flex-direction:column;height:100%;gap:10px;padding:16px">
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <input class="field" id="kTitle" value="${esc(note.title)}" placeholder="제목"
        style="flex:1;min-width:200px;font-size:16px;font-weight:700">
      <select class="field" id="kCat" style="max-width:160px">${catOpts}</select>
    </div>
    <input class="field" id="kTags" value="${esc(note.tags || "")}" placeholder="태그 (쉼표로 구분)">
    <textarea class="field" id="kContent" style="flex:1;min-height:300px;resize:none;font-size:13px;line-height:1.7">${esc(note.content || "")}</textarea>
    <div style="display:flex;gap:8px;align-items:center">
      <button class="btn primary" id="kSaveBtn">저장</button>
      <button class="btn danger" id="kDeleteBtn">삭제</button>
      <span style="color:var(--muted);font-size:12px;margin-left:auto">수정: ${esc((note.updatedAt||"").slice(0,10))}</span>
    </div>
  </div>`;
}

// ── 메인 렌더 ──────────────────────────────────────────────────────────────
function render() {
  const panel = document.getElementById("knowledgeView");
  if (!panel || panel.classList.contains("hidden")) return;

  const list = filtered();
  const sel  = selected();

  const catBtns = [
    `<button class="k-cat-btn${!_cat ? " active" : ""}" data-kcat="">전체 <span class="k-cat-chip">${_notes.length}</span></button>`,
    ...CATS.map(c =>
      `<button class="k-cat-btn${_cat === c ? " active" : ""}" data-kcat="${esc(c)}">${esc(c)} <span class="k-cat-chip">${_notes.filter(n => n.category === c).length}</span></button>`
    ),
  ].join("");

  const listHtml = list.length
    ? list.map(n => `
        <div class="k-item${_selId === n.id ? " active" : ""}" data-ksel="${esc(n.id)}">
          <div class="k-item-title">${esc(n.title || "제목 없음")}</div>
          <div class="k-item-meta">
            <span class="k-cat-chip">${esc(n.category)}</span>
            <span>${esc((n.updatedAt || "").slice(0, 10))}</span>
          </div>
          ${n.tags ? `<div class="k-item-tags">${n.tags.split(",").map(t => t.trim()).filter(Boolean).map(t => `<span class="k-tag">${esc(t)}</span>`).join("")}</div>` : ""}
        </div>`).join("")
    : `<div style="padding:16px;color:var(--muted);font-size:13px">${_query ? "검색 결과 없음" : "노트가 없습니다"}</div>`;

  panel.innerHTML = `
    <div class="k-layout">
      <div class="k-sidebar">
        <input class="k-search" id="kSearch" placeholder="전체 검색..." value="${esc(_query)}">
        <button class="btn primary" id="kNewBtn" style="width:100%">+ 새 노트</button>
        <div class="k-cat-list">${catBtns}</div>
        <div class="k-cat-list" style="border-top:1px solid var(--line);padding-top:8px;margin-top:4px">${listHtml}</div>
      </div>
      <div class="k-main" id="kEditorPane">
        ${sel ? editorHtml(sel) : `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:14px">← 노트를 선택하거나 새 노트를 만드세요</div>`}
      </div>
    </div>`;

  // 이벤트
  onSearchInput(document.getElementById("kSearch"), e => {
    _query = e.target.value; render();
  });
  document.getElementById("kNewBtn")?.addEventListener("click", () => {
    const n = newNote();
    _notes.unshift(n);
    _selId = n.id;
    save();
    render();
    setTimeout(() => document.getElementById("kTitle")?.focus(), 50);
  });
  document.getElementById("kSaveBtn")?.addEventListener("click", () => {
    if (!sel) return;
    commit({
      ...sel,
      title:    document.getElementById("kTitle")?.value || "",
      content:  document.getElementById("kContent")?.value || "",
      category: document.getElementById("kCat")?.value || CATS[0],
      tags:     document.getElementById("kTags")?.value || "",
    });
    toast("저장됐습니다.");
    render();
  });
  document.getElementById("kDeleteBtn")?.addEventListener("click", () => {
    if (!sel || !confirm("이 노트를 삭제할까요?")) return;
    deleteNote(sel.id);
    toast("삭제됐습니다.");
    render();
  });
  panel.querySelectorAll("[data-ksel]").forEach(el =>
    el.addEventListener("click", () => { _selId = el.dataset.ksel; render(); })
  );
  panel.querySelectorAll("[data-kcat]").forEach(el =>
    el.addEventListener("click", () => { _cat = el.dataset.kcat; render(); })
  );
}

// ── 초기화 ─────────────────────────────────────────────────────────────────
export function initKnowledge() {
  loadLocal();
  on("viewChanged", async ({ view }) => {
    if (view !== "knowledge") return;
    await loadFromServer();
    render();
  });
}
