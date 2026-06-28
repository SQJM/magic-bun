export function parseSemVer(v) {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-.]+))?(?:\+([0-9A-Za-z-.]+))?$/);
  if (!m) return null;
  return {
    major: +m[1],
    minor: +m[2],
    patch: +m[3],
    pre: m[4] || '',
    build: m[5] || '',
    raw: v
  };
}

export function compareSemVer(a, b) {
  const A = typeof a === 'string' ? parseSemVer(a) : a;
  const B = typeof b === 'string' ? parseSemVer(b) : b;
  if (!A || !B) return 0;
  if (A.major !== B.major) return A.major - B.major;
  if (A.minor !== B.minor) return A.minor - B.minor;
  if (A.patch !== B.patch) return A.patch - B.patch;
  if (A.pre && !B.pre) return -1;
  if (!A.pre && B.pre) return 1;
  if (A.pre && B.pre) return A.pre < B.pre ? -1 : A.pre > B.pre ? 1 : 0;
  return 0;
}

export function maxSatisfying(versions, range) {
  const rs = parseRange(range);
  if (!rs) return null;
  const sorted = [...versions].sort(compareSemVer);
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (satisfies(sorted[i], rs)) return sorted[i];
  }
  return null;
}

export function satisfies(version, range) {
  const v = typeof version === 'string' ? parseSemVer(version) : version;
  if (!v) return false;
  const rs = typeof range === 'string' ? parseRange(range) : range;
  if (!rs) return false;
  return rs.every((r) => matchOne(v, r));
}

function matchOne(v, r) {
  if (r.op === '=') return compareSemVer(v, r.ver) === 0;
  if (r.op === '>=') return compareSemVer(v, r.ver) >= 0;
  if (r.op === '<=') return compareSemVer(v, r.ver) <= 0;
  if (r.op === '>') return compareSemVer(v, r.ver) > 0;
  if (r.op === '<') return compareSemVer(v, r.ver) < 0;
  if (r.op === '^') {
    if (r.ver.major !== v.major) return false;
    return compareSemVer(v, r.ver) >= 0;
  }
  if (r.op === '~') {
    if (r.ver.major !== v.major || r.ver.minor !== v.minor) return false;
    return compareSemVer(v, r.ver) >= 0;
  }
  if (r.op === 'x' || r.op === '*') return true;
  if (r.op === 'x-range') {
    const pmaj = r.parts[0] === 'x' ? null : +r.parts[0];
    const pmin = r.parts[1] === 'x' ? null : +r.parts[1];
    const ppatch = r.parts[2] === 'x' ? null : +r.parts[2];
    if (pmaj !== null && v.major !== pmaj) return false;
    if (pmin !== null && v.minor !== pmin) return false;
    if (ppatch !== null && v.patch !== ppatch) return false;
    return true;
  }
  if (r.op === '~>') {
    if (r.ver.major !== v.major) return false;
    if (r.ver.minor !== v.minor) return false;
    return compareSemVer(v, r.ver) >= 0;
  }
  return false;
}

export function parseRange(range) {
  if (!range || typeof range !== 'string') return null;
  const trimmed = range.trim();
  if (!trimmed) return null;
  if (trimmed === '*' || trimmed === 'x' || trimmed === 'X' || trimmed === 'latest') {
    return [{ op: 'x' }];
  }
  const parts = trimmed.split(/\s*\|\|\s*/);
  const out = [];
  for (const p of parts) {
    const clauses = p.trim().split(/\s+/);
    for (const c of clauses) {
      const r = parseClause(c);
      if (!r) return null;
      out.push(r);
    }
  }
  return out;
}

function parseClause(c) {
  if (c === '*' || c === 'x' || c === 'X') return { op: 'x' };
  let m;
  if ((m = c.match(/^=(\d.+)$/))) return { op: '=', ver: parseSemVer(m[1]) };
  if ((m = c.match(/^>=(\d.+)$/))) return { op: '>=', ver: parseSemVer(m[1]) };
  if ((m = c.match(/^<=(\d.+)$/))) return { op: '<=', ver: parseSemVer(m[1]) };
  if ((m = c.match(/^>(\d.+)$/))) return { op: '>', ver: parseSemVer(m[1]) };
  if ((m = c.match(/^<(\d.+)$/))) return { op: '<', ver: parseSemVer(m[1]) };
  if ((m = c.match(/^\^(\d.+)$/))) return { op: '^', ver: parseSemVer(m[1]) };
  if ((m = c.match(/^~(\d.+)$/))) return { op: '~', ver: parseSemVer(m[1]) };
  if ((m = c.match(/^~>(\d.+)$/))) return { op: '~>', ver: parseSemVer(m[1]) };
  if ((m = c.match(/^(\d+|x|X|\*)\.(\d+|x|X|\*)\.(\d+|x|X|\*)$/))) {
    return { op: 'x-range', parts: [m[1], m[2], m[3]] };
  }
  if ((m = c.match(/^(\d+)\.(\d+|x|X|\*)$/))) {
    return { op: 'x-range', parts: [m[1], m[2], 'x'] };
  }
  if ((m = c.match(/^(\d+)$/))) {
    return { op: 'x-range', parts: [m[1], 'x', 'x'] };
  }
  if ((m = c.match(/^(\d.+)$/))) {
    return { op: '=', ver: parseSemVer(m[1]) };
  }
  return null;
}
