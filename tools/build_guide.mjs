// Builds the public Digital Nation guide (a static wiki) from the game's own data.
//
//   node tools/build_guide.mjs [outDir]     (default: guide/)
//
// The game is opened in headless Chromium once per language, so every number,
// name and translation comes straight from game.js, content.js and lang/*.js.
// Nothing is written by hand, so the guide cannot drift from the game.
// Output: <outDir>/<lang>/{index,sectors,research,eras,policies,events,achievements}.html,
// <outDir>/<lang>/wiki/<id>.html for every encyclopedia entry, <outDir>/index.html,
// <outDir>/guide.css and <outDir>/sitemap.xml.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || path.join(root, 'guide'));
const SITE = 'https://tardigrade23.github.io/DigitalNation/';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(path.join(process.env.NODE_PATH || '', 'playwright'))); }

// Text used only by the guide. t() marks it for tools/i18n.mjs; the game's
// translation files translate it.
const t = s => s;
const UI = [
  t('Guide'), t('Digital Nation guide'), t('Play Digital Nation'), t('Play free in your browser'),
  t('Everything in the game, explained: sectors, research, eras, policies, national events and the real technology behind them.'),
  t('Sectors'), t('Research'), t('Eras'), t('Policies'), t('National events'), t('Achievements'), t('Tech Encyclopedia'),
  t('Base cost'), t('Income per second'), t('Arrives in'), t('Research cost'), t('Research time'), t('Effect'),
  t('Research projects needed'), t('Also requires'), t('Income multiplier'), t('Options'), t('Choices'),
  t('What it is'), t('Real world'), t('Did you know?'), t('Quick quiz'), t('Show answer'), t('Image'),
  t('In the game'), t('Previous'), t('Next'), t('Language'), t('Back to the guide'),
  t('All {n} sectors, from internet providers to space agencies: what they cost, what they earn and when they arrive.'),
  t('All {n} research projects in 6 branches: cost, time and effect.'),
  t('The 7 eras of a digital nation and what it takes to reach each one.'),
  t('National policies: every choice has a benefit and a cost.'),
  t('{n} national events based on real history, with the choices you can make.'),
  t('All {n} achievements and how to earn them.'),
  t('{n} entries about real digital technology, with photos, facts and a quiz.'),
  t('Images: Wikimedia Commons. Facts are checked against public sources; tell us if something is wrong.'),
];

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function collect(page, lang) {
  await page.addInitScript(l => { try { localStorage.setItem('digitalnation_lang', l); localStorage.setItem('digitalnation_save_v1', JSON.stringify({ settings: { analytics: false } })); } catch (e) { /* ignore */ } }, lang);
  await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
  await page.waitForFunction(() => window.DN && typeof I18N === 'object');
  return page.evaluate(ui => {
    const time = [10 * 60, 3600, 4 * 3600, 16 * 3600, 48 * 3600, 96 * 3600, 192 * 3600];
    const lib = id => (LIBRARY[id] ? { what: LIBRARY[id].what, real: LIBRARY[id].real, fact: LIBRARY[id].fact, q: LIBRARY[id].q, a: LIBRARY[id].a, c: LIBRARY[id].c } : null);
    return {
      lang: I18N.lang, rtl: !!I18N.info.rtl,
      ui: Object.fromEntries(ui.map(s => [s, t(s)])),
      tagline: t("Grow a small digital state into the world's leading tech nation."),
      eras: ERAS.map((e, i) => ({ i, roman: ROMAN[i], name: e.name, need: e.need, mult: e.mult, sector: e.sector ? SECTORS.find(s => s.id === e.sector).name : '' })),
      sectors: SECTORS.map(s => ({ id: s.id, name: s.name, era: s.era, base: money(s.base), inc: money(s.inc) + '/s', c1: s.c1, c2: s.c2, lib: lib(s.id) })),
      branches: BRANCHES.map(b => ({ id: b.id, name: b.name, tone: b.tone })),
      research: RESEARCH.map(n => ({ id: n.id, branch: n.branch, name: n.name, desc: n.desc, cost: fmt(n.cost) + ' RP',
        time: dur(time[RESEARCH.filter(x => x.branch === n.branch).indexOf(n)] * 1000), lib: lib(n.id) })),
      policies: POLICIES.map(p => ({ name: p.name, options: p.options.map(o => ({ label: o.label, fx: fmtMods(o.mods) })) })),
      events: NATIONAL_EVENTS.map(e => ({ id: e.id, title: e.title, situation: e.situation, real: e.real, choices: e.choices.map(c => ({ label: c.label, fx: choiceSummary(c) })) })),
      achievements: ACHIEVEMENTS.map(a => ({ name: a.name, desc: a.desc })),
      images: typeof LIBRARY_IMAGES === 'object' ? LIBRARY_IMAGES : {},
      labels: { sector: t('Sector · {era}'), research: t('Research · {branch}') },
    };
  }, UI);
}

