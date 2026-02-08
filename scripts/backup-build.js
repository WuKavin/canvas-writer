const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const releaseDir = path.join(root, "release");
const backupDir = path.join(root, "build_backups");

if (!fs.existsSync(releaseDir)) {
  console.log("No release directory, skipping backup.");
  process.exit(0);
}

const files = fs.readdirSync(releaseDir).filter((f) => f.endsWith(".dmg"));
if (files.length === 0) {
  console.log("No DMG found, skipping backup.");
  process.exit(0);
}

if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
for (const file of files) {
  const src = path.join(releaseDir, file);
  const base = file.replace(/\.dmg$/, "");
  const dest = path.join(backupDir, `${base}-${stamp}.dmg`);
  fs.copyFileSync(src, dest);
  console.log(`Backed up ${file} -> ${dest}`);
}

// keep last 5 backups per base name
const backups = fs.readdirSync(backupDir).filter((f) => f.endsWith(".dmg"));
const groups = new Map();
for (const f of backups) {
  const base = f.replace(/-\d{4}-\d{2}-\d{2}T.*\.dmg$/, "");
  if (!groups.has(base)) groups.set(base, []);
  groups.get(base).push(f);
}
for (const [base, list] of groups.entries()) {
  list.sort().reverse();
  const toDelete = list.slice(5);
  for (const f of toDelete) {
    fs.unlinkSync(path.join(backupDir, f));
  }
}
