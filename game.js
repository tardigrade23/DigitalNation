'use strict';

/* =========================================================
 * Digital Nation — idle nation simulator (prototype)
 * ========================================================= */

const SAVE_KEY = 'digitalnation_save_v1';
const COST_GROWTH = 1.15;
const MILESTONES = [25, 50, 100, 200, 300, 400, 500];
const OFFLINE_MAX_SEC = 8 * 3600;
const OFFLINE_EFFICIENCY = 0.5;
const PRESTIGE_DIVISOR = 1e7;      // influence = floor(sqrt(runEarned / 1e7))
const INFLUENCE_BONUS = 0.10;      // +10% income per influence point
const BOOST_DURATION = 120e3;
const BOOST_COOLDOWN = 300e3;
const ATTACK_WINDOW = 12e3;
const DEBUFF_DURATION = 30e3;
const SEC_MAX = 7;
const DEFAULT_NATION = 'Digital Nation';
const DEFAULT_PLAYER = { name: 'Leader', avatar: 'ai', tone: 'gold', flag: 0 };
const DEFAULT_SETTINGS = { sound: true, vibration: true };
const DEFAULT_DAILY = { streak: 0, last: '', best: 0 };
const DEFAULT_POLICIES = { tax: 1, net: 1, edu: 1, trade: 1 };
const START_GEMS = 25;

// c1/c2: icon tile gradient
const SECTORS = [
  { id: 'isp',     name: 'Internet Provider',  base: 15,     inc: 0.5,   c1: '#5AB8FF', c2: '#2563C9' },
  { id: 'egov',    name: 'E-Government',       base: 100,    inc: 4,     c1: '#7FD1C7', c2: '#1F8A7E' },
  { id: 'mbank',   name: 'Mobile Banking',     base: 1100,   inc: 20,    c1: '#FFB86B', c2: '#D9681C' },
  { id: 'fintech', name: 'Fintech Hub',        base: 12e3,   inc: 100,   c1: '#6EE29C', c2: '#1E9A5A' },
  { id: 'dc',      name: 'Data Center',        base: 130e3,  inc: 550,   c1: '#8FA3FF', c2: '#3B4FCF' },
  { id: 'g5',      name: '5G Network',         base: 1.4e6,  inc: 3000,  c1: '#FF8FAB', c2: '#C23A63' },
  { id: 'smart',   name: 'Smart City',         base: 2e7,    inc: 18e3,  c1: '#F7C75B', c2: '#C7800F' },
  { id: 'ai',      name: 'AI Lab',             base: 3.3e8,  inc: 110e3, c1: '#C29BFF', c2: '#6A3FD6' },
  { id: 'quantum', name: 'Quantum Computing',  base: 5.1e9,  inc: 700e3, c1: '#5EF0E0', c2: '#138A9C' },
  { id: 'space',   name: 'Satellite Internet', base: 7.5e10, inc: 5e6,   c1: '#B5C3D9', c2: '#4A5A75' },
];

const UPGRADES = [];
(function buildUpgrades() {
  const tiers = [
    { req: 10,  costMul: 50,  mult: 3, label: 'Optimization' },
    { req: 50,  costMul: 5e3, mult: 3, label: 'Automation' },
    { req: 150, costMul: 5e6, mult: 5, label: 'AI Integration' },
  ];
  for (const s of SECTORS) {
    tiers.forEach((t, i) => UPGRADES.push({
      id: `${s.id}_${i}`, kind: 'sector', sector: s.id, mult: t.mult,
      icon: s.id, c1: s.c1, c2: s.c2, tag: 'Sector',
      name: `${s.name} ${t.label}`,
      desc: `${s.name} income ×${t.mult}`,
      cost: s.base * t.costMul,
      unlocked: () => owned(s.id) >= t.req,
    }));
  }
  const ai = [
    ['AI Assistant',                 1.5, 5e4,  1e4],
    ['Government AI',                2,   5e6,  1e6],
    ['Neural Cloud',                 2,   5e8,  1e8],
    ['National Language Model',      3,   5e10, 1e10],
    ['Artificial General Intelligence', 5, 5e13, 1e13],
  ];
  ai.forEach(([name, mult, cost, need], i) => UPGRADES.push({
    id: `ai_${i}`, kind: 'global', mult, cost, name, icon: 'ai', c1: '#C29BFF', c2: '#6A3FD6', tag: 'AI',
    desc: `All income ×${mult}`,
    unlocked: () => state.runEarned >= need,
  }));
  UPGRADES.push(
    { id: 'click_0', kind: 'click', mult: 3,  cost: 200, name: 'Online Tax System',        desc: 'Tap power ×3',  icon: 'coin', c1: '#F7C75B', c2: '#C7800F', tag: 'Tax', unlocked: () => state.clicks >= 10 },
    { id: 'click_1', kind: 'click', mult: 5,  cost: 2e5, name: 'Blockchain Tax Registry',  desc: 'Tap power ×5',  icon: 'coin', c1: '#F7C75B', c2: '#C7800F', tag: 'Tax', unlocked: () => state.runEarned >= 5e4 },
    { id: 'click_2', kind: 'click', mult: 10, cost: 2e9, name: 'Digital Citizen ID',       desc: 'Tap power ×10', icon: 'coin', c1: '#F7C75B', c2: '#C7800F', tag: 'Tax', unlocked: () => state.runEarned >= 5e8 },
  );
  UPGRADES.sort((a, b) => a.cost - b.cost);
})();

/* ---------------- State ---------------- */

function defaultState() {
  const now = Date.now();
  return {
    nation: DEFAULT_NATION,
    gdp: 0, runEarned: 0, lifeEarned: 0,
    sectors: {}, upgrades: {},
    pop: 1e6, secLevel: 0,
    influence: 0, prestiges: 0,
    clicks: 0, attacksRepelled: 0, attacksLost: 0,
    boostUntil: 0, boostReadyAt: 0, debuffUntil: 0,
    attack: null, nextAttack: now + 90e3,
    startedAt: now, lastSave: now,
    player: { ...DEFAULT_PLAYER }, achievements: {},
    settings: { ...DEFAULT_SETTINGS }, daily: { ...DEFAULT_DAILY }, coach: {},
    rp: 0, research: {}, policies: { ...DEFAULT_POLICIES }, policyChangedAt: {}, era: 0,
    policyChanges: 0, gamesWon: 0,
    gems: START_GEMS, vipUntil: 0, shieldUntil: 0, owned: { golden: false, flags: [], tones: [] }, adGems: { day: '', n: 0 },
  };
}

let state = loadGame();
let buyAmt = 1;
let screen = 'nation';

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
  const w = 100 * (1 - Math.exp(-score / 200)) + mods().welfare;
  return Math.max(0, Math.min(100, w));
}

function popTarget() { return 1e6 * (1 + totalOwned() * 0.015) * (1 + welfare() / 100); }

function globalMult(withTemp) {
  let m = 1;
  for (const u of UPGRADES) if (u.kind === 'global' && state.upgrades[u.id]) m *= u.mult;
  m *= 1 + welfare() / 100;
  m *= Math.sqrt(state.pop / 1e6);
  m *= 1 + state.influence * INFLUENCE_BONUS;
  m *= mods().income * ERAS[currentEra()].mult;
  if (state.owned.golden) m *= 2;
  if (withTemp) {
    const now = Date.now();
    if (now < state.boostUntil) m *= 2;
    if (now < state.debuffUntil) m *= 0.5;
  }
  return m;
}

function sectorIncome(s) { return owned(s.id) * s.inc * sectorMult(s) * globalMult(true); }

function incomePerSec(withTemp = true) {
  let base = 0;
  for (const s of SECTORS) base += owned(s.id) * s.inc * sectorMult(s);
  return base * globalMult(withTemp);
}

function clickValue() {
  let m = 1;
  for (const u of UPGRADES) if (u.kind === 'click' && state.upgrades[u.id]) m *= u.mult;
  return (1 + incomePerSec() * 0.05) * m * mods().tap;
}

function earn(x) { state.gdp += x; state.runEarned += x; state.lifeEarned += x; }

function costFor(s, n) {
  const r = COST_GROWTH;
  return s.base * mods().cost * Math.pow(r, owned(s.id)) * (Math.pow(r, n) - 1) / (r - 1);
}

function maxAffordable(s) {
  const r = COST_GROWTH;
  const c0 = s.base * mods().cost * Math.pow(r, owned(s.id));
  return Math.max(0, Math.floor(Math.log(state.gdp * (r - 1) / c0 + 1) / Math.log(r)));
}

function purchaseCount(s) { return buyAmt === 'max' ? Math.max(1, maxAffordable(s)) : buyAmt; }

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
  Sound.play('buy'); buzz(12);
  if (before === 0) toast(`${s.name} is online`, s.id, s);
  const hit = MILESTONES.filter(m => before < m && before + n >= m).pop();
  if (hit) toast(`${s.name} reached ${hit}: income ×2`, s.id, s);
}

function buyUpgrade(id) {
  const u = UPGRADES.find(x => x.id === id);
  if (!u || state.upgrades[id] || !u.unlocked() || state.gdp < u.cost) return;
  state.gdp -= u.cost;
  state.upgrades[id] = true;
  Sound.play('upgrade'); buzz([12, 40, 12]);
  toast(`${u.name} activated`, u.icon, u);
}

/* ---------------- Cybersecurity ---------------- */

function secCost() { return 2000 * Math.pow(10, state.secLevel); }
function secChance() { return Math.max(0.05, Math.min(0.95, 0.25 + state.secLevel * 0.1 + mods().defense)); }
function attackWindow() { return ATTACK_WINDOW + mods().window * 1000; }

function buySecurity() {
  if (state.secLevel >= SEC_MAX || state.gdp < secCost()) return;
  state.gdp -= secCost();
  state.secLevel++;
  Sound.play('upgrade'); buzz([12, 40, 12]);
  toast(`Defense upgraded to level ${state.secLevel}`, 'shield-check', 'green');
}

function scheduleAttack(now) { state.nextAttack = now + (90 + Math.random() * 60) * 1000; }

function repelAttack() {
  if (!state.attack) return;
  const reward = Math.max(80, incomePerSec(false) * 30);
  earn(reward);
  state.attack = null;
  state.attacksRepelled++;
  scheduleAttack(Date.now());
  Sound.play('defend'); buzz(20);
  toast(`Attack stopped. Reward: ${money(reward)}`, 'shield-check', 'green');
}

function resolveAttack(now) {
  state.attack = null;
  if (game) closeGame();
  if (Math.random() < secChance()) {
    state.attacksRepelled++;
    Sound.play('defend');
    toast('Auto-defense blocked the attack', 'shield-check', 'green');
  } else {
    const stolen = state.gdp * 0.1 * mods().breach;
    state.gdp -= stolen;
    state.debuffUntil = now + DEBUFF_DURATION;
    state.attacksLost++;
    Sound.play('breach'); buzz(300);
    toast(`Breach! Hackers stole ${money(stolen)}`, 'alert', 'bad');
  }
  scheduleAttack(now);
}