function page(d, { title, desc, rel, body, file }) {
  const LANGS = d.allLangs;
  const up = '../'.repeat(rel);
  const alt = LANGS.map(l => `<link rel="alternate" hreflang="${l.code}" href="${SITE}guide/${l.code}/${file}">`).join('\n  ');
  const nav = [['index.html', d.ui['Guide']], ['sectors.html', d.ui['Sectors']], ['research.html', d.ui['Research']], ['eras.html', d.ui['Eras']],
    ['policies.html', d.ui['Policies']], ['events.html', d.ui['National events']], ['achievements.html', d.ui['Achievements']], ['wiki/index.html', d.ui['Tech Encyclopedia']]]
    .map(([f, label]) => `<a href="${up}${f}"${f === file ? ' aria-current="page"' : ''}>${esc(label)}</a>`).join('');
  const langs = LANGS.map(l => `<a href="${up}../${l.code}/${file}" lang="${l.code}"${l.code === d.lang ? ' aria-current="true"' : ''}>${esc(l.name)}</a>`).join('');
  return `<!doctype html>
<html lang="${d.lang}"${d.rtl ? ' dir="rtl"' : ''}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} · Digital Nation</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${SITE}guide/${d.lang}/${file}">
  ${alt}
  <link rel="alternate" hreflang="x-default" href="${SITE}guide/en/${file}">
  <meta property="og:title" content="${esc(title)} · Digital Nation">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:image" content="${SITE}icons/icon-512.png">
  <link rel="icon" href="${up}../../icons/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@600;700&family=Manrope:wght@400;600;700&display=swap">
  <link rel="stylesheet" href="${up}../guide.css">
</head>
<body>
  <header class="top">
    <a class="brand" href="${up}index.html"><img src="${up}../../icons/favicon.svg" alt="" width="28" height="28">Digital Nation <span>${esc(d.ui['Guide'])}</span></a>
    <a class="play" href="${up}../../">${esc(d.ui['Play Digital Nation'])}</a>
  </header>
  <nav class="nav">${nav}</nav>
  <main>
${body}
  </main>
  <footer>
    <details class="langs"><summary>${esc(d.ui['Language'])}</summary><div>${langs}</div></details>
    <p>${esc(d.ui['Images: Wikimedia Commons. Facts are checked against public sources; tell us if something is wrong.'])}</p>
    <p><a href="${up}../../">${esc(d.ui['Play Digital Nation'])}</a> · <a href="${up}../../privacy.html">Privacy</a> · <a href="${up}../../terms.html">Terms</a></p>
  </footer>
</body>
</html>
`;
}

const card = (href, title, text) => `<a class="card" href="${href}"><b>${esc(title)}</b><span>${esc(text)}</span></a>`;
const fmtN = (s, n) => s.replace('{n}', n);

function entryList(d) {
  const all = [];
  for (const s of d.sectors) if (s.lib) all.push({ ...s, kind: d.labels.sector.replace('{era}', d.eras[s.era].name), group: d.ui['Sectors'] });
  for (const n of d.research) if (n.lib) { const b = d.branches.find(x => x.id === n.branch); all.push({ ...n, kind: d.labels.research.replace('{branch}', b.name), group: b.name }); }
  return all;
}

function thumb(d, id, up) {
  const img = d.images[id];
  return img ? `<img class="thumb" src="${up}../../${esc(img.src)}" alt="" loading="lazy">` : '<span class="thumb"></span>';
}

