(function () {
  'use strict';
  const state = {
    locale: 'zh-CN',
    theme: 'light',
    activeFilter: 'all',
    searchOpen: false,
    currentRoute: { name: 'home', params: {} }
  };
  const THEME_ICONS = {
    light: 'icon-sun',
    dark: 'icon-moon',
    acrylic: 'icon-acrylic'
  };
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.startsWith('on') && typeof attrs[k] === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        } else if (k === 'style' && typeof attrs[k] === 'object') {
          Object.assign(node.style, attrs[k]);
        } else if (attrs[k] != null) {
          node.setAttribute(k, attrs[k]);
        }
      }
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach((c) => {
        if (c == null) return;
        if (typeof c === 'string') node.appendChild(document.createTextNode(c));
        else node.appendChild(c);
      });
    }
    return node;
  }
  function rewriteAnchorLinks(host, currentDocId) {
    const links = host.querySelectorAll('a[href^="#"]');
    links.forEach((a) => {
      const raw = a.getAttribute('href') || '';
      if (raw.startsWith('#/')) return;
      if (raw === '#') return;
      const slug = decodeURIComponent(raw.slice(1));
      if (!slug) return;
      if (MagicData.docHasAnchor(currentDocId, slug)) {
        a.setAttribute('href', '#/docs/' + encodeURIComponent(currentDocId) + '#' + encodeURIComponent(slug));
      } else {
        const targetDoc = MagicData.findDocByAnchor(slug);
        if (targetDoc) {
          a.setAttribute('href', '#/docs/' + encodeURIComponent(targetDoc) + '#' + encodeURIComponent(slug));
        } else {
          a.setAttribute('href', '#/404#' + encodeURIComponent(slug));
        }
      }
    });
  }
  function scrollToAnchor(slug) {
    const safe = (slug || '').replace(/[^\w\u4e00-\u9fff-]/g, '');
    if (!safe) return;
    const host = $('#doc-content') || document.body;
    const target = host.querySelector('#' + CSS.escape(safe)) || host.querySelector('[id="' + safe + '"]');
    if (target) {
      const top = target.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: 'smooth' });
      target.classList.add('anchor-flash');
      setTimeout(() => target.classList.remove('anchor-flash'), 1600);
    } else {
      const inOther = MagicData.findDocByAnchor(safe);
      if (inOther && inOther !== currentDocId()) {
        navigate('#/docs/' + encodeURIComponent(inOther) + '#' + encodeURIComponent(safe));
      }
    }
  }
  function currentDocId() {
    return state.currentRoute?.params?.id || '';
  }
  function parseHash() {
    const raw = (location.hash || '#/');
    let path = raw.replace(/^#/, '');
    if (path.startsWith('/')) path = path.slice(1);
    const hashIdx = path.indexOf('#');
    let anchor = '';
    if (hashIdx >= 0) {
      anchor = decodeURIComponent(path.slice(hashIdx + 1));
      path = path.slice(0, hashIdx);
    }
    const [pathOnly, queryStr] = path.split('?');
    const segs = pathOnly.split('/').filter(Boolean);
    if (segs.length === 0 && !anchor) return { name: 'home' };
    if (segs.length === 0 && anchor) return { name: 'anchor-lookup', params: { slug: anchor } };
    if (segs[0] === 'docs' && segs.length === 1) {
      return anchor ? { name: 'doc-detail', params: { id: '使用指南', anchor } } : { name: 'docs-index' };
    }
    if (segs[0] === 'docs' && segs.length === 2) {
      return { name: 'doc-detail', params: { id: decodeURIComponent(segs[1]), anchor } };
    }
    if (segs.length === 1) {
      const anchorSlug = anchor || decodeURIComponent(segs[0]);
      return { name: 'anchor-lookup', params: { slug: anchorSlug } };
    }
    return { name: 'not-found' };
  }
  function navigate(hash) {
    if (location.hash === hash) {
      render();
    } else {
      location.hash = hash;
    }
  }
  window.addEventListener('hashchange', () => {
    state.currentRoute = parseHash();
    render();
  });
  function t(key) { return MagicI18N.getPath(state.locale, key); }
  function applyI18n(root) {
    $$('[data-i18n]', root || document).forEach((node) => {
      const key = node.getAttribute('data-i18n');
      node.textContent = t(key);
    });
    $$('[data-i18n-placeholder]', root || document).forEach((node) => {
      const key = node.getAttribute('data-i18n-placeholder');
      node.setAttribute('placeholder', t(key));
    });
  }
  function setLocale(locale) {
    state.locale = locale;
    MagicMarkdown.setLocale(locale);
    document.documentElement.setAttribute('lang', locale === 'zh-CN' ? 'zh-CN' : 'en');
    $$('.lang-btn').forEach((btn) => {
      btn.setAttribute('aria-pressed', btn.dataset.locale === locale ? 'true' : 'false');
    });
    try { localStorage.setItem('magic-locale', locale); } catch (e) { }
    render();
  }
  function setTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    const icon = $('#theme-icon');
    if (icon) {
      icon.className = 'theme-icon ' + THEME_ICONS[theme];
    }
    try { localStorage.setItem('magic-theme', theme); } catch (e) { }
  }
  function cycleTheme() {
    const order = ['light', 'dark', 'acrylic'];
    const i = order.indexOf(state.theme);
    setTheme(order[(i + 1) % order.length]);
  }
  let renderToken = 0;
  async function render() {
    const token = ++renderToken;
    const app = $('#app');
    if (!app) return;
    const route = state.currentRoute;
    applyI18n();
    $$('.topnav a').forEach((a) => a.classList.remove('active'));
    if (route.name === 'home') $('.topnav a[data-nav="home"]')?.classList.add('active');
    else if (route.name === 'docs-index') $('.topnav a[data-nav="docs"]')?.classList.add('active');
    else if (route.name === 'doc-detail') {
      $('.topnav a[data-nav="docs"]')?.classList.add('active');
    }
    try {
      // Only load i18n upfront; doc content is lazy-loaded per-page
      await MagicI18N.loadAll();
    } catch (e) {
      if (token !== renderToken) return;
      app.innerHTML = '';
      app.className = 'app-shell';
      app.appendChild(el('div', { class: 'loading', text: '文档加载失败:' + e.message }));
      return;
    }
    if (token !== renderToken) return;

    // Lazy-load doc content only for detail pages
    if (route.name === 'doc-detail' && route.params.id) {
      try {
        var cached = MagicData.getDoc(route.params.id);
        if (!cached) {
          await MagicData.loadDoc(route.params.id);
        }
      } catch (e) {
        // If lazy load fails, show UI with cached data anyway
      }
    }

    if (token !== renderToken) return;
    app.innerHTML = '';
    app.className = 'app-shell';
    if (route.name === 'home') {
      renderHome(app);
    } else if (route.name === 'docs-index') {
      renderDocsIndex(app);
    } else if (route.name === 'doc-detail') {
      renderDocDetail(app, route.params.id, route.params.anchor);
    } else if (route.name === 'anchor-lookup') {
      renderAnchorLookup(app, route.params.slug);
    } else {
      renderNotFound(app);
    }
  }
  function renderAnchorLookup(app, slug) {
    const target = MagicData.findDocByAnchor(slug);
    if (target) {
      navigate('#/docs/' + encodeURIComponent(target) + '#' + slug);
      return;
    }
    return renderNotFound(app);
  }
  function renderHome(app) {
    const tpl = $('#tpl-home');
    const node = tpl.content.cloneNode(true);
    app.appendChild(node);
    const features = MagicI18N.getFeatures(state.locale);
    const fg = $('#features-grid');
    features.forEach((f, i) => {
      fg.appendChild(el('a', {
        class: 'feature-card stagger-' + (i + 1),
        style: { animation: 'slide-up 500ms cubic-bezier(0.16, 1, 0.3, 1) ' + (i * 60) + 'ms both' }
      }, [
        el('div', { class: 'feature-icon', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + MagicI18N.getFeatureIcon(f.icon) + '</svg>' }),
        el('h3', { class: 'feature-title', text: f.title }),
        el('p', { class: 'feature-desc', text: f.desc })
      ]));
    });
    const summaries = MagicData.getAllSummaries();
    const mg = $('#docs-map-grid');
    summaries.forEach((s, i) => {
      const catLabel = MagicData.getCategoryLabel(s.category, state.locale);
      const color = MagicData.getCategoryColor(s.category);
      const title = state.locale === 'zh-CN' ? s.zhTitle : s.enTitle;
      const desc = s.description[state.locale];
      const sections = state.locale === 'zh-CN' ? s.zhSections : s.enSections;
      const iconSvg = MagicI18N.getDocIcon(s.id);
      mg.appendChild(el('a', {
        class: 'doc-card stagger-' + Math.min(9, i + 1),
        href: `#/docs/${encodeURIComponent(s.id)}`,
        style: { animation: 'slide-up 500ms cubic-bezier(0.16, 1, 0.3, 1) ' + (i * 40) + 'ms both' }
      }, [
        el('div', { class: 'doc-card-head' }, [
          el('div', { class: 'doc-card-icon', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + iconSvg + '</svg>' }),
          el('span', { class: 'doc-card-cat', text: catLabel, style: { background: color + '20', color: color } })
        ]),
        el('h3', { class: 'doc-card-title', text: title }),
        el('p', { class: 'doc-card-desc', text: desc }),
        el('div', { class: 'doc-card-foot' }, [
          el('span', { text: sections + ' ' + t('docs.sectionsLabel') }),
          el('span', { text: '·' }),
          el('span', { text: s.readMinutes + ' ' + t('docs.readMinutes') }),
          el('span', { class: 'doc-card-arrow', html: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>' })
        ])
      ]));
    });
    applyI18n(app);
  }
  function renderDocsIndex(app) {
    const tpl = $('#tpl-docs-index');
    const node = tpl.content.cloneNode(true);
    app.appendChild(node);
    renderSideNav($('#side-nav'));
    const chips = $('#filter-chips');
    const cats = [
      { key: 'all', zh: '全部', en: 'All' },
      { key: 'start', zh: '入门', en: 'Get Started' },
      { key: 'core', zh: '进阶', en: 'Core' },
      { key: 'reference', zh: '参考', en: 'Reference' }
    ];
    chips.appendChild(el('button', {
      class: 'chip' + (state.activeFilter === 'all' ? ' active' : ''),
      'data-cat': 'all',
      text: state.locale === 'zh-CN' ? '全部' : 'All',
      onclick: () => { state.activeFilter = 'all'; render(); }
    }));
    cats.slice(1).forEach((c) => {
      chips.appendChild(el('button', {
        class: 'chip' + (state.activeFilter === c.key ? ' active' : ''),
        'data-cat': c.key,
        text: state.locale === 'zh-CN' ? c.zh : c.en,
        onclick: () => { state.activeFilter = c.key; render(); }
      }));
    });
    const summaries = MagicData.getAllSummaries();
    const filtered = state.activeFilter === 'all' ? summaries : summaries.filter((s) => s.category === state.activeFilter);
    const grid = $('#docs-grid');
    filtered.forEach((s, i) => {
      const catLabel = MagicData.getCategoryLabel(s.category, state.locale);
      const color = MagicData.getCategoryColor(s.category);
      const title = state.locale === 'zh-CN' ? s.zhTitle : s.enTitle;
      const desc = s.description[state.locale];
      const sections = state.locale === 'zh-CN' ? s.zhSections : s.enSections;
      const iconSvg = MagicI18N.getDocIcon(s.id);
      grid.appendChild(el('a', {
        class: 'doc-card stagger-' + Math.min(9, i + 1),
        href: `#/docs/${encodeURIComponent(s.id)}`,
        style: { animation: 'slide-up 400ms cubic-bezier(0.16, 1, 0.3, 1) ' + (i * 30) + 'ms both' }
      }, [
        el('div', { class: 'doc-card-head' }, [
          el('div', { class: 'doc-card-icon', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + iconSvg + '</svg>' }),
          el('span', { class: 'doc-card-cat', text: catLabel, style: { background: color + '20', color: color } })
        ]),
        el('h3', { class: 'doc-card-title', text: title }),
        el('p', { class: 'doc-card-desc', text: desc }),
        el('div', { class: 'doc-card-foot' }, [
          el('span', { text: sections + ' ' + t('docs.sectionsLabel') }),
          el('span', { text: '·' }),
          el('span', { text: s.readMinutes + ' ' + t('docs.readMinutes') }),
          el('span', { class: 'doc-card-arrow', html: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>' })
        ])
      ]));
    });
    applyI18n(app);
  }
  function renderSideNav(host) {
    if (!host) return;
    host.innerHTML = '';
    const summaries = MagicData.getAllSummaries();
    const groups = [
      { key: 'start', items: summaries.filter((s) => s.category === 'start') },
      { key: 'core', items: summaries.filter((s) => s.category === 'core') },
      { key: 'reference', items: summaries.filter((s) => s.category === 'reference') }
    ];
    groups.forEach((g) => {
      if (!g.items.length) return;
      const title = state.locale === 'zh-CN' ? MagicData.CATEGORY_META[g.key].zh : MagicData.CATEGORY_META[g.key].en;
      host.appendChild(el('div', { class: 'side-nav-group' }, [
        el('h4', { class: 'side-nav-title', text: title }),
        ...g.items.map((s) => {
          const a = el('a', {
            href: `#/docs/${encodeURIComponent(s.id)}`
          }, [
            el('span', { class: 'side-nav-icon', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + MagicI18N.getDocIcon(s.id) + '</svg>' }),
            document.createTextNode(state.locale === 'zh-CN' ? s.zhTitle : s.enTitle)
          ]);
          if (state.currentRoute.name === 'doc-detail' && state.currentRoute.params.id === s.id) {
            a.classList.add('active');
          }
          return a;
        })
      ]));
    });
  }
  function renderDocDetail(app, id, anchor) {
    const doc = MagicData.getDoc(id);
    const tpl = $('#tpl-doc-detail');
    const node = tpl.content.cloneNode(true);
    app.appendChild(node);
    renderSideNav($('#side-nav'));
    if (!doc) {
      $('#doc-content').innerHTML = '';
      $('#doc-content').appendChild(el('div', { class: 'loading', text: '未找到文档:' + id }));
      $('#outline-nav').innerHTML = '';
      return;
    }
    const trans = doc.translations[state.locale];
    const content = $('#doc-content');
    content.innerHTML = '';
    content.appendChild(el('h1', { text: trans.title }));
    const meta = el('div', { class: 'doc-meta' }, [
      el('span', { text: doc.source }),
      el('span', { text: '·' }),
      el('span', { text: (trans.content || '').split(/\n#{1,6} /).length - 1 + ' ' + t('docs.sectionsLabel') })
    ]);
    content.appendChild(meta);
    const sectionsWithAnchors = [];
    const fullHtml = MagicMarkdown.render(trans.content || '');
    const contentHost = el('div', { class: 'doc-body', html: fullHtml });
    contentHost.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
      if (h.tagName === 'H1') return;
      if (!h.id) h.id = MagicMarkdown.slugify(h.textContent || '');
      sectionsWithAnchors.push({ level: parseInt(h.tagName[1]), text: h.textContent, id: h.id });
    });
    content.appendChild(contentHost);
    rewriteAnchorLinks(contentHost, id);
    renderOutline($('#outline-nav'), sectionsWithAnchors);
    if (anchor) {
      requestAnimationFrame(() => scrollToAnchor(anchor));
    }
    const { prev, next } = MagicData.getPrevNext(id);
    const foot = el('div', { class: 'doc-nav-foot' });
    if (prev) {
      const p = MagicData.getDoc(prev);
      const pTitle = p ? (state.locale === 'zh-CN' ? p.translations['zh-CN'].title : p.translations['en-US'].title) : prev;
      foot.appendChild(el('a', { href: `#/docs/${encodeURIComponent(prev)}` }, [
        el('span', { class: 'label', text: '← ' + t('docs.prev') }),
        el('span', { class: 'title', text: pTitle })
      ]));
    } else {
      foot.appendChild(el('a', { href: '#/docs', style: { visibility: 'hidden' } }, [el('span')]));
    }
    if (next) {
      const n = MagicData.getDoc(next);
      const nTitle = n ? (state.locale === 'zh-CN' ? n.translations['zh-CN'].title : n.translations['en-US'].title) : next;
      foot.appendChild(el('a', { class: 'next', href: `#/docs/${encodeURIComponent(next)}` }, [
        el('span', { class: 'label', text: t('docs.next') + ' →' }),
        el('span', { class: 'title', text: nTitle })
      ]));
    } else {
      foot.appendChild(el('a', { href: '#/', style: { visibility: 'hidden' } }, [el('span')]));
    }
    content.appendChild(foot);
    bindCodeCopy(content);
    bindOutlineScrollSpy();
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }
  function renderOutline(host, items) {
    if (!host) return;
    host.innerHTML = '';
    if (!items || !items.length) return;
    host.appendChild(el('h4', { text: t('docs.toc') }));
    items.forEach((it) => {
      const link = el('a', {
        href: '#/docs/' + encodeURIComponent(currentDocId()) + '#' + encodeURIComponent(it.id),
        'data-target': it.id,
        class: 'lvl-' + it.level,
        text: it.text
      });
      link.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        const id = it.id;
        scrollToAnchor(id);
        const newHash = '#/docs/' + encodeURIComponent(currentDocId()) + '#' + encodeURIComponent(id);
        if (location.hash !== newHash) {
          history.replaceState(null, '', newHash);
          if (state.currentRoute) state.currentRoute.params = state.currentRoute.params || {};
          if (state.currentRoute) state.currentRoute.params.anchor = id;
        }
      });
      host.appendChild(link);
    });
  }
  function bindOutlineScrollSpy() {
    const links = $$('.outline-nav a');
    if (!links.length) return;
    const targets = links.map((a) => document.getElementById(a.dataset.target)).filter(Boolean);
    const setActive = (id) => {
      links.forEach((a) => a.classList.toggle('active', a.dataset.target === id));
    };
    const obs = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.target.offsetTop - b.target.offsetTop);
      if (visible[0]) setActive(visible[0].target.id);
    }, { rootMargin: '-80px 0px -60% 0px' });
    targets.forEach((t) => obs.observe(t));
  }
  function bindCodeCopy(root) {
    $$('.code-copy', root).forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const code = btn.getAttribute('data-code') || '';
        try {
          await navigator.clipboard.writeText(code);
          const old = btn.textContent;
          btn.textContent = t('copied');
          btn.classList.add('copied');
          setTimeout(() => { btn.textContent = old; btn.classList.remove('copied'); }, 1400);
        } catch (e) {
          console.error('Copy failed', e);
        }
      });
    });
  }
  function renderNotFound(app) {
    const tpl = $('#tpl-notfound');
    const node = tpl.content.cloneNode(true);
    app.appendChild(node);
    applyI18n(app);
  }
  function openSearch() {
    state.searchOpen = true;
    $('#search-panel').classList.add('open');
    setTimeout(() => $('#search-input')?.focus(), 50);
  }
  function closeSearch() {
    state.searchOpen = false;
    $('#search-panel').classList.remove('open');
    $('#search-input').value = '';
    $('#search-results').innerHTML = '';
  }
  function performSearch(query) {
    const host = $('#search-results');
    if (!host) return;
    host.innerHTML = '';
    if (!query.trim()) {
      host.appendChild(el('div', { class: 'search-empty', text: '' }));
      return;
    }
    const allDocs = [];
    MagicData.DOC_FILES.forEach((name) => {
      const id = name.replace(/\.html$/, '');
      const d = MagicData.getDoc(id);
      if (d) allDocs.push(d);
    });
    const results = MagicSearch.search(allDocs, query, state.locale, 50);
    const currentDocId = state.currentRoute.name === 'doc-detail' ? state.currentRoute.params.id : null;

    const finalResults = [];
    const seen = new Set();
    const ql = query.toLowerCase();

    // 1. Document title matches (always first) — use summaries as fallback
    var summarizedIds = [];
    for (const d of allDocs) {
      const title = (d.translations[state.locale]?.title || '');
      if (title.toLowerCase().includes(ql)) {
        const key = 'doc:' + d.id;
        if (!seen.has(key)) { seen.add(key);
          finalResults.push({ docId: d.id, docTitle: title, sectionHeading: null, isDocMatch: true }); }
      }
      summarizedIds.push(d.id);
    }
    // Also check config summaries for docs not yet loaded
    const config = window.__MAGIC_CONFIG;
    if (config && config.summaries && config.docFiles) {
      config.docFiles.forEach(function (id) {
        if (seen.has('doc:' + id)) return;
        var pre = config.summaries[id];
        if (!pre) return;
        var title = state.locale === 'zh-CN' ? pre.zhTitle : pre.enTitle;
        if (title && title.toLowerCase().includes(ql)) {
          seen.add('doc:' + id);
          finalResults.push({ docId: id, docTitle: title, sectionHeading: null, isDocMatch: true });
        }
      });
    }

    // 2. If on doc detail page, search rendered DOM for matching headings
    if (currentDocId) {
      const content = $('#doc-content');
      if (content) {
        const currentDoc = MagicData.getDoc(currentDocId);
        const docTitle = currentDoc?.translations[state.locale]?.title || currentDocId;
        content.querySelectorAll('h2, h3, h4, h5, h6').forEach(h => {
          const text = h.textContent || '';
          if (text.toLowerCase().includes(ql)) {
            const key = 'dom:' + currentDocId + ':' + text;
            if (!seen.has(key)) { seen.add(key);
              finalResults.push({ docId: currentDocId, docTitle, sectionHeading: text, isDomMatch: true }); }
          }
        });
      }
    }

    // 3. Standard search results (deduplicated, fill rest to 18)
    for (const r of results) {
      if (finalResults.length >= 18) break;
      const key = r.docId + ':' + (r.sectionHeading || '');
      if (!seen.has(key)) {
        seen.add(key);
        finalResults.push(r);
      }
    }

    if (!finalResults.length) {
      host.appendChild(el('div', { class: 'search-empty', text: t('search.empty') }));
      return;
    }
    const esc = MagicSearch.escapeHtml || (s => s);
    function highlightText(text, query) {
      if (!query) return esc(text);
      const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return text.split(new RegExp(`(${q})`, 'gi'))
        .map(p => p.toLowerCase() === query.toLowerCase() ? `<mark>${esc(p)}</mark>` : esc(p)).join('');
    }
    finalResults.forEach((r) => {
      const sectionSlug = r.sectionHeading ? MagicData.slugify(r.sectionHeading) : '';
      const hash = sectionSlug ? '#' + encodeURIComponent(sectionSlug) : '';
      const children = [el('div', { class: 'search-result-title', html: highlightText(r.docTitle, query) })];
      if (r.sectionHeading) {
        children.push(el('div', { class: 'search-result-heading', html: highlightText(r.sectionHeading, query) }));
      }
      host.appendChild(el('a', {
        class: 'search-result' + (r.isDocMatch ? ' search-result-doc' : ''),
        href: `#/docs/${encodeURIComponent(r.docId)}${hash}`,
        onclick: (e) => {
          e.preventDefault();
          const target = e.currentTarget.getAttribute('href');
          closeSearch();
          location.hash = target;
        }
      }, children));
    });
  }
  function init() {
    try {
      const savedLocale = localStorage.getItem('magic-locale');
      if (savedLocale === 'zh-CN' || savedLocale === 'en-US') state.locale = savedLocale;
      const savedTheme = localStorage.getItem('magic-theme');
      if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'acrylic') state.theme = savedTheme;
    } catch (e) { }
    setTheme(state.theme);
    setLocale(state.locale);
    state.currentRoute = parseHash();
    $('#theme-btn').addEventListener('click', cycleTheme);
    $$('.lang-btn').forEach((btn) => {
      btn.addEventListener('click', () => setLocale(btn.dataset.locale));
    });
    $('#search-trigger').addEventListener('click', openSearch);
    $('#search-close').addEventListener('click', closeSearch);
    $('#search-panel').addEventListener('click', (e) => {
      if (e.target.id === 'search-panel') closeSearch();
    });
    $('#search-input').addEventListener('input', (e) => performSearch(e.target.value));
    $('#search-input').addEventListener('keydown', (e) => {
      const results = $$('.search-result');
      if (!results.length) return;
      const active = $('.search-result.active');
      let idx = active ? Array.from(results).indexOf(active) : -1;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        idx = Math.min(idx + 1, results.length - 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        idx = Math.max(idx - 1, 0);
      } else if (e.key === 'Enter' && active) {
        e.preventDefault();
        closeSearch();
        window.location.hash = active.getAttribute('href');
        return;
      }
      results.forEach((r) => r.classList.remove('active'));
      if (idx >= 0) {
        results[idx].classList.add('active');
        results[idx].scrollIntoView({ block: 'nearest' });
      }
    });
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        state.searchOpen ? closeSearch() : openSearch();
      } else if (e.key === 'Escape' && state.searchOpen) {
        closeSearch();
      }
    });
    bindScroll();
    render();
  }

  function bindScroll() {
    const topbar = $('.topbar');
    const btt = $('#back-to-top');
    if (!btt) return;
    let ticking = false;
    let lastVisible = false;
    const update = () => {
      const y = window.scrollY || document.documentElement.scrollTop;
      const show = y > 320;
      if (show !== lastVisible) {
        btt.classList.toggle('visible', show);
        lastVisible = show;
      }
      if (topbar) topbar.classList.toggle('scrolled', y > 8);
      const outline = $('#outline-nav');
      const footer = $('.site-footer');
      if (outline && footer) {
        const ft = footer.getBoundingClientRect().top;
        if (ft < window.innerHeight + 40) {
          outline.style.maxHeight = Math.max(60, ft - 96) + 'px';
        } else if (outline.style.maxHeight) {
          outline.style.maxHeight = '';
        }
      }
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }, { passive: true });
    btt.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    update();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
