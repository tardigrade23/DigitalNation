/* Şəxsi Akademiya: kurs kataloqu, dərs naviqasiyası, testlər, qeydlər və irəliləyiş.
   İrəliləyiş həmişə brauzerdə saxlanılır; claude.ai daxilində açılanda isə
   istifadəçinin şəxsi db bölməsinə (data/users/<id>/<kurs>) sinxronlaşdırılır. */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const dayKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => dayKey(new Date());
  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  // ---------- state ----------
  let catalog = [];
  const byId = {};
  const prog = {};
  const registry = {};
  let db = null, uid = null;
  const refs = {}, writing = {}, dirty = {}, timers = {};

  const blank = () => ({ done: {}, last: 0, notes: {}, extra: {}, days: [], updated: 0 });
  function loadLocal(cid) { prog[cid] = Object.assign(blank(), lsGet('akademiya:' + cid) || {}); }
  function saveLocal(cid) { lsSet('akademiya:' + cid, prog[cid]); }

  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
    return JSON.stringify(v);
  }
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

  function merge(a, b) {
    const newer = (a.updated || 0) >= (b.updated || 0) ? a : b, older = newer === a ? b : a;
    const m = blank();
    m.done = Object.assign({}, b.done || {}, a.done || {});
    const ex = Object.assign({}, older.extra || {});
    for (const [k, v] of Object.entries(newer.extra || {})) ex[k] = isObj(v) && isObj(ex[k]) ? Object.assign({}, ex[k], v) : v;
    m.extra = ex;
    const notes = Object.assign({}, b.notes || {});
    for (const [k, v] of Object.entries(a.notes || {})) if (!notes[k] || (v.ts || 0) >= (notes[k].ts || 0)) notes[k] = v;
    for (const k of Object.keys(notes)) if (!notes[k] || !notes[k].t) delete notes[k];
    m.notes = notes;
    m.days = [...new Set([...(a.days || []), ...(b.days || [])])].sort().slice(-370);
    m.last = newer.last || 0;
    m.updated = Math.max(a.updated || 0, b.updated || 0);
    return m;
  }

  function touch(cid) {
    const p = prog[cid];
    p.updated = Date.now();
    const t = today();
    if (!p.days.includes(t)) p.days.push(t);
    saveLocal(cid);
    scheduleRemote(cid);
  }

  // ---------- cloud sync ----------
  const SYNC = {
    local: ['Yalnız bu cihazda', ''], connecting: ['Qoşulur…', ''], cloud: ['Buludda saxlanılır', 'cloud'],
    slow: ['Bulud cavab vermir', 'error'], error: ['Sinxron xətası', 'error'],
  };
  function setSync(s) { const el = $('#sync'); el.textContent = SYNC[s][0]; el.className = 'sync ' + SYNC[s][1]; }

  function scheduleRemote(cid) {
    if (!refs[cid]) return;
    clearTimeout(timers[cid]);
    timers[cid] = setTimeout(() => flush(cid), 1200);
  }
  async function flush(cid, retried) {
    if (!refs[cid]) return;
    if (writing[cid]) { dirty[cid] = true; return; }
    writing[cid] = true;
    try {
      await refs[cid].set(JSON.parse(JSON.stringify(prog[cid])));
    } catch (e) {
      if (e && e.code === 'unavailable' && !retried) { writing[cid] = false; setTimeout(() => flush(cid, true), 1000 + Math.random() * 1500); return; }
      setSync('error');
    }
    writing[cid] = false;
    if (dirty[cid]) { dirty[cid] = false; flush(cid); }
  }

  async function connect() {
    const c = window.claude;
    if (!c || typeof c.use !== 'function') return setSync('local');
    setSync('connecting');
    const [d, u] = await Promise.all([c.use('db'), c.use('user')]);
    const id = u ? await u.id() : null;
    if (!d || !id) return setSync('local');
    db = d; uid = id;
    catalog.forEach(course => subscribe(course.id));
  }

  function subscribe(cid) {
    const ref = db.collection('data/users/' + uid).doc(cid);
    refs[cid] = ref;
    const slow = setTimeout(() => setSync('slow'), 10000);
    ref.onSnapshot(snap => {
      if (!snap.metadata.fromCache) { clearTimeout(slow); setSync('cloud'); }
      if (snap.metadata.hasPendingWrites) return;
      const remote = snap.exists ? snap.data() : null;
      const merged = remote ? merge(prog[cid], remote) : prog[cid];
      const localChanged = canon(merged) !== canon(prog[cid]);
      prog[cid] = merged;
      saveLocal(cid);
      if (!snap.metadata.fromCache && (!remote || canon(merged) !== canon(remote))) scheduleRemote(cid);
      if (localChanged) refreshChrome();
    }, err => {
      clearTimeout(slow);
      refs[cid] = null;
      setSync(err && err.code === 'revoked' ? 'local' : 'error');
    });
  }

  // ---------- helpers ----------
  const doneCount = cid => Object.keys(prog[cid].done).length;
  const pctOf = cid => Math.round(100 * doneCount(cid) / (byId[cid].lessons || 1));
  function streak() {
    const all = new Set();
    catalog.forEach(c => (prog[c.id].days || []).forEach(d => all.add(d)));
    const d = new Date();
    if (!all.has(dayKey(d))) d.setDate(d.getDate() - 1);
    let n = 0;
    while (all.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  let toastT;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600);
  }

  // ---------- home ----------
  function renderHome() {
    const h = new Date().getHours();
    $('#greetH').textContent = h < 5 ? 'Gecəniz xeyrə qalsın' : h < 12 ? 'Sabahınız xeyir' : h < 18 ? 'Günortanız xeyir' : 'Axşamınız xeyir';
    $('#crumb').innerHTML = '';

    const active = catalog.filter(c => prog[c.id].updated).sort((a, b) => prog[b.id].updated - prog[a.id].updated);
    const cont = active[0] || catalog[0];
    const box = $('#continueBox');
    if (cont) {
      const p = prog[cont.id], started = !!p.updated;
      box.innerHTML = `<div class="continue"><div class="mark">${esc(cont.mark || 'A')}</div>
        <div><div class="label">${started ? 'Davam et' : 'Başla'}</div>
        <div class="what">${esc(cont.title)}</div>
        <div class="sub">${started ? `Dərs ${p.last + 1} · ${doneCount(cont.id)} / ${cont.lessons} tamamlanıb` : `${cont.lessons} dərs · ilk dərsdən başla`}</div></div>
        <a class="btn" href="#${cont.id}-${p.last + 1}">${started ? 'Davam et →' : 'Başla →'}</a></div>`;
    } else box.innerHTML = '';

    const total = catalog.reduce((s, c) => s + doneCount(c.id), 0);
    const all = catalog.reduce((s, c) => s + (c.lessons || 0), 0);
    const st = streak();
    $('#stats').innerHTML = [
      [total + ' / ' + all, 'tamamlanmış dərs'],
      [st, 'gün ardıcıl'],
      [catalog.filter(c => doneCount(c.id) >= c.lessons).length + ' / ' + catalog.length, 'bitirilmiş kurs'],
    ].map(([n, l]) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('');

    $('#shelfCount').textContent = catalog.length + ' kurs';
    $('#shelf').innerHTML = catalog.map(c => {
      const pc = pctOf(c.id);
      return `<a class="course-card" href="#${c.id}-${prog[c.id].last + 1}">
        <div class="top"><div class="mark">${esc(c.mark || 'A')}</div><h3>${esc(c.title)}</h3></div>
        <p>${esc(c.description || '')}</p>
        <div class="meter"><i style="width:${pc}%"></i></div>
        <div class="foot"><span>${doneCount(c.id)} / ${c.lessons} dərs</span><span>${pc}%</span></div></a>`;
    }).join('') + `<div class="course-card add"><div class="top"><div class="mark">+</div><h3>Yeni kurs</h3></div>
        <p>Claude ilə yeni sessiyada yaz: “Akademiyama … kursu əlavə et”. Kurs bu rəfdə görünəcək və irəliləyişin ayrıca saxlanılacaq.</p></div>`;
    renderAppBox();
  }

  // ---------- install as app + backup ----------
  const PWA_URL = 'https://tardigrade23.github.io/akademiya/';
  const inClaude = !!(window.claude && typeof window.claude.use === 'function');
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (!curCid) renderAppBox(); });
  window.addEventListener('appinstalled', () => { installEvt = null; toast('Akademiya quraşdırıldı'); if (!curCid) renderAppBox(); });
  if (!inClaude && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  function renderAppBox() {
    const box = $('#appBox'); if (!box) return;
    let install = '';
    if (inClaude) {
      install = `<div class="tool"><h3>📱 Telefona tətbiq kimi quraşdır</h3>
        <p>Quraşdırıla bilən versiya bu ünvandadır. Telefonda brauzerlə aç və “Ana ekrana əlavə et” seç:</p>
        <p><a href="${PWA_URL}" target="_blank" rel="noopener">${PWA_URL.replace('https://', '')}</a></p></div>`;
    } else if (!standalone()) {
      const how = isIOS
        ? 'Safari-də aşağıdakı <b>Paylaş</b> düyməsinə (kvadrat və ox) bas, sonra <b>“Ana ekrana əlavə et”</b> (Add to Home Screen) seç.'
        : 'Brauzer menyusunu (⋮) aç və <b>“Tətbiqi quraşdır”</b> və ya <b>“Ana ekrana əlavə et”</b> seç.';
      install = `<div class="tool"><h3>📱 Telefona tətbiq kimi quraşdır</h3>
        ${installEvt ? '<p>Bir kliklə ana ekrana əlavə et. Akademiya ayrıca tətbiq kimi, internetsiz də açılacaq.</p><button class="btn" id="installBtn">Quraşdır</button>' : `<p>${how} Akademiya ayrıca tətbiq kimi açılacaq, dərslər internetsiz də işləyəcək.</p>`}</div>`;
    }
    const backup = `<div class="tool"><h3>💾 Yedək nüsxə</h3>
      <p>İrəliləyiş və qeydlər ${inClaude ? 'hesabında' : 'bu cihazda'} saxlanılır. Başqa cihaza keçirmək və ya qorumaq üçün faylda saxla.</p>
      <div class="row">${inClaude ? '' : '<button class="btn ghost" id="exportBtn">Faylda saxla</button>'}
      <label class="btn ghost" for="importFile">Fayldan bərpa et</label><input type="file" id="importFile" accept="application/json,.json" hidden></div></div>`;
    box.innerHTML = install + backup;
    const ib = $('#installBtn');
    if (ib) ib.onclick = async () => { const e = installEvt; installEvt = null; e.prompt(); await e.userChoice.catch(() => {}); renderAppBox(); };
    const eb = $('#exportBtn');
    if (eb) eb.onclick = () => {
      const data = { app: 'akademiya', version: 1, exported: new Date().toISOString(), progress: prog };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `akademiya-yedek-${today()}.json`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('Yedək fayl hazırlandı');
    };
    $('#importFile').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (data.app !== 'akademiya' || !data.progress) throw new Error('format');
        let n = 0;
        for (const [cid, rec] of Object.entries(data.progress)) {
          if (!byId[cid] || !rec) continue;
          prog[cid] = merge(prog[cid], Object.assign(blank(), rec));
          saveLocal(cid); scheduleRemote(cid); n++;
        }
        toast(n ? 'İrəliləyiş bərpa olundu' : 'Faylda bu kurslar üçün məlumat yoxdur');
        renderHome();
      } catch (err) { toast('Bu fayl Akademiya yedəyi deyil'); }
      e.target.value = '';
    };
  }

  // ---------- course mounting ----------
  let mounted = null, mounting = null, unmountFns = [], lessonEls = [], current = 0;
  function loadScript(cid) {
    if (registry[cid]) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = `courses/${cid}/course.js`;
      s.onload = () => res(); s.onerror = () => rej(new Error('script'));
      document.body.appendChild(s);
    });
  }
  function unmount() {
    unmountFns.forEach(fn => { try { fn(); } catch (e) {} });
    unmountFns = []; lessonEls = []; mounted = null;
    $('#lessonHost').innerHTML = '';
  }
  function mount(cid) {
    if (mounted === cid) return Promise.resolve();
    if (mounting && mounting.cid === cid) return mounting.p;
    unmount();
    const host = $('#lessonHost');
    host.innerHTML = '<div class="card">Dərslər yüklənir…</div>';
    const p = (async () => {
      const r = await fetch(`courses/${cid}/lessons.html`);
      if (!r.ok) throw new Error('lessons');
      host.innerHTML = await r.text();
      lessonEls = [...host.querySelectorAll('section.lesson')];
      lessonEls.forEach((s, i) => { s.dataset.idx = i; });
      mounted = cid;
      await loadScript(cid);
      registry[cid](makeApi(cid));
    })();
    mounting = { cid, p };
    return p.catch(e => {
      console.error(e);
      host.innerHTML = '<div class="card"><h3>Kurs açılmadı</h3><p>Kursun faylları yüklənmədi. Səhifəni yeniləyib yenidən cəhd et.</p></div>';
    }).finally(() => { mounting = null; });
  }

  function makeApi(cid) {
    return {
      done(i) {
        if (prog[cid].done[i]) return;
        prog[cid].done[i] = true; touch(cid); renderSide();
        const t = lessonEls[i] && lessonEls[i].dataset.title;
        toast('Tamamlandı: ' + (t || 'Dərs ' + (i + 1)));
      },
      get: k => prog[cid].extra[k],
      set(k, v) { prog[cid].extra[k] = v; touch(cid); },
      quizzes(Q) { $('#lessonHost').querySelectorAll('.quiz').forEach(el => buildQuiz(el, Q, this)); },
      onUnmount(fn) { unmountFns.push(fn); },
    };
  }

  // ---------- quizzes (shared) ----------
  function buildQuiz(el, QUIZ, api) {
    const key = el.dataset.quiz, qs = QUIZ[key], section = +el.closest('section').dataset.idx;
    if (!qs) return;
    el.innerHTML = '';
    let answered = 0, right = 0;
    qs.forEach((it, qi) => {
      const d = document.createElement('div'); d.className = 'q';
      d.innerHTML = `<div><b>${qi + 1}.</b> ${esc(it.q)}</div><div class="opts"></div><div class="fb"></div>`;
      const opts = d.querySelector('.opts'), fb = d.querySelector('.fb');
      it.o.forEach((o, oi) => {
        const b = document.createElement('button'); b.textContent = o;
        b.onclick = () => {
          if (d.dataset.done) return; d.dataset.done = 1; answered++;
          const ok = oi === it.a; if (ok) right++;
          b.classList.add(ok ? 'right' : 'wrong'); opts.children[it.a].classList.add('right');
          fb.innerHTML = (ok ? '✅ Düzgün! ' : '❌ Səhv. ') + esc(it.e);
          if (answered === qs.length) finish();
        };
        opts.appendChild(b);
      });
      el.appendChild(d);
    });
    const res = document.createElement('div'); el.appendChild(res);
    function finish() {
      const isFinal = key === 'final';
      const pass = right >= Math.ceil(qs.length * (isFinal ? 0.8 : 0.6));
      res.className = 'msg ' + (pass ? 'ok' : 'bad');
      res.innerHTML = `Nəticə: ${right} / ${qs.length}. ` + (pass ? (isFinal ? '🎓 Təbriklər! Kursu tamamladın.' : 'Dərs tamamlandı ✓') : 'Mövzunu yenidən oxu və təkrar cəhd et.') +
        ' <button class="btn ghost" style="margin-left:8px;padding:4px 10px">Yenidən</button>';
      res.querySelector('button').onclick = () => buildQuiz(el, QUIZ, api);
      if (pass) api.done(section);
    }
  }

  // ---------- course view ----------
  let curCid = null, notesMode = false;
  function renderSide() {
    if (!curCid || !lessonEls.length) return;
    const c = byId[curCid], p = prog[curCid], parts = c.parts || {};
    const nNotes = Object.keys(p.notes).length;
    let nav = '';
    lessonEls.forEach((s, i) => {
      if (parts[i]) nav += `<div class="part">${esc(parts[i])}</div>`;
      const cls = (!notesMode && i === current ? 'active ' : '') + (p.done[i] ? 'done' : '');
      nav += `<button class="${cls}" data-go="${i + 1}"><span class="num">${p.done[i] ? '✓' : i + 1}</span>${esc(s.dataset.title)}</button>`;
    });
    $('#side').innerHTML = `<div class="ctitle">${esc(c.title)}</div>
      <div class="meter"><i style="width:${pctOf(curCid)}%"></i></div>
      <div class="pct">${doneCount(curCid)} / ${c.lessons} dərs · ${pctOf(curCid)}%</div>
      <nav>${nav}</nav>
      <a class="notes-link" href="#${curCid}-qeydler">📝 Qeydlərim (${nNotes})</a>`;
    $('#side').querySelectorAll('[data-go]').forEach(b => { b.onclick = () => { location.hash = curCid + '-' + b.dataset.go; }; });
    const act = $('#side nav button.active');
    if (act && window.matchMedia('(max-width:860px)').matches) act.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function showLesson(i) {
    notesMode = false;
    i = Math.max(0, Math.min(lessonEls.length - 1, i));
    current = i;
    lessonEls.forEach((s, j) => s.classList.toggle('show', j === i));
    $('#lessonHost').hidden = false; $('#notesView').hidden = true; $('#notesCard').hidden = false;
    const p = prog[curCid];
    if (p.last !== i) { p.last = i; touch(curCid); }
    $('#noteText').value = (p.notes[i] && p.notes[i].t) || '';
    $('#noteState').textContent = 'Qeydlər avtomatik saxlanılır.';
    $('#pager').innerHTML = (i > 0 ? `<a class="btn ghost" href="#${curCid}-${i}">← Əvvəlki</a>` : '<span></span>') +
      (i < lessonEls.length - 1 ? `<a class="btn" href="#${curCid}-${i + 2}">Növbəti →</a>` : `<a class="btn" href="#">Kurslara qayıt</a>`);
    $('#crumb').innerHTML = `<b>${esc(byId[curCid].title)}</b> · ${i + 1}. ${esc(lessonEls[i].dataset.title)}`;
    renderSide();
    window.scrollTo({ top: 0 });
  }

  function showNotes() {
    notesMode = true;
    const p = prog[curCid];
    $('#lessonHost').hidden = true; $('#notesCard').hidden = true; $('#pager').innerHTML = '';
    const items = lessonEls.map((s, i) => p.notes[i] ? `<div class="note-item"><a href="#${curCid}-${i + 1}"><b>${i + 1}. ${esc(s.dataset.title)}</b></a>
        <span class="fb">· ${new Date(p.notes[i].ts).toLocaleDateString('az')}</span><pre>${esc(p.notes[i].t)}</pre></div>` : '').join('');
    const v = $('#notesView'); v.hidden = false;
    v.innerHTML = `<div class="card"><h2>Qeydlərim</h2><p class="lead">${esc(byId[curCid].title)} kursu üzrə bütün qeydlərin. Qeydi dəyişmək üçün dərsə keç.</p>
      ${items || '<p>Hələ qeyd yoxdur. Hər dərsin altında “Qeydlərim” bölməsi var. Dərsi öz sözlərinlə 2–3 cümlədə yazmaq onu yadda saxlamağın ən yaxşı yoludur.</p>'}</div>`;
    $('#crumb').innerHTML = `<b>${esc(byId[curCid].title)}</b> · Qeydlər`;
    renderSide();
    window.scrollTo({ top: 0 });
  }

  let noteT;
  $('#noteText').addEventListener('input', () => {
    $('#noteState').textContent = 'Yazılır…';
    clearTimeout(noteT);
    const cid = curCid, i = current;
    noteT = setTimeout(() => {
      const t = $('#noteText').value.trim();
      if (t) prog[cid].notes[i] = { t, ts: Date.now() }; else delete prog[cid].notes[i];
      touch(cid);
      $('#noteState').textContent = 'Saxlanıldı ✓';
      renderSide();
    }, 700);
  });

  // ---------- routing ----------
  function parseHash() {
    const h = decodeURIComponent(location.hash.slice(1));
    const m = h.match(/^([a-z0-9]+)(?:-(\d+|qeydler))?$/);
    if (!m || !byId[m[1]]) return { view: 'home' };
    if (m[2] === 'qeydler') return { view: 'notes', cid: m[1] };
    return { view: 'course', cid: m[1], lesson: m[2] ? +m[2] - 1 : null };
  }
  async function route() {
    const r = parseHash();
    if (r.view === 'home') {
      curCid = null;
      $('#courseView').hidden = true; $('#home').hidden = false;
      renderHome();
      return;
    }
    $('#home').hidden = true; $('#courseView').hidden = false;
    curCid = r.cid;
    await mount(r.cid);
    if (mounted !== r.cid || curCid !== r.cid) return;
    if (r.view === 'notes') showNotes();
    else showLesson(r.lesson == null ? prog[r.cid].last : r.lesson);
  }
  function refreshChrome() {
    if (!curCid) renderHome(); else renderSide();
  }
  window.addEventListener('hashchange', route);

  // ---------- theme ----------
  const savedTheme = lsGet('akademiya:theme');
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  $('#themeBtn').onclick = () => {
    const r = document.documentElement, dark = matchMedia('(prefers-color-scheme: dark)').matches;
    const cur = r.dataset.theme || (dark ? 'dark' : 'light');
    r.dataset.theme = cur === 'dark' ? 'light' : 'dark';
    lsSet('akademiya:theme', r.dataset.theme);
  };

  // ---------- public API for course modules ----------
  window.LMS = { registerCourse(id, init) { registry[id] = init; } };

  // ---------- boot ----------
  (async () => {
    try {
      const r = await fetch('courses/catalog.json');
      catalog = (await r.json()).courses || [];
    } catch (e) {
      $('#shelf').innerHTML = '<div class="card">Kurs kataloqu yüklənmədi. Səhifəni yenilə.</div>';
      return;
    }
    catalog.forEach(c => { byId[c.id] = c; loadLocal(c.id); });
    route();
    connect();
  })();
})();
