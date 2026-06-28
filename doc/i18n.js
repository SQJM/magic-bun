(function (global) {
  'use strict';

  var _data = {};
  var _features = {};
  var _iconsLoaded = false;
  var _loadPromise = null;

  var DOC_ICONS = {};
  var FEATURE_ICONS = {};
  var ICON_SVG = {};

  function getPath(locale, key) {
    var data = _data[locale];
    if (!data) {
      console.warn('MagicI18N: locale not loaded - ' + locale);
      return '';
    }
    var parts = key.split('.');
    var cur = data;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return key;
      cur = cur[parts[i]];
    }
    return cur == null ? key : cur;
  }

  function getFeatures(locale) {
    return _features[locale] || [];
  }

  function getDocIcon(id) {
    return ICON_SVG[DOC_ICONS[id]] || ICON_SVG.filetext || '';
  }

  function getFeatureIcon(icon) {
    return FEATURE_ICONS[icon] || FEATURE_ICONS.plugin || '';
  }

  function loadIcons() {
    if (_iconsLoaded) return Promise.resolve();
    var icons = global.__MAGIC_ICONS || {};
    DOC_ICONS = icons.docIcons || {};
    FEATURE_ICONS = icons.featureIcons || {};
    ICON_SVG = icons.iconSvg || {};
    _iconsLoaded = true;
    return Promise.resolve();
  }

  function load(locale) {
    if (_data[locale]) return Promise.resolve();
    var json = null;
    if (locale === 'zh-CN') {
      json = global.__MAGIC_I18N_ZH || null;
    } else if (locale === 'en-US') {
      json = global.__MAGIC_I18N_EN || null;
    }
    if (!json) return Promise.reject(new Error('Locale not found: ' + locale));
    _data[locale] = json;
    if (json.features) {
      _features[locale] = json.features;
    }
    return Promise.resolve();
  }

  function loadAll() {
    if (_loadPromise) return _loadPromise;
    _loadPromise = Promise.all([
      load('zh-CN'),
      load('en-US'),
      loadIcons()
    ]);
    return _loadPromise;
  }

  global.MagicI18N = {
    get I18N() { return _data; },
    get FEATURES() { return _features; },
    get FEATURE_ICONS() { return FEATURE_ICONS; },
    get DOC_ICONS() { return DOC_ICONS; },
    get ICON_SVG() { return ICON_SVG; },
    getPath: getPath,
    getFeatures: getFeatures,
    getDocIcon: getDocIcon,
    getFeatureIcon: getFeatureIcon,
    load: load,
    loadAll: loadAll
  };
})(window);
