/* Couche données ANPER SE (web) — IndexedDB + cache mémoire.
   Miroir fonctionnel de db/manager.py (SQLite) de la version desktop.
   Les données réelles sont petites (dizaines/centaines de lignes) : on les
   charge entièrement en mémoire pour des lectures synchrones, et on persiste
   chaque écriture dans IndexedDB. RENALOC (33k localités) reste en mémoire
   sous forme arborescente région→dept→commune→[localités]. */

const DB = (() => {
  const DB_NAME = 'anper_se';
  const DB_VER  = 2;
  const STORES  = ['projets', 'clients', 'composantes', 'kv', 'tombstones'];
  let _idb = null;
  const cache = { projets: [], clients: [], composantes: [], renaloc: {}, tombstones: [] };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));
  // uid déterministe pour les fiches du seed ou d'une sauvegarde : le même projet
  // reçoit le même uid sur tous les appareils, sinon la synchro le duplique.
  const stableUid = (r) => {
    if (r.cid) return 'c:' + r.cid;
    if (r.pid && r.type && r.numero) return 'k:' + r.pid + '|' + r.type + '|' + r.numero;
    if (r.pid && !r.type && !r.numero) return 'p:' + r.pid;
    return uuid();
  };
  let _onChange = null;             // notifié après toute mutation (pour auto-sync)
  const setOnChange = fn => { _onChange = fn; };
  const notify = () => { if (_onChange) try { _onChange(); } catch (e) {} };

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('projets'))
          db.createObjectStore('projets', { keyPath: 'pid' });
        if (!db.objectStoreNames.contains('clients'))
          db.createObjectStore('clients', { keyPath: 'cid' });
        if (!db.objectStoreNames.contains('composantes'))
          db.createObjectStore('composantes', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('kv'))
          db.createObjectStore('kv', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('tombstones'))
          db.createObjectStore('tombstones', { keyPath: 'uid' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function tx(store, mode = 'readonly') {
    return _idb.transaction(store, mode).objectStore(store);
  }
  function reqP(r) {
    return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  }
  function getAll(store) { return reqP(tx(store).getAll()); }
  function put(store, val) { return reqP(tx(store, 'readwrite').put(val)); }
  function del(store, key) { return reqP(tx(store, 'readwrite').delete(key)); }
  function clear(store) { return reqP(tx(store, 'readwrite').clear()); }
  async function kvGet(key) { const r = await reqP(tx('kv').get(key)); return r ? r.value : undefined; }
  function kvSet(key, value) { return put('kv', { key, value }); }

  async function init() {
    _idb = await open();
    const seeded = await kvGet('seeded');
    const stamp = (r) => { if (!r.uid) r.uid = stableUid(r); if (!r._updated) r._updated = Date.now(); return r; };
    if (!seeded) {
      try {
        const seed = await fetch('data/seed.json').then(r => r.json());
        // _updated minimal : toute version déjà modifiée dans le cloud l'emporte sur le seed
        const seedStamp = (r) => { r._updated = 1; return stamp(r); };
        for (const p of (seed.projets || [])) await put('projets', seedStamp(p));
        for (const c of (seed.clients || [])) await put('clients', seedStamp(c));
        for (const cp of (seed.composantes || [])) { delete cp.id; await put('composantes', seedStamp(cp)); }
        await kvSet('renaloc', seed.renaloc || {});
        await kvSet('seeded', true);
      } catch (e) {
        console.warn('Seed indisponible :', e);
        await kvSet('renaloc', {});
        await kvSet('seeded', true);
      }
    }
    cache.projets     = await getAll('projets');
    cache.clients     = await getAll('clients');
    cache.composantes = await getAll('composantes');
    cache.tombstones  = await getAll('tombstones');
    cache.renaloc     = (await kvGet('renaloc')) || {};
    // Backfill uid/_updated pour d'anciens enregistrements (migration v1→v2)
    for (const [store, arr] of [['projets', cache.projets], ['clients', cache.clients], ['composantes', cache.composantes]]) {
      for (const r of arr) { if (!r.uid || !r._updated) { stamp(r); await put(store, r); } }
    }
  }

  // ── Utilitaires ───────────────────────────────────────────────────────────
  const today = () => {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  };

  function nextPid() {
    let mx = 0;
    for (const p of cache.projets) {
      const m = /^ANPER-(\d+)$/.exec(p.pid || '');
      if (m) mx = Math.max(mx, +m[1]);
    }
    return 'ANPER-' + String(mx + 1).padStart(3, '0');
  }
  function nextCid() {
    let mx = 0;
    for (const c of cache.clients) {
      const m = /^CLT-(\d+)$/.exec(c.cid || '');
      if (m) mx = Math.max(mx, +m[1]);
    }
    return 'CLT-' + String(mx + 1).padStart(4, '0');
  }

  // ── RENALOC (cascade) ───────────────────────────────────────────────────────
  const renalocLoaded = () => Object.keys(cache.renaloc).length > 0;
  function getRegions() {
    const ks = Object.keys(cache.renaloc).sort((a, b) => a.localeCompare(b, 'fr'));
    return ks.length ? ks : REGIONS;
  }
  function getDepartements(regions) {
    const set = new Set();
    for (const r of regions) for (const d of Object.keys(cache.renaloc[r] || {})) if (d) set.add(d);
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }
  function getCommunes(depts) {
    const set = new Set();
    for (const r of Object.keys(cache.renaloc))
      for (const d of depts)
        if (cache.renaloc[r][d]) for (const c of Object.keys(cache.renaloc[r][d])) if (c) set.add(c);
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }
  function getLocalites(communes) {
    const set = new Set();
    for (const r of Object.keys(cache.renaloc))
      for (const d of Object.keys(cache.renaloc[r]))
        for (const c of communes)
          if (cache.renaloc[r][d][c]) for (const l of cache.renaloc[r][d][c]) if (l) set.add(l);
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }

  // Tombstone : enregistre une suppression pour la fusion multi-appareils
  async function tombstone(uid) {
    if (!uid) return;
    const rec = { uid, _updated: Date.now() };
    await put('tombstones', rec);
    cache.tombstones = cache.tombstones.filter(t => t.uid !== uid); cache.tombstones.push(rec);
  }

  // ── Projets ───────────────────────────────────────────────────────────────
  async function insertProjet(data) {
    const pid = nextPid();
    const rec = { ...data, pid, uid: uuid(), _updated: Date.now(), date_creation: today(), date_modification: today() };
    await put('projets', rec); cache.projets.push(rec); notify(); return pid;
  }
  async function updateProjet(pid, data) {
    const i = cache.projets.findIndex(p => p.pid === pid);
    if (i < 0) return;
    const rec = { ...cache.projets[i], ...data, pid, _updated: Date.now(), date_modification: today() };
    await put('projets', rec); cache.projets[i] = rec; notify();
  }
  async function deleteProjet(pid) {
    for (const c of cache.composantes.filter(c => c.pid === pid)) { await del('composantes', c.id); await tombstone(c.uid); }
    cache.composantes = cache.composantes.filter(c => c.pid !== pid);
    const copies = cache.projets.filter(p => p.pid === pid); // toutes les copies (uid différents)
    await del('projets', pid); cache.projets = cache.projets.filter(p => p.pid !== pid);
    for (const p of copies) await tombstone(p.uid);
    notify();
  }
  // Renumérotation continue ANPER-001, 002… dans l'ordre actuel (après une
  // suppression). Renvoie le plan [[ancien, nouveau], …] ; apply=false = simulation.
  // Composantes (pid) et clients (projet_raccorde) suivent ; les composantes
  // orphelines (projet supprimé) reçoivent un tombstone pour ne pas se rattacher
  // au projet qui reprend le numéro libéré.
  async function renumberProjets(apply = true) {
    const pad = n => 'ANPER-' + String(n).padStart(3, '0');
    const sorted = cache.projets.filter(p => /^ANPER-\d+$/.test(p.pid || ''))
      .sort((a, b) => a.pid.localeCompare(b.pid, 'fr', { numeric: true }));
    const map = new Map();
    sorted.forEach((p, i) => { if (p.pid !== pad(i + 1)) map.set(p.pid, pad(i + 1)); });
    const plan = [...map.entries()];
    if (!apply || !plan.length) return plan;
    const now = Date.now();
    const live = new Set(cache.projets.map(p => p.pid));
    for (const c of cache.composantes.filter(c => c.pid && !live.has(c.pid))) { await del('composantes', c.id); await tombstone(c.uid); }
    cache.composantes = cache.composantes.filter(c => !c.pid || live.has(c.pid));
    // Clients d'un projet supprimé : fiche conservée, rattachement vidé (sinon ils
    // passeraient au projet qui reprend le numéro)
    for (const c of cache.clients) if (/^ANPER-\d+$/.test(c.projet_raccorde || '') && !live.has(c.projet_raccorde)) {
      c.projet_raccorde = ''; c._updated = now; await put('clients', c);
    }
    for (const old of map.keys()) await del('projets', old);   // clé IndexedDB = pid
    for (const p of sorted) if (map.has(p.pid)) {
      p.pid = map.get(p.pid); p._updated = now; p.date_modification = today(); await put('projets', p);
    }
    for (const c of cache.composantes) if (map.has(c.pid)) { c.pid = map.get(c.pid); c._updated = now; await put('composantes', c); }
    for (const c of cache.clients) if (map.has(c.projet_raccorde)) { c.projet_raccorde = map.get(c.projet_raccorde); c._updated = now; await put('clients', c); }
    notify();
    return plan;
  }
  const getProjet = pid => cache.projets.find(p => p.pid === pid) || {};
  function getAllProjets(filtre = '') {
    let arr = [...cache.projets].sort((a, b) => (b.id || 0) - (a.id || 0));
    if (filtre) {
      const q = filtre.toLowerCase();
      const keys = ['pid','nom','region','statut','technologie','bailleur','source_financement','maitre_ouvrage','chef_projet','departement'];
      arr = arr.filter(p => keys.some(k => String(p[k] || '').toLowerCase().includes(q)));
    }
    return arr;
  }
  const getAllPids = () => [...cache.projets]
    .sort((a, b) => (a.pid || '').localeCompare(b.pid || ''))
    .map(p => ({ pid: p.pid, nom: p.nom }));

  // ── Clients ─────────────────────────────────────────────────────────────────
  async function insertClient(data) {
    const cid = nextCid();
    const rec = { ...data, cid, uid: uuid(), _updated: Date.now(), date_creation: today() };
    await put('clients', rec); cache.clients.push(rec); notify(); return cid;
  }
  async function updateClient(cid, data) {
    const i = cache.clients.findIndex(c => c.cid === cid);
    if (i < 0) return;
    const rec = { ...cache.clients[i], ...data, cid, _updated: Date.now() };
    await put('clients', rec); cache.clients[i] = rec; notify();
  }
  async function deleteClient(cid) {
    const copies = cache.clients.filter(c => c.cid === cid); // toutes les copies (uid différents)
    await del('clients', cid); cache.clients = cache.clients.filter(c => c.cid !== cid);
    for (const c of copies) await tombstone(c.uid); notify();
  }
  const getClient = cid => cache.clients.find(c => c.cid === cid) || {};
  function getAllClients(filtre = '') {
    let arr = [...cache.clients].sort((a, b) => (b.id || 0) - (a.id || 0));
    if (filtre) {
      const q = filtre.toLowerCase();
      const keys = ['cid','nom_prenoms','region','statut_paiement','type_client','genre','milieu','projet_raccorde','commune','telephone','cni','localite'];
      arr = arr.filter(c => keys.some(k => String(c[k] || '').toLowerCase().includes(q)));
    }
    return arr;
  }

  // ── Composantes ─────────────────────────────────────────────────────────────
  function getComposantes(pid = '', filtre = '') {
    let arr = cache.composantes.map(c => ({ ...c, nom_projet: (getProjet(c.pid) || {}).nom || '' }));
    if (pid) arr = arr.filter(c => c.pid === pid);
    if (filtre) {
      const q = filtre.toLowerCase();
      arr = arr.filter(c => ['libelle','numero','pid'].some(k => String(c[k] || '').toLowerCase().includes(q)));
    }
    const ord = { C: 0, A: 1, SA: 2 };
    // Chemin numérique du numéro (« C1 »→[1], « A1.2 »→[1,2], « 1.1.1 »→[1,1,1])
    // pour un tri VRAIMENT hiérarchique : chaque activité/sous-activité vient se
    // ranger sous sa composante (C1 → A1.1 → SA1.1.1 → A1.2 …), et non tous les C
    // puis tous les A puis tous les SA.
    const numPath = s => String(s || '').replace(/^[A-Za-z\s]+/, '').split('.').map(x => parseInt(x, 10) || 0);
    return arr.sort((a, b) => {
      const pc = (a.pid || '').localeCompare(b.pid || '');
      if (pc) return pc;
      const pa = numPath(a.numero), pb = numPath(b.numero), n = Math.max(pa.length, pb.length);
      for (let i = 0; i < n; i++) {
        const d = (i < pa.length ? pa[i] : -1) - (i < pb.length ? pb[i] : -1);
        if (d) return d;
      }
      return (ord[a.type] || 0) - (ord[b.type] || 0);
    });
  }
  const getComposante = id => cache.composantes.find(c => c.id === id) || {};
  async function insertComposante(data) {
    const rec = { ...data, uid: uuid(), _updated: Date.now(), date_creation: new Date().toISOString() };
    const id = await put('composantes', rec); rec.id = id; cache.composantes.push(rec); notify(); return id;
  }
  async function updateComposante(id, data) {
    const i = cache.composantes.findIndex(c => c.id === id);
    if (i < 0) return;
    const rec = { ...cache.composantes[i], ...data, id, _updated: Date.now() };
    await put('composantes', rec); cache.composantes[i] = rec; notify();
  }
  async function deleteComposante(id) {
    const c = cache.composantes.find(c => c.id === id);
    await del('composantes', id); cache.composantes = cache.composantes.filter(c => c.id !== id);
    if (c) await tombstone(c.uid); notify();
  }

  // ── Statistiques (miroir manager.py) ─────────────────────────────────────────
  const sum = (arr, k) => arr.reduce((s, x) => s + (+x[k] || 0), 0);
  function groupCount(arr, keyFn) {
    const m = {};
    for (const x of arr) { const k = keyFn(x); m[k] = (m[k] || 0) + 1; }
    return m;
  }

  function statsProjets() {
    const p = cache.projets;
    const byStatut = Object.entries(groupCount(p, x => x.statut || ''))
      .map(([statut, n]) => ({ statut, n }));
    const byRegion = Object.entries(groupCount(p, x => x.region || ''))
      .map(([region, n]) => ({ region, n })).sort((a, b) => b.n - a.n);
    return {
      total: p.length, budget: sum(p, 'budget_total'), decaisse: sum(p, 'montant_decaisse'),
      menages: sum(p, 'nb_menages_raccordes'), emplois: sum(p, 'emplois_crees'),
      co2: sum(p, 'co2_evite'), by_statut: byStatut, by_region: byRegion,
    };
  }
  function statsClients() {
    const c = cache.clients;
    const byStatut = Object.entries(groupCount(c, x => x.statut_paiement || ''))
      .map(([k, n]) => ({ statut_paiement: k, n }));
    return { total: c.length, revenus: sum(c, 'revenus'), consommation: sum(c, 'consommation'), by_statut: byStatut };
  }
  function statsClientsDetail() {
    const c = cache.clients;
    const norm = (v, d) => (v && String(v).trim()) ? v : d;
    const grp = (fn) => Object.entries(groupCount(c, fn)).map(([k, n]) => [k, n]).sort((a, b) => b[1] - a[1]);
    const by_type     = grp(x => norm(x.type_client, 'Autre')).map(([t, n]) => ({ t, n }));
    const by_paiement = grp(x => norm(x.statut_paiement, 'N.C.')).map(([s, n]) => ({ s, n }));
    const conso = c.map(x => +x.consommation || 0).filter(v => v > 0);
    const rev   = c.map(x => +x.revenus || 0).filter(v => v > 0);
    const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
    return {
      by_type, by_paiement,
      avg_conso: avg(conso), puissance_totale: sum(c, 'puissance'), avg_revenus: avg(rev),
      a_jour: c.filter(x => x.statut_paiement === 'À jour').length, total: c.length,
    };
  }
  function statsCharts() {
    const p = cache.projets, c = cache.clients;
    const norm = (v, d) => (v && String(v).trim()) ? v : d;
    const genre = Object.entries(groupCount(c, x => norm(x.genre, 'N.C.'))).map(([g, n]) => ({ g, n }));
    const byReg = {};
    for (const x of p) { const r = (x.region || '').trim(); if (!r) continue;
      byReg[r] = byReg[r] || { region: r, budget: 0, decaisse: 0, menages: 0 };
      byReg[r].budget += +x.budget_total || 0; byReg[r].decaisse += +x.montant_decaisse || 0;
      byReg[r].menages += +x.nb_menages_raccordes || 0; }
    const budget = Object.values(byReg).sort((a, b) => b.budget - a.budget).slice(0, 7);
    const techno = Object.entries(groupCount(p, x => norm(x.technologie, 'Autre'))).map(([t, n]) => ({ t, n })).sort((a, b) => b.n - a.n);
    const source = Object.entries(groupCount(p, x => norm(x.source_financement, 'Autre'))).map(([s, n]) => ({ s, n })).sort((a, b) => b.n - a.n);
    return { genre, budget, techno, source };
  }
  function statsMenagesRegion() {
    const p = cache.projets, byReg = {};
    for (const x of p) { const r = (x.region || '').trim(); if (!r) continue;
      byReg[r] = byReg[r] || { region: r, cibles: 0, raccordes: 0, co2: 0, emplois: 0 };
      byReg[r].cibles += +x.nb_menages_cibles || 0; byReg[r].raccordes += +x.nb_menages_raccordes || 0;
      byReg[r].co2 += +x.co2_evite || 0; byReg[r].emplois += +x.emplois_crees || 0; }
    return Object.values(byReg).sort((a, b) => b.raccordes - a.raccordes).slice(0, 8);
  }
  function statsComposantes(pid = '') {
    const arr = pid ? cache.composantes.filter(c => c.pid === pid) : cache.composantes;
    const cnt = groupCount(arr, x => x.type);
    return { C: cnt.C || 0, A: cnt.A || 0, SA: cnt.SA || 0, total: arr.length };
  }
  function getClientsCountByProjet(pid) {
    const arr = cache.clients.filter(c => c.projet_raccorde === pid);
    return { total: arr.length,
      masculin: arr.filter(c => c.genre === 'Masculin').length,
      feminin:  arr.filter(c => c.genre === 'Féminin').length };
  }
  const menagesCiblesTotal = () => sum(cache.projets, 'nb_menages_cibles');

  // ── Périodes (date_creation = JJ/MM/AAAA) ─────────────────────────────────────
  function matchPeriod(rec, year, month, quarter) {
    const dc = rec.date_creation || '';
    const yy = dc.slice(6, 10), mm = dc.slice(3, 5);
    if (year && yy !== String(year)) return false;
    if (month) { if (mm !== String(month).padStart(2, '0')) return false; }
    else if (quarter) {
      const m = parseInt(mm, 10) || 0;
      const ranges = { 1: [1, 3], 2: [4, 6], 3: [7, 9], 4: [10, 12] }[quarter] || [1, 12];
      if (m < ranges[0] || m > ranges[1]) return false;
    }
    return true;
  }
  const getProjetsByPeriod = (y, m, q) => cache.projets.filter(p => matchPeriod(p, y, m, q)).sort((a, b) => (b.id || 0) - (a.id || 0));
  const getClientsByPeriod = (y, m, q) => cache.clients.filter(c => matchPeriod(c, y, m, q)).sort((a, b) => (b.id || 0) - (a.id || 0));
  function statsByPeriod(y, m, q) {
    const p = getProjetsByPeriod(y, m, q), c = getClientsByPeriod(y, m, q);
    return { projets: p.length, clients: c.length, budget: sum(p, 'budget_total'),
      decaisse: sum(p, 'montant_decaisse'), menages: sum(p, 'nb_menages_raccordes'),
      emplois: sum(p, 'emplois_crees'), co2: sum(p, 'co2_evite') };
  }

  // ── Import / Export ──────────────────────────────────────────────────────────
  function exportJSON() {
    return JSON.stringify({
      _app: 'ANPER SE', _exported: new Date().toISOString(),
      projets: cache.projets, clients: cache.clients,
      composantes: cache.composantes, renaloc: cache.renaloc,
    }, null, 2);
  }
  async function importJSON(obj, { replaceRenaloc = false } = {}) {
    // Estampille uid/_updated si absents (anciennes sauvegardes / export depuis anper.db)
    // — sans cela, le partage/fusion par uid laisserait tomber ces fiches.
    const stamp = (r) => { if (!r.uid) r.uid = stableUid(r); if (!r._updated) r._updated = Date.now(); return r; };
    if (obj.projets) { await clear('projets'); cache.projets = [];
      for (const p of obj.projets) { stamp(p); await put('projets', p); cache.projets.push(p); } }
    if (obj.clients) { await clear('clients'); cache.clients = [];
      for (const c of obj.clients) { stamp(c); await put('clients', c); cache.clients.push(c); } }
    if (obj.composantes) { await clear('composantes'); cache.composantes = [];
      for (const cp of obj.composantes) { delete cp.id; stamp(cp); const id = await put('composantes', cp); cp.id = id; cache.composantes.push(cp); } }
    if (obj.renaloc && (replaceRenaloc || !renalocLoaded())) { cache.renaloc = obj.renaloc; await kvSet('renaloc', obj.renaloc); }
  }
  // Import RENALOC depuis un tableau de lignes {region,departement,commune,localite}
  async function importRenalocRows(rows) {
    const tree = {};
    for (const r of rows) {
      const reg = (r.region || '').trim(), dep = (r.departement || '').trim();
      const com = (r.commune || '').trim(), loc = (r.localite || '').trim();
      if (!reg) continue;
      ((tree[reg] = tree[reg] || {})[dep] = tree[reg][dep] || {})[com] = tree[reg][dep][com] || [];
      if (loc && !tree[reg][dep][com].includes(loc)) tree[reg][dep][com].push(loc);
    }
    cache.renaloc = tree; await kvSet('renaloc', tree);
    let n = 0; for (const r in tree) for (const d in tree[r]) for (const c in tree[r][d]) n += tree[r][d][c].length || 1;
    return n;
  }
  async function resetAll() {
    for (const s of ['projets', 'clients', 'composantes', 'kv', 'tombstones']) await clear(s);
    cache.projets = []; cache.clients = []; cache.composantes = []; cache.renaloc = {}; cache.tombstones = [];
  }

  // ── Synchronisation multi-utilisateur (état + fusion par fiche) ───────────────
  // L'état partagé (fichier OneDrive) contient les fiches estampillées uid/_updated
  // et les tombstones. La fusion garde, par uid, la version la plus récente, et
  // applique les suppressions dont le tombstone est plus récent que la fiche.
  function exportState() {
    return {
      _app: 'ANPER SE', _v: 2, _exported: Date.now(),
      projets: cache.projets, clients: cache.clients, composantes: cache.composantes,
      tombstones: cache.tombstones, renaloc: cache.renaloc,
    };
  }
  // Fusionne un état distant dans le local ; renvoie {changed, counts}. Pur côté
  // données : recalcule le cache puis réécrit IndexedDB.
  async function mergeRemote(remote) {
    if (!remote || typeof remote !== 'object') return { changed: false };
    const tomb = new Map();
    for (const t of [...(cache.tombstones || []), ...(remote.tombstones || [])]) {
      const cur = tomb.get(t.uid);
      if (!cur || (t._updated || 0) > (cur._updated || 0)) tomb.set(t.uid, t);
    }
    const mergeStore = (localArr, remoteArr) => {
      const byUid = new Map();
      for (const r of localArr) if (r.uid) byUid.set(r.uid, r);
      for (const r of (remoteArr || [])) {
        if (!r.uid) continue;
        const cur = byUid.get(r.uid);
        if (!cur || (r._updated || 0) > (cur._updated || 0)) byUid.set(r.uid, r);
      }
      // applique les tombstones
      const out = [];
      for (const r of byUid.values()) {
        const t = tomb.get(r.uid);
        if (t && (t._updated || 0) >= (r._updated || 0)) continue; // supprimé
        out.push(r);
      }
      return out;
    };
    // Dédoublonnage par clé métier : un même projet (pid) ou client (cid) peut
    // exister sous plusieurs uid (seed chargé sur chaque appareil, restauration
    // d'une sauvegarde sans uid). On garde la fiche la plus récente et on pose un
    // tombstone sur les autres, qui disparaissent ainsi aussi du cloud au push.
    const dedupe = (arr, keyFn) => {
      const best = new Map(), rest = [];
      for (const r of arr) {
        const k = keyFn(r);
        if (!k) { rest.push(r); continue; }
        const cur = best.get(k);
        if (!cur) { best.set(k, r); continue; }
        const win = ((r._updated || 0) > (cur._updated || 0)
          || ((r._updated || 0) === (cur._updated || 0) && r.uid > cur.uid)) ? r : cur;
        const lose = win === r ? cur : r;
        best.set(k, win);
        const now = Math.max(Date.now(), (lose._updated || 0) + 1);
        tomb.set(lose.uid, { uid: lose.uid, _updated: now });
      }
      return [...best.values(), ...rest];
    };
    const newP = dedupe(mergeStore(cache.projets, remote.projets), r => r.pid);
    const newC = dedupe(mergeStore(cache.clients, remote.clients), r => r.cid);
    const newK = dedupe(mergeStore(cache.composantes, remote.composantes),
      r => (r.pid && r.numero) ? r.pid + '|' + (r.type || '') + '|' + r.numero : null);

    // Réécrit les stores fusionnés
    await clear('projets'); for (const r of newP) await put('projets', r);
    await clear('clients'); for (const r of newC) await put('clients', r);
    await clear('composantes'); for (const r of newK) { delete r.id; const id = await put('composantes', r); r.id = id; }
    await clear('tombstones'); const allTomb = [...tomb.values()]; for (const t of allTomb) await put('tombstones', t);
    cache.projets = newP; cache.clients = newC; cache.composantes = newK; cache.tombstones = allTomb;
    if (remote.renaloc && !renalocLoaded()) { cache.renaloc = remote.renaloc; await kvSet('renaloc', remote.renaloc); }
    return { changed: true, counts: { projets: newP.length, clients: newC.length, composantes: newK.length } };
  }
  // Paramètres de synchro persistés (client_id Azure, lien de partage, etc.)
  const syncGet = (k) => kvGet('sync:' + k);
  const syncSet = (k, v) => kvSet('sync:' + k, v);
  // Stockage générique pour le domaine « Gestion administrative » (réutilise le store kv)
  const adminGet = (k) => kvGet('admin:' + k);
  const adminSet = async (k, v) => { await kvSet('admin:' + k, v); await kvSet('admints:' + k, Date.now()); notify(); };
  const adminTs = (k) => kvGet('admints:' + k);
  async function adminAll() {
    const all = await getAll('kv'); const tsMap = {};
    for (const e of all) if (e.key.startsWith('admints:')) tsMap[e.key.slice(8)] = e.value;
    const out = [];
    for (const e of all) if (e.key.startsWith('admin:')) { const k = e.key.slice(6); out.push({ key: k, value: e.value, ts: tsMap[k] || 0 }); }
    return out;
  }
  async function adminApply(key, value, ts) { await kvSet('admin:' + key, value); await kvSet('admints:' + key, ts || Date.now()); }

  // Petites listes extensibles (ex. Chefs de Projet, Bailleurs) alimentées par saisie libre —
  // même famille de stockage que adminGet/Set, préfixe 'list:' dans le store kv existant.
  const getListValues = (name) => kvGet('list:' + name).then(v => v || []);
  async function addListValue(name, value) {
    value = (value || '').trim(); if (!value) return;
    const arr = await getListValues(name);
    if (!arr.includes(value)) { arr.push(value); arr.sort((a, b) => a.localeCompare(b, 'fr')); await kvSet('list:' + name, arr); }
  }

  return {
    init, cache, setOnChange,
    getRegions, getDepartements, getCommunes, getLocalites, renalocLoaded, importRenalocRows,
    insertProjet, updateProjet, deleteProjet, renumberProjets, getProjet, getAllProjets, getAllPids,
    insertClient, updateClient, deleteClient, getClient, getAllClients,
    getComposantes, getComposante, insertComposante, updateComposante, deleteComposante,
    statsProjets, statsClients, statsClientsDetail, statsCharts, statsMenagesRegion,
    statsComposantes, getClientsCountByProjet, menagesCiblesTotal,
    getProjetsByPeriod, getClientsByPeriod, statsByPeriod,
    exportJSON, importJSON, resetAll,
    exportState, mergeRemote, syncGet, syncSet, adminGet, adminSet, adminTs, adminAll, adminApply,
    getListValues, addListValue,
  };
})();
