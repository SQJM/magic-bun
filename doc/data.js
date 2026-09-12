(function (global) {
  'use strict';

  var config = null;
  var docCache = new Map();
  var loadPromise = null;
  var loadingDocs = {};

  // Doc file locale mapping
  var DOC_FILES_MAP = {
    "使用指南": { zh: "data/使用指南.zh.js", en: "data/使用指南.en.js" },
    "开发规范": { zh: "data/开发规范.zh.js", en: "data/开发规范.en.js" },
    "组件文件格式": { zh: "data/组件文件格式.zh.js", en: "data/组件文件格式.en.js" },
    "技术架构": { zh: "data/技术架构.zh.js", en: "data/技术架构.en.js" },
    "数据模型": { zh: "data/数据模型.zh.js", en: "data/数据模型.en.js" },
    "构建流程": { zh: "data/构建流程.zh.js", en: "data/构建流程.en.js" },
    "包管理": { zh: "data/包管理.zh.js", en: "data/包管理.en.js" },
    "API参考": { zh: "data/API参考.zh.js", en: "data/API参考.en.js" },
    "配置参考": { zh: "data/配置参考.zh.js", en: "data/配置参考.en.js" },
    "app.xml参考": { zh: "data/app.xml参考.zh.js", en: "data/app.xml参考.en.js" },
    "安全指南": { zh: "data/安全指南.zh.js", en: "data/安全指南.en.js" },
    "PWA": { zh: "data/PWA.zh.js", en: "data/PWA.en.js" }
  };

  function initConfig() {
    config = global.__MAGIC_CONFIG || null;
  }

  // Dynamically load a single doc's JS files (zh + en) by injecting script tags
  function loadDoc(id) {
    if (docCache.has(id)) return Promise.resolve(docCache.get(id));
    if (loadingDocs[id]) return loadingDocs[id];

    var files = DOC_FILES_MAP[id];
    if (!files) return Promise.reject(new Error('Unknown doc: ' + id));

    loadingDocs[id] = new Promise(function (resolve, reject) {
      var paths = [files.zh, files.en];
      var loaded = 0;
      var total = paths.length;

      paths.forEach(function (src) {
        var script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = function () {
          loaded++;
          if (loaded === total) {
            // After both scripts loaded, the doc data is in global.MAGIC_DOCS
            var docData = (global.MAGIC_DOCS || {})[id];
            if (docData) {
              docCache.set(id, docData);
            }
            resolve(docCache.get(id));
          }
        };
        script.onerror = function () {
          loaded++;
          if (loaded === total) {
            resolve(docCache.get(id));
          }
        };
        document.head.appendChild(script);
      });

      // Timeout fallback after 5s
      setTimeout(function () {
        if (!docCache.has(id)) {
          var docData = (global.MAGIC_DOCS || {})[id];
          if (docData) docCache.set(id, docData);
          resolve(docCache.get(id));
        }
      }, 5000);
    });

    return loadingDocs[id];
  }

  function loadAllDocs() {
    if (loadPromise) return loadPromise;
    initConfig();
    if (!config) {
      loadPromise = Promise.resolve(docCache);
      return loadPromise;
    }
    // We no longer need to load all docs upfront.
    // The config already has summary data.
    // If global.__MAGIC_DOCS happens to be available (from docs.js), load them.
    loadPromise = Promise.resolve().then(function () {
      initConfig();
      var docs = global.__MAGIC_DOCS || {};
      var ids = Object.keys(docs);
      for (var i = 0; i < ids.length; i++) {
        if (!docCache.has(ids[i])) {
          docCache.set(ids[i], docs[ids[i]]);
        }
      }
      return docCache;
    });
    return loadPromise;
  }

  function getDoc(id) {
    var cached = docCache.get(id);
    if (cached) return cached;
    // Check if loaded in MAGIC_DOCS global
    var docs = global.__MAGIC_DOCS || {};
    if (docs[id]) {
      docCache.set(id, docs[id]);
      return docs[id];
    }
    // Check MAGIC_DOCS (without underscore, used by individual files)
    var docs2 = global.MAGIC_DOCS || {};
    if (docs2[id]) {
      docCache.set(id, docs2[id]);
      return docs2[id];
    }
    return null;
  }

  function getSummary(doc) {
    if (!config) {
      return {
        id: doc.id,
        zhTitle: '',
        enTitle: '',
        zhSections: 0,
        enSections: 0,
        category: 'core',
        icon: 'filetext',
        readMinutes: 2,
        description: { 'zh-CN': '', 'en-US': '' }
      };
    }

    var meta = (config.meta && config.meta[doc.id]) || { category: 'core', icon: 'filetext', zhDesc: '', enDesc: '' };

    // Use precomputed summaries if available
    var pre = (config.summaries && config.summaries[doc.id]) || {};

    var zhSections = pre.zhSections;
    var enSections = pre.enSections;
    var readMinutes = pre.readMinutes;

    // Fallback: compute from content if precomputed data not available
    if (!zhSections) {
      var zh = doc.translations['zh-CN'];
      var en = doc.translations['en-US'];
      var zhContent = zh ? zh.content || '' : '';
      var enContent = en ? en.content || '' : '';
      zhSections = zhContent.split(/\n#{1,6} /).length - 1;
      enSections = enContent.split(/\n#{1,6} /).length - 1;
      var zhChars = zhContent.length;
      var enChars = enContent.length;
      readMinutes = Math.max(2, Math.round((zhChars / 600 + enChars / 900) / 2));
    }

    return {
      id: doc.id,
      zhTitle: pre.zhTitle || (doc.translations['zh-CN'] ? doc.translations['zh-CN'].title : ''),
      enTitle: pre.enTitle || (doc.translations['en-US'] ? doc.translations['en-US'].title : ''),
      zhSections: zhSections,
      enSections: enSections,
      category: meta.category,
      icon: meta.icon,
      readMinutes: readMinutes,
      description: { 'zh-CN': meta.zhDesc, 'en-US': meta.enDesc }
    };
  }

  function getAllSummaries() {
    initConfig();
    if (!config) return [];
    var files = config.docFiles;
    var result = [];
    for (var i = 0; i < files.length; i++) {
      var doc = getDoc(files[i]);
      // Even without full doc content, we can build summary from precomputed data
      if (doc) {
        result.push(getSummary(doc));
      } else if (config.summaries && config.summaries[files[i]]) {
        // Build a minimal summary from precomputed data alone
        var pre = config.summaries[files[i]];
        var meta = (config.meta && config.meta[files[i]]) || { category: 'core', icon: 'filetext', zhDesc: '', enDesc: '' };
        result.push({
          id: files[i],
          zhTitle: pre.zhTitle,
          enTitle: pre.enTitle,
          zhSections: pre.zhSections,
          enSections: pre.enSections,
          category: meta.category,
          icon: meta.icon,
          readMinutes: pre.readMinutes,
          description: { 'zh-CN': meta.zhDesc, 'en-US': meta.enDesc }
        });
      }
    }
    return result;
  }

  function getPrevNext(id) {
    initConfig();
    if (!config) return { prev: null, next: null };
    var idx = config.docFiles.indexOf(id);
    if (idx === -1) return { prev: null, next: null };
    return {
      prev: idx > 0 ? config.docFiles[idx - 1] : null,
      next: idx < config.docFiles.length - 1 ? config.docFiles[idx + 1] : null
    };
  }

  function getCategoryLabel(cat, locale) {
    initConfig();
    if (!config || !config.categoryMeta || !config.categoryMeta[cat]) return '';
    return locale === 'zh-CN' ? config.categoryMeta[cat].zh : config.categoryMeta[cat].en;
  }

  function getCategoryColor(cat) {
    initConfig();
    if (!config || !config.categoryMeta || !config.categoryMeta[cat]) return '';
    return config.categoryMeta[cat].color;
  }

  function findDocByAnchor(slug) {
    if (!slug) return null;
    var docs = Array.from(docCache.values());
    // Check cache first
    for (var i = 0; i < docs.length; i++) {
      var doc = docs[i];
      if (hasAnchorInDoc(doc, slug)) return doc.id;
    }
    // Not found in cache, try loading each doc
    // This is a fallback - for anchor lookups we need the content
    return null;
  }

  function docHasAnchor(id, slug) {
    if (!slug) return false;
    var doc = getDoc(id);
    if (!doc) return false;
    return hasAnchorInDoc(doc, slug);
  }

  function hasAnchorInDoc(doc, slug) {
    var locales = ['zh-CN', 'en-US'];
    for (var i = 0; i < locales.length; i++) {
      var md = (doc.translations[locales[i]] && doc.translations[locales[i]].content) || '';
      var re = /^#{1,6}\s+(.+?)\s*$/gm;
      var m;
      while ((m = re.exec(md)) !== null) {
        if (slugify(m[1].trim()) === slug) return true;
      }
    }
    return false;
  }

  function slugify(s) {
    return (s || '').toLowerCase()
      .replace(/[\u0000-\u002f\u003a-\u0040\u005b-\u0060\u007b-\u007f]+/g, ' ')
      .trim()
      .replace(/\s+/g, '-')
      .substring(0, 80);
  }

  global.MagicData = {
    loadAllDocs: loadAllDocs,
    loadDoc: loadDoc,
    getDoc: getDoc,
    getAllSummaries: getAllSummaries,
    getPrevNext: getPrevNext,
    getCategoryLabel: getCategoryLabel,
    getCategoryColor: getCategoryColor,
    findDocByAnchor: findDocByAnchor,
    docHasAnchor: docHasAnchor,
    slugify: slugify,
    get META() {
      initConfig();
      return config ? config.meta : {};
    },
    get CATEGORY_META() {
      initConfig();
      return config ? config.categoryMeta : {};
    },
    get DOC_FILES() {
      initConfig();
      return config ? config.docFiles.map(function (id) { return id + '.js'; }) : [];
    }
  };
})(window);