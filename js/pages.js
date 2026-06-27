/* Pages ANPER SE. Chaque fonction renvoie un noeud DOM.
   Si le noeud porte _onMount(), le routeur l'appelle après insertion (canvas). */

// ── Champ de formulaire générique ────────────────────────────────────────────
function field(label, opt = {}) {
  const { type = 'text', value = '', options = null, required = false, placeholder = '' } = opt;
  const wrap = el('div.field');
  if (label) wrap.append(el('label.field-lbl', { html: label + (required ? ' <span class="req">*</span>' : '') }));
  let input;
  if (type === 'combo') {
    input = el('select.field-in');
    input.append(el('option', { value: '', text: '—' }));
    for (const o of (options || [])) input.append(el('option', { value: o, text: o }));
    input.value = value;
  } else if (type === 'text-area') {
    input = el('textarea.field-in', { rows: 3, placeholder }); input.value = value;
  } else {
    input = el('input.field-in', { type: type === 'number' ? 'text' : type, placeholder }); input.value = value;
  }
  wrap.append(input);
  return {
    node: wrap, input,
    get: () => input.value.trim(),
    set: v => { input.value = v == null ? '' : v; },
    clear: () => { input.value = ''; },
  };
}
const num = v => { const n = parseFloat(String(v).replace(/\s/g, '').replace(/ /g, '')); return isNaN(n) ? 0 : n; };
const fmtFCFA = v => { v = +v || 0;
  if (v >= 1e9) return (v / 1e9).toFixed(2) + ' G';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + ' M';
  if (v >= 1e3) return (v / 1e3).toFixed(0) + ' k';
  return v.toFixed(0); };
const nf = v => (+v || 0).toLocaleString('fr-FR');

const Pages = {};

// ═══════════════════════════════ TABLEAU DE BORD ═══════════════════════════════
Pages.dashboard = function () {
  const root = el('div.page');
  root.append(el('div.page-head', {}, [
    el('h1', { text: '🏠 Tableau de Bord' }),
    el('p.sub', { text: 'Suivi & Évaluation — Électrification Rurale' }),
  ]));
  const tabsBar = el('div.tabs');
  const body = el('div');
  const tabs = [['global', 'Vue globale'], ['projet', 'Par projet'], ['periode', 'Par période']];
  let active = 'global';
  const draw = () => {
    body.innerHTML = '';
    $$('.tab', tabsBar).forEach(b => b.classList.toggle('active', b.dataset.t === active));
    const view = active === 'global' ? viewGlobal() : active === 'projet' ? viewProjet() : viewPeriode();
    body.append(view);
    if (view._onMount) view._onMount();
  };
  for (const [t, lbl] of tabs) tabsBar.append(el('button.tab', { 'data-t': t, text: lbl, onclick: () => { active = t; draw(); } }));
  root.append(tabsBar, body);
  root._onMount = draw;
  return root;
};

function sectionTitle(text, color = T.PRIMARY) {
  return el('div.sec-title', {}, [el('span.sec-bar', { style: { background: color } }), el('span', { text })]);
}
function statCard(icon, label, value, color) {
  return el('div.stat', { style: { '--c': color } }, [
    el('div.stat-ico', { text: icon }),
    el('div.stat-body', {}, [el('div.stat-val', { text: value, style: { color } }), el('div.stat-lbl', { text: label })]),
  ]);
}
function kpiCard(label, value, unit, color, sub) {
  return el('div.kpi', {}, [
    el('div.kpi-strip', { style: { background: color } }),
    el('div.kpi-body', {}, [
      el('div.kpi-lbl', { text: label }),
      el('div.kpi-val', {}, [el('span', { text: value, style: { color } }), unit ? el('span.kpi-unit', { text: ' ' + unit }) : null]),
      sub ? el('div.kpi-sub', { text: sub }) : null,
    ]),
  ]);
}
function panel(w, h, cls = '') {
  const cv = el('canvas.chart' + cls); cv.dataset.h = h;
  return el('div.panel', {}, [cv]);
}

