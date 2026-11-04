'use strict';

/* =========================================================
 * Digital Nation — idle nation simulator (prototip)
 * ========================================================= */

const SAVE_KEY = 'digitalnation_save_v1';
const COST_GROWTH = 1.15;
const MILESTONES = [25, 50, 100, 200, 300, 400, 500];
const OFFLINE_MAX_SEC = 8 * 3600;
const OFFLINE_EFFICIENCY = 0.5;
const PRESTIGE_DIVISOR = 1e7;      // nüfuz = floor(sqrt(runEarned / 1e7))
const INFLUENCE_BONUS = 0.10;      // hər nüfuz xalı +10%
const BOOST_DURATION = 120e3;
const BOOST_COOLDOWN = 300e3;
const ATTACK_WINDOW = 12e3;
const DEBUFF_DURATION = 30e3;

const SECTORS = [
  { id: 'isp',     icon: '📡', name: 'İnternet Provayderi', base: 15,    inc: 0.5 },
  { id: 'egov',    icon: '🏛️', name: 'E-Hökumət Portalı',   base: 100,   inc: 4 },
  { id: 'mbank',   icon: '💳', name: 'Mobil Bankçılıq',      base: 1100,  inc: 20 },
  { id: 'fintech', icon: '💹', name: 'Fintech Hab',          base: 12e3,  inc: 100 },
  { id: 'dc',      icon: '🗄️', name: 'Data Mərkəzi',         base: 130e3, inc: 550 },
  { id: 'g5',      icon: '📶', name: '5G Şəbəkəsi',          base: 1.4e6, inc: 3000 },
  { id: 'smart',   icon: '🌆', name: 'Smart City',           base: 2e7,   inc: 18e3 },
  { id: 'ai',      icon: '🤖', name: 'AI Laboratoriyası',    base: 3.3e8, inc: 110e3 },
  { id: 'quantum', icon: '⚛️', name: 'Kvant Hesablama',      base: 5.1e9, inc: 700e3 },
  { id: 'space',   icon: '🛰️', name: 'Peyk İnterneti',       base: 7.5e10, inc: 5e6 },
];

const UPGRADES = [];
(function buildUpgrades() {
  const tiers = [
    { req: 10,  costMul: 50,  mult: 3, label: 'Optimallaşdırma' },
    { req: 50,  costMul: 5e3, mult: 3, label: 'Avtomatlaşdırma' },
    { req: 150, costMul: 5e6, mult: 5, label: 'AI İnteqrasiyası' },
  ];
  for (const s of SECTORS) {
    tiers.forEach((t, i) => UPGRADES.push({
      id: `${s.id}_${i}`, kind: 'sector', sector: s.id, mult: t.mult,
      name: `${s.icon} ${s.name}: ${t.label}`,
      desc: `${s.name} gəliri x${t.mult}`,
      cost: s.base * t.costMul,
      unlocked: () => owned(s.id) >= t.req,
    }));
  }
  const ai = [
    ['AI Köməkçi',              'Bütün gəlir x1.5', 5e4,  1.5, 1e4],
    ['Dövlət Süni İntellekti',  'Bütün gəlir x2',   5e6,  2,   1e6],
    ['Neyron Bulud Şəbəkəsi',   'Bütün gəlir x2',   5e8,  2,   1e8],
    ['Milli Dil Modeli',        'Bütün gəlir x3',   5e10, 3,   1e10],
    ['Süni Ümumi İntellekt',    'Bütün gəlir x5',   5e13, 5,   1e13],
  ];
  ai.forEach(([name, desc, cost, mult, need], i) => UPGRADES.push({
    id: `ai_${i}`, kind: 'global', mult, cost, name: `🧠 ${name}`, desc,
    unlocked: () => state.runEarned >= need,
  }));
  UPGRADES.push(
    { id: 'click_0', kind: 'click', mult: 3, cost: 200, name: '🧾 Onlayn Vergi Sistemi', desc: 'Klik gücü x3', unlocked: () => state.clicks >= 10 },
    { id: 'click_1', kind: 'click', mult: 5, cost: 2e5, name: '🔗 Blokçeyn Vergi Reyestri', desc: 'Klik gücü x5', unlocked: () => state.runEarned >= 5e4 },
    { id: 'click_2', kind: 'click', mult: 10, cost: 2e9, name: '🪪 Rəqəmsal Vətəndaş ID', desc: 'Klik gücü x10', unlocked: () => state.runEarned >= 5e8 },
  );
  UPGRADES.sort((a, b) => a.cost - b.cost);
})();

