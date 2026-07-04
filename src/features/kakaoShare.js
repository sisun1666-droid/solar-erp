import { $, toast } from "../utils/index.js";

export function openKakaoShare(text) {
  const ta = $("kakaoText");
  if (ta) ta.value = text;
  $("kakaoModal")?.classList.remove("hidden");
  $("kakaoModal")?.classList.add("open");
}

async function copyText() {
  const text = $("kakaoText")?.value || "";
  try { await navigator.clipboard.writeText(text); toast("복사했습니다."); }
  catch { toast("복사에 실패했습니다."); }
}

export function initKakaoShare() {
  $("copyKakaoBtn")?.addEventListener("click", copyText);
  $("openKakaoBtn")?.addEventListener("click", async () => {
    await copyText();
    toast("복사했습니다. 카카오톡에 붙여넣기 해주세요.");
    window.open("kakaotalk://", "_blank");
  });
}
