const fs = require("fs");
const path = require("path");

const distDir = path.resolve(__dirname, "..", "dist");
const target = path.join(distDir, "main");
const contents = 'require("./main.js");\n';

try {
  fs.mkdirSync(distDir, { recursive: true });
  if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== contents) {
    fs.writeFileSync(target, contents, "utf8");
  }
} catch (error) {
  console.error("[DIST_MAIN_SHIM] Failed to create dist/main shim:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
