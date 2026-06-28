import { join } from 'node:path';
import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'node:fs';
import { getAuditLogPath } from './magic-config.ts';

const MAX_SIZE = 5 * 1024 * 1024;

function ensureDir(p) {
  const dir = require('node:path').dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function audit(action, details = {}) {
  const cfg = (() => { try { return JSON.parse(readFileSync(join(require('node:os').homedir(), '.magic', 'config.json'), 'utf-8')); } catch (e) { return { audit: true }; } })();
  if (cfg.audit === false) return;
  const p = getAuditLogPath();
  ensureDir(p);
  const entry = {
    ts: new Date().toISOString(),
    action,
    user: process.env.USERNAME || process.env.USER || 'unknown',
    pid: process.pid,
    cwd: process.cwd(),
    ...details
  };
  try { appendFileSync(p, JSON.stringify(entry) + '\n'); } catch (e) {}
  rotateIfBig(p);
}

function rotateIfBig(p) {
  try {
    const stat = require('node:fs').statSync(p);
    if (stat.size > MAX_SIZE) {
      const backup = p + '.1';
      require('node:fs').copyFileSync(p, backup);
      require('node:fs').truncateSync(p, 0);
    }
  } catch (e) {}
}

export function readAudit(n = 100) {
  const p = getAuditLogPath();
  if (!existsSync(p)) return [];
  const lines = readFileSync(p, 'utf-8').trim().split('\n').filter(Boolean);
  return lines.slice(-n).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
}