function updateAttack(now) {
  if (!state.attack && now < state.shieldUntil) { if (now >= state.nextAttack) scheduleAttack(now); return; }
  if (state.attack) {
    if (now >= state.attack.endsAt) resolveAttack(now);
  } else if (now >= state.nextAttack) {
    if (incomePerSec(false) >= 5) { state.attack = { endsAt: now + attackWindow(), len: attackWindow() }; Sound.play('alarm'); buzz([180, 80, 180]); }
    else scheduleAttack(now);
  }
}

/* ---------------- Boost (rewarded ad placeholder) ---------------- */

function activateBoost() {
  const now = Date.now();
  if (now < state.boostReadyAt) return;
  state.boostUntil = now + BOOST_DURATION;
  state.boostReadyAt = now + BOOST_COOLDOWN;
  Sound.play('buy');
  toast('2× income for 2 minutes', 'bolt', 'gold');
}

/* ---------------- Prestige: technology export ---------------- */

function claimableInfluence() { return Math.floor(Math.sqrt(state.runEarned / PRESTIGE_DIVISOR) * mods().influence); }

function doPrestige() {
  const gain = claimableInfluence();
  if (gain < 1) return;
  showModal('Export technology?',
    `You will gain ${gain} Influence.\nGDP, sectors, upgrades and defense will reset.`,
    { icon: 'globe', tone: 'violet', okText: 'Export', onOk: performPrestige });
}

function performPrestige() {
  const gain = claimableInfluence();
  if (gain < 1) return;
  const keep = {
    nation: state.nation, lifeEarned: state.lifeEarned,
    influence: state.influence + gain, prestiges: state.prestiges + 1,
    clicks: state.clicks, attacksRepelled: state.attacksRepelled, attacksLost: state.attacksLost,
    startedAt: state.startedAt, player: state.player, achievements: state.achievements,
    settings: state.settings, daily: state.daily, coach: state.coach,
    research: state.research, policies: state.policies, era: state.era,
    policyChanges: state.policyChanges, gamesWon: state.gamesWon,
    gems: state.gems, vipUntil: state.vipUntil, shieldUntil: state.shieldUntil, owned: state.owned, adGems: state.adGems,
  };
  state = Object.assign(defaultState(), keep);
  sectorSig = ''; upgSig = '';
  saveGame();
  Sound.play('reward');
  showModal('Technology exported', `+${gain} Influence. All income is now +${Math.round(state.influence * INFLUENCE_BONUS * 100)}%.`, { icon: 'globe', tone: 'violet' });
}

/* ---------------- Rank ---------------- */

function techRank() {
  const r = 195 - Math.floor(Math.log10(Math.max(1, state.lifeEarned)) * 10);
  return Math.max(1, Math.min(195, r));
}

function rankTitle(r) {
  if (r === 1) return "World's most advanced digital nation";
  if (r <= 10) return 'Digital superpower';
  if (r <= 40) return 'Global tech leader';
  if (r <= 90) return 'Regional tech hub';
  if (r <= 150) return 'Digitizing state';
  return 'Analog state';
}

function nextGoal() {
  for (const s of SECTORS) {
    if (!owned(s.id)) return { text: `Unlock ${s.name}`, cost: s.base };
  }
  let best = null;
  for (const s of SECTORS) {
    const m = MILESTONES.find(x => owned(s.id) < x);
    if (!m) continue;
    const cost = costFor(s, m - owned(s.id));
    if (!best || cost < best.cost) best = { text: `${m} ${s.name} for ×2 income`, cost };
  }
  return best || { text: 'Every milestone reached', cost: 0 };
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
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/* ---------------- Save / load ---------------- */

function saveGame() {
  state.lastSave = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
}

function loadGame() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { saved = null; }
  const s = saved && typeof saved === 'object' ? Object.assign(defaultState(), saved) : defaultState();
  if (s.nation === 'Rəqəmsal Respublika' || s.nation === 'Digital Republic') s.nation = DEFAULT_NATION; // older defaults
  s.player = Object.assign({ ...DEFAULT_PLAYER }, saved && saved.player);
  if (!s.achievements || typeof s.achievements !== 'object') s.achievements = {};
  s.settings = Object.assign({ ...DEFAULT_SETTINGS }, saved && saved.settings);
  s.daily = Object.assign({ ...DEFAULT_DAILY }, saved && saved.daily);
  s.policies = Object.assign({ ...DEFAULT_POLICIES }, saved && saved.policies);
  if (!s.research || typeof s.research !== 'object') s.research = {};
  s.owned = Object.assign({ golden: false, flags: [], tones: [] }, saved && saved.owned);
  // Saves from before gems existed get gems for the achievements they already earned.
  if (saved && saved.gems === undefined) s.gems = START_GEMS + 10 * Object.keys(s.achievements).length;
  // Players from before the tutorial existed skip it.
  if (!saved || typeof saved.coach !== 'object' || !saved.coach) s.coach = saved ? { t1: 1, t2: 1, t3: 1, t4: 1 } : {};
  return s;
}

function applyOffline() {
  const now = Date.now();
  const elapsed = Math.min(isVip() ? 24 * 3600 : OFFLINE_MAX_SEC, (now - state.lastSave) / 1000);
  state.attack = null;
  state.nextAttack = Math.max(state.nextAttack, now + 60e3);
  if (elapsed < 30) return;
  const target = popTarget();
  state.pop = target - (target - state.pop) * Math.exp(-elapsed * 0.05);
  if (researchUnlocked()) state.rp += rpRate() * elapsed * OFFLINE_EFFICIENCY;
  const gain = incomePerSec(false) * elapsed * (isVip() ? 1 : OFFLINE_EFFICIENCY + mods().offline);
  if (gain <= 0) return;
  earn(gain);
  showModal('Welcome back', `Your nation earned ${money(gain)} while you were away for ${dur(elapsed * 1000)}.`, { icon: 'moon', tone: 'cyan' });
}

/* ---------------- UI helpers ---------------- */

