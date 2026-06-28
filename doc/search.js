(function (global) {
  'use strict';
  function highlightSnippet(text, ranges) {
    if (!text) return '';
    if (!ranges || !ranges.length) return escapeHtml(text);
    const sorted = ranges.slice().sort((a, b) => a[0] - b[0]);
    let html = '';
    let cursor = 0;
    for (const [s, e] of sorted) {
      if (s < cursor) continue;
      html += escapeHtml(text.slice(cursor, s));
      html += '<mark>' + escapeHtml(text.slice(s, e + 1)) + '</mark>';
      cursor = e + 1;
    }
    html += escapeHtml(text.slice(cursor));
    return html;
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function findRanges(text, query) {
    if (!text || !query) return [];
    const q = query.toLowerCase();
    const t = text.toLowerCase();
    const ranges = [];
    let pos = 0;
    while (pos < t.length) {
      const idx = t.indexOf(q, pos);
      if (idx === -1) break;
      ranges.push([idx, idx + q.length - 1]);
      pos = idx + q.length;
      if (ranges.length > 6) break;
    }
    return ranges;
  }
  function splitByHeadings(md) {
    const items = [];
    if (!md) return items;
    const re = /^(#{1,6})\s+(.+?)\s*$/gm;
    const splits = [];
    let m;
    while ((m = re.exec(md)) !== null) {
      splits.push({ level: m[1].length, heading: m[2].trim(), start: m.index, headingStart: m.index });
    }
    if (!splits.length) {
      return [{ level: 1, heading: '', content: md, sectionIndex: 0 }];
    }
    if (splits[0].start > 0) {
      items.push({ level: 0, heading: '', content: md.slice(0, splits[0].start), sectionIndex: 0 });
    }
    for (let i = 0; i < splits.length; i++) {
      const cur = splits[i];
      const next = splits[i + 1];
      const bodyStart = cur.start + cur.heading.length + cur.level + 2;
      const bodyEnd = next ? next.start : md.length;
      const content = md.slice(bodyStart, bodyEnd).trim();
      items.push({
        level: cur.level,
        heading: cur.heading,
        content,
        sectionIndex: items.length
      });
    }
    return items;
  }
  function buildIndex(docs, locale) {
    const items = [];
    docs.forEach((doc) => {
      const t = doc.translations[locale];
      const title = t.title;
      const sections = splitByHeadings(t.content || '');
      sections.forEach((s) => {
        items.push({
          docId: doc.id,
          docTitle: title,
          sectionIndex: s.sectionIndex,
          sectionHeading: s.heading,
          content: s.content
        });
      });
    });
    return items;
  }
  function search(docs, query, locale, limit = 16) {
    if (!query || !query.trim()) return [];
    const items = buildIndex(docs, locale);
    const q = query.trim();
    const results = [];
    for (const item of items) {
      const titleLower = item.docTitle.toLowerCase();
      const headingLower = item.sectionHeading.toLowerCase();
      const contentLower = item.content.toLowerCase();
      const qLower = q.toLowerCase();
      let score = 0;
      let matchField = null;
      let ranges = [];
      if (titleLower.includes(qLower)) {
        score = 30 + (titleLower.startsWith(qLower) ? 10 : 0);
        matchField = 'title';
        ranges = findRanges(item.docTitle, q);
      }
      else if (headingLower.includes(qLower)) {
        score = 20 + (headingLower.startsWith(qLower) ? 8 : 0);
        matchField = 'heading';
        ranges = findRanges(item.sectionHeading, q);
      }
      else if (contentLower.includes(qLower)) {
        const idx = contentLower.indexOf(qLower);
        const posPenalty = Math.min(1, idx / Math.max(1, contentLower.length));
        score = 10 - posPenalty * 5;
        matchField = 'content';
        const ctx = 60;
        const start = Math.max(0, idx - ctx);
        const end = Math.min(item.content.length, idx + q.length + ctx);
        const snippet = (start > 0 ? '...' : '') + item.content.slice(start, end) + (end < item.content.length ? '...' : '');
        const localRanges = findRanges(item.content.slice(start, end), q).map(([s, e]) => [s + (start > 0 ? 1 : 0), e + (start > 0 ? 1 : 0)]);
        results.push({
          docId: item.docId,
          docTitle: item.docTitle,
          sectionHeading: item.sectionHeading,
          sectionIndex: item.sectionIndex,
          snippet,
          matchRanges: localRanges,
          matchField,
          score
        });
        continue;
      }
      if (score > 0) {
        let snippet = item.sectionHeading;
        if (matchField === 'title') snippet = item.docTitle;
        results.push({
          docId: item.docId,
          docTitle: item.docTitle,
          sectionHeading: item.sectionHeading,
          sectionIndex: item.sectionIndex,
          snippet: matchField === 'title' ? item.docTitle : item.sectionHeading,
          matchRanges: ranges,
          matchField,
          score
        });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }
  global.MagicSearch = {
    search,
    highlightSnippet
  };
})(window);
