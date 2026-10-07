// A fingerprint of the server-side code (core + server). The MCP compares it with the running server's and
// restarts a stale server, so code changes take effect without anyone remembering to restart it.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function walk(dir: string, out: string[]) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); } else if (/\.(ts|tsx|json)$/.test(e.name)) out.push(p);
  }
}

export function codeVersion(root: string) {
  const files: string[] = [];
  for (const d of ['packages/core/src', 'apps/server/src']) { try { walk(path.join(root, d), files); } catch { /* missing dir */ } }
  const h = crypto.createHash('sha1');
  for (const f of files.sort()) { const s = fs.statSync(f); h.update(`${path.relative(root, f)}:${s.size}:${Math.floor(s.mtimeMs)}\n`); }
  return h.digest('hex').slice(0, 12);
}