function build(d) {
  const L = path.join(OUT, d.lang);
  fs.mkdirSync(path.join(L, 'wiki'), { recursive: true });
  const write = (f, html) => fs.writeFileSync(path.join(L, f), html);
  const entries = entryList(d);
  const pages = [];
  const add = (file, opts) => { write(file, page(d, { ...opts, file })); pages.push(file); };

  add('index.html', { title: d.ui['Digital Nation guide'], desc: d.ui['Everything in the game, explained: sectors, research, eras, policies, national events and the real technology behind them.'], rel: 0, body: `
    <section class="hero">
      <h1>${esc(d.ui['Digital Nation guide'])}</h1>
      <p>${esc(d.tagline)}</p>
      <p class="muted">${esc(d.ui['Everything in the game, explained: sectors, research, eras, policies, national events and the real technology behind them.'])}</p>
      <a class="btn" href="../../">${esc(d.ui['Play free in your browser'])}</a>
    </section>
    <section class="cards">
      ${card('sectors.html', d.ui['Sectors'], fmtN(d.ui['All {n} sectors, from internet providers to space agencies: what they cost, what they earn and when they arrive.'], d.sectors.length))}
      ${card('research.html', d.ui['Research'], fmtN(d.ui['All {n} research projects in 6 branches: cost, time and effect.'], d.research.length))}
      ${card('eras.html', d.ui['Eras'], d.ui['The 7 eras of a digital nation and what it takes to reach each one.'])}
      ${card('policies.html', d.ui['Policies'], d.ui['National policies: every choice has a benefit and a cost.'])}
      ${card('events.html', d.ui['National events'], fmtN(d.ui['{n} national events based on real history, with the choices you can make.'], d.events.length))}
      ${card('achievements.html', d.ui['Achievements'], fmtN(d.ui['All {n} achievements and how to earn them.'], d.achievements.length))}
      ${card('wiki/index.html', d.ui['Tech Encyclopedia'], fmtN(d.ui['{n} entries about real digital technology, with photos, facts and a quiz.'], entries.length))}
    </section>` });

  add('sectors.html', { title: d.ui['Sectors'], desc: fmtN(d.ui['All {n} sectors, from internet providers to space agencies: what they cost, what they earn and when they arrive.'], d.sectors.length), rel: 0, body: `
    <h1>${esc(d.ui['Sectors'])}</h1>
    <div class="table"><table>
      <thead><tr><th></th><th>${esc(d.ui['Sectors'])}</th><th>${esc(d.ui['Arrives in'])}</th><th>${esc(d.ui['Base cost'])}</th><th>${esc(d.ui['Income per second'])}</th></tr></thead>
      <tbody>${d.sectors.map(s => `<tr><td><span class="dot" style="--c1:${s.c1};--c2:${s.c2}"></span></td><td>${s.lib ? `<a href="wiki/${s.id}.html">${esc(s.name)}</a>` : esc(s.name)}</td><td>${esc(d.eras[s.era].name)}</td><td class="num">${esc(s.base)}</td><td class="num">${esc(s.inc)}</td></tr>`).join('')}</tbody>
    </table></div>` });

  add('research.html', { title: d.ui['Research'], desc: fmtN(d.ui['All {n} research projects in 6 branches: cost, time and effect.'], d.research.length), rel: 0, body: `
    <h1>${esc(d.ui['Research'])}</h1>
    ${d.branches.map(b => `<h2 class="tone-${b.tone}">${esc(b.name)}</h2>
    <div class="table"><table>
      <thead><tr><th>${esc(d.ui['Research'])}</th><th>${esc(d.ui['Research cost'])}</th><th>${esc(d.ui['Research time'])}</th><th>${esc(d.ui['Effect'])}</th></tr></thead>
      <tbody>${d.research.filter(n => n.branch === b.id).map(n => `<tr><td>${n.lib ? `<a href="wiki/${n.id}.html">${esc(n.name)}</a>` : esc(n.name)}</td><td class="num">${esc(n.cost)}</td><td class="num">${esc(n.time)}</td><td>${esc(n.desc)}</td></tr>`).join('')}</tbody>
    </table></div>`).join('\n')}` });

  add('eras.html', { title: d.ui['Eras'], desc: d.ui['The 7 eras of a digital nation and what it takes to reach each one.'], rel: 0, body: `
    <h1>${esc(d.ui['Eras'])}</h1>
    <ol class="eras">${d.eras.map(e => `<li><span class="roman">${e.roman}</span><div><b>${esc(e.name)}</b>
      <span>${esc(d.ui['Research projects needed'])}: ${e.need}${e.sector ? ` · ${esc(d.ui['Also requires'])}: ${esc(e.sector)}` : ''} · ${esc(d.ui['Income multiplier'])}: ×${e.mult}</span></div></li>`).join('')}</ol>` });

  add('policies.html', { title: d.ui['Policies'], desc: d.ui['National policies: every choice has a benefit and a cost.'], rel: 0, body: `
    <h1>${esc(d.ui['Policies'])}</h1>
    ${d.policies.map(p => `<section class="box"><h2>${esc(p.name)}</h2><ul class="opts">${p.options.map(o => `<li><b>${esc(o.label)}</b><span class="fx">${o.fx}</span></li>`).join('')}</ul></section>`).join('')}` });

  add('events.html', { title: d.ui['National events'], desc: fmtN(d.ui['{n} national events based on real history, with the choices you can make.'], d.events.length), rel: 0, body: `
    <h1>${esc(d.ui['National events'])}</h1>
    ${d.events.map(e => `<section class="box" id="${e.id}"><h2>${esc(e.title)}</h2><p>${esc(e.situation)}</p>
      <div class="note"><span class="eyebrow">${esc(d.ui['Real world'])}</span><p>${esc(e.real)}</p></div>
      <h3>${esc(d.ui['Choices'])}</h3><ul class="opts">${e.choices.map(c => `<li><b>${esc(c.label)}</b><span class="fx">${c.fx}</span></li>`).join('')}</ul></section>`).join('')}` });

  add('achievements.html', { title: d.ui['Achievements'], desc: fmtN(d.ui['All {n} achievements and how to earn them.'], d.achievements.length), rel: 0, body: `
    <h1>${esc(d.ui['Achievements'])}</h1>
    <ul class="ach">${d.achievements.map(a => `<li><b>${esc(a.name)}</b><span>${esc(a.desc)}</span></li>`).join('')}</ul>` });

  const groups = [...new Set(entries.map(e => e.group))];
  add('wiki/index.html', { title: d.ui['Tech Encyclopedia'], desc: fmtN(d.ui['{n} entries about real digital technology, with photos, facts and a quiz.'], entries.length), rel: 1, body: `
    <h1>${esc(d.ui['Tech Encyclopedia'])}</h1>
    ${groups.map(g => `<h2>${esc(g)}</h2><div class="wiki-grid">${entries.filter(e => e.group === g).map(e => `<a class="wiki-item" href="${e.id}.html">${thumb(d, e.id, '../')}<b>${esc(e.name)}</b><span>${esc(e.kind)}</span></a>`).join('')}</div>`).join('\n')}` });

  entries.forEach((e, i) => {
    const img = d.images[e.id], c = e.lib;
    const prev = entries[i - 1], next = entries[i + 1];
    const stats = e.base
      ? `<li>${esc(d.ui['Arrives in'])}: <b>${esc(d.eras[e.era].name)}</b></li><li>${esc(d.ui['Base cost'])}: <b>${esc(e.base)}</b></li><li>${esc(d.ui['Income per second'])}: <b>${esc(e.inc)}</b></li>`
      : `<li>${esc(d.ui['Research cost'])}: <b>${esc(e.cost)}</b></li><li>${esc(d.ui['Research time'])}: <b>${esc(e.time)}</b></li><li>${esc(d.ui['Effect'])}: <b>${esc(e.desc)}</b></li>`;
    add(`wiki/${e.id}.html`, { title: e.name, desc: c.what, rel: 1, body: `
    <article class="entry">
      <p class="eyebrow">${esc(e.kind)}</p>
      <h1>${esc(e.name)}</h1>
      ${img ? `<figure><img src="../../../${esc(img.src)}" alt="${esc(e.name)}"><figcaption>${esc(d.ui['Image'])}: <a href="${esc(img.source)}" rel="nofollow noopener">${esc(img.artist)}</a> · ${img.licenseUrl ? `<a href="${esc(img.licenseUrl)}" rel="nofollow noopener">${esc(img.license)}</a>` : esc(img.license)} · Wikimedia Commons</figcaption></figure>` : ''}
      <h2>${esc(d.ui['What it is'])}</h2><p>${esc(c.what)}</p>
      <div class="note"><span class="eyebrow">${esc(d.ui['Real world'])}</span><p>${esc(c.real)}</p></div>
      <div class="note gold"><span class="eyebrow">${esc(d.ui['Did you know?'])}</span><p>${esc(c.fact)}</p></div>
      <section class="quiz"><span class="eyebrow">${esc(d.ui['Quick quiz'])}</span><p><b>${esc(c.q)}</b></p>
        <ul>${c.a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        <details><summary>${esc(d.ui['Show answer'])}</summary><p>${esc(c.a[c.c])}</p></details></section>
      <section class="box"><h2>${esc(d.ui['In the game'])}</h2><ul class="stats">${stats}</ul></section>
      <nav class="pager">${prev ? `<a href="${prev.id}.html">← ${esc(prev.name)}</a>` : '<span></span>'}${next ? `<a href="${next.id}.html">${esc(next.name)} →</a>` : '<span></span>'}</nav>
      <p class="cta"><a class="btn" href="../../../">${esc(d.ui['Play free in your browser'])}</a></p>
    </article>` });
  });
  return pages;
}