/* ---------------- State ---------------- */

function defaultState() {
  const now = Date.now();
  return {
    nation: 'Rəqəmsal Respublika',
    gdp: 0, runEarned: 0, lifeEarned: 0,
    sectors: {}, upgrades: {},
    pop: 1e6, secLevel: 0,
    influence: 0, prestiges: 0,
    clicks: 0, attacksRepelled: 0, attacksLost: 0,
    boostUntil: 0, boostReadyAt: 0, debuffUntil: 0,
    attack: null, nextAttack: now + 90e3,
    startedAt: now, lastSave: now,
  };
}

let state = loadGame();
let buyAmt = 1;

function owned(id) { return state.sectors[id] || 0; }
function totalOwned() { return SECTORS.reduce((a, s) => a + owned(s.id), 0); }

/* ---------------- Economy ---------------- */

function sectorMult(s) {
  let m = 1;
  const n = owned(s.id);
  for (const ms of MILESTONES) if (n >= ms) m *= 2;
  for (const u of UPGRADES) if (u.kind === 'sector' && u.sector === s.id && state.upgrades[u.id]) m *= u.mult;
  return m;
}

function welfare() {
  const score = totalOwned() + owned('smart') * 5 + owned('egov') * 0.5;
  return 100 * (1 - Math.exp(-score / 200));
}

function popTarget() { return 1e6 * (1 + totalOwned() * 0.015) * (1 + welfare() / 100); }

function globalMult(withTemp) {
  let m = 1;
  for (const u of UPGRADES) if (u.kind === 'global' && state.upgrades[u.id]) m *= u.mult;
  m *= 1 + welfare() / 100;
  m *= Math.sqrt(state.pop / 1e6);
  m *= 1 + state.influence * INFLUENCE_BONUS;
  if (withTemp) {
    const now = Date.now();
    if (now < state.boostUntil) m *= 2;
    if (now < state.debuffUntil) m *= 0.5;
  }
  return m;
}

function sectorIncome(s, withTemp = true) { return owned(s.id) * s.inc * sectorMult(s) * globalMult(withTemp); }

function incomePerSec(withTemp = true) {
  let base = 0;
  for (const s of SECTORS) base += owned(s.id) * s.inc * sectorMult(s);
  return base * globalMult(withTemp);
}

function clickValue() {
  let m = 1;
  for (const u of UPGRADES) if (u.kind === 'click' && state.upgrades[u.id]) m *= u.mult;
  return (1 + incomePerSec() * 0.05) * m;
}

function earn(x) { state.gdp += x; state.runEarned += x; state.lifeEarned += x; }

function costFor(s, n) {
  const r = COST_GROWTH;
  return s.base * Math.pow(r, owned(s.id)) * (Math.pow(r, n) - 1) / (r - 1);
}

function maxAffordable(s) {
  const r = COST_GROWTH;
  const c0 = s.base * Math.pow(r, owned(s.id));
  return Math.max(0, Math.floor(Math.log(state.gdp * (r - 1) / c0 + 1) / Math.log(r)));
}

function purchaseCount(s) {
  if (buyAmt === 'max') return Math.max(1, maxAffordable(s));
  return buyAmt;
}

function isUnlocked(i) { return i === 0 || owned(SECTORS[i - 1].id) > 0 || owned(SECTORS[i].id) > 0; }

function buySector(id) {
  const i = SECTORS.findIndex(s => s.id === id);
  const s = SECTORS[i];
  if (!s || !isUnlocked(i)) return;
  const n = purchaseCount(s);
  const cost = costFor(s, n);
  if (state.gdp < cost) return;
  const before = owned(id);
  state.gdp -= cost;
  state.sectors[id] = before + n;
  const hit = MILESTONES.find(m => before < m && before + n >= m);
  if (hit) toast(`${s.icon} ${s.name}: ${hit} ədəd! Gəlir x2`, 'good');
}

