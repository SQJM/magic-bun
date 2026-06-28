(function (global) {
  'use strict';

  var _ready = false;
  var _queue = [];
  var currentLocale = 'zh-CN';

  // Wait for vendor.bundle.js (markdownit + hljs) to load
  function waitForVendor(callback) {
    var mdFactory = global.markdownit;
    var hljs = global.hljs;
    if (mdFactory && hljs) {
      callback(mdFactory, hljs);
      return;
    }
    // Poll until vendor is available (it's loaded with defer)
    var interval = setInterval(function () {
      mdFactory = global.markdownit;
      hljs = global.hljs;
      if (mdFactory && hljs) {
        clearInterval(interval);
        callback(mdFactory, hljs);
      }
    }, 30);
    // Safety timeout
    setTimeout(function () {
      clearInterval(interval);
      if (global.markdownit && global.hljs) {
        callback(global.markdownit, global.hljs);
      }
    }, 10000);
  }

  // Stub methods (render is replaced once vendor loads)
  var MagicMarkdown = {
    render: function (mdText) {
      return mdText || ''; // fallback until vendor is ready
    },
    setLocale: function (l) { currentLocale = l; },
    getLocale: function () { return currentLocale; },
    slugify: function (s) {
      return (s || '').toLowerCase()
        .replace(/[\u0000-\u002f\u003a-\u0040\u005b-\u0060\u007b-\u007f]+/g, ' ')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[\u4e00-\u9fff]+/g, function (m) { return m; })
        .substring(0, 80);
    },
    escapeHtml: function (s) {
      return s.replace(/[&<>]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]; });
    },
    highlight: function (code, lang) { return code; }
  };

  function copyLabel() {
    if (global.MagicI18N && global.MagicI18N.getPath) {
      return global.MagicI18N.getPath(currentLocale, 'copyCode') || 'Copy';
    }
    return 'Copy';
  }

  function escapeAttr(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function init(mdFactory, hljs) {
    function highlightCode(code, lang) {
      try {
        if (lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
        }
      } catch (e) {}
      try { return hljs.highlightAuto(code).value; } catch (e) { return code; }
    }

    var md = mdFactory({
      html: false,
      xhtmlOut: false,
      breaks: false,
      linkify: true,
      typographer: false,
      highlight: function (code, lang) {
        var langLabel = lang || 'text';
        var highlighted = highlightCode(code, lang);
        var codeJson = JSON.stringify(code);
        return ''
          + '<pre><div class="code-head">'
          + '<span class="code-lang">' + langLabel + '</span>'
          + '<button class="code-copy" data-code=\'' + codeJson + '\'>' + copyLabel() + '</button>'
          + '</div>'
          + '<code class="language-' + langLabel + '">' + highlighted + '</code></pre>';
      }
    });

    function slugify(s) {
      return (s || '').toLowerCase()
        .replace(/[\u0000-\u002f\u003a-\u0040\u005b-\u0060\u007b-\u007f]+/g, ' ')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[\u4e00-\u9fff]+/g, function (m) { return m; })
        .substring(0, 80);
    }

    function enhanceHeadings(html) {
      return html.replace(/<(h[1-6])([^>]*)>([^<]+)<\/\1>/g, function (m, tag, attrs, text) {
        var id = slugify(text);
        if (!id) return m;
        var a = attrs || '';
        if (a.indexOf('id=') === -1) a += ' id="' + id + '"';
        return '<' + tag + a + '>' + text + '</' + tag + '>';
      });
    }

    function wrapTables(html) {
      return html
        .replace(/<table>/g, '<div class="table-wrap"><table>')
        .replace(/<\/table>/g, '</table></div>');
    }

    // Replace stub render with real one
    MagicMarkdown.render = function (mdText) {
      if (!md) return mdText || '';
      var html = md.render(mdText);
      return wrapTables(enhanceHeadings(html));
    };

    MagicMarkdown.highlight = highlightCode;
    _ready = true;
  }

  waitForVendor(init);

  global.MagicMarkdown = MagicMarkdown;
})(window);