const $ = id => document.getElementById(id);
const icon = (id, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const TONES = { gold: 'tile-gold', cyan: 'tile-cyan', rose: 'tile-rose', violet: 'tile-violet', green: 'tile-green', bad: 'tile-bad' };
function tile(iconId, tone, extra = '') {
  if (tone && typeof tone === 'object') return `<span class="tile ${extra}" style="--c1:${tone.c1};--c2:${tone.c2}">${icon(iconId)}</span>`;
  return `<span class="tile ${TONES[tone] || ''} ${extra}">${icon(iconId)}</span>`;
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function toast(text, iconId = 'bolt', tone = 'gold') {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `${tile(iconId, tone)}<span>${esc(text)}</span>`;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 2600);
  while ($('toasts').children.length > 2) $('toasts').firstChild.remove();
}

// opts: { icon, tone, okText, onOk(value), input: initialValue }. With onOk a Cancel button appears.
let modalOnOk = null;
function showModal(title, text, opts = {}) {
  const mi = $('modalIcon');
  mi.className = `tile tile-lg modal-icon ${TONES[opts.tone || 'gold']}`;
  mi.innerHTML = icon(opts.icon || 'globe');
  $('modalTitle').textContent = title;
  $('modalText').textContent = text;
  const input = $('modalInput');
  input.hidden = opts.input === undefined;
  if (!input.hidden) input.value = opts.input;
  $('modalCancel').hidden = !opts.onOk;
  $('modalOk').textContent = opts.okText || 'Continue';
  modalOnOk = opts.onOk || null;
  $('modal').hidden = false;
  updateCoach();
  if (!input.hidden) input.focus();
}

function closeModal(confirmed) {
  const fn = confirmed ? modalOnOk : null;
  const value = $('modalInput').value;
  modalOnOk = null;
  $('modal').hidden = true;
  if (fn) fn(value);
  if (!overlayOpen()) nextOverlay();
}

/* ---------------- Skyline (canvas) ---------------- */

const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function rng(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SLOTS = 24;
const SLOT_ORDER = (() => {
  const r = rng(42), a = [...Array(SLOTS).keys()];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  // keep the first building near the centre
  const mid = a.indexOf(Math.floor(SLOTS / 2)); [a[0], a[mid]] = [a[mid], a[0]];
  return a;
})();

function drawSkyline() {
  const cv = $('skyline');
  if (!cv || screen !== 'nation') return;
  const W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const t = Date.now();
  const total = totalOwned();
  const tier = SECTORS.filter(s => owned(s.id) > 0).length;
  const has = id => owned(id) > 0;

  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#071222'); sky.addColorStop(0.7, '#123150'); sky.addColorStop(1, '#1D4466');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

  // aurora (quantum)
  if (has('quantum')) {
    const a = ctx.createLinearGradient(0, H * 0.1, W, H * 0.4);
    a.addColorStop(0, 'rgba(94,240,224,0)'); a.addColorStop(0.5, 'rgba(94,240,224,.18)'); a.addColorStop(1, 'rgba(155,140,255,0)');
    ctx.fillStyle = a;
    ctx.beginPath(); ctx.moveTo(0, H * 0.35);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, H * 0.22 + Math.sin(x / 50 + t / 3000) * 12);
    ctx.lineTo(W, H * 0.45); ctx.lineTo(0, H * 0.5); ctx.fill();
  }

  // stars
  const sr = rng(7);
  for (let i = 0; i < 46; i++) {
    const x = sr() * W, y = sr() * H * 0.55, base = 0.25 + sr() * 0.6, ph = sr() * 6.28;
    const a = reduceMotion ? base : base * (0.55 + 0.45 * Math.sin(t / 900 + ph));
    ctx.fillStyle = `rgba(232,238,246,${a.toFixed(2)})`;
    ctx.fillRect(x, y, 1.4, 1.4);
  }

  // moon
  ctx.fillStyle = 'rgba(245,226,170,.9)';
  ctx.beginPath(); ctx.arc(W * 0.86, H * 0.2, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0B1A2E';
  ctx.beginPath(); ctx.arc(W * 0.86 + 5, H * 0.2 - 3, 10, 0, Math.PI * 2); ctx.fill();

  // satellite (space)
  if (has('space')) {
    const sx = (reduceMotion ? 0.3 : ((t / 40000) % 1.2) - 0.1) * W, sy = H * 0.14;
    ctx.fillStyle = '#B5C3D9'; ctx.fillRect(sx - 3, sy - 2, 6, 4);
    ctx.fillStyle = '#4CC9F0'; ctx.fillRect(sx - 12, sy - 1.5, 8, 3); ctx.fillRect(sx + 4, sy - 1.5, 8, 3);
  }

  // far skyline
  const fr = rng(99);
  ctx.fillStyle = '#132A43';
  for (let x = 0; x < W;) {
    const w = 12 + fr() * 22, h = H * (0.14 + fr() * 0.16);
    ctx.fillRect(x, H - h, w - 1, h); x += w;
  }

  // main buildings
  const slotW = W / SLOTS;
  const litP = 0.12 + (welfare() / 100) * 0.6;
  let tallest = null;
  const buildings = [];
  SLOT_ORDER.forEach((slot, k) => {
    const need = Math.floor(k * k * 0.6);
    if (total < need) return;
    const br = rng(1000 + slot);
    const w = slotW * (0.75 + br() * 0.55);
    const x = slot * slotW + (slotW - w) / 2;
    const growth = Math.min(1, (total - need) / 120);
    const h = Math.min(H * 0.8, H * (0.16 + br() * 0.22 + growth * 0.22 + tier * 0.02));
    const shade = 30 + Math.floor(br() * 14);
    buildings.push({ slot, x, w, h, br, shade });
    if (!tallest || h > tallest.h) tallest = { x, w, h };
  });
  buildings.sort((a, b) => a.h - b.h).reverse();
  for (const b of buildings.reverse()) {
    const y = H - b.h;
    ctx.fillStyle = `rgb(${b.shade - 8},${b.shade + 12},${b.shade + 34})`;
    ctx.fillRect(b.x, y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    ctx.fillRect(b.x, y, 2, b.h);
    // windows
    const cols = Math.max(1, Math.floor((b.w - 4) / 5)), rows = Math.floor((b.h - 8) / 7);
    const ox = b.x + (b.w - cols * 5 + 2) / 2;
    const cyanWin = has('ai') && b.slot % 3 === 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wr = rng(b.slot * 7919 + r * 131 + c)();
        if (wr > litP) continue;
        ctx.fillStyle = cyanWin ? 'rgba(127,216,245,.85)' : (wr < litP * 0.3 ? 'rgba(255,214,120,.95)' : 'rgba(245,184,65,.6)');
        ctx.fillRect(ox + c * 5, y + 6 + r * 7, 3, 3);
      }
    }
  }

  // 5G mast with blinking light
  if (has('g5') && tallest) {
    const mx = tallest.x + tallest.w / 2, my = H - tallest.h;
    ctx.strokeStyle = '#8C9CB1'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx, my - 18); ctx.stroke();
    const on = reduceMotion || Math.floor(t / 600) % 2 === 0;
    ctx.fillStyle = on ? '#FF5D6E' : 'rgba(255,93,110,.3)';
    ctx.beginPath(); ctx.arc(mx, my - 19, 2.2, 0, Math.PI * 2); ctx.fill();
  }

  // AI dome
  if (has('ai')) {
    const dx = W * 0.18, dr = 16;
    const glow = ctx.createRadialGradient(dx, H, 2, dx, H, dr * 2.2);
    glow.addColorStop(0, 'rgba(194,155,255,.5)'); glow.addColorStop(1, 'rgba(194,155,255,0)');
    ctx.fillStyle = glow; ctx.fillRect(dx - dr * 2.2, H - dr * 2.2, dr * 4.4, dr * 2.2);
    ctx.fillStyle = '#3B2A78';
    ctx.beginPath(); ctx.arc(dx, H - 4, dr, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = '#C29BFF'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(dx, H - 4, dr, Math.PI, 0); ctx.stroke();
  }

  // ground
  ctx.fillStyle = '#0A1522'; ctx.fillRect(0, H - 5, W, 5);
  ctx.fillStyle = 'rgba(245,184,65,.35)'; ctx.fillRect(0, H - 5, W, 1);
}

/* ---------------- Rendering ---------------- */

let sectorSig = '';
function buildSectors() {
  const visible = [];
  for (let i = 0; i < SECTORS.length; i++) {
    visible.push(i);
    if (!isUnlocked(i)) break; // one locked teaser
  }
  const sig = visible.map(i => `${i}:${isUnlocked(i)}`).join(',');
  if (sig === sectorSig) return;
  sectorSig = sig;
  $('sectors').innerHTML = visible.map(i => {
    const s = SECTORS[i];
    if (!isUnlocked(i)) {
      return `<div class="row locked">${tile('lock', null, 'tile-locked')}
        <div class="row-title"><span class="nm">${s.name}</span></div>
        <button class="buy" disabled>Locked<small>${money(s.base)}</small></button>
        <div class="row-sub">Build one ${SECTORS[i - 1].name} to unlock</div></div>`;
    }
    return `<div class="row" data-id="${s.id}">
      ${tile(s.id, s)}
      <div class="row-title"><span class="nm">${s.name}</span><span class="count" data-f="owned"></span></div>
      <button class="buy" data-buy="${s.id}"><span data-f="label"></span><small data-f="cost"></small></button>
      <div class="row-sub"><span data-f="meta"></span><span class="meter"><i data-f="prog"></i></span></div>
    </div>`;
  }).join('');
}

function renderSectors() {
  buildSectors();
  for (const row of $('sectors').querySelectorAll('.row[data-id]')) {
    const s = SECTORS.find(x => x.id === row.dataset.id);
    const n = owned(s.id);
    const count = purchaseCount(s);
    const cost = costFor(s, count);
    const f = k => row.querySelector(`[data-f="${k}"]`);
    f('owned').textContent = n;
    f('label').textContent = `Build ×${count}`;
    f('cost').textContent = money(cost);
    const next = MILESTONES.find(m => n < m);
    const prev = [...MILESTONES].reverse().find(m => n >= m) || 0;
    f('meta').textContent = `${money(sectorIncome(s))}/s` + (next ? ` · ×2 at ${next}` : ' · maxed');
    f('prog').style.width = next ? `${((n - prev) / (next - prev)) * 100}%` : '100%';
    const btn = row.querySelector('.buy');
    const can = state.gdp >= cost;
    btn.disabled = !can;
    btn.classList.toggle('can', can);
  }
}

function availableUpgrades() { return UPGRADES.filter(u => !state.upgrades[u.id] && u.unlocked()); }

let upgSig = '';
function renderUpgrades(list) {
  const shown = list.slice(0, 12);
  const sig = shown.map(u => `${u.id}:${state.gdp >= u.cost ? 1 : 0}`).join(',');
  if (sig === upgSig) return;
  upgSig = sig;
  $('upgrades').innerHTML = shown.length ? shown.map(u => {
    const can = state.gdp >= u.cost;
    return `<div class="row">
      ${tile(u.icon, u)}
      <div class="row-title"><span class="nm">${u.name}</span></div>
      <button class="buy ${can ? 'can' : ''}" data-upg="${u.id}" ${can ? '' : 'disabled'}>Buy<small>${money(u.cost)}</small></button>
      <div class="row-sub"><span><span class="kind">${u.tag}</span> · ${u.desc}</span></div>
    </div>`;
  }).join('') : `<div class="empty">${icon('up')}<span>No upgrades yet. Grow your sectors to unlock more.</span></div>`;
}

function renderSecurity(now) {
  $('secLevelBig').textContent = state.secLevel;
  $('secChance').textContent = `${Math.round(secChance() * 100)}%`;
  $('secBar').style.width = `${secChance() * 100}%`;
  $('secLevel').textContent = `${state.secLevel} / ${SEC_MAX}`;
  $('nextAttack').textContent = state.attack ? 'Now!' : (incomePerSec(false) < 5 ? 'Not a target yet' : `in ${dur(state.nextAttack - now)}`);
  $('attacksWon').textContent = state.attacksRepelled;
  $('attacksLost').textContent = state.attacksLost;
  const sb = $('buySec');
  if (state.secLevel >= SEC_MAX) { sb.textContent = 'Maximum defense'; sb.disabled = true; }
  else { sb.textContent = `Upgrade defense · ${money(secCost())}`; sb.disabled = state.gdp < secCost(); }
}

function renderGlobal(now) {
  renderEra();
  for (const b of $('govTabs').children) b.classList.toggle('on', b.dataset.gov === govTab);
  for (const k of ['policies', 'research', 'export']) $(`gov-${k}`).hidden = k !== govTab;
  if (govTab === 'policies') renderPolicies(now);
  if (govTab === 'research') renderResearch();
  const claim = claimableInfluence();
  $('runEarned').textContent = money(state.runEarned);
  $('claimable').textContent = `+${claim}`;
  $('inflBonus').textContent = `+${Math.round(state.influence * INFLUENCE_BONUS * 100)}%`;
  $('countries').textContent = Math.min(194, state.influence);
  $('prestige').disabled = claim < 1;
}

function renderStats(now) {
  const rows = [
    ['Lifetime GDP', money(state.lifeEarned)],
    ['Facilities built', totalOwned()],
    ['Income multiplier', `×${fmt(globalMult(true))}`],
    ['Taxes collected (taps)', state.clicks],
    ['Technology exports', state.prestiges],
    ['Research completed', `${researchCount()} / ${RESEARCH.length}`],
    ['Current era', ERAS[currentEra()].name],
    ['Cyber mini-games won', state.gamesWon],
    ['Gems', fmt(state.gems)],
    ['Time played', dur(now - state.startedAt)],
  ];
  $('statsList').innerHTML = rows.map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('');
}

function render() {
  const now = Date.now();
  const ips = incomePerSec();
  $('nationName').textContent = state.nation;
  $('gdp').textContent = money(state.gdp);
  $('ips').textContent = `+${money(ips)}/s`;
  const r = techRank();
  $('rank').textContent = `#${r}`;
  $('title').textContent = rankTitle(r);
  renderIdentity();
  $('gems').textContent = fmt(state.gems);
  $('profileBtn').classList.toggle('vip', isVip());

  // effects + attack (visible on every screen)
  const fx = [];
  if (now < state.boostUntil) fx.push(`<span class="chip good">${icon('bolt', 'ic-xs')}2× income · ${dur(state.boostUntil - now)}</span>`);
  if (now < state.shieldUntil) fx.push(`<span class="chip good">${icon('shield-check', 'ic-xs')}Cyber Shield · ${dur(state.shieldUntil - now)}</span>`);
  if (now < state.debuffUntil) fx.push(`<span class="chip bad">${icon('alert', 'ic-xs')}Breach −50% · ${dur(state.debuffUntil - now)}</span>`);
  $('effects').innerHTML = fx.join('');
  $('attack').hidden = !state.attack;
  if (state.attack) $('attackBar').style.width = `${Math.max(0, (state.attack.endsAt - now) / (state.attack.len || ATTACK_WINDOW)) * 100}%`;

  // tab badges
  const ups = availableUpgrades();
  const affordable = ups.filter(u => state.gdp >= u.cost).length;
  $('upgBadge').hidden = affordable === 0;
  $('upgBadge').textContent = affordable;
  $('secBadge').hidden = !(state.attack || (state.secLevel < SEC_MAX && state.gdp >= secCost()));
  const resReady = researchUnlocked() && RESEARCH.some(n => researchAvailable(n) && state.rp >= n.cost);
  $('resBadge').hidden = !resReady;
  $('govBadge').hidden = !(resReady || claimableInfluence() >= 1) || screen === 'global';
  const daily = dailyStatus();
  const tutorialDone = COACH.filter(c => c.tut).every(c => state.coach[c.id]);
  $('nationBadge').hidden = !daily.ready || screen === 'nation' || !tutorialDone;

  if (screen === 'nation') {
    $('pop').textContent = fmt(state.pop);
    $('welfare').textContent = `${Math.round(welfare())}%`;
    $('influence').textContent = state.influence;
    $('defStat').textContent = `Lv ${state.secLevel}`;
    $('tapValue').textContent = `+${money(clickValue())} per tap`;
    $('buildingCount').textContent = `${totalOwned()} facilities`;
    $('eraChip').textContent = ERAS[currentEra()].name;
    $('dailyCardDot').hidden = !daily.ready;
    $('dailyCardText').textContent = daily.ready ? `Day ${daily.day} reward is ready` : `Next reward in ${dur(msToMidnight())}`;
    const g = nextGoal();
    $('goalText').textContent = g.cost ? `${g.text} · ${money(g.cost)}` : g.text;
    $('goalBar').style.width = `${g.cost ? Math.min(100, (state.gdp / g.cost) * 100) : 100}%`;
    const boostBtn = $('boost');
    if (now < state.boostUntil) {
      boostBtn.disabled = true; boostBtn.textContent = 'Active';
      $('boostSub').textContent = `2× income for ${dur(state.boostUntil - now)}`;
    } else if (now < state.boostReadyAt) {
      boostBtn.disabled = true; boostBtn.textContent = dur(state.boostReadyAt - now);
      $('boostSub').textContent = 'Next boost is recharging';
    } else {
      boostBtn.disabled = false; boostBtn.textContent = isVip() ? 'Claim' : 'Watch';
      $('boostSub').textContent = isVip() ? 'VIP: 2× income for 2 minutes, no ad' : 'Watch a short ad for 2× income (2 min)';
    }
  } else if (screen === 'sectors') {
    renderSectors();
  } else if (screen === 'upgrades') {
    renderUpgrades(ups);
  } else if (screen === 'security') {
    renderSecurity(now);
  } else if (screen === 'global') {
    renderGlobal(now);
  } else if (screen === 'profile') {
    renderProfile(now, r);
  } else if (screen === 'shop') {
    renderShop(now);
  }
  updateCoach();
}

let lastTab = 'nation';
function showScreen(name) {
  screen = name;
  if (name !== 'profile' && name !== 'shop') lastTab = name;
  for (const b of document.querySelectorAll('.tabbar button')) b.classList.toggle('on', b.dataset.screen === name);
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== `screen-${name}`;
  sectorSig = ''; upgSig = ''; achSig = '';
  window.scrollTo(0, 0);
  render();
  drawSkyline();
}

/* ---------------- Profile, flags, achievements ---------------- */

const AVATARS = ['ai', 'quantum', 'space', 'globe', 'shield', 'bolt', 'trophy', 'smart'];
const TONE_COLORS = {
  gold: ['#F7C75B', '#D98E1C'], cyan: ['#4CC9F0', '#1F7FB8'], violet: ['#A99BFF', '#5B47D6'],
  rose: ['#FF8FAB', '#D2456B'], green: ['#5EE29A', '#1E9A5A'],
  neon: ['#FF4D9D', '#7C3AED'], platinum: ['#F1F5F9', '#8796AE'], royal: ['#FFD86B', '#6D28D9'],
};
const TONE_PRICES = { neon: 100, platinum: 150, royal: 200 };
// [top band, middle band, bottom band, emblem]
const FLAGS = [
  ['#0F6E8C', '#F5B841', '#1B2839', '#F5B841'],
  ['#1D3A6E', '#E8EEF6', '#C8283E', '#1D3A6E'],
  ['#2A9BD8', '#E2483D', '#3BA55C', '#E8EEF6'],
  ['#5B47D6', '#4CC9F0', '#1B2839', '#4CC9F0'],
  ['#1E9A5A', '#E8EEF6', '#1E9A5A', '#1E9A5A'],
  ['#1B2839', '#F5B841', '#0C1420', '#F5B841'],
  // premium
  ['#5EF0E0', '#9B8CFF', '#1B1050', '#5EF0E0'],
  ['#F5B841', '#0C1420', '#F5B841', '#F5B841'],
  ['#FF7A59', '#FFC94A', '#C2287A', '#C2287A'],
  ['#FF4D9D', '#0C1420', '#22D3EE', '#22D3EE'],
];
const FLAG_PRICES = { 6: 150, 7: 200, 8: 150, 9: 250 };
const FLAG_NAMES = { 6: 'Aurora', 7: 'Royal Gold', 8: 'Sunset', 9: 'Neon' };

function flagSvg(i) {
  const [a, b, c, e] = FLAGS[i] || FLAGS[0];
  return `<svg viewBox="0 0 30 20" aria-hidden="true">
    <rect width="30" height="6.67" fill="${a}"/><rect y="6.67" width="30" height="6.66" fill="${b}"/><rect y="13.33" width="30" height="6.67" fill="${c}"/>
    <circle cx="15" cy="10" r="4.4" fill="#0C1420" stroke="#E8EEF6" stroke-width="1"/>
    <path d="M12.8 10h4.4M15 7.8v4.4" stroke="${e}" stroke-width="1.2" stroke-linecap="round"/></svg>`;
}

function avatarTile(iconId, tone) {
  const [c1, c2] = TONE_COLORS[tone] || TONE_COLORS.gold;
  return tile(iconId, { c1, c2 });
}

const ACHIEVEMENTS = [
  { id: 'first',   icon: 'isp',          name: 'First Steps',          desc: 'Build your first facility',      prog: () => [totalOwned(), 1] },
  { id: 'isp25',   icon: 'isp',          name: 'Connected Nation',     desc: 'Own 25 Internet Providers',      prog: () => [owned('isp'), 25] },
  { id: 'million', icon: 'coin',         name: 'Millionaire State',    desc: 'Earn $1M GDP in total',          prog: () => [state.lifeEarned, 1e6] },
  { id: 'smart',   icon: 'smart',        name: 'Smart Citizens',       desc: 'Build a Smart City',             prog: () => [owned('smart'), 1] },
  { id: 'cyber10', icon: 'shield-check', name: 'Cyber Guardian',       desc: 'Stop 10 cyber attacks',          prog: () => [state.attacksRepelled, 10] },
  { id: 'billion', icon: 'coins',        name: 'Billion-Dollar Nation', desc: 'Earn $1B GDP in total',         prog: () => [state.lifeEarned, 1e9] },
  { id: 'ai',      icon: 'ai',           name: 'AI Pioneer',           desc: 'Open an AI Lab',                 prog: () => [owned('ai'), 1] },
  { id: 'export',  icon: 'globe',        name: 'Tech Exporter',        desc: 'Export technology once',         prog: () => [state.prestiges, 1] },
  { id: 'top50',   icon: 'trophy',       name: 'Top 50',               desc: 'Reach #50 in the tech ranking',  prog: () => [196 - techRank(), 146] },
  { id: 'orbit',   icon: 'space',        name: 'Orbit Reached',        desc: 'Launch Satellite Internet',      prog: () => [owned('space'), 1] },
  { id: 'loyal',   icon: 'gift',         name: 'Loyal Leader',         desc: 'Claim 7 daily rewards in a row', prog: () => [state.daily.best, 7] },
  { id: 'policy',  icon: 'egov',         name: 'Policy Maker',         desc: 'Change a national policy',       prog: () => [state.policyChanges, 1] },
  { id: 'think',   icon: 'flask',        name: 'Think Tank',           desc: 'Complete 6 research projects',   prog: () => [researchCount(), 6] },
  { id: 'hacker',  icon: 'bug',          name: 'Firewall Hero',        desc: 'Win the cyber mini-game 5 times', prog: () => [state.gamesWon, 5] },
  { id: 'quantumEra', icon: 'quantum',   name: 'Quantum Leap',         desc: 'Reach the Quantum Era',          prog: () => [currentEra(), 3] },
];

function checkAchievements(silent) {
  for (const a of ACHIEVEMENTS) {
    if (state.achievements[a.id]) continue;
    const [cur, target] = a.prog();
    if (cur >= target) {
      state.achievements[a.id] = Date.now();
      state.gems += ACH_GEMS;
      if (!silent) { toast(`Achievement: ${a.name} · +${ACH_GEMS} gems`, 'star', 'gold'); Sound.play('reward'); buzz([20, 40, 20]); }
    }
  }
}

function buildPickers() {
  const tone = state.player.tone;
  $('avatarIcons').innerHTML = AVATARS.map(id =>
    `<button data-avatar="${id}" aria-label="Avatar ${id}">${avatarTile(id, tone)}</button>`).join('');
  $('avatarTones').innerHTML = Object.entries(TONE_COLORS).map(([k, [c1, c2]]) =>
    `<button data-tone="${k}" aria-label="${k} color" style="--c1:${c1};--c2:${c2}">${toneOwned(k) ? '' : lockBadge(TONE_PRICES[k])}</button>`).join('');
  $('flagPicker').innerHTML = FLAGS.map((_, i) => `<button data-flag="${i}" aria-label="Flag ${i + 1}">${flagSvg(i)}${flagOwned(i) ? '' : lockBadge(FLAG_PRICES[i])}</button>`).join('');
  shopSig = '';
}

let identitySig = '';
function renderIdentity() {
  const p = state.player;
  const sig = `${p.avatar}|${p.tone}|${p.flag}|${p.name}|${state.nation}`;
  if (sig === identitySig) return;
  identitySig = sig;
  $('headerFlag').innerHTML = flagSvg(p.flag);
  $('headerAvatar').innerHTML = avatarTile(p.avatar, p.tone);
  $('profileAvatar').innerHTML = avatarTile(p.avatar, p.tone);
  $('profileName').textContent = p.name;
  $('profileNation').textContent = `Leader of ${state.nation}`;
  $('kvPlayer').textContent = p.name;
  $('kvNation').textContent = state.nation;
  for (const b of $('avatarIcons').children) b.classList.toggle('on', b.dataset.avatar === p.avatar);
  for (const b of $('avatarTones').children) b.classList.toggle('on', b.dataset.tone === p.tone);
  for (const b of $('flagPicker').children) b.classList.toggle('on', Number(b.dataset.flag) === p.flag);
}

let achSig = '';
function renderProfile(now, rank) {
  const done = ACHIEVEMENTS.filter(a => state.achievements[a.id]).length;
  $('profileRank').textContent = `#${rank}`;
  $('profileAch').textContent = `${done} / ${ACHIEVEMENTS.length}`;
  $('vipChip').hidden = !isVip();
  const rows = ACHIEVEMENTS.map(a => {
    const got = !!state.achievements[a.id];
    const [cur, target] = a.prog();
    const pct = got ? 100 : Math.floor(Math.min(1, Math.max(0, cur) / target) * 100);
    return { a, got, pct };
  });
  const sig = rows.map(r => `${r.a.id}:${r.got ? 'y' : r.pct}`).join(',');
  if (sig !== achSig) {
    achSig = sig;
    $('achList').innerHTML = rows.map(({ a, got, pct }) => `<div class="row ach ${got ? '' : 'todo'}">
      ${tile(a.icon, 'gold')}
      <div class="row-title"><span class="nm">${a.name}</span></div>
      ${got ? `<span class="ach-state">${icon('check')}</span>` : `<span class="ach-state todo">${pct}%</span>`}
      <div class="row-sub"><span>${a.desc}</span>${got ? '' : `<span class="meter"><i style="width:${pct}%"></i></span>`}</div>
    </div>`).join('');
  }
  renderStats(now);
  for (const [id, key] of [['setSound', 'sound'], ['setVibe', 'vibration']]) $(id).setAttribute('aria-checked', String(!!state.settings[key]));
}

/* ---------------- PWA: install + offline ---------------- */

let deferredInstall = null;
const isPwaBuild = () => !!document.querySelector('link[rel="manifest"]');
const isStandalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

function renderInstall() {
  const btn = $('installBtn'), txt = $('installText');
  btn.hidden = true;
  if (isStandalone()) txt.textContent = 'Installed. Digital Nation runs full screen and works offline.';
  else if (!isPwaBuild()) txt.textContent = 'You can install the game from its hosted web address.';
  else if (deferredInstall) { txt.textContent = 'Add it to your home screen. It opens full screen and works offline.'; btn.hidden = false; }
  else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) txt.textContent = 'In Safari, tap Share, then "Add to Home Screen".';
  else txt.textContent = 'Open your browser menu and choose "Install app" or "Add to Home screen".';
}

