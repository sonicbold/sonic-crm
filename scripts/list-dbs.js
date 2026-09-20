const fs = require("fs");
const path = require("path");

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".next") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (/\.(db|db-wal|db-shm|db-journal)$/i.test(ent.name)) acc.push({ p, size: fs.statSync(p).size });
  }
  return acc;
}

const files = walk(process.cwd());
console.log(JSON.stringify(files, null, 2));
