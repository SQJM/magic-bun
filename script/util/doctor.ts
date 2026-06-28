export function formatBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
  return (n / 1024 / 1024 / 1024).toFixed(1) + ' GB';
}

export function formatTime(ms) {
  if (ms < 1000) return ms + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  return Math.floor(ms / 60000) + 'm' + Math.floor((ms % 60000) / 1000) + 's';
}

export function doctorChecks() {
  const checks = [];

  checks.push({
    name: 'Bun runtime',
    ok: typeof Bun !== 'undefined',
    detail: typeof Bun !== 'undefined' ? 'Bun ' + Bun.version : 'Bun not detected (running under Node ' + process.version + ')'
  });

  const home = process.env.MAGIC_HOME || require('node:os').homedir() + '/.magic';
  const fs = require('node:fs');
  checks.push({
    name: 'MAGIC_HOME',
    ok: fs.existsSync(home),
    detail: home + (fs.existsSync(home) ? '' : ' (will be created on first run)')
  });

  const cfg = home + '/config.json';
  checks.push({
    name: 'Config file',
    ok: true,
    detail: cfg + (fs.existsSync(cfg) ? '' : ' (using defaults)')
  });

  const cache = home + '/cache';
  if (fs.existsSync(cache)) {
    let size = 0;
    for (const f of fs.readdirSync(cache)) {
      try { size += fs.statSync(cache + '/' + f).size; } catch (e) {}
    }
    checks.push({
      name: 'Cache',
      ok: true,
      detail: cache + ' (' + formatBytes(size) + ', ' + fs.readdirSync(cache).length + ' entries)'
    });
  } else {
    checks.push({ name: 'Cache', ok: true, detail: cache + ' (empty)' });
  }

  const registry = process.env.MAGIC_REGISTRY || 'https://github.com';
  checks.push({
    name: 'Registry',
    ok: true,
    detail: registry
  });

  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  checks.push({
    name: 'Proxy',
    ok: true,
    detail: proxy || '(none)'
  });

  return checks;
}
