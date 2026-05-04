const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const entries = ["index.html", "manifest.webmanifest", "sw.js", "assets", "fonts"];

fs.mkdirSync(dist, { recursive: true });

function copyEntry(source, target) {
  const stat = fs.statSync(source);

  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const child of fs.readdirSync(source)) {
      copyEntry(path.join(source, child), path.join(target, child));
    }
    return;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, fs.readFileSync(source));
}

for (const entry of entries) {
  const source = path.join(root, entry);
  const target = path.join(dist, entry);
  copyEntry(source, target);
}

console.log(`Built static app in ${path.relative(root, dist)}`);
