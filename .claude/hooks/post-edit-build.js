import { execSync } from "child_process";

try {
  execSync("npm run build", {
    cwd: "C:/Users/sisun/solar-erp-v2",
    encoding: "utf8",
    stdio: "pipe",
  });
} catch (e) {
  const out = ((e.stdout || "") + (e.stderr || "")).replace(/\x1b\[[0-9;]*m/g, "");
  console.log(
    JSON.stringify({
      decision: "block",
      reason: "빌드 실패 - 이 프로젝트엔 lint/test가 없어서 빌드로 대신 검증합니다:\n" + out,
    })
  );
}