function registerServiceWorker() {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; renderInstall(); });
  window.addEventListener('appinstalled', () => { deferredInstall = null; toast('Digital Nation installed', 'check', 'green'); renderInstall(); });
  if (!isPwaBuild() || !('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* unsupported host */ }); });
}

/* ---------------- Gems, shop, VIP, ads ---------------- */

const ACH_GEMS = 10;
const AD_GEMS_PER_DAY = 5;
const GEM_PACKS = [
  { id: 'p1', gems: 100,  price: '$0.99' },
  { id: 'p2', gems: 550,  price: '$4.99',  tag: '+10% bonus' },
  { id: 'p3', gems: 1200, price: '$9.99',  tag: 'Popular' },
  { id: 'p4', gems: 2500, price: '$19.99', tag: 'Best value' },
];
const WARPS = [{ h: 1, cost: 40 }, { h: 4, cost: 120 }, { h: 24, cost: 500 }];
const SHOP_BOOSTS = [
  { id: 'golden', icon: 'coins', tone: 'gold', name: 'Golden Economy', desc: 'Permanent ×2 income. Kept forever, even after exports.', cost: 1500 },
  { id: 'shield', icon: 'shield-check', tone: 'green', name: 'Cyber Shield', desc: 'No cyber attacks for 24 hours.', cost: 150 },
  { id: 'grant', icon: 'flask', tone: 'cyan', name: 'Research Grant', desc: 'Get 1 hour of research points (at least 200 RP).', cost: 100 },
];

const isVip = () => Date.now() < state.vipUntil;
const gemCost = n => `<span class="gem-cost">${icon('gem')}${fmt(n)}</span>`;
const lockBadge = price => `<span class="lockbadge">${icon('gem')}${price}</span>`;
const flagOwned = i => !FLAG_PRICES[i] || state.owned.flags.includes(i);
const toneOwned = k => !TONE_PRICES[k] || state.owned.tones.includes(k);
const adGemsUsed = () => (state.adGems.day === dayKey() ? state.adGems.n : 0);
const adGemsLeft = () => AD_GEMS_PER_DAY - adGemsUsed();

function addGems(n, reason) {
  state.gems += n;
  Sound.play('reward'); buzz([15, 30, 15]);
  toast(`+${n} gems${reason ? ` · ${reason}` : ''}`, 'gem', 'violet');
  saveGame();
  render();
}

function spendGems(n, label, onDone) {
  if (state.gems < n) {
    showModal('Not enough gems', `You need ${fmt(n)} gems for ${label}. You have ${fmt(state.gems)}.`, {
      icon: 'gem', tone: 'violet', okText: 'Get gems', onOk: () => { showScreen('shop'); },
    });
    return;
  }
  showModal(`Buy ${label}?`, `This costs ${fmt(n)} gems. You have ${fmt(state.gems)}.`, {
    icon: 'gem', tone: 'violet', okText: `Spend ${fmt(n)} gems`,
    onOk: () => { state.gems -= n; onDone(); Sound.play('upgrade'); saveGame(); shopSig = ''; render(); },
  });
}

// Real-money purchases are simulated in the web prototype.
function simulatedPurchase(title, price, onDone) {
  showModal(title, `Price: ${price}\nPrototype: no money is charged. The store version will use Google Play and App Store billing.`, {
    icon: 'gem', tone: 'violet', okText: 'Buy (simulated)', onOk: onDone,
  });
}

function buyPack(id) {
  const p = GEM_PACKS.find(x => x.id === id);
  if (p) simulatedPurchase(`Buy ${fmt(p.gems)} gems?`, p.price, () => addGems(p.gems, 'Purchase'));
}

function buyVip() {
  simulatedPurchase(isVip() ? 'Extend VIP by 30 days?' : 'Start VIP membership?', '$4.99 / month', () => {
    state.vipUntil = Math.max(Date.now(), state.vipUntil) + 30 * 86400e3;
    Sound.play('reward'); buzz([20, 40, 20]);
    toast('VIP active for 30 days', 'crown', 'gold');
    saveGame(); identitySig = ''; render();
  });
}

function buyWarp(h) {
  const w = WARPS.find(x => x.h === h);
  if (!w) return;
  const amount = incomePerSec(false) * h * 3600;
  spendGems(w.cost, `a ${h}-hour time warp (${money(amount)})`, () => {
    earn(amount);
    toast(`Time warp: +${money(amount)}`, 'clock', 'cyan');
  });
}

function buyShopBoost(id) {
  const b = SHOP_BOOSTS.find(x => x.id === id);
  if (!b || (id === 'golden' && state.owned.golden)) return;
  spendGems(b.cost, b.name, () => {
    if (id === 'golden') state.owned.golden = true;
    if (id === 'shield') { state.shieldUntil = Math.max(Date.now(), state.shieldUntil) + 24 * 3600e3; state.attack = null; }
    if (id === 'grant') state.rp += Math.max(200, rpRate() * 3600);
    toast(`${b.name} activated`, b.icon, b.tone);
  });
}

function pickFlag(i) {
  if (flagOwned(i)) { state.player.flag = i; saveGame(); shopSig = ''; render(); return; }
  spendGems(FLAG_PRICES[i], `the ${FLAG_NAMES[i]} flag`, () => {
    state.owned.flags.push(i);
    state.player.flag = i;
    buildPickers();
  });
}

function pickTone(k) {
  if (toneOwned(k)) { state.player.tone = k; saveGame(); buildPickers(); render(); return; }
  spendGems(TONE_PRICES[k], `the ${k} avatar color`, () => {
    state.owned.tones.push(k);
    state.player.tone = k;
    buildPickers();
  });
}

// Rewarded-ad placeholder: VIP players skip it.
let adTimer = null;
function watchAd(onReward) {
  if (isVip()) { onReward(); return; }
  if (overlayOpen()) return;
  const start = Date.now(), len = 3000;
  $('adOverlay').hidden = false;
  updateCoach();
  adTimer = setInterval(() => {
    const left = len - (Date.now() - start);
    $('adBar').style.width = `${Math.min(100, (1 - left / len) * 100)}%`;
    $('adText').textContent = left > 0 ? `Your reward arrives in ${Math.ceil(left / 1000)} seconds` : 'Done!';
    if (left <= 0) {
      clearInterval(adTimer);
      $('adOverlay').hidden = true;
      onReward();
      if (!overlayOpen()) nextOverlay();
    }
  }, 100);
}

let shopSig = '';
function renderShop(now) {
  $('shopGems').textContent = fmt(state.gems);
  $('vipStatus').textContent = isVip() ? `Active · ${Math.ceil((state.vipUntil - now) / 86400e3)} days left` : 'Monthly membership';
  $('vipBtn').textContent = isVip() ? 'Extend VIP · $4.99' : 'Start VIP · $4.99 / month';
  const left = adGemsLeft();
  $('adGemsText').textContent = left > 0 ? `${isVip() ? 'VIP: no ad needed' : 'Watch a short ad'} · +5 gems (${left} of ${AD_GEMS_PER_DAY} left today)` : 'Come back tomorrow for more free gems';
  $('adGemsBtn').disabled = left <= 0;
  $('adGemsBtn').textContent = isVip() ? 'Claim' : 'Watch';

  const ips = incomePerSec(false);
  const sig = [state.gems, fmt(ips), state.owned.golden, state.owned.flags.join(), state.owned.tones.join(), state.player.flag, state.player.tone, Math.floor(state.shieldUntil / 60e3), fmt(rpRate())].join('|');
  if (sig === shopSig) return;
  shopSig = sig;
  if (!$('gemPacks').children.length) {
    $('gemPacks').innerHTML = GEM_PACKS.map(p => `<button class="pack" data-pack="${p.id}">
      ${p.tag ? `<span class="tag">${p.tag}</span>` : ''}${icon('gem')}<b>${fmt(p.gems)}</b><span class="price">${p.price}</span></button>`).join('');
  }
  $('warps').innerHTML = WARPS.map(w => {
    const can = state.gems >= w.cost;
    return `<div class="row">${tile('clock', 'cyan')}
      <div class="row-title"><span class="nm">${w.h} hour${w.h > 1 ? 's' : ''} of income</span></div>
      <button class="buy gem ${can ? 'can' : ''}" data-warp="${w.h}">Warp<small>${gemCost(w.cost)}</small></button>
      <div class="row-sub"><span>+${money(ips * w.h * 3600)} instantly</span></div></div>`;
  }).join('');
  $('shopBoosts').innerHTML = SHOP_BOOSTS.map(b => {
    const owned = b.id === 'golden' && state.owned.golden;
    const active = b.id === 'shield' && now < state.shieldUntil;
    const can = state.gems >= b.cost;
    const btn = owned ? `<button class="buy" disabled>${icon('check', 'ic-sm')}<small>Owned</small></button>`
      : `<button class="buy gem ${can ? 'can' : ''}" data-sboost="${b.id}">${active ? 'Extend' : 'Buy'}<small>${gemCost(b.cost)}</small></button>`;
    return `<div class="row">${tile(b.icon, b.tone)}<div class="row-title"><span class="nm">${b.name}</span></div>${btn}
      <div class="row-sub"><span>${b.desc}${active ? ` Active for ${dur(state.shieldUntil - now)}.` : ''}</span></div></div>`;
  }).join('');
  $('shopFlags').innerHTML = Object.keys(FLAG_PRICES).map(Number).map(i =>
    `<button data-flag="${i}" class="${state.player.flag === i ? 'on' : ''}" aria-label="${FLAG_NAMES[i]} flag">${flagSvg(i)}${flagOwned(i) ? '' : lockBadge(FLAG_PRICES[i])}</button>`).join('');
  $('shopTones').innerHTML = Object.keys(TONE_PRICES).map(k => {
    const [c1, c2] = TONE_COLORS[k];
    return `<button data-tone="${k}" class="${state.player.tone === k ? 'on' : ''}"><span class="swatch" style="--c1:${c1};--c2:${c2}"></span>${toneOwned(k) ? k : gemCost(TONE_PRICES[k])}</button>`;
  }).join('');
}

/* ---------------- Policies, research, eras ---------------- */

const POLICY_COOLDOWN = 60e3;
const POLICIES = [
  { id: 'tax', name: 'Tax Rate', icon: 'coin', options: [
    { label: 'Low', mods: { income: 0.85, welfare: 15 } },
    { label: 'Balanced', mods: {} },
    { label: 'High', mods: { income: 1.3, welfare: -20, popGrowth: 0.6 } } ] },
  { id: 'net', name: 'Internet Policy', icon: 'isp', options: [
    { label: 'Open', mods: { income: 1.15, defense: -0.15 } },
    { label: 'Balanced', mods: {} },
    { label: 'Firewall', mods: { defense: 0.2, income: 0.9 } } ] },
  { id: 'edu', name: 'Education', icon: 'book', options: [
    { label: 'Tech', mods: { research: 1.5, welfare: -5 } },
    { label: 'Balanced', mods: {} },
    { label: 'Social', mods: { welfare: 10, research: 0.8 } } ] },
  { id: 'trade', name: 'Trade', icon: 'globe', options: [
    { label: 'Export', mods: { influence: 1.25, offline: 0.2, breach: 1.5 } },
    { label: 'Balanced', mods: {} },
    { label: 'Self-reliant', mods: { breach: 0.5, income: 0.95 } } ] },
];

const RESEARCH = [
  { id: 'e1', branch: 'eco', name: 'Digital Taxes',         cost: 20,   mods: { tap: 2 },                  desc: 'Tap power ×2' },
  { id: 'e2', branch: 'eco', name: 'E-Commerce',            cost: 120,  mods: { income: 1.25 },            desc: 'All income ×1.25' },
  { id: 'e3', branch: 'eco', name: 'Digital Currency',      cost: 700,  mods: { income: 1.5 },             desc: 'All income ×1.5' },
  { id: 'e4', branch: 'eco', name: 'Smart Contracts',       cost: 4000, mods: { cost: 0.9 },               desc: 'Sectors cost 10% less' },
  { id: 's1', branch: 'soc', name: 'E-Health',              cost: 30,   mods: { welfare: 5 },              desc: 'Welfare +5' },
  { id: 's2', branch: 'soc', name: 'Online Learning',       cost: 150,  mods: { research: 1.25 },          desc: 'Research points ×1.25' },
  { id: 's3', branch: 'soc', name: 'Digital Identity',      cost: 800,  mods: { popGrowth: 1.5, welfare: 5 }, desc: 'Population grows 50% faster · Welfare +5' },
  { id: 's4', branch: 'soc', name: 'Universal Connectivity', cost: 4500, mods: { welfare: 10, income: 1.1 }, desc: 'Welfare +10 · All income ×1.1' },
  { id: 'c1', branch: 'sec', name: 'Firewalls',             cost: 25,   mods: { defense: 0.1 },            desc: 'Auto-defense +10%' },
  { id: 'c2', branch: 'sec', name: 'Threat Intelligence',   cost: 130,  mods: { window: 5 },               desc: '+5 seconds to respond to attacks' },
  { id: 'c3', branch: 'sec', name: 'AI Defense Grid',       cost: 750,  mods: { defense: 0.15 },           desc: 'Auto-defense +15%' },
  { id: 'c4', branch: 'sec', name: 'Quantum Encryption',    cost: 4200, mods: { breach: 0.5 },             desc: 'Breaches steal half as much' },
];
const BRANCHES = [
  { id: 'eco', name: 'Economy', icon: 'coins', tone: 'gold' },
  { id: 'soc', name: 'Society', icon: 'users', tone: 'rose' },
  { id: 'sec', name: 'Security', icon: 'shield', tone: 'green' },
];
const ERAS = [
  { name: 'Connected Era',   need: 0,  mult: 1 },
  { name: 'Information Era', need: 4,  mult: 1.5 },
  { name: 'AI Era',          need: 8,  mult: 2.25, sector: 'ai' },
  { name: 'Quantum Era',     need: 12, mult: 3.5,  sector: 'quantum' },
];
const ROMAN = ['I', 'II', 'III', 'IV'];

const MULT_KEYS = ['income', 'tap', 'research', 'popGrowth', 'cost', 'breach', 'influence'];
function mods() {
  const m = { income: 1, tap: 1, research: 1, popGrowth: 1, cost: 1, breach: 1, influence: 1, welfare: 0, defense: 0, window: 0, offline: 0 };
  const apply = src => { for (const [k, v] of Object.entries(src)) { if (MULT_KEYS.includes(k)) m[k] *= v; else m[k] += v; } };
  for (const p of POLICIES) apply(p.options[state.policies[p.id] ?? 1].mods);
  for (const n of RESEARCH) if (state.research[n.id]) apply(n.mods);
  return m;
}

function policiesUnlocked() { return owned('egov') >= 5 || state.policyChanges > 0; }
function researchUnlocked() { return owned('mbank') > 0 || researchCount() > 0; }
function researchCount() { return RESEARCH.filter(n => state.research[n.id]).length; }
function researchAvailable(n) {
  if (state.research[n.id]) return false;
  const prev = RESEARCH.filter(x => x.branch === n.branch);
  const i = prev.indexOf(n);
  return i === 0 || !!state.research[prev[i - 1].id];
}
function rpRate() {
  const base = 0.02 * totalOwned() + 0.2 * owned('dc') + 1 * owned('ai') + 5 * owned('quantum') + 0.05 * owned('egov');
  return base * mods().research;
}

function currentEra() {
  const n = researchCount();
  let e = 0;
  ERAS.forEach((era, i) => { if (n >= era.need && (!era.sector || owned(era.sector) > 0)) e = i; });
  return e;
}
function checkEra() {
  const e = currentEra();
  if (e > state.era) {
    state.era = e;
    state.gems += 25;
    Sound.play('reward'); buzz([30, 60, 30]);
    queueOverlay(() => showModal(`Welcome to the ${ERAS[e].name}`, `Your nation entered Era ${ROMAN[e]}. All income is now ×${ERAS[e].mult}, and you received 25 gems.`, { icon: 'flask', tone: 'cyan' }));
  }
}

function fmtMods(m) {
  const parts = [];
  const pct = v => `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}%`;
  const add = (good, text) => parts.push(`<span class="${good ? 'up' : 'down'}">${text}</span>`);
  if (m.income) add(m.income > 1, `Income ×${m.income}`);
  if (m.welfare) add(m.welfare > 0, `Welfare ${m.welfare > 0 ? '+' : '−'}${Math.abs(m.welfare)}`);
  if (m.popGrowth) add(m.popGrowth > 1, m.popGrowth > 1 ? 'Faster population growth' : 'Slower population growth');
  if (m.defense) add(m.defense > 0, `Auto-defense ${pct(m.defense)}`);
  if (m.research) add(m.research > 1, `Research ×${m.research}`);
  if (m.influence) add(m.influence > 1, `Export influence ×${m.influence}`);
  if (m.offline) add(m.offline > 0, `Offline earnings ${pct(m.offline)}`);
  if (m.breach) add(m.breach < 1, `Breach damage ×${m.breach}`);
  return parts.length ? parts.join(' · ') : '<span class="muted">No bonuses or penalties</span>';
}

function setPolicy(id, opt) {
  const now = Date.now();
  if (!policiesUnlocked() || state.policies[id] === opt) return;
  if (now - (state.policyChangedAt[id] || 0) < POLICY_COOLDOWN) return;
  state.policies[id] = opt;
  state.policyChangedAt[id] = now;
  state.policyChanges++;
  const p = POLICIES.find(x => x.id === id);
  Sound.play('buy'); buzz(15);
  toast(`${p.name}: ${p.options[opt].label}`, 'egov', 'cyan');
  saveGame();
  render();
}

function buyResearch(id) {
  const n = RESEARCH.find(x => x.id === id);
  if (!n || !researchUnlocked() || !researchAvailable(n) || state.rp < n.cost) return;
  state.rp -= n.cost;
  state.research[id] = Date.now();
  Sound.play('upgrade'); buzz([12, 40, 12]);
  toast(`Research complete: ${n.name}`, 'flask', 'cyan');
  researchSig = '';
  saveGame();
  render();
}

let govTab = 'policies';
let policiesBuilt = false;
function renderPolicies(now) {
  const unlocked = policiesUnlocked();
  $('policyLock').hidden = unlocked;
  if (!unlocked) $('policyLockText').textContent = `Build 5 E-Government portals to start making national policy (${owned('egov')} / 5).`;
  if (!policiesBuilt) {
    policiesBuilt = true;
    $('policies').innerHTML = POLICIES.map(p => `<div class="card policy" data-pid="${p.id}">
      <div class="policy-head">${tile(p.icon, 'cyan')}<span><span class="card-title">${p.name}</span><span class="policy-cd" data-f="cd"></span></span></div>
      <div class="policy-opts">${p.options.map((o, i) => `<button data-policy="${p.id}" data-opt="${i}">${o.label}</button>`).join('')}</div>
      <div class="policy-effect" data-f="fx"></div></div>`).join('');
  }
  for (const card of $('policies').children) {
    const p = POLICIES.find(x => x.id === card.dataset.pid);
    const sel = state.policies[p.id] ?? 1;
    const wait = POLICY_COOLDOWN - (now - (state.policyChangedAt[p.id] || 0));
    card.querySelectorAll('button').forEach((b, i) => {
      b.classList.toggle('on', i === sel);
      b.disabled = !unlocked || (wait > 0 && i !== sel);
    });
    card.querySelector('[data-f="fx"]').innerHTML = fmtMods(p.options[sel].mods);
    card.querySelector('[data-f="cd"]').textContent = !unlocked ? 'Locked' : (wait > 0 ? `Can change again in ${dur(wait)}` : 'You can change this now');
  }
}

let researchSig = '';
function renderResearch() {
  const unlocked = researchUnlocked();
  $('researchLock').hidden = unlocked;
  $('researchBody').hidden = !unlocked;
  if (!unlocked) return;
  $('rpValue').textContent = `${fmt(state.rp)} RP`;
  $('rpRate').textContent = `+${fmt(rpRate())}/s`;
  const sig = RESEARCH.map(n => `${n.id}${state.research[n.id] ? 'd' : researchAvailable(n) ? (state.rp >= n.cost ? 'a' : 'w') : 'l'}`).join('');
  if (sig === researchSig) return;
  researchSig = sig;
  $('research').innerHTML = BRANCHES.map(b => `<div class="branch">
    <div class="branch-head">${icon(b.icon, 'ic-sm')}${b.name}</div>
    ${RESEARCH.filter(n => n.branch === b.id).map(n => {
      const done = !!state.research[n.id], avail = researchAvailable(n), can = avail && state.rp >= n.cost;
      const cls = done ? 'done' : (avail ? '' : 'locked');
      const btn = done ? `<button class="buy" disabled>${icon('check', 'ic-sm')}<small>Done</small></button>`
        : `<button class="buy rp ${can ? 'can' : ''}" data-res="${n.id}" ${can ? '' : 'disabled'}>${avail ? 'Research' : 'Locked'}<small>${fmt(n.cost)} RP</small></button>`;
      return `<div class="row node ${cls}">${tile(done ? 'check' : 'flask', done ? 'green' : b.tone)}
        <div class="row-title"><span class="nm">${n.name}</span></div>${btn}
        <div class="row-sub"><span>${n.desc}</span></div></div>`;
    }).join('')}</div>`).join('');
}

function renderEra() {
  const e = currentEra(), era = ERAS[e], next = ERAS[e + 1];
  $('eraNum').textContent = `Era ${ROMAN[e]}`;
  $('eraName').textContent = era.name;
  $('eraMult').textContent = `×${era.mult}`;
  if (!next) {
    $('eraNext').textContent = 'The final era. Your nation leads the world in technology.';
    $('eraBar').style.width = '100%';
    return;
  }
  const n = researchCount();
  const needSector = next.sector && owned(next.sector) === 0 ? ` and build a ${SECTORS.find(s => s.id === next.sector).name}` : '';
  $('eraNext').textContent = `Complete ${next.need} research projects${needSector} to reach the ${next.name} (×${next.mult})`;
  $('eraBar').style.width = `${Math.min(100, (n / next.need) * 100)}%`;
}

/* ---------------- Cyber mini-game ---------------- */

const GAME_HITS = 5;
let game = null;
function startGame() {
  if (!state.attack || game) return;
  game = { hits: 0, cell: -1, moveAt: 0 };
  $('gameGrid').innerHTML = Array.from({ length: 9 }, (_, i) => `<button class="cell" data-cell="${i}" aria-label="Server ${i + 1}">${icon('bug')}</button>`).join('');
  $('gameHits').textContent = `0 / ${GAME_HITS}`;
  $('cyberGame').hidden = false;
  moveBug();
  updateCoach();
}
function moveBug() {
  if (!game) return;
  let c;
  do c = Math.floor(Math.random() * 9); while (c === game.cell);
  game.cell = c;
  game.moveAt = Date.now() + Math.max(650, 1100 - game.hits * 90);
  $('gameGrid').querySelectorAll('.cell').forEach((el, i) => el.classList.toggle('bug', i === c));
}
function hitCell(i, el) {
  if (!game) return;
  if (i !== game.cell) {
    el.classList.remove('miss'); void el.offsetWidth; el.classList.add('miss');
    return;
  }
  game.hits++;
  $('gameHits').textContent = `${game.hits} / ${GAME_HITS}`;
  Sound.play('tap'); buzz(10);
  if (game.hits >= GAME_HITS) {
    closeGame();
    state.gamesWon++;
    state.gems += 2;
    repelAttack();
    render();
    return;
  }
  moveBug();
}
function closeGame() {
  game = null;
  $('cyberGame').hidden = true;
  if (!overlayOpen()) nextOverlay();
}

/* ---------------- Sound + haptics ---------------- */

const Sound = (() => {
  let ctx = null, lastTap = 0;
  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      try { ctx = new C(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  function tone(freq, dur, { type = 'sine', vol = 0.08, delay = 0, slide = 0 } = {}) {
    const a = ac();
    if (!a) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.03);
  }
  const SFX = {
    tap: () => {
      const now = performance.now();
      if (now - lastTap < 45) return;
      lastTap = now;
      tone(820 + Math.random() * 120, 0.07, { type: 'triangle', vol: 0.05, slide: 1.35 });
    },
    buy: () => { tone(523, 0.08, { type: 'triangle' }); tone(784, 0.13, { type: 'triangle', delay: 0.07 }); },
    upgrade: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.13, { type: 'triangle', vol: 0.07, delay: i * 0.06 })),
    reward: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.2, { vol: 0.07, delay: i * 0.08 })),
    alarm: () => [0, 0.26, 0.52].forEach(d => { tone(740, 0.12, { type: 'square', vol: 0.03, delay: d }); tone(554, 0.12, { type: 'square', vol: 0.03, delay: d + 0.13 }); }),
    defend: () => { tone(392, 0.1, { type: 'triangle' }); tone(784, 0.22, { type: 'triangle', delay: 0.08 }); },
    breach: () => tone(220, 0.45, { type: 'sawtooth', vol: 0.05, slide: 0.5 }),
  };
  return {
    play(name) { if (!state.settings.sound || !SFX[name]) return; try { SFX[name](); } catch (e) { /* audio unavailable */ } },
    unlock() { if (state.settings.sound) ac(); },
  };
})();

