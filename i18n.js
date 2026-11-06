'use strict';

/* =========================================================
 * Digital Nation translations.
 *
 * English is the source language and the text itself is the key:
 *   t('Defense upgraded to level {n}', { n: 3 })
 * Each language lives in lang/<code>.js and calls I18N.add(code, { english: translated }).
 * The chosen language file is loaded before the game starts, so t() can be
 * used anywhere, even in data tables. Anything without a translation falls
 * back to English.
 *
 * Static text in index.html is translated by walking the DOM once at start
 * (see I18N.translateDom): text nodes, placeholders, aria-labels and titles.
 * Elements whose text mixes in <b>, <i> or <a> are translated as one unit
 * (innerHTML) so translators see the whole sentence.
 * ========================================================= */

const LANGS = [
  { code: 'en', name: 'English', english: 'English' },
  { code: 'az', name: 'Azərbaycanca', english: 'Azerbaijani' },
  { code: 'tr', name: 'Türkçe', english: 'Turkish' },
  { code: 'ru', name: 'Русский', english: 'Russian' },
  { code: 'es', name: 'Español', english: 'Spanish' },
  { code: 'pt', name: 'Português', english: 'Portuguese' },
  { code: 'fr', name: 'Français', english: 'French' },
  { code: 'de', name: 'Deutsch', english: 'German' },
  { code: 'ar', name: 'العربية', english: 'Arabic', rtl: true },
  { code: 'hi', name: 'हिन्दी', english: 'Hindi' },
  { code: 'id', name: 'Bahasa Indonesia', english: 'Indonesian' },
  { code: 'zh', name: '中文', english: 'Chinese' },
];
const LANG_KEY = 'digitalnation_lang';

const I18N = (() => {
  const dicts = {};
  const pick = () => {
    let saved = null;
    try { saved = localStorage.getItem(LANG_KEY); } catch (e) { /* storage unavailable */ }
    if (saved && LANGS.some(l => l.code === saved)) return saved;
    for (const tag of navigator.languages || [navigator.language || 'en']) {
      const base = String(tag).toLowerCase().split('-')[0];
      if (LANGS.some(l => l.code === base)) return base;
    }
    return 'en';
  };
  const lang = pick();
  const info = LANGS.find(l => l.code === lang);
  document.documentElement.lang = lang;
  if (info.rtl) document.documentElement.dir = 'rtl';

  // Load the language file before the rest of the page's scripts run.
  // A single-file build inlines the dictionaries, so nothing is fetched then.
  if (lang !== 'en' && !window.DN_LANGS_INLINE && document.readyState === 'loading') {
    document.write(`<script src="lang/${lang}.js" data-lang="${lang}"><\/script>`);
  }

  function add(code, dict) { dicts[code] = Object.assign(dicts[code] || {}, dict); }
  function has(code) { return code === 'en' || !!dicts[code]; }

  function t(text, vars) {
    const d = dicts[lang];
    // "Text|context" keys give the same English text a different translation
    // (for example a short tab label); English drops the context part.
    let out = (d && d[text]) || text.replace(/\|[\w-]+$/, '');
    if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    return out;
  }

  function setLang(code) {
    try { localStorage.setItem(LANG_KEY, code); } catch (e) { /* storage unavailable */ }
  }

  // ---- static page text ----
  const INLINE = new Set(['B', 'I', 'A', 'EM', 'STRONG', 'BR']);
  const SKIP = new Set(['SCRIPT', 'STYLE', 'SVG', 'svg', 'TEMPLATE', 'CODE']);
  const ATTRS = ['placeholder', 'aria-label', 'title', 'content'];

  // Units of translatable text, the same way for extraction and for translation.
  function units(root) {
    const out = [];
    const walk = el => {
      if (SKIP.has(el.tagName) || el.hasAttribute('data-no-i18n')) return;
      for (const a of ATTRS) {
        if (a === 'content' && !(el.tagName === 'META' && el.getAttribute('name') === 'description')) continue;
        const v = el.getAttribute(a);
        if (v && /[A-Za-z]/.test(v)) out.push({ el, attr: a, text: v.trim(), owner: el.closest('[id]') });
      }
      const kids = [...el.childNodes];
      // Inline markup with an id is a live element the game updates, so keep it out of the unit.
      const mixed = kids.some(n => n.nodeType === 1 && INLINE.has(n.tagName)) &&
        kids.every(n => n.nodeType === 3 || (n.nodeType === 1 && INLINE.has(n.tagName) && !n.id && ![...n.children].some(c => !INLINE.has(c.tagName))));
      if (mixed && /[A-Za-z]/.test(el.textContent)) {
        out.push({ el, html: true, text: el.innerHTML.replace(/\s+/g, ' ').trim(), owner: el.closest('[id]') });
        return;
      }
      for (const n of kids) {
        if (n.nodeType === 3) {
          const v = n.nodeValue.replace(/\s+/g, ' ').trim();
          const ctx = el.getAttribute('data-i18n-ctx');
          if (/[A-Za-z]/.test(v)) out.push({ node: n, text: ctx ? `${v}|${ctx}` : v, owner: el.closest('[id]') });
        }
        else if (n.nodeType === 1) walk(n);
      }
    };
    walk(root);
    return out;
  }

  function translateDom(root) {
    if (lang === 'en') return;
    for (const u of units(root || document.documentElement)) {
      const tr = t(u.text);
      if (tr === u.text || tr === u.text.replace(/\|[\w-]+$/, '')) continue;
      if (u.attr) u.el.setAttribute(u.attr, tr);
      else if (u.html) u.el.innerHTML = tr;
      else {
        const v = u.node.nodeValue;
        u.node.nodeValue = v.replace(v.trim(), tr.replace(/\|[\w-]+$/, ''));
      }
    }
  }

  return { lang, info, add, has, t, setLang, units, translateDom };
})();

const t = I18N.t;
