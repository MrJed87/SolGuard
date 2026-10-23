// Copies the third-party runtime files from node_modules into assets/ (committed, so the site needs no build step).
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const out = path.join(root, "assets");
fs.mkdirSync(path.join(out, "fonts"), { recursive: true });
fs.copyFileSync(path.join(root, "node_modules/chart.js/dist/chart.umd.js"), path.join(out, "chart.umd.min.js"));
for (const w of [400, 500, 600, 700, 800]) {
  const f = `inter-latin-${w}-normal.woff2`;
  fs.copyFileSync(path.join(root, "node_modules/@fontsource/inter/files", f), path.join(out, "fonts", f));
}
fs.copyFileSync(path.join(root, "node_modules/@fontsource/inter/LICENSE"), path.join(out, "fonts/OFL.txt"));
console.log("Vendor files updated.");