function buyUpgrade(id) {
  const u = UPGRADES.find(x => x.id === id);
  if (!u || state.upgrades[id] || !u.unlocked() || state.gdp < u.cost) return;
  state.gdp -= u.cost;
  state.upgrades[id] = true;
  toast(`${u.name} aktivləşdi`, 'good');
}

/* ---------------- Cyber security ---------------- */

const SEC_MAX = 7;
function secCost() { return 2000 * Math.pow(10, state.secLevel); }
function secChance() { return Math.min(0.95, 0.25 + state.secLevel * 0.1); }

function buySecurity() {
  if (state.secLevel >= SEC_MAX || state.gdp < secCost()) return;
  state.gdp -= secCost();
  state.secLevel++;
  toast(`🛡️ Müdafiə səviyyəsi ${state.secLevel}`, 'good');
}

function scheduleAttack(now) { state.nextAttack = now + (90 + Math.random() * 60) * 1000; }

function repelAttack() {
  if (!state.attack) return;
  const reward = Math.max(50, incomePerSec(false) * 20);
  earn(reward);
  state.attack = null;
  state.attacksRepelled++;
  scheduleAttack(Date.now());
  toast(`🛡️ Hücum dəf edildi! Mükafat: ${money(reward)}`, 'good');
}

function resolveAttack(now) {
  state.attack = null;
  if (Math.random() < secChance()) {
    state.attacksRepelled++;
    toast('🛡️ Müdafiə sistemi hücumu avtomatik dəf etdi', 'good');
  } else {
    const stolen = state.gdp * 0.1;
    state.gdp -= stolen;
    state.debuffUntil = now + DEBUFF_DURATION;
    state.attacksLost++;
    toast(`💀 Hakerlər ${money(stolen)} oğurladı. Gəlir 30 san -50%`, 'bad');
  }
  scheduleAttack(now);
}

function updateAttack(now) {
  if (state.attack) {
    if (now >= state.attack.endsAt) resolveAttack(now);
  } else if (now >= state.nextAttack) {
    if (incomePerSec(false) >= 5) state.attack = { endsAt: now + ATTACK_WINDOW };
    else scheduleAttack(now);
  }
}

/* ---------------- Boost (rewarded ad placeholder) ---------------- */

function activateBoost() {
  const now = Date.now();
  if (now < state.boostReadyAt) return;
  state.boostUntil = now + BOOST_DURATION;
  state.boostReadyAt = now + BOOST_COOLDOWN;
  toast('📺 x2 gəlir bonusu aktivdir (2 dəq)', 'good');
}

/* ---------------- Prestige / export ---------------- */

function claimableInfluence() { return Math.floor(Math.sqrt(state.runEarned / PRESTIGE_DIVISOR)); }

function doPrestige() {
  const gain = claimableInfluence();
  if (gain < 1) return;
  showModal('🌍 Texnologiya ixracı',
    `${gain} nüfuz xalı qazanacaqsan.\nÜDM, sektorlar, təkmilləşdirmələr və müdafiə sıfırlanacaq.`,
    { okText: 'İxrac et', onOk: performPrestige });
}

function performPrestige() {
  const gain = claimableInfluence();
  if (gain < 1) return;
  const keep = {
    nation: state.nation, lifeEarned: state.lifeEarned,
    influence: state.influence + gain, prestiges: state.prestiges + 1,
    clicks: state.clicks, attacksRepelled: state.attacksRepelled, attacksLost: state.attacksLost,
    startedAt: state.startedAt,
  };
  state = Object.assign(defaultState(), keep);
  sectorSig = '';
  saveGame();
  showModal('🌍 Texnologiya ixrac edildi!', `+${gain} Beynəlxalq Nüfuz. İndi bütün gəlir +${Math.round(state.influence * INFLUENCE_BONUS * 100)}% artıqdır.`);
}

/* ---------------- Rank ---------------- */

function techRank() {
  const r = 195 - Math.floor(Math.log10(Math.max(1, state.lifeEarned)) * 10);
  return Math.max(1, Math.min(195, r));
}

function rankTitle(r) {
  if (r === 1) return 'Dünyanın ən qabaqcıl rəqəmsal dövləti';
  if (r <= 10) return 'Rəqəmsal super güc';
  if (r <= 40) return 'Qlobal texno-lider';
  if (r <= 90) return 'Regional texno-mərkəz';
  if (r <= 150) return 'Rəqəmsallaşan dövlət';
  return 'Analoq dövlət';
}