const CSS = `:root{--bg:#0C1420;--surface:#131E2D;--surface-2:#1B2839;--line:#26354A;--text:#E8EEF6;--muted:#93A4BC;--gold:#F5B841;--cyan:#4CC9F0;--good:#4ED38A;--bad:#FF5D6E}
@media (prefers-color-scheme: light){:root{--bg:#F5F7FB;--surface:#FFFFFF;--surface-2:#EEF2F8;--line:#D9E1EC;--text:#132033;--muted:#5A6B82;--gold:#B7790A;--cyan:#0B7FAE;--good:#167A47;--bad:#C2283D}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 Manrope,"Noto Sans",system-ui,sans-serif}
a{color:var(--cyan)}main{max-width:960px;margin:0 auto;padding:8px 16px 40px}
h1,h2,h3,.brand{font-family:"Chakra Petch",Manrope,system-ui,sans-serif;line-height:1.2}h1{font-size:2rem;margin:.6em 0 .4em}h2{margin-top:1.6em}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid var(--line);background:var(--surface)}
.brand{display:flex;align-items:center;gap:8px;color:var(--text);text-decoration:none;font-weight:700;font-size:1.15rem}.brand span{color:var(--muted);font-weight:600}
.play,.btn{background:var(--gold);color:#1B1300;font-weight:700;text-decoration:none;padding:10px 16px;border-radius:12px;white-space:nowrap}
.nav{display:flex;gap:4px;overflow-x:auto;padding:8px 12px;border-bottom:1px solid var(--line);scrollbar-width:none}
.nav a{color:var(--muted);text-decoration:none;padding:6px 10px;border-radius:8px;white-space:nowrap;font-weight:600}.nav a[aria-current]{background:var(--surface-2);color:var(--text)}
.hero{padding:24px 0 8px}.hero .btn{display:inline-block;margin-top:8px}.muted{color:var(--muted)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-top:20px}
.card{display:flex;flex-direction:column;gap:4px;padding:16px;border:1px solid var(--line);border-radius:16px;background:var(--surface);text-decoration:none;color:var(--text)}.card span{color:var(--muted);font-size:.92rem}.card:hover{border-color:var(--cyan)}
.table{overflow-x:auto;border:1px solid var(--line);border-radius:14px;background:var(--surface)}table{border-collapse:collapse;width:100%;min-width:560px}
th,td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:start;vertical-align:top}th{color:var(--muted);font-size:.85rem;font-weight:700}tr:last-child td{border-bottom:0}
.num{white-space:nowrap;font-variant-numeric:tabular-nums}[dir=rtl] .num{direction:ltr;unicode-bidi:isolate}
.dot{display:inline-block;width:18px;height:18px;border-radius:6px;background:linear-gradient(135deg,var(--c1),var(--c2))}
.eras{list-style:none;padding:0;display:grid;gap:10px}.eras li{display:flex;gap:14px;align-items:center;padding:14px;border:1px solid var(--line);border-radius:14px;background:var(--surface)}
.eras .roman{font:700 1.4rem "Chakra Petch",sans-serif;color:var(--gold);min-width:44px;text-align:center}.eras li div{display:flex;flex-direction:column}.eras li span{color:var(--muted);font-size:.92rem}
.box h2{margin-top:.7em}.box{padding:4px 16px 12px;border:1px solid var(--line);border-radius:16px;background:var(--surface);margin:14px 0}
.opts,.ach,.stats{list-style:none;padding:0;margin:0;display:grid;gap:8px}.opts li,.ach li{display:flex;flex-direction:column;padding:10px 12px;border-radius:12px;background:var(--surface-2)}
.fx,.ach span{font-size:.92rem;color:var(--muted)}.fx .up{color:var(--good)}.fx .down{color:var(--bad)}.fx .muted{color:var(--muted)}
.note{padding:12px 14px;border-radius:14px;border:1px solid var(--line);background:var(--surface-2);margin:12px 0}.note.gold{border-color:var(--gold)}.note p{margin:.3em 0 0}
.eyebrow{display:block;font-size:.75rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--gold)}
.wiki-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
.wiki-item{display:flex;flex-direction:column;gap:2px;padding:10px;border:1px solid var(--line);border-radius:14px;background:var(--surface);color:var(--text);text-decoration:none}.wiki-item span{color:var(--muted);font-size:.85rem}
.thumb{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:10px;background:var(--surface-2);margin-bottom:6px}
.entry figure{margin:12px 0}.entry img{width:100%;max-height:420px;object-fit:cover;border-radius:16px}figcaption{font-size:.8rem;color:var(--muted)}
.quiz{padding:12px 16px;border:1px solid var(--line);border-radius:16px;background:var(--surface);margin:12px 0}.quiz ul{padding-inline-start:20px}summary{cursor:pointer;color:var(--cyan);font-weight:700}
.pager{display:flex;justify-content:space-between;gap:12px;margin:20px 0}.cta{text-align:center;margin:24px 0}
footer{max-width:960px;margin:0 auto;padding:20px 16px 40px;color:var(--muted);font-size:.9rem;border-top:1px solid var(--line)}
.langs div{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.langs a{padding:4px 10px;border-radius:999px;border:1px solid var(--line);text-decoration:none;color:var(--text)}.langs a[aria-current]{border-color:var(--gold)}
@media (max-width:560px){h1{font-size:1.6rem}.brand span{display:none}}
`;