function viewGlobal() {
  const sp = DB.statsProjets(), sc = DB.statsClients(), cd = DB.statsClientsDetail();
  const ch = DB.statsCharts(), mr = DB.statsMenagesRegion();
  const budget = sp.budget, decaisse = sp.decaisse, menages = sp.menages, menagesCibles = DB.menagesCiblesTotal();
  const tauxDec = budget ? decaisse / budget * 100 : 0;
  const tauxRac = menagesCibles ? menages / menagesCibles * 100 : 0;
  const tauxRec = cd.total ? cd.a_jour / cd.total * 100 : 0;
  const coutMen = menages ? budget / menages : 0;
  const nPme = (cd.by_type.find(r => r.t === 'PME') || {}).n || 0;
  const nInst = (cd.by_type.find(r => r.t === 'Institution') || {}).n || 0;
  const tauxPme = cd.total ? (nPme + nInst) / cd.total * 100 : 0;

  const v = el('div');
  // KPI de base
  v.append(sectionTitle('Indicateurs de base'));
  const g1 = el('div.grid-stats');
  [['📊', 'Projets', nf(sp.total), T.PRIMARY],
   ['👥', 'Clients raccordés', nf(sc.total), T.INFO],
   ['💰', 'Budget total (FCFA)', nf(Math.round(budget)), T.WARNING],
   ['💸', 'Décaissé (FCFA)', nf(Math.round(decaisse)), T.PRIMARY_D],
   ['🏘️', 'Ménages raccordés', nf(menages), T.PRIMARY],
   ['🎯', 'Ménages cibles', nf(menagesCibles), T.INFO],
   ['🌿', 'CO₂ évité (tCO₂)', nf(Math.round(sp.co2)), '#0891B2'],
   ['👷', 'Emplois créés', nf(sp.emplois), '#7C3AED'],
  ].forEach(a => g1.append(statCard(...a)));
  v.append(g1);
  // KPI calculés
  v.append(sectionTitle('Indicateurs calculés', T.INFO));
  const g2 = el('div.grid-kpi');
  [['Taux de décaissement', tauxDec.toFixed(1), '%', T.WARNING, `${fmtFCFA(decaisse)} / ${fmtFCFA(budget)} FCFA`],
   ['Taux de raccordement', tauxRac.toFixed(1), '%', T.PRIMARY, `${nf(menages)} / ${nf(menagesCibles)} ménages`],
   ['Taux de recouvrement', tauxRec.toFixed(1), '%', '#059669', `${nf(cd.a_jour)} à jour / ${nf(cd.total)}`],
   ['Coût moyen / ménage', fmtFCFA(coutMen), 'FCFA', T.INFO, 'Budget ÷ ménages raccordés'],
   ['PME + Institutions', tauxPme.toFixed(1), '%', '#7C3AED', `${nPme} PME + ${nInst} institutions`],
   ['Consommation moy.', Math.round(cd.avg_conso).toString(), 'kWh/mois', '#0891B2', 'Clients actifs'],
   ['Puissance installée', nf(Math.round(cd.puissance_totale)), 'VA', T.DANGER, 'Somme des souscriptions'],
  ].forEach(a => g2.append(kpiCard(...a)));
  v.append(g2);
  // Jauges
  v.append(sectionTitle('Taux clés (jauges)', T.WARNING));
  const gj = el('div.grid-4');
  const gDec = panel(0, 150), gRac = panel(0, 150), gRec = panel(0, 150), gPme = panel(0, 150);
  gj.append(gDec, gRac, gRec, gPme); v.append(gj);
  // Répartition clients
  v.append(sectionTitle('Répartition clients'));
  const gc = el('div.grid-3');
  const pGenre = panel(0, 210), pType = panel(0, 210), pMil = panel(0, 210);
  gc.append(pGenre, pType, pMil); v.append(gc);
  // Suivi projets
  v.append(sectionTitle('Suivi des projets', T.WARNING));
  const gp = el('div.grid-3');
  const pStat = panel(0, 210), pTech = panel(0, 210), pSrc = panel(0, 210);
  gp.append(pStat, pTech, pSrc); v.append(gp);
  // Impacts régionaux
  v.append(sectionTitle('Impacts régionaux', '#0891B2'));
  const gr = el('div.grid-2');
  const pBud = panel(0, 240), pMen = panel(0, 240);
  gr.append(pBud, pMen); v.append(gr);
  // Recouvrement
  v.append(sectionTitle('Recouvrement & Paiement', T.DANGER));
  const gpay = el('div.grid-1');
  const pPay = panel(0, 190); gpay.append(pPay); v.append(gpay);

  v._onMount = () => {
    const donutData = (rows, key, pal) => rows.filter(r => r.n > 0).map(r => [r[key], r.n, clr(pal, r[key])]);
    Charts.gauge($('canvas', gDec), tauxDec, T.WARNING, 'Décaissement', fmtFCFA(decaisse) + ' FCFA');
    Charts.gauge($('canvas', gRac), tauxRac, T.PRIMARY, 'Raccordement', nf(menages) + ' ménages');
    Charts.gauge($('canvas', gRec), tauxRec, '#059669', 'Recouvrement', nf(cd.a_jour) + ' clients');
    Charts.gauge($('canvas', gPme), tauxPme, '#7C3AED', 'PME + Inst. / total', '');
    Charts.donut($('canvas', pGenre), donutData(ch.genre, 'g', GEN), 'Genre des clients');
    Charts.donut($('canvas', pType), donutData(cd.by_type, 't', TYPE), 'Type de client');
    Charts.donut($('canvas', pMil), donutData(cd.by_milieu, 'm', MIL), 'Milieu');
    const hb = (cv, rows, key, pal, ttl) => {
      const d = rows.filter(r => r.n > 0).map(r => [r[key], r.n]);
      const cols = rows.filter(r => r.n > 0).map(r => clr(pal, r[key]));
      d.length ? Charts.hbars(cv, d, cols, ttl, true) : Charts.noData(cv);
    };
    hb($('canvas', pStat), sp.by_statut, 'statut', STA, 'Projets par statut');
    hb($('canvas', pTech), ch.techno, 't', TECH, 'Technologie');
    hb($('canvas', pSrc), ch.source, 's', {}, 'Source de financement');
    ch.budget.length
      ? Charts.grouped($('canvas', pBud), ch.budget.map(r => r.region), ch.budget.map(r => r.budget || 0), ch.budget.map(r => r.decaisse || 0), 'Budget vs Décaissé / région (FCFA)', T.PRIMARY, T.WARNING, 'Budget', 'Décaissé')
      : Charts.noData($('canvas', pBud));
    mr.length
      ? Charts.grouped($('canvas', pMen), mr.map(r => r.region), mr.map(r => r.cibles || 0), mr.map(r => r.raccordes || 0), 'Ménages cibles vs raccordés / région', '#CBD5E1', T.PRIMARY, 'Cibles', 'Raccordés')
      : Charts.noData($('canvas', pMen));
    hb($('canvas', pPay), cd.by_paiement, 's', PAY, 'Statut de paiement');
  };
  return v;
}