/* ---------------- Formatting ---------------- */

const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
function fmt(n) {
  if (!isFinite(n)) return '∞';
  if (n < 0) return '-' + fmt(-n);
  if (n < 1000) return n < 100 && n % 1 !== 0 ? n.toFixed(1) : String(Math.floor(n));
  const i = Math.floor(Math.log10(n) / 3);
  if (i >= SUFFIX.length) return n.toExponential(2);
  return (n / Math.pow(1000, i)).toFixed(2) + SUFFIX[i];
}
function money(n) { return '$' + fmt(n); }
function dur(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h) return `${h} saat ${m} dəq`;
  if (m) return `${m} dəq ${sec} san`;
  return `${sec} san`;
}

/* ---------------- Save / load ---------------- */

function saveGame() {
  state.lastSave = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
}

function loadGame() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { saved = null; }
  return saved && typeof saved === 'object' ? Object.assign(defaultState(), saved) : defaultState();
}

function applyOffline() {
  const now = Date.now();
  const elapsed = Math.min(OFFLINE_MAX_SEC, (now - state.lastSave) / 1000);
  state.attack = null;
  state.nextAttack = Math.max(state.nextAttack, now + 60e3);
  if (elapsed < 30) return;
  const gain = incomePerSec(false) * elapsed * OFFLINE_EFFICIENCY;
  state.pop = popTarget() - (popTarget() - state.pop) * Math.exp(-elapsed * 0.05);
  if (gain <= 0) return;
  earn(gain);
  showModal('🌙 Sən yox ikən', `Dövlətin ${dur(elapsed * 1000)} ərzində ${money(gain)} qazandı.`);
}

/* ---------------- UI ---------------- */

const $ = id => document.getElementById(id);

function toast(text, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = text;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3500);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
}

// opts: { okText, onOk(value), input: initialValue }. onOk olduqda "Ləğv et" düyməsi də görünür.
let modalOnOk = null;
function showModal(title, text, opts = {}) {
  $('modalTitle').textContent = title;
  $('modalText').textContent = text;
  const input = $('modalInput');
  input.hidden = opts.input === undefined;
  if (!input.hidden) input.value = opts.input;
  $('modalCancel').hidden = !opts.onOk;
  $('modalOk').textContent = opts.okText || 'Davam et';
  modalOnOk = opts.onOk || null;
  $('modal').classList.remove('hidden');
  if (!input.hidden) input.focus();
}

function closeModal(confirmed) {
  const fn = confirmed ? modalOnOk : null;
  const value = $('modalInput').value;
  modalOnOk = null;
  $('modal').classList.add('hidden');
  if (fn) fn(value);
}

let sectorSig = '';
function buildSectors() {
  const visible = [];
  for (let i = 0; i < SECTORS.length; i++) {
    visible.push(i);
    if (!isUnlocked(i)) break; // show one locked teaser
  }
  const sig = visible.map(i => `${i}:${isUnlocked(i)}`).join(',');
  if (sig === sectorSig) return;
  sectorSig = sig;
  $('sectors').innerHTML = visible.map(i => {
    const s = SECTORS[i];
    if (!isUnlocked(i)) {
      return `<div class="sector locked"><div class="ico">🔒</div>
        <div class="name">???</div><div class="meta">${SECTORS[i - 1].name} al, açılsın</div>
        <button class="btn buy" disabled>Bağlıdır</button></div>`;
    }
    return `<div class="sector" data-id="${s.id}">
      <div class="ico">${s.icon}</div>
      <div class="name"><span>${s.name}</span><span class="owned" data-f="owned"></span></div>
      <button class="btn buy" data-buy="${s.id}"><span data-f="label"></span><small data-f="cost"></small></button>
      <div class="meta" data-f="meta"></div>
      <div class="progress"><i data-f="prog"></i></div>
    </div>`;
  }).join('');
}