const LANGS = (() => {
  const src = fs.readFileSync(path.join(root, 'i18n.js'), 'utf8');
  const block = src.slice(src.indexOf('const LANGS = ['), src.indexOf('];', src.indexOf('const LANGS = [')) + 1);
  return Function(`${block}; return LANGS;`)();
})();

const b = await chromium.launch();
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'guide.css'), CSS);
const urls = [];
for (const l of LANGS) {
  const ctx = await b.newContext({ locale: l.code });
  await ctx.route(/^https?:\/\//, r => r.abort());
  const p = await ctx.newPage();
  const d = await collect(p, l.code);
  d.allLangs = LANGS;
  const pages = build(d);
  for (const f of pages) urls.push(`${SITE}guide/${l.code}/${f}`);
  console.log(`guide/${l.code}: ${pages.length} pages`);
  await ctx.close();
}
await b.close();
// Language chooser at guide/: sends visitors to their browser's language.
fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Digital Nation guide</title><link rel="canonical" href="${SITE}guide/en/index.html"><link rel="stylesheet" href="guide.css">
<script>(function(){var c=${JSON.stringify(LANGS.map(l => l.code))},l=(navigator.languages||[navigator.language||'en']).map(function(x){return String(x).toLowerCase().split('-')[0]}).filter(function(x){return c.indexOf(x)>=0})[0]||'en';location.replace(l+'/index.html');})();</script>
</head><body><main><h1>Digital Nation guide</h1><p>${LANGS.map(l => `<a href="${l.code}/index.html" lang="${l.code}">${esc(l.name)}</a>`).join(' · ')}</p></main></body></html>
`);
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`);
console.log(`${urls.length} pages written to ${path.relative(root, OUT) || OUT}`);