function buzz(pattern) {
  if (!state.settings.vibration || !navigator.vibrate) return;
  try { navigator.vibrate(pattern); } catch (e) { /* not supported */ }
}

/* ---------------- Overlays (modal + daily) queue ---------------- */

const overlayQueue = [];
function overlayOpen() { return !$('modal').hidden || !$('daily').hidden || !$('cyberGame').hidden || !$('adOverlay').hidden; }
function queueOverlay(fn) { if (overlayOpen()) overlayQueue.push(fn); else fn(); }
function nextOverlay() { const fn = overlayQueue.shift(); if (fn) fn(); updateCoach(); }

/* ---------------- Daily reward ---------------- */

// minutes of current income, with a floor for brand-new nations
const DAILY = [
  { min: 10, base: 100 }, { min: 15, base: 300 }, { min: 20, base: 800, gems: 5 }, { min: 30, base: 2000 },
  { min: 45, base: 5000, gems: 10 }, { min: 60, base: 12000 }, { min: 120, base: 30000, boost: 30, gems: 20 },
];
function dayKey(d = new Date()) { return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
function yesterdayKey() { const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); }
function msToMidnight() { const d = new Date(); d.setHours(24, 0, 0, 0); return d - Date.now(); }

function dailyStatus() {
  const d = state.daily;
  if (d.last === dayKey()) return { ready: false, day: d.streak };
  const continues = d.last === yesterdayKey() && d.streak < DAILY.length;
  return { ready: true, day: continues ? d.streak + 1 : 1 };
}
function dailyAmount(day) { const r = DAILY[day - 1]; return Math.max(r.base, incomePerSec(false) * r.min * 60); }

