import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LOCKFILE_VERSION = 2;
const LOCKFILE_HEADER = '# magic-lock v' + LOCKFILE_VERSION;

export function readLock(projectDir) {
  const p = join(projectDir, 'magic-lock.json');
  if (!existsSync(p)) {
    return { version: LOCKFILE_VERSION, modules: {} };
  }
  try {
    const raw = readFileSync(p, 'utf-8');
    const lines = raw.split('\n').filter((l) => !l.startsWith('#'));
    const j = JSON.parse(lines.join('\n'));
    if (j.version !== LOCKFILE_VERSION) {
      j.version = LOCKFILE_VERSION;
      j.migratedFrom = j.version;
    }
    if (!j.modules) j.modules = {};
    return j;
  } catch (e) {
    return { version: LOCKFILE_VERSION, modules: {}, corrupted: true };
  }
}

export function writeLock(projectDir, lock) {
  const p = join(projectDir, 'magic-lock.json');
  const out = { ...lock, version: LOCKFILE_VERSION };
  const txt = LOCKFILE_HEADER + '\n' + JSON.stringify(out, null, 2) + '\n';
  writeFileSync(p, txt);
}

export function lockHas(lock, name) {
  return !!(lock.modules && lock.modules[name]);
}

export function lockGet(lock, name) {
  return lock.modules[name] || null;
}

export function lockSet(lock, name, entry) {
  if (!lock.modules) lock.modules = {};
  lock.modules[name] = entry;
}

export function lockRemove(lock, name) {
  if (lock.modules) delete lock.modules[name];
}

export function lockEntries(lock) {
  return Object.entries(lock.modules || {});
}

export function lockDiff(oldLock, newLock) {
  const oldMap = oldLock.modules || {};
  const newMap = newLock.modules || {};
  const added = [];
  const removed = [];
  const changed = [];
  for (const k of Object.keys(newMap)) {
    if (!oldMap[k]) added.push({ name: k, ...newMap[k] });
    else if (JSON.stringify(oldMap[k]) !== JSON.stringify(newMap[k])) {
      changed.push({ name: k, from: oldMap[k], to: newMap[k] });
    }
  }
  for (const k of Object.keys(oldMap)) {
    if (!newMap[k]) removed.push({ name: k, ...oldMap[k] });
  }
  return { added, removed, changed };
}

export function lockUpdate(projectDir, name, entry) {
  const lock = readLock(projectDir);
  lockSet(lock, name, entry);
  writeLock(projectDir, lock);
  return lock;
}

export { LOCKFILE_VERSION };