function viewProjet() {
  const v = el('div');
  const pids = DB.getAllPids();
  if (!pids.length) { v.append(el('p.muted', { text: 'Aucun projet enregistré.' })); return v; }
  const sel = el('select.field-in', { style: { maxWidth: '460px' } });
  for (const p of pids) sel.append(el('option', { value: p.pid, text: `${p.pid} — ${p.nom}` }));
  const detail = el('div');
  v.append(el('div.row-sel', {}, [el('label', { text: 'Projet : ' }), sel]), detail);
  const render = () => {
    const pid = sel.value, p = DB.getProjet(pid), cc = DB.getClientsCountByProjet(pid), comp = DB.statsComposantes(pid);
    detail.innerHTML = '';
    const tDec = p.budget_total ? (p.montant_decaisse / p.budget_total * 100) : 0;
    const tRac = p.nb_menages_cibles ? (p.nb_menages_raccordes / p.nb_menages_cibles * 100) : 0;
    const g = el('div.grid-stats');
    [['💰', 'Budget (FCFA)', nf(Math.round(p.budget_total)), T.WARNING],
     ['💸', 'Décaissé (FCFA)', nf(Math.round(p.montant_decaisse)), T.PRIMARY_D],
     ['🏘️', 'Ménages raccordés', nf(p.nb_menages_raccordes), T.PRIMARY],
     ['🎯', 'Ménages cibles', nf(p.nb_menages_cibles), T.INFO],
     ['👥', 'Clients (H/F)', `${cc.total} (${cc.masculin}/${cc.feminin})`, T.INFO],
     ['🌿', 'CO₂ évité', nf(Math.round(p.co2_evite)), '#0891B2'],
     ['👷', 'Emplois', nf(p.emplois_crees), '#7C3AED'],
     ['🔧', 'Composantes (C/A/SA)', `${comp.C}/${comp.A}/${comp.SA}`, T.GRAY700],
    ].forEach(a => g.append(statCard(...a)));
    detail.append(el('div.card-info', {}, [
      el('h3', { text: `${p.pid} — ${p.nom}` }),
      el('p.muted', { text: `${p.region || ''} · ${p.technologie || ''} · ${p.statut || ''} · Bailleur : ${p.bailleur || '—'}` }),
    ]));
    detail.append(g);
    const gj = el('div.grid-2');
    const gDec = panel(0, 160), gRac = panel(0, 160); gj.append(gDec, gRac); detail.append(gj);
    Charts.gauge($('canvas', gDec), tDec, T.WARNING, 'Taux de décaissement', '');
    Charts.gauge($('canvas', gRac), tRac, T.PRIMARY, 'Taux de raccordement', '');
  };
  sel.addEventListener('change', render);
  v._onMount = render;
  return v;
}