function renderSectors() {
  buildSectors();
  for (const row of $('sectors').querySelectorAll('.sector[data-id]')) {
    const s = SECTORS.find(x => x.id === row.dataset.id);
    const n = owned(s.id);
    const count = purchaseCount(s);
    const cost = costFor(s, count);
    const f = k => row.querySelector(`[data-f="${k}"]`);
    f('owned').textContent = n;
    f('label').textContent = `Al x${count}`;
    f('cost').textContent = money(cost);
    const next = MILESTONES.find(m => n < m);
    const prev = [...MILESTONES].reverse().find(m => n >= m) || 0;
    f('meta').textContent = `${money(sectorIncome(s))}/san` + (next ? ` · ${next}-də x2` : ' · maks');
    f('prog').style.width = next ? `${((n - prev) / (next - prev)) * 100}%` : '100%';
    const btn = row.querySelector('.buy');
    const can = state.gdp >= cost;
    btn.disabled = !can;
    btn.classList.toggle('can', can);
  }
}

let upgSig = '';
function renderUpgrades() {
  const list = UPGRADES.filter(u => !state.upgrades[u.id] && u.unlocked()).slice(0, 12);
  const sig = list.map(u => `${u.id}:${state.gdp >= u.cost ? 1 : 0}`).join(',');
  if (sig === upgSig) return;
  upgSig = sig;
  $('upgrades').innerHTML = list.length ? list.map(u => {
    const can = state.gdp >= u.cost;
    return `<button class="upg ${can ? 'can' : ''}" data-upg="${u.id}" ${can ? '' : 'disabled'}>
      <span class="t">${u.name}</span><span class="c">${money(u.cost)}</span>
      <span class="d">${u.desc}</span></button>`;
  }).join('') : '<div class="empty">Yeni təkmilləşdirmə yoxdur. Sektorlarını böyüt!</div>';
}

function renderPanels(now) {
  $('secLevel').textContent = `${state.secLevel} / ${SEC_MAX}`;
  $('secChance').textContent = `${Math.round(secChance() * 100)}%`;
  $('nextAttack').textContent = state.attack ? 'İndi!' : (incomePerSec(false) < 5 ? 'Hələ hədəf deyilsən' : dur(state.nextAttack - now));
  $('attackStats').textContent = `${state.attacksRepelled} / ${state.attacksLost}`;
  const sb = $('buySec');
  if (state.secLevel >= SEC_MAX) { sb.textContent = 'Maksimum müdafiə'; sb.disabled = true; }
  else { sb.textContent = `Müdafiəni gücləndir — ${money(secCost())}`; sb.disabled = state.gdp < secCost(); }

  const claim = claimableInfluence();
  $('runEarned').textContent = money(state.runEarned);
  $('claimable').textContent = claim;
  $('inflBonus').textContent = `+${Math.round(state.influence * INFLUENCE_BONUS * 100)}%`;
  $('countries').textContent = Math.min(194, state.influence);
  $('prestige').disabled = claim < 1;

  const rows = [
    ['Ümumi qazanılan ÜDM', money(state.lifeEarned)],
    ['Bu dövrdə qazanılan', money(state.runEarned)],
    ['Sektor sayı', totalOwned()],
    ['Gəlir multiplikatoru', `x${fmt(globalMult(true))}`],
    ['Klik sayı', state.clicks],
    ['İxrac (prestij) sayı', state.prestiges],
    ['Oyun müddəti', dur(now - state.startedAt)],
  ];
  $('statsList').innerHTML = rows.map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('');
}

function render() {
  const now = Date.now();
  const ips = incomePerSec();
  $('nationName').textContent = state.nation;
  $('gdp').textContent = money(state.gdp);
  $('ips').textContent = `+${money(ips)} / san`;
  $('pop').textContent = fmt(state.pop);
  $('welfare').textContent = `${Math.round(welfare())}%`;
  const r = techRank();
  $('rank').textContent = `#${r}`;
  $('title').textContent = rankTitle(r);
  $('influence').textContent = state.influence;
  $('tapValue').textContent = money(clickValue());

  const boostBtn = $('boost');
  if (now < state.boostReadyAt) {
    boostBtn.disabled = true;
    boostBtn.textContent = `📺 Bonus ${dur(state.boostReadyAt - now)} sonra`;
  } else {
    boostBtn.disabled = false;
    boostBtn.textContent = '📺 x2 Bonus (2 dəq)';
  }

  const fx = [];
  if (now < state.boostUntil) fx.push(`<span class="chip good">⚡ x2 gəlir · ${dur(state.boostUntil - now)}</span>`);
  if (now < state.debuffUntil) fx.push(`<span class="chip bad">💀 Kiberhücum: -50% · ${dur(state.debuffUntil - now)}</span>`);
  $('effects').innerHTML = fx.join('');

  if (state.attack) {
    $('attack').classList.remove('hidden');
    $('attackBar').style.width = `${Math.max(0, (state.attack.endsAt - now) / ATTACK_WINDOW) * 100}%`;
  } else {
    $('attack').classList.add('hidden');
  }

  renderSectors();
  renderUpgrades();
  renderPanels(now);
}

