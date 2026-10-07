// Team access: anyone not on this machine needs the team's invite token.
// The host machine (and Claude's MCP running on it) is always trusted; everyone else joins through an invite link
// (/join/<token>, which sets a cookie) or sends the token as a Bearer header (teammates' MCP servers).
// Tunnelled traffic (cloudflared, reverse proxies) arrives from localhost but carries forwarding headers — it counts as remote.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage } from 'node:http';
import type { NextFunction, Request, Response } from 'express';

export interface TeamConfig { token: string; publicUrl?: string; createdAt: number }

let cfgFile = '';
let cfg: TeamConfig;

export function initTeam(dataDir: string): TeamConfig {
  cfgFile = path.join(dataDir, 'team.json');
  try { cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8')); } catch { cfg = { token: '', createdAt: Date.now() }; }
  if (process.env.CUTROOM_TOKEN) cfg.token = process.env.CUTROOM_TOKEN;
  if (process.env.CUTROOM_PUBLIC_URL) cfg.publicUrl = process.env.CUTROOM_PUBLIC_URL;
  if (!cfg.token) { cfg.token = crypto.randomBytes(18).toString('base64url'); save(); }
  return cfg;
}
function save() { fs.mkdirSync(path.dirname(cfgFile), { recursive: true }); fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 1), { mode: 0o600 }); }
export const team = () => cfg;
export function setPublicUrl(url: string | undefined) { cfg.publicUrl = url; save(); }

const FORWARD = ['x-forwarded-for', 'cf-connecting-ip', 'forwarded', 'x-real-ip', 'cf-ray'];
export function isLocalRequest(req: IncomingMessage) {
  const a = req.socket.remoteAddress ?? '';
  const loop = a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
  return loop && !FORWARD.some((h) => req.headers[h]);
}

function cookie(req: IncomingMessage, name: string) {
  const m = (req.headers.cookie ?? '').split(/;\s*/).find((c) => c.startsWith(`${name}=`));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : '';
}
function tokenOf(req: IncomingMessage) {
  const auth = req.headers.authorization ?? '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const q = new URL(req.url ?? '/', 'http://x').searchParams.get('token');
  return q || cookie(req, 'cutroom_token');
}
const same = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const authorized = (req: IncomingMessage) => isLocalRequest(req) || (!!tokenOf(req) && same(tokenOf(req), cfg.token));

/** Express middleware: /join/<token> sets the cookie; everything else needs local access or the token. */
export function teamGate(req: Request, res: Response, next: NextFunction) {
  const join = req.path.match(/^\/join\/([\w-]+)$/);
  if (join) {
    if (!same(join[1], cfg.token)) { res.status(403).type('html').send(page('That invite link is not valid (it may have been reset). Ask the host for a new one.')); return; }
    const secure = req.headers['x-forwarded-proto'] === 'https' || !!req.headers['cf-ray'];
    res.setHeader('set-cookie', `cutroom_token=${encodeURIComponent(cfg.token)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);
    const next = String(req.query.next || '/');
    const name = req.query.name ? `${next.includes('?') ? '&' : '?'}name=${encodeURIComponent(String(req.query.name))}` : '';
    res.redirect(next.startsWith('/') ? next + name : '/');
    return;
  }
  if (req.path === '/api/health' || authorized(req)) { next(); return; }
  if (req.path.startsWith('/api/') || req.path.startsWith('/media/') || req.path.startsWith('/exports/')) { res.status(401).json({ error: 'this Cutroom server needs an invite — open the invite link from the host (…/join/<token>) or send Authorization: Bearer <token>' }); return; }
  res.status(401).type('html').send(page('This Cutroom server is private. Open the invite link the host sent you.'));
}

const page = (msg: string) => `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Cutroom</title>
<body style="margin:0;display:grid;place-items:center;height:100vh;background:#0e1014;color:#e8eaf0;font:15px system-ui"><div style="max-width:440px;padding:24px;text-align:center">
<div style="font-size:28px;margin-bottom:12px">▶ Cutroom</div><p>${msg}</p></div></body>`;