function viewPeriode() {
  const v = el('div');
  const now = new Date();
  const fY = field('Année', { type: 'combo', options: ['', ...Array.from({ length: 6 }, (_, i) => String(now.getFullYear() - i))], value: String(now.getFullYear()) });
  const fM = field('Mois', { type: 'combo', options: ['', ...Array.from({ length: 12 }, (_, i) => String(i + 1))] });
  const fQ = field('Trimestre', { type: 'combo', options: ['', '1', '2', '3', '4'] });
  const out = el('div');
  const bar = el('div.grid-3', {}, [fY.node, fM.node, fQ.node]);
  v.append(bar, out);
  const refresh = () => {
    const y = fY.get(), m = fM.get() ? +fM.get() : 0, q = fQ.get() ? +fQ.get() : 0;
    const s = DB.statsByPeriod(y, m, q);
    out.innerHTML = '';
    const g = el('div.grid-stats');
    [['📊', 'Projets', nf(s.projets), T.PRIMARY], ['👥', 'Clients', nf(s.clients), T.INFO],
     ['💰', 'Budget', nf(Math.round(s.budget)), T.WARNING], ['💸', 'Décaissé', nf(Math.round(s.decaisse)), T.PRIMARY_D],
     ['🏘️', 'Ménages', nf(s.menages), T.PRIMARY], ['🌿', 'CO₂', nf(Math.round(s.co2)), '#0891B2'],
     ['👷', 'Emplois', nf(s.emplois), '#7C3AED'],
    ].forEach(a => g.append(statCard(...a)));
    out.append(el('p.muted', { text: `Filtré par date de création — ${y || 'toutes années'}${m ? ' · mois ' + m : ''}${q ? ' · T' + q : ''}` }), g);
  };
  [fM.input, fQ.input].forEach(i => i.addEventListener('change', () => {
    if (i === fM.input && fM.get()) fQ.set('');
    if (i === fQ.input && fQ.get()) fM.set('');
    refresh();
  }));
  fY.input.addEventListener('change', refresh);
  v._onMount = refresh;
  return v;
}

window.Pages = Pages;