function renderDaily() {
  const st = dailyStatus();
  $('dailyGrid').innerHTML = DAILY.map((r, i) => {
    const day = i + 1;
    const done = st.ready ? day < st.day : day <= st.day;
    const today = st.ready && day === st.day;
    const cls = `day ${day === DAILY.length ? 'big' : ''} ${done ? 'done' : ''} ${today ? 'today' : ''}`;
    const extra = r.boost ? ` + 2× ${r.boost}m` : '';
    const gems = (r.gems || 0) + (isVip() ? 10 : 0);
    const gemTxt = gems ? `<span class="gem-mini">${icon('gem')}+${gems}</span>` : '';
    return `<div class="${cls}">Day ${day}${icon(done ? 'check' : (r.boost ? 'gift' : 'coin'))}<b>${money(dailyAmount(day))}${extra}</b>${gemTxt}</div>`;
  }).join('');
  $('dailyClaim').hidden = !st.ready;
  $('dailyClose').textContent = st.ready ? 'Later' : 'Close';
  $('dailySub').textContent = st.ready
    ? (st.day === 1 ? 'Come back every day. Rewards grow with each day in a row.' : `Day ${st.day} in a row. Keep the streak going!`)
    : `Claimed for today. Next reward in ${dur(msToMidnight())}.`;
}

