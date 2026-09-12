import { test, expect, describe } from 'bun:test';
import { parseSemVer, compareSemVer, maxSatisfying, satisfies, parseRange } from '../../script/util/semver-range.ts';
import { sha256, verifyIntegrity, integrityField, parseIntegrityField } from '../../script/util/integrity.ts';
import { parseFlags } from '../../script/util/json-output.ts';
import { parallelMap, Semaphore } from '../../script/util/concurrency.ts';
import { cacheKey, cacheHas, cacheGet, cachePut, cacheVerify, cacheClear, cacheList, cacheSize } from '../../script/util/global-cache.ts';
import { readLock, writeLock, lockSet, lockGet, lockHas, lockDiff } from '../../script/util/lock-manager.ts';
import { extractDependencies, buildDepTree, findWhy, detectCircular, resolveDependencies } from '../../script/util/dep-resolver.ts';
import { formatBytes, formatTime, doctorChecks } from '../../script/util/doctor.ts';
import { loadConfig, get, set, reset } from '../../script/util/magic-config.ts';
import { join } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

describe('SemVer 解析', () => {
  test('parseSemVer 合法版本', () => {
    expect(parseSemVer('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, pre: '', build: '', raw: '1.2.3' });
    expect(parseSemVer('v0.0.1')).toEqual({ major: 0, minor: 0, patch: 1, pre: '', build: '', raw: 'v0.0.1' });
    expect(parseSemVer('1.2.3-beta.1')).toEqual({ major: 1, minor: 2, patch: 3, pre: 'beta.1', build: '', raw: '1.2.3-beta.1' });
    expect(parseSemVer('1.2.3+build.5')).toEqual({ major: 1, minor: 2, patch: 3, pre: '', build: 'build.5', raw: '1.2.3+build.5' });
  });
  test('parseSemVer 非法', () => {
    expect(parseSemVer('abc')).toBeNull();
    expect(parseSemVer('1.2')).toBeNull();
    expect(parseSemVer('1.2.3.4')).toBeNull();
  });
  test('compareSemVer', () => {
    expect(compareSemVer('1.0.0', '1.0.0')).toBe(0);
    expect(compareSemVer('1.0.0', '1.0.1')).toBeLessThan(0);
    expect(compareSemVer('2.0.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareSemVer('1.0.0-beta', '1.0.0')).toBeLessThan(0);
    expect(compareSemVer('1.0.0-beta.2', '1.0.0-beta.1')).toBeGreaterThan(0);
  });
  test('parseRange 各种范围', () => {
    expect(parseRange('*')).toEqual([{ op: 'x' }]);
    expect(parseRange('^1.0.0')[0].op).toBe('^');
    expect(parseRange('~1.2.0')[0].op).toBe('~');
    expect(parseRange('>=1.0.0')[0].op).toBe('>=');
    expect(parseRange('1.x')[0].op).toBe('x-range');
    expect(parseRange('1.2.x')[0].op).toBe('x-range');
  });
  test('satisfies 各种操作符', () => {
    expect(satisfies('1.2.3', '*')).toBe(true);
    expect(satisfies('1.2.3', '^1.0.0')).toBe(true);
    expect(satisfies('2.0.0', '^1.0.0')).toBe(false);
    expect(satisfies('1.2.5', '~1.2.0')).toBe(true);
    expect(satisfies('1.3.0', '~1.2.0')).toBe(false);
    expect(satisfies('1.5.0', '1.x')).toBe(true);
    expect(satisfies('2.0.0', '1.x')).toBe(false);
    expect(satisfies('1.2.3', '1.2.x')).toBe(true);
    expect(satisfies('1.2.3', '>=1.0.0 <2.0.0')).toBe(true);
  });
  test('maxSatisfying 选最大满足版本', () => {
    expect(maxSatisfying(['1.0.0', '1.2.0', '1.2.5', '2.0.0'], '^1.0.0')).toBe('1.2.5');
    expect(maxSatisfying(['0.9.0', '1.0.0', '1.5.0'], '~2.0.0')).toBeNull();
    expect(maxSatisfying(['0.5.0', '1.0.0', '2.0.0'], '*')).toBe('2.0.0');
  });
});

describe('SHA-256 完整性', () => {
  test('sha256 计算', () => {
    expect(sha256(Buffer.from('hello'))).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });
  test('integrityField 格式', () => {
    const f = integrityField('abc123');
    expect(f).toBe('sha256-abc123');
    expect(parseIntegrityField(f)).toBe('abc123');
    expect(parseIntegrityField('sha256-')).toBeNull();
    expect(parseIntegrityField('abc')).toBeNull();
  });
  test('verifyIntegrity 匹配/不匹配/缺失', () => {
    const h = sha256(Buffer.from('test'));
    const f = integrityField(h);
    expect(verifyIntegrity(h, f).ok).toBe(true);
    expect(verifyIntegrity('wrong', f).ok).toBe(false);
    expect(verifyIntegrity(h, '').ok).toBe(true);
    expect(verifyIntegrity(h, null).ok).toBe(true);
    expect(verifyIntegrity(h, 'sha256-short').ok).toBe(false);
  });
});

describe('退出码 / JSON / Flags', () => {
  test('parseFlags 长短参数', () => {
    expect(parseFlags(['a', 'b', '--json', '--registry', 'url'], { json: 'boolean', registry: 'string' })).toEqual({ _: ['a', 'b'], json: true, registry: 'url' });
    expect(parseFlags(['--json', '--registry=https://x.com'], { json: 'boolean', registry: 'string' })).toEqual({ _: [], json: true, registry: 'https://x.com' });
  });
});

describe('并发控制', () => {
  test('Semaphore 限制并发', async () => {
    const sem = new Semaphore(2);
    let max = 0, active = 0;
    const tasks = Array.from({ length: 10 }, () => async () => {
      await sem.acquire();
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 20));
      active--;
      sem.release();
    });
    await Promise.all(tasks.map((t) => t()));
    expect(max).toBeLessThanOrEqual(2);
  });
  test('parallelMap 并行且全部完成', async () => {
    const r = await parallelMap([1, 2, 3, 4, 5], async (n) => n * 2, 3);
    expect(r).toEqual([2, 4, 6, 8, 10]);
  });
});

describe('全局缓存', () => {
  test('cachePut/Get/Has 完整', () => {
    const url = 'https://example.com/test-' + Date.now() + '.zip';
    expect(cacheHas(url)).toBe(false);
    cachePut(url, Buffer.from('data'), { integrity: 'sha256-x' });
    expect(cacheHas(url)).toBe(true);
    const got = cacheGet(url);
    expect(got.data.toString()).toBe('data');
    expect(got.meta.integrity).toBe('sha256-x');
  });
  test('cacheVerify 命中且 hash 匹配', () => {
    const data = Buffer.from('hello world');
    const h = sha256(data);
    const url = 'https://example.com/v-' + Date.now() + '.bin';
    cachePut(url, data, { integrity: integrityField(h) });
    const r = cacheVerify(url, integrityField(h));
    expect(r.ok).toBe(true);
  });
  test('cacheVerify 命中但 hash 不匹配', () => {
    const url = 'https://example.com/wrong-' + Date.now() + '.bin';
    cachePut(url, Buffer.from('a'), { integrity: integrityField('a') });
    const r = cacheVerify(url, integrityField('b'));
    expect(r.ok).toBe(false);
  });
  test('cacheList/Size/Clear', () => {
    const before = cacheSize();
    const url = 'https://example.com/cl-' + Date.now() + '.bin';
    cachePut(url, Buffer.from('1234567'));
    expect(cacheList().length).toBeGreaterThanOrEqual(1);
    expect(cacheSize()).toBeGreaterThan(before);
    cacheClear(url.replace('https://example.com/', ''));
  });
});

describe('Lock 文件 v2', () => {
  test('空 lock 读取返回 v2', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lock-'));
    try {
      const l = readLock(dir);
      expect(l.version).toBe(2);
      expect(l.modules).toEqual({});
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test('读写/差异化', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lock-'));
    try {
      let l = readLock(dir);
      lockSet(l, 'a/b', { version: '1.0.0', integrity: 'sha256-1' });
      lockSet(l, 'c/d', { version: '2.0.0', integrity: 'sha256-2' });
      writeLock(dir, l);
      const r = readLock(dir);
      expect(r.version).toBe(2);
      expect(lockHas(r, 'a/b')).toBe(true);
      expect(lockGet(r, 'a/b').version).toBe('1.0.0');
      const d = lockDiff({ modules: {} }, r);
      expect(d.added.length).toBe(2);
      expect(d.removed.length).toBe(0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test('lock header 写入', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lock-'));
    try {
      const l = readLock(dir);
      writeLock(dir, l);
      const fs = require('node:fs');
      const txt = fs.readFileSync(join(dir, 'magic-lock.json'), 'utf-8');
      expect(txt.startsWith('# magic-lock v2')).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('依赖解析', () => {
  test('extractDependencies', () => {
    const toml = `
[build]
out = "dist"

[dependencies]
"a/b" = "^1.0.0"
"c/d" = "2.0.0"
`;
    const fs = require('node:fs');
    const dir = mkdtempSync(join(tmpdir(), 'toml-'));
    try {
      writeFileSync(join(dir, 'build.toml'), toml);
      const d = extractDependencies({ deps: { 'a/b': '^1.0.0', 'c/d': '2.0.0' } });
      expect(d['a/b']).toBe('^1.0.0');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test('resolveDependencies', () => {
    const r = resolveDependencies({ 'a/b': '^1.0.0', 'c/d': '2.0.0' }, { 'a/b': ['1.0.0', '1.2.0', '2.0.0'], 'c/d': ['2.0.0'] });
    expect(r.ok).toBe(true);
    expect(r.resolved['a/b'].version).toBe('1.2.0');
  });
  test('findWhy + detectCircular', () => {
    const tree = {
      root: { version: '1.0.0', deps: { 'a/b': '1.0.0' } },
      'a/b': { version: '1.0.0', deps: { 'c/d': '1.0.0' } },
      'c/d': { version: '1.0.0', deps: {} }
    };
    const p = findWhy(tree, 'c/d');
    expect(p.length).toBeGreaterThan(0);
    const cycle = detectCircular({ a: { deps: { b: '1' } }, b: { deps: { a: '1' } } });
    expect(cycle.length).toBeGreaterThan(0);
  });
});

describe('Doctor 诊断', () => {
  test('返回 6 项检查', () => {
    const c = doctorChecks();
    expect(c.length).toBe(6);
    expect(c.find((x) => x.name === 'Bun runtime')).toBeDefined();
    expect(c.find((x) => x.name === 'MAGIC_HOME')).toBeDefined();
    expect(c.find((x) => x.name === 'Cache')).toBeDefined();
  });
});

describe('formatBytes / formatTime', () => {
  test('formatBytes 单位', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
  });
  test('formatTime', () => {
    expect(formatTime(500)).toBe('500ms');
    expect(formatTime(1500)).toBe('1.5s');
    expect(formatTime(65000)).toBe('1m5s');
  });
});

describe('Magic Config', () => {
  test('loadConfig 返回默认 + 持久化', () => {
    const c = loadConfig();
    expect(c.registry).toBeDefined();
    expect(c.retry).toBe(3);
    expect(c.lockfileVersion).toBe(2);
  });
  test('get/set/reset 流程', () => {
    const orig = get('retry');
    set('retry', 5);
    expect(get('retry')).toBe(5);
    reset();
    expect(get('retry')).toBe(3);
  });
});
