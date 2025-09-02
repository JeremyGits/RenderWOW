const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "node_modules", "monaco-editor", "min", "vs");
const dest = path.join(__dirname, "..", "vendor", "vs");

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });

function copyDir(s, d){
  fs.mkdirSync(d, { recursive: true });
  for (const e of fs.readdirSync(s, { withFileTypes: true })) {
    const sp = path.join(s, e.name);
    const dp = path.join(d, e.name);
    if (e.isDirectory()) copyDir(sp, dp);
    else fs.copyFileSync(sp, dp);
  }
}
copyDir(src, dest);
console.log("Monaco copied to vendor/vs");