function showDaily() { renderDaily(); $('daily').hidden = false; updateCoach(); }
function closeDaily() { $('daily').hidden = true; if (!overlayOpen()) nextOverlay(); }

function claimDaily() {
  const st = dailyStatus();
  if (!st.ready) return;
  const amount = dailyAmount(st.day);
  earn(amount);
  const r = DAILY[st.day - 1];
  if (r.boost) state.boostUntil = Math.max(Date.now(), state.boostUntil) + r.boost * 60e3;
  const gems = (r.gems || 0) + (isVip() ? 10 : 0);
  state.gems += gems;
  state.daily = { streak: st.day, last: dayKey(), best: Math.max(state.daily.best, st.day) };
  saveGame();
  Sound.play('reward'); buzz([20, 40, 20]);
  toast(`Day ${st.day} reward: ${money(amount)}${gems ? ` · +${gems} gems` : ''}`, 'gift', 'rose');
  closeDaily();
  render();
}

let dailyAutoShown = '';
function maybeAutoDaily() {
  const tutorialDone = COACH.filter(c => c.tut).every(c => state.coach[c.id]);
  if (!tutorialDone || dailyAutoShown === dayKey() || !dailyStatus().ready) return;
  dailyAutoShown = dayKey();
  queueOverlay(showDaily);
}

/* ---------------- Tutorial + one-time tips (coach marks) ---------------- */

const tabBtn = name => document.querySelector(`.tabbar [data-screen="${name}"]`);
const COACH = [
  { id: 't1', tut: true, screen: 'nation', target: () => $('tap'),
    text: 'Welcome, Leader! Tap <b>Collect Taxes</b> to raise your first $15.', until: () => state.gdp >= 15 || owned('isp') > 0 },
  { id: 't2', tut: true, target: () => tabBtn('sectors'),
    text: 'Well done. Now open <b>Sectors</b> to invest in your country.', until: () => screen === 'sectors' || owned('isp') > 0 },
  { id: 't3', tut: true, screen: 'sectors', target: () => document.querySelector('[data-buy="isp"]'),
    text: 'Build your first <b>Internet Provider</b>. It earns GDP every second.', until: () => owned('isp') > 0 },
  { id: 't4', tut: true, target: () => document.querySelector('.ips-pill'), button: "Let's go",
    text: 'Your nation now earns on its own, even while you are away. Keep building to climb the world ranking!' },
  { id: 'tipSec', when: () => !!state.attack, target: () => $('repel'),
    text: 'Hackers are attacking! Tap <b>Defend</b>, then catch the malware before the timer runs out.', until: () => !state.attack },
  { id: 'tipUpg', when: () => availableUpgrades().some(u => state.gdp >= u.cost), target: () => tabBtn('upgrades'),
    text: 'An <b>upgrade</b> is ready. Upgrades multiply your income.', until: () => screen === 'upgrades' },
  { id: 'tipPolicy', when: () => policiesUnlocked(), target: () => tabBtn('global'),
    text: 'You can now set <b>national policy</b>. Every choice has a benefit and a cost.', until: () => screen === 'global' },
  { id: 'tipResearch', when: () => researchUnlocked() && state.rp >= RESEARCH[0].cost, target: () => tabBtn('global'),
    text: 'Your first <b>research</b> project is ready. Research is permanent.', until: () => screen === 'global' && govTab === 'research' },
  { id: 'tipShop', when: () => state.gems >= 50, target: () => $('gemBtn'),
    text: 'You have <b>gems</b>! Spend them in the shop on time warps, boosts and premium flags.', until: () => screen === 'shop' },
  { id: 'tipExport', when: () => claimableInfluence() >= 1, target: () => tabBtn('global'),
    text: 'You can now <b>export technology</b> for permanent Influence.', until: () => screen === 'global' },
];