/* ---------------- Loop ---------------- */

let lastTick = Date.now();
function tick() {
  const now = Date.now();
  const dt = Math.min(1, (now - lastTick) / 1000); // background tabs: offline logic handles long gaps
  lastTick = now;
  earn(incomePerSec() * dt);
  state.pop += (popTarget() - state.pop) * Math.min(1, dt * 0.05);
  updateAttack(now);
  render();
}

function bindUI() {
  $('tap').addEventListener('click', e => {
    const v = clickValue();
    earn(v);
    state.clicks++;
    const f = document.createElement('span');
    f.className = 'floater';
    f.textContent = '+' + money(v);
    const box = $('tap').getBoundingClientRect();
    const zone = $('tap').parentElement.getBoundingClientRect();
    f.style.left = `${(e.clientX || box.left + box.width / 2) - zone.left - 20}px`;
    f.style.top = `${(e.clientY || box.top) - zone.top - 20}px`;
    $('tap').parentElement.appendChild(f);
    setTimeout(() => f.remove(), 900);
    render();
  });
  $('boost').addEventListener('click', activateBoost);
  $('repel').addEventListener('click', () => { repelAttack(); render(); });
  $('buySec').addEventListener('click', () => { buySecurity(); render(); });
  $('prestige').addEventListener('click', doPrestige);
  $('modalOk').addEventListener('click', () => closeModal(true));
  $('modalCancel').addEventListener('click', () => closeModal(false));
  $('modalInput').addEventListener('keydown', e => { if (e.key === 'Enter') closeModal(true); });

  $('sectors').addEventListener('click', e => {
    const b = e.target.closest('[data-buy]');
    if (b) { buySector(b.dataset.buy); render(); }
  });
  $('upgrades').addEventListener('click', e => {
    const b = e.target.closest('[data-upg]');
    if (b) { buyUpgrade(b.dataset.upg); render(); }
  });
  $('buyAmt').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    buyAmt = b.dataset.amt === 'max' ? 'max' : Number(b.dataset.amt);
    for (const x of $('buyAmt').children) x.classList.toggle('on', x === b);
    render();
  });
  document.querySelector('.tabs').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    for (const x of document.querySelectorAll('.tabs button')) x.classList.toggle('on', x === b);
    for (const p of document.querySelectorAll('.panel')) p.classList.toggle('hidden', p.id !== `tab-${b.dataset.tab}`);
  });
  $('nationName').addEventListener('click', () => {
    showModal('🏳️ Dövlətin adı', 'Rəqəmsal dövlətinə ad ver:', {
      input: state.nation, okText: 'Yadda saxla',
      onOk: n => { if (n && n.trim()) { state.nation = n.trim().slice(0, 32); saveGame(); render(); } },
    });
  });
  $('reset').addEventListener('click', () => {
    showModal('🗑️ Oyunu sıfırla', 'Bütün irəliləyiş, nüfuz da daxil, silinəcək. Bunu geri qaytarmaq olmur.', {
      okText: 'Sıfırla',
      onOk: () => { state = defaultState(); sectorSig = ''; upgSig = ''; saveGame(); render(); },
    });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveGame();
    else { applyOffline(); lastTick = Date.now(); render(); }
  });
  window.addEventListener('beforeunload', saveGame);
}

bindUI();
applyOffline();
render();
setInterval(tick, 100);
setInterval(saveGame, 5000);

// Debug / test üçün
window.DN = { get state() { return state; }, incomePerSec, earn, render, SECTORS, UPGRADES };
