import { initStore } from "./store/index.js";
import { initRouter } from "./router.js";
import { initAuth       } from "./features/auth.js";
import { initShell      } from "./features/shell.js";
import { initPwa        } from "./pwa.js";
import { normalizeState } from "./features/admin.js";
import { initGcal       } from "./features/gcal.js";
import { initTodos      } from "./features/todos.js";
import { initAssignment } from "./features/assignment.js";
import { initConstruction } from "./features/construction.js";
import { initProjects   } from "./features/projects.js";
import { initMeetings   } from "./features/meetings.js";
import { initMessages   } from "./features/messages.js";
import { initReports    } from "./features/reports.js";
import { initInspection } from "./features/inspection.js";
import { initDashboard    } from "./features/dashboard.js";
import { initKnowledge   } from "./features/knowledge.js";
import { initAdmin      } from "./features/admin.js";

// 모달 닫기 공통 핸들러
document.addEventListener("click", e => {
  const btn = e.target.closest("[data-close-modal]");
  if (btn) {
    const id = btn.dataset.closeModal;
    const m = document.getElementById(id);
    m?.classList.remove("open");
    m?.classList.add("hidden");
  }
  if (e.target.classList.contains("overlay")) {
    e.target.classList.remove("open");
    e.target.classList.add("hidden");
  }
});

async function boot() {
  await initStore();
  normalizeState();
  initAuth();
  // 피처 먼저 등록 → 그 다음 router가 초기 viewChanged 발사
  initGcal();
  initTodos();
  initAssignment();
  initConstruction();
  initProjects();
  initMeetings();
  initMessages();
  initReports();
  initInspection();
  initDashboard();
  initKnowledge();
  initAdmin();
  initShell();
  initRouter();
  initPwa();
  console.log("[app] booted ✓");
}

boot().catch(console.error);