function currentCoach() {
  const tutDone = COACH.filter(c => c.tut).every(c => state.coach[c.id]);
  for (const c of COACH) {
    if (state.coach[c.id]) continue;
    if (c.tut) return c;              // tutorial steps run in order
    if (tutDone && c.when()) return c; // tips appear once their moment comes
  }
  return null;
}

let coachShown = '';
function updateCoach() {
  let c = currentCoach();
  while (c && c.until && c.until()) { state.coach[c.id] = 1; c = currentCoach(); }
  const bubble = $('coach'), ring = $('coachRing');
  const target = c && (!c.screen || c.screen === screen) && !overlayOpen() ? c.target() : null;
  if (!target || target.getClientRects().length === 0) { bubble.hidden = true; ring.hidden = true; return; }

  if (coachShown !== c.id) {
    coachShown = c.id;
    const skip = c.tut && c.id !== 't4' ? '<button class="coach-skip" data-coach="skip">Skip tutorial</button>' : '';
    const okLabel = c.button || (c.tut ? '' : 'Got it');
    const ok = okLabel ? `<button class="btn btn-gold" data-coach="ok">${okLabel}</button>` : '';
    bubble.innerHTML = `<div>${c.text}</div><div class="coach-actions">${skip}${ok}</div>`;
  }
  const r = target.getBoundingClientRect();
  const pad = 6;
  ring.hidden = false;
  Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });

  bubble.hidden = false;
  const bw = Math.min(320, window.innerWidth - 32);
  bubble.style.width = `${bw}px`;
  const bh = bubble.offsetHeight;
  const below = r.top + r.height / 2 < window.innerHeight / 2;
  const top = below ? r.bottom + pad + 14 : r.top - pad - 14 - bh;
  const left = Math.max(16, Math.min(window.innerWidth - 16 - bw, r.left + r.width / 2 - bw / 2));
  bubble.dataset.side = below ? 'below' : 'above';
  bubble.style.top = `${top}px`;
  bubble.style.left = `${left}px`;
  bubble.style.setProperty('--ax', `${Math.max(18, Math.min(bw - 18, r.left + r.width / 2 - left))}px`);
}

/* ---------------- Loop ---------------- */

let lastTick = Date.now();
let skyTimer = 0;
let achTimer = 0;
function tick() {
  const now = Date.now();
  const dt = Math.min(1, (now - lastTick) / 1000); // long gaps are handled by applyOffline
  lastTick = now;
  earn(incomePerSec() * dt);
  state.pop += (popTarget() - state.pop) * Math.min(1, dt * 0.05 * mods().popGrowth);
  if (researchUnlocked()) state.rp += rpRate() * dt;
  checkEra();
  if (game && now >= game.moveAt) moveBug();
  if (game) $('gameBar').style.width = state.attack ? `${Math.max(0, (state.attack.endsAt - now) / (state.attack.len || ATTACK_WINDOW)) * 100}%` : '0%';
  updateAttack(now);
  if (now - achTimer > 1000) { achTimer = now; checkAchievements(false); maybeAutoDaily(); }
  render();
  if (now - skyTimer > (reduceMotion ? 3000 : 150)) { skyTimer = now; drawSkyline(); }
}

function bindUI() {
  $('tap').addEventListener('click', e => {
    const v = clickValue();
    earn(v);
    state.clicks++;
    Sound.play('tap'); buzz(6);
    const f = document.createElement('span');
    f.className = 'floater';
    f.textContent = '+' + money(v);
    const box = $('tap').getBoundingClientRect();
    const x = e.clientX || box.left + box.width / 2;
    const y = e.clientY || box.top + box.height / 2;
    f.style.left = `${x - 20}px`;
    f.style.top = `${y - 30}px`;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 900);
    render();
  });
  $('boost').addEventListener('click', () => { if (Date.now() >= state.boostReadyAt) watchAd(() => { activateBoost(); render(); }); });
  $('gemBtn').addEventListener('click', () => showScreen('shop'));
  $('shopBack').addEventListener('click', () => showScreen(lastTab));
  $('vipBtn').addEventListener('click', buyVip);
  $('adGemsBtn').addEventListener('click', () => { if (adGemsLeft() > 0) watchAd(() => { state.adGems = { day: dayKey(), n: adGemsUsed() + 1 }; addGems(5, 'Ad reward'); }); });
  $('gemPacks').addEventListener('click', e => { const b = e.target.closest('[data-pack]'); if (b) buyPack(b.dataset.pack); });
  $('warps').addEventListener('click', e => { const b = e.target.closest('[data-warp]'); if (b) buyWarp(Number(b.dataset.warp)); });
  $('shopBoosts').addEventListener('click', e => { const b = e.target.closest('[data-sboost]'); if (b) buyShopBoost(b.dataset.sboost); });
  $('shopFlags').addEventListener('click', e => { const b = e.target.closest('[data-flag]'); if (b) pickFlag(Number(b.dataset.flag)); });
  $('shopTones').addEventListener('click', e => { const b = e.target.closest('[data-tone]'); if (b) pickTone(b.dataset.tone); });
  $('repel').addEventListener('click', () => { startGame(); render(); });
  $('gameGrid').addEventListener('pointerdown', e => {
    const c = e.target.closest('[data-cell]');
    if (c) { e.preventDefault(); hitCell(Number(c.dataset.cell), c); }
  });
  $('govTabs').addEventListener('click', e => {
    const b = e.target.closest('[data-gov]');
    if (b) { govTab = b.dataset.gov; researchSig = ''; render(); }
  });
  $('policies').addEventListener('click', e => {
    const b = e.target.closest('[data-policy]');
    if (b) setPolicy(b.dataset.policy, Number(b.dataset.opt));
  });
  $('research').addEventListener('click', e => {
    const b = e.target.closest('[data-res]');
    if (b) buyResearch(b.dataset.res);
  });
  $('buySec').addEventListener('click', () => { buySecurity(); render(); });
  $('prestige').addEventListener('click', doPrestige);
  $('goal').addEventListener('click', () => showScreen('sectors'));
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
  document.querySelector('.tabbar').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) showScreen(b.dataset.screen);
  });
  $('nationBtn').addEventListener('click', () => showScreen('profile'));
  $('profileBtn').addEventListener('click', () => showScreen('profile'));
  $('profileBack').addEventListener('click', () => showScreen(lastTab));
  $('editNation').addEventListener('click', () => {
    showModal('Name your nation', 'Choose a name for your digital state.', {
      icon: 'pencil', tone: 'cyan', input: state.nation, okText: 'Save',
      onOk: n => { if (n && n.trim()) { state.nation = n.trim().slice(0, 32); saveGame(); render(); } },
    });
  });
  $('editPlayer').addEventListener('click', () => {
    showModal('Your name', 'How should your citizens address you?', {
      icon: 'users', tone: 'gold', input: state.player.name, okText: 'Save',
      onOk: n => { if (n && n.trim()) { state.player.name = n.trim().slice(0, 24); saveGame(); render(); } },
    });
  });
  $('avatarIcons').addEventListener('click', e => {
    const b = e.target.closest('[data-avatar]');
    if (b) { state.player.avatar = b.dataset.avatar; saveGame(); render(); }
  });
  $('avatarTones').addEventListener('click', e => {
    const b = e.target.closest('[data-tone]');
    if (b) pickTone(b.dataset.tone);
  });
  $('flagPicker').addEventListener('click', e => {
    const b = e.target.closest('[data-flag]');
    if (b) pickFlag(Number(b.dataset.flag));
  });
  $('dailyCard').addEventListener('click', () => queueOverlay(showDaily));
  $('dailyClaim').addEventListener('click', claimDaily);
  $('dailyClose').addEventListener('click', closeDaily);
  $('setSound').addEventListener('click', () => { state.settings.sound = !state.settings.sound; Sound.play('tap'); saveGame(); render(); });
  $('setVibe').addEventListener('click', () => { state.settings.vibration = !state.settings.vibration; buzz(30); saveGame(); render(); });
  $('replayTut').addEventListener('click', () => { for (const c of COACH) if (c.tut) delete state.coach[c.id]; coachShown = ''; showScreen('nation'); });
  $('coach').addEventListener('click', e => {
    const c = currentCoach();
    if (!c) return;
    if (e.target.closest('[data-coach="skip"]')) { for (const x of COACH) if (x.tut) state.coach[x.id] = 1; saveGame(); }
    else if (e.target.closest('[data-coach="ok"]')) { state.coach[c.id] = 1; saveGame(); }
    updateCoach();
  });
  // Browsers only allow audio after a user gesture.
  document.addEventListener('pointerdown', () => Sound.unlock(), { once: true });
  window.addEventListener('scroll', updateCoach, { passive: true });
  $('installBtn').addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    try { await deferredInstall.userChoice; } catch (e) { /* ignore */ }
    deferredInstall = null;
    renderInstall();
  });
  $('reset').addEventListener('click', () => {
    showModal('Reset everything?', 'All progress, including Influence, will be deleted. This cannot be undone.', {
      icon: 'trash', tone: 'bad', okText: 'Reset',
      onOk: () => { state = defaultState(); sectorSig = ''; upgSig = ''; achSig = ''; coachShown = ''; dailyAutoShown = ''; saveGame(); buildPickers(); showScreen('nation'); },
    });
  });

  window.addEventListener('resize', drawSkyline);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveGame();
    else { applyOffline(); lastTick = Date.now(); render(); maybeAutoDaily(); }
  });
  window.addEventListener('beforeunload', saveGame);
}

bindUI();
buildPickers();
checkAchievements(true);
renderInstall();
registerServiceWorker();
applyOffline();
render();
maybeAutoDaily();
drawSkyline();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawSkyline);
setInterval(tick, 100);
setInterval(saveGame, 5000);

// Debug / test hook
window.DN = { get state() { return state; }, isVip, addGems, incomePerSec, earn, render, showScreen, dailyStatus, mods, rpRate, currentEra, SECTORS, UPGRADES, RESEARCH };
