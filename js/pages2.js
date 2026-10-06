/* Pages ANPER SE (suite) : fiches, registres, composantes, rapports, SIG. */

function formSection(title) {
  const head = el('div.form-sec', {}, [el('span', { text: title })]);
  const grid = el('div.form-grid');
  return { head, grid };
}

// ═══════════════════════════════ FICHE PROJET ═══════════════════════════════
Pages.fiche_projet = function (editPid) {
  const root = el('div.page');
  const p = editPid ? DB.getProjet(editPid) : {};
  root.append(el('div.form-head', {}, [
    el('h1', { text: '📋 Fiche de saisie Projet' }),
    el('span.id-badge', { text: editPid ? 'ID : ' + editPid : 'ID : (auto-généré)' }),
  ]));

  const f = {};
  // Identification
  const s1 = formSection('📌 Identification du projet');
  f.nom = field('Nom du Projet', { required: true, value: p.nom });
  f.mo = field("Maître d'Ouvrage", { required: true, value: p.maitre_ouvrage });
  f.cp = new EditableCombo('Chef de Projet', 'chefsProjet', p.chef_projet, true);
  f.bailleur = new EditableCombo('Bailleur', 'bailleurs', p.bailleur, true);
  f.source = field('Source de Financement', { type: 'combo', options: SOURCES_FIN, value: p.source_financement });
  f.statut = field('Statut', { type: 'combo', options: STATUTS_PROJET, value: p.statut });
  f.techno = field('Technologie', { type: 'combo', options: TECHNOS, value: p.technologie });
  f.debut = field('Date Début (JJ/MM/AAAA)', { value: p.date_debut });
  f.fin = field('Date Fin Prévue (JJ/MM/AAAA)', { value: p.date_fin });
  [f.nom, f.mo, f.cp, f.bailleur, f.source, f.statut, f.techno, f.debut, f.fin].forEach(x => s1.grid.append(x.node));

  // Localisation cascade
  const s2 = formSection('📍 Localisation RENALOC');
  f.region = new MultiSelect('Région(s)', () => DB.getRegions(), () => { f.dept.clear(); f.commune.clear(); f.localite.clear(); }, true);
  f.dept = new MultiSelect('Département(s)', () => DB.getDepartements(f.region.getList()), () => { f.commune.clear(); f.localite.clear(); }, true);
  f.commune = new MultiSelect('Commune(s)', () => DB.getCommunes(f.dept.getList()), () => { f.localite.clear(); }, true);
  f.localite = new MultiSelect('Localité(s)', () => DB.getLocalites(f.commune.getList()), null, true);
  [f.region, f.dept, f.commune, f.localite].forEach(x => s2.grid.append(x.node));

  // Finances
  const s3 = formSection('💰 Données financières');
  f.budget = field('Budget Total (FCFA)', { type: 'number', value: p.budget_total });
  f.engage = field('Montant Engagé (FCFA)', { type: 'number', value: p.montant_engage });
  f.q1 = field('Décaissé T1 (FCFA)', { type: 'number', value: p.decaisse_q1 });
  f.q2 = field('Décaissé T2 (FCFA)', { type: 'number', value: p.decaisse_q2 });
  f.q3 = field('Décaissé T3 (FCFA)', { type: 'number', value: p.decaisse_q3 });
  f.q4 = field('Décaissé T4 (FCFA)', { type: 'number', value: p.decaisse_q4 });
  f.decaisse = field('Montant Décaissé total (FCFA) — auto', { type: 'number', value: p.montant_decaisse });
  f.decaisse.input.readOnly = true; f.decaisse.input.classList.add('field-computed');
  [f.budget, f.engage, f.q1, f.q2, f.q3, f.q4, f.decaisse].forEach(x => s3.grid.append(x.node));
  // Total décaissé = somme des trimestres saisis (recalcul auto)
  const recalcDec = () => {
    const q = ['q1', 'q2', 'q3', 'q4'].map(k => num(f[k].get()));
    if (q.some(v => v)) f.decaisse.set(String(Math.round(q.reduce((s, v) => s + v, 0))));
  };
  ['q1', 'q2', 'q3', 'q4'].forEach(k => { const inp = f[k].node.querySelector('input'); if (inp) inp.addEventListener('input', recalcDec); });

  // Indicateurs
  const s4 = formSection('📊 Indicateurs techniques & impact');
  f.villages = field('Nb Villages desservis', { type: 'number', value: p.nb_villages });
  f.menCib = field('Ménages Cibles', { type: 'number', value: p.nb_menages_cibles });
  f.menRac = field('Ménages Raccordés', { type: 'number', value: p.nb_menages_raccordes });
  f.emplois = field('Emplois Créés', { type: 'number', value: p.emplois_crees });
  f.co2 = field('CO₂ Évité (tCO₂)', { type: 'number', value: p.co2_evite });
  [f.villages, f.menCib, f.menRac, f.emplois, f.co2].forEach(x => s4.grid.append(x.node));

  // Observations
  const s5 = formSection('📝 Observations');
  f.obs = field('Observations / Commentaires', { type: 'text-area', value: p.observations });
  s5.grid.append(f.obs.node); s5.grid.classList.add('one-col');

  for (const s of [s1, s2, s3, s4, s5]) root.append(s.head, s.grid);
  if (editPid) { f.region.set(p.region); f.dept.set(p.departement); f.commune.set(p.commune); f.localite.set(p.localite); }

  const save = async () => {
    if (!f.nom.get()) return toast('Le nom du projet est obligatoire.', 'warn');
    if (!f.region.getList().length) return toast('Sélectionnez au moins une région.', 'warn');
    if (!f.dept.getList().length) return toast('Sélectionnez au moins un département.', 'warn');
    if (!f.commune.getList().length) return toast('Sélectionnez au moins une commune.', 'warn');
    if (!f.localite.getList().length) return toast('Sélectionnez au moins une localité.', 'warn');
    const data = {
      nom: f.nom.get(), maitre_ouvrage: f.mo.get(), chef_projet: f.cp.get(), bailleur: f.bailleur.get(),
      source_financement: f.source.get(), statut: f.statut.get(), technologie: f.techno.get(),
      date_debut: f.debut.get(), date_fin: f.fin.get(),
      region: f.region.get(), departement: f.dept.get(), commune: f.commune.get(), localite: f.localite.get(),
      budget_total: num(f.budget.get()), montant_engage: num(f.engage.get()), montant_decaisse: num(f.decaisse.get()),
      decaisse_q1: num(f.q1.get()), decaisse_q2: num(f.q2.get()), decaisse_q3: num(f.q3.get()), decaisse_q4: num(f.q4.get()),
      nb_villages: Math.round(num(f.villages.get())), nb_menages_cibles: Math.round(num(f.menCib.get())),
      nb_menages_raccordes: Math.round(num(f.menRac.get())), emplois_crees: Math.round(num(f.emplois.get())),
      co2_evite: num(f.co2.get()), observations: f.obs.get(),
    };
    await f.cp.persist(); await f.bailleur.persist();
    try {
      if (editPid) { await DB.updateProjet(editPid, data); toast('Projet ' + editPid + ' mis à jour ✔', 'ok'); navigate('registre_projets'); }
      else { const pid = await DB.insertProjet(data); toast(pid + ' enregistré ✔', 'ok'); navigate('registre_projets'); }
    } catch (e) { toast('Erreur : ' + e.message, 'err'); }
  };
  root.append(el('div.form-actions', {}, [
    el('button.btn.btn-primary', { text: '✔ Enregistrer le projet', onclick: save }),
    el('button.btn.btn-ghost', { text: '◀ Menu', onclick: () => navigate('dashboard') }),
  ]));
  return root;
};

// ═══════════════════════════════ FICHE CLIENT ═══════════════════════════════
Pages.fiche_client = function (editCid) {
  const root = el('div.page');
  const c = editCid ? DB.getClient(editCid) : {};
  root.append(el('div.form-head', {}, [
    el('h1', { text: "👤 Fiche d'enregistrement Client" }),
    el('span.id-badge', { text: editCid ? 'ID : ' + editCid : 'ID : (auto-généré)' }),
  ]));
  const f = {};
  const s1 = formSection('👤 Identification du client');
  f.nom = field('Nom & Prénoms', { required: true, value: c.nom_prenoms });
  f.type = field('Type de Client', { type: 'combo', options: TYPES_CLIENT, value: c.type_client });
  f.genre = field('Genre', { type: 'combo', options: GENRES, value: c.genre });
  f.tel = field('Téléphone', { value: c.telephone });
  f.cni = field('N° CNI', { value: c.cni });
  f.dn = field('Date de Naissance (JJ/MM/AAAA)', { value: c.date_naissance });
  [f.nom, f.type, f.genre, f.tel, f.cni, f.dn].forEach(x => s1.grid.append(x.node));
  // Genre pertinent uniquement pour un client « Ménage »
  const syncGenre = () => {
    const isMenage = f.type.get() === 'Ménage';
    f.genre.node.style.display = isMenage ? '' : 'none';
    if (!isMenage) f.genre.clear();
  };
  f.type.input.addEventListener('change', syncGenre);
  syncGenre();

  const s2 = formSection('📍 Localisation RENALOC');
  const parseList = s => new Set(String(s || '').split(/[,;/]/).map(x => x.trim()).filter(Boolean));
  let projFilter = null; // {region,departement,commune,localite} Sets — restreint aux localités du projet raccordé
  f.region = new MultiSelect('Région(s)', () => { const a = DB.getRegions(); return projFilter ? a.filter(x => projFilter.region.has(x)) : a; }, () => { f.dept.clear(); f.commune.clear(); f.localite.clear(); }, true);
  f.dept = new MultiSelect('Département(s)', () => { const a = DB.getDepartements(f.region.getList()); return projFilter ? a.filter(x => projFilter.departement.has(x)) : a; }, () => { f.commune.clear(); f.localite.clear(); }, true);
  f.commune = new MultiSelect('Commune(s)', () => { const a = DB.getCommunes(f.dept.getList()); return projFilter ? a.filter(x => projFilter.commune.has(x)) : a; }, () => { f.localite.clear(); }, true);
  f.localite = new MultiSelect('Localité(s)', () => { const a = DB.getLocalites(f.commune.getList()); return projFilter ? a.filter(x => projFilter.localite.has(x)) : a; }, null, true);
  f.lat = field('Latitude (si non disponible)', { type: 'number', value: c.latitude });
  f.lon = field('Longitude (si non disponible)', { type: 'number', value: c.longitude });
  [f.region, f.dept, f.commune, f.localite].forEach(x => s2.grid.append(x.node));
  s2.grid.append(f.lat.node, f.lon.node);

  const s3 = formSection('⚡ Raccordement');
  const pids = DB.getAllPids().map(p => `${p.pid} — ${p.nom}`);
  f.projet = field('Projet Raccordé', { type: 'combo', options: pids });
  f.dateRac = field('Date Raccordement (JJ/MM/AAAA)', { value: c.date_raccordement });
  f.compteur = field('Type Compteur', { type: 'combo', options: TYPES_COMPTEUR, value: c.type_compteur });
  f.puissance = field('Puissance (W)', { type: 'number', value: c.puissance });
  [f.projet, f.dateRac, f.compteur, f.puissance].forEach(x => s3.grid.append(x.node));
  // Filtre les localités sélectionnables sur celles du projet raccordé choisi
  const syncProjFilter = () => {
    const val = f.projet.get();
    const pid = val.includes(' — ') ? val.split(' — ')[0].trim() : val;
    const p = pid ? DB.getProjet(pid) : null;
    if (p) {
      projFilter = { region: parseList(p.region), departement: parseList(p.departement), commune: parseList(p.commune), localite: parseList(p.localite) };
      if (!f.region.getList().length) f.region.set(p.region);
      if (!f.dept.getList().length) f.dept.set(p.departement);
      if (!f.commune.getList().length) f.commune.set(p.commune);
      if (!f.localite.getList().length) f.localite.set(p.localite);
    } else projFilter = null;
  };
  f.projet.input.addEventListener('change', syncProjFilter);

  const s4 = formSection('💳 Données financières');
  f.revenus = field('Revenus Mensuels (FCFA)', { type: 'number', value: c.revenus });
  f.statutP = field('Statut Paiement', { type: 'combo', options: STATUTS_PAIEMENT, value: c.statut_paiement });
  f.conso = field('Consommation (kWh)', { type: 'number', value: c.consommation });
  f.solde = field('Solde Compteur (FCFA)', { type: 'number', value: c.solde });
  [f.revenus, f.statutP, f.conso, f.solde].forEach(x => s4.grid.append(x.node));
  // Le libellé du solde s'adapte au type de compteur choisi
  const syncSoldeLabel = () => {
    const t = f.compteur.get();
    const lbl = t === 'Prépayé' ? 'Crédit restant (FCFA)' : t === 'Postpayé' ? 'Montant dû / Impayé (FCFA)' : 'Solde Compteur (FCFA)';
    const lblNode = f.solde.node.querySelector('.field-lbl');
    if (lblNode) lblNode.textContent = lbl;
  };
  f.compteur.input.addEventListener('change', syncSoldeLabel);
  syncSoldeLabel();

  const s5 = formSection('📝 Observations');
  f.obs = field('Observations', { type: 'text-area', value: c.observations });
  s5.grid.append(f.obs.node); s5.grid.classList.add('one-col');

  for (const s of [s1, s2, s3, s4, s5]) root.append(s.head, s.grid);
  if (editCid) {
    f.region.set(c.region); f.dept.set(c.departement); f.commune.set(c.commune); f.localite.set(c.localite);
    const lbl = pids.find(x => x.startsWith((c.projet_raccorde || '') + ' ')) || c.projet_raccorde || '';
    f.projet.set(lbl);
    if (lbl) syncProjFilter();
  }

  const save = async () => {
    if (!f.nom.get()) return toast('Le nom & prénoms est obligatoire.', 'warn');
    if (!f.region.getList().length) return toast('Sélectionnez au moins une région.', 'warn');
    if (!f.dept.getList().length) return toast('Sélectionnez au moins un département.', 'warn');
    if (!f.commune.getList().length) return toast('Sélectionnez au moins une commune.', 'warn');
    if (!f.localite.getList().length) return toast('Sélectionnez au moins une localité.', 'warn');
    const proj = f.projet.get().includes(' — ') ? f.projet.get().split(' — ')[0].trim() : f.projet.get();
    const data = {
      nom_prenoms: f.nom.get(), type_client: f.type.get(), genre: f.genre.get(), telephone: f.tel.get(),
      cni: f.cni.get(), date_naissance: f.dn.get(), region: f.region.get(), departement: f.dept.get(),
      commune: f.commune.get(), localite: f.localite.get(),
      latitude: f.lat.get() ? num(f.lat.get()) : null, longitude: f.lon.get() ? num(f.lon.get()) : null,
      projet_raccorde: proj, date_raccordement: f.dateRac.get(), type_compteur: f.compteur.get(),
      puissance: Math.round(num(f.puissance.get())), revenus: num(f.revenus.get()), statut_paiement: f.statutP.get(),
      consommation: num(f.conso.get()), solde: num(f.solde.get()), observations: f.obs.get(),
    };
    try {
      if (editCid) { await DB.updateClient(editCid, data); toast('Client ' + editCid + ' mis à jour ✔', 'ok'); navigate('registre_clients'); }
      else { const cid = await DB.insertClient(data); toast(cid + ' enregistré ✔', 'ok'); navigate('registre_clients'); }
    } catch (e) { toast('Erreur : ' + e.message, 'err'); }
  };
  root.append(el('div.form-actions', {}, [
    el('button.btn.btn-primary', { text: '✔ Enregistrer le client', onclick: save }),
    el('button.btn.btn-ghost', { text: '◀ Menu', onclick: () => navigate('dashboard') }),
  ]));
  return root;
};

// ── Table réutilisable ────────────────────────────────────────────────────────
function dataTable(cols, rows, rowActions, opts = {}) {
  const wrap = el('div.table-wrap');
  const t = el('table.tbl');
  // opts.freeze2 : colonnes 1 et 2 figées au défilement horizontal
  if (opts.freeze2) { t.classList.add('tbl-freeze2'); wrap.classList.add('table-scroll'); }
  const thead = el('tr');
  for (const c of cols) thead.append(el('th', { text: c.label }));
  if (rowActions) thead.append(el('th', { text: '' }));
  t.append(el('thead', {}, [thead]));
  const tb = el('tbody');
  if (!rows.length) {
    tb.append(el('tr', {}, [el('td', { colspan: cols.length + (rowActions ? 1 : 0), text: 'Aucune donnée.', class: 'muted', style: { textAlign: 'center', padding: '24px' } })]));
  }
  for (const r of rows) {
    const tr = el('tr');
    for (const c of cols) tr.append(c.render ? el('td', {}, [c.render(r)]) : el('td', { text: r[c.key] == null ? '' : String(r[c.key]) }));
    if (rowActions) tr.append(el('td.row-actions', {}, rowActions(r)));
    tb.append(tr);
  }
  t.append(tb); wrap.append(t);
  return wrap;
}
function chip(text, sty) { return el('span.chip', { text, style: sty || {} }); }
// Champs région/département/commune/localité = listes séparées par virgule/point-virgule/slash
// (souvent longues, ex. 47 localités BOAD) : aperçu tronqué + liste complète au survol.
function listCell(val) {
  const items = String(val || '').split(/[,;/]/).map(s => s.trim()).filter(Boolean);
  if (!items.length) return el('span.muted', { text: '—' });
  const full = items.join(', ');
  const preview = items.length > 3 ? `${items.length} — ${items.slice(0, 2).join(', ')}…` : full;
  return el('span', { text: preview, title: full, style: {
    display: 'inline-block', maxWidth: '180px', whiteSpace: 'nowrap',
    overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'bottom',
  } });
}

// ═══════════════════════════════ REGISTRE PROJETS ═══════════════════════════════
Pages.registre_projets = function () {
  const root = el('div.page');
  const search = el('input.search', { placeholder: '🔍 Rechercher (nom, région, statut, bailleur…)' });
  root.append(el('div.page-head', {}, [
    el('h1', { text: '📊 Registre des Projets' }),
    el('div', { style: { display: 'flex', gap: '8px' } }, [
      el('button.btn.btn-ghost', { text: '🔢 Renuméroter', title: 'Numérotation continue après une suppression', onclick: () => renumber() }),
      el('button.btn.btn-primary', { text: '＋ Nouveau projet', onclick: () => navigate('fiche_projet') }),
    ]),
  ]));
  const host = el('div');
  // Supprime les trous de numérotation (ex. après suppression d'ANPER-016)
  const renumber = async () => {
    const plan = await DB.renumberProjets(false);
    if (!plan.length) { toast('Numérotation déjà continue', 'ok'); return; }
    const txt = plan.map(([a, b]) => a + ' → ' + b).join(', ');
    if (!await confirmDialog('Renuméroter les projets', `${txt}. Les composantes et les clients rattachés suivent. Continuer ?`)) return;
    await DB.renumberProjets(true); toast(plan.length + ' projet(s) renuméroté(s) ✔', 'ok'); render();
  };
  const render = () => {
    host.innerHTML = '';
    // Ordre croissant de numérotation (ANPER-001, ANPER-002…)
    const rows = DB.getAllProjets(search.value.trim())
      .sort((a, b) => String(a.pid || '').localeCompare(String(b.pid || ''), 'fr', { numeric: true }));
    host.append(el('p.muted', { text: rows.length + ' projet(s)' }));
    host.append(dataTable([
      { key: 'pid', label: 'ID' },
      { key: 'nom', label: 'Nom' },
      { key: 'region', label: 'Région' },
      { label: 'Départements', render: r => listCell(r.departement) },
      { label: 'Communes', render: r => listCell(r.commune) },
      { label: 'Localités', render: r => listCell(r.localite) },
      { key: 'technologie', label: 'Techno' },
      { label: 'Statut', render: r => { const s = STATUT_COLORS[r.statut]; return s ? chip(r.statut, { background: s.bg, color: s.fg }) : el('span', { text: r.statut || '' }); } },
      { label: 'Budget (FCFA)', render: r => el('span', { text: nf(Math.round(r.budget_total || 0)) }) },
      { label: 'Décaissé', render: r => el('span', { text: nf(Math.round(r.montant_decaisse || 0)) }) },
      { key: 'nb_menages_raccordes', label: 'Ménages' },
    ], rows, r => [
      el('button.ico-btn', { title: 'Modifier', text: '✏️', onclick: () => navigate('fiche_projet', r.pid) }),
      el('button.ico-btn', { title: 'Supprimer', text: '🗑️', onclick: async () => {
        if (await confirmDialog('Supprimer', `Supprimer ${r.pid} — « ${r.nom} » et ses composantes ?`)) { await DB.deleteProjet(r.pid); const pl = await DB.renumberProjets(true); toast('Projet supprimé' + (pl.length ? ' — ' + pl.length + ' projet(s) renuméroté(s)' : ''), 'ok'); render(); }
      } }),
    ], { freeze2: true }));
  };
  search.addEventListener('input', render);
  root.append(search, host);
  root._onMount = render;
  return root;
};

// ═══════════════════════════════ REGISTRE CLIENTS ═══════════════════════════════
Pages.registre_clients = function () {
  const root = el('div.page');
  const search = el('input.search', { placeholder: '🔍 Rechercher (nom, région, projet, paiement…)' });
  root.append(el('div.page-head', {}, [
    el('h1', { text: '👥 Registre des Clients' }),
    el('button.btn.btn-primary', { text: '＋ Nouveau client', onclick: () => navigate('fiche_client') }),
  ]));
  const host = el('div');
  const payColor = { 'À jour': { bg: '#DCFCE7', fg: '#166534' }, 'Retard 1 mois': { bg: '#FEF3C7', fg: '#92400E' }, 'En défaut': { bg: '#FEE2E2', fg: '#991B1B' } };
  const render = () => {
    host.innerHTML = '';
    const rows = DB.getAllClients(search.value.trim());
    host.append(el('p.muted', { text: rows.length + ' client(s)' }));
    host.append(dataTable([
      { key: 'cid', label: 'ID' },
      { key: 'nom_prenoms', label: 'Nom & Prénoms' },
      { key: 'type_client', label: 'Type' },
      { key: 'genre', label: 'Genre' },
      { key: 'region', label: 'Région' },
      { key: 'projet_raccorde', label: 'Projet' },
      { label: 'Paiement', render: r => { const s = payColor[r.statut_paiement]; return s ? chip(r.statut_paiement, { background: s.bg, color: s.fg }) : el('span', { text: r.statut_paiement || '' }); } },
      { label: 'Conso (kWh)', render: r => el('span', { text: nf(r.consommation || 0) }) },
    ], rows, r => [
      el('button.ico-btn', { title: 'Modifier', text: '✏️', onclick: () => navigate('fiche_client', r.cid) }),
      el('button.ico-btn', { title: 'Supprimer', text: '🗑️', onclick: async () => {
        if (await confirmDialog('Supprimer', `Supprimer ${r.cid} — « ${r.nom_prenoms} » ?`)) { await DB.deleteClient(r.cid); toast('Client supprimé', 'ok'); render(); }
      } }),
    ]));
  };
  search.addEventListener('input', render);
  root.append(search, host);
  root._onMount = render;
  return root;
};

// ═══════════════════════════════ COMPOSANTES ═══════════════════════════════
Pages.registre_composantes = function () {
  const root = el('div.page');
  root.append(el('div.page-head', {}, [el('h1', { text: '🔧 Composantes & Activités' })]));
  const pids = DB.getAllPids();
  const selProj = el('select.field-in', { style: { maxWidth: '460px' } });
  selProj.append(el('option', { value: '', text: 'Tous les projets' }));
  for (const p of pids) selProj.append(el('option', { value: p.pid, text: `${p.pid} — ${p.nom}` }));
  const search = el('input.search', { placeholder: '🔍 Filtrer (libellé, numéro…)' });
  const addBtn = el('button.btn.btn-primary', { text: '＋ Nouvelle composante', onclick: () => editComp(null) });
  const host = el('div');

  const typeChip = t => chip({ C: 'Composante', A: 'Activité', SA: 'Sous-activité' }[t] || t,
    { background: { C: '#DBEAFE', A: '#DCFCE7', SA: '#FEF3C7' }[t], color: { C: '#1E40AF', A: '#166534', SA: '#92400E' }[t] });

  const DEPTH = { C: 0, A: 1, SA: 2 };
  const render = () => {
    host.innerHTML = '';
    const rows = DB.getComposantes(selProj.value, search.value.trim());
    const st = DB.statsComposantes(selProj.value);
    host.append(el('p.muted', { text: `${st.total} ligne(s) — ${st.C} composantes · ${st.A} activités · ${st.SA} sous-activités` }));

    const wrap = el('div.table-wrap');
    const t = el('table.tbl.comp-tree');
    const cols = ['Type', 'N°', 'Libellé', 'Responsable', 'Statut', 'Avancement', ''];
    t.append(el('thead', {}, [el('tr', {}, cols.map(c => el('th', { text: c })))]));
    const tb = el('tbody');
    if (!rows.length) tb.append(el('tr', {}, [el('td', { colspan: cols.length, text: 'Aucune donnée.', class: 'muted', style: { textAlign: 'center', padding: '24px' } })]));

    const showProjHead = !selProj.value;   // « Tous les projets » → séparateurs de projet
    let curPid = null;
    for (const r of rows) {
      if (showProjHead && r.pid !== curPid) {
        curPid = r.pid;
        tb.append(el('tr.comp-projhead', {}, [el('td', { colspan: cols.length, text: `📁 ${r.pid} — ${r.nom_projet || ''}` })]));
      }
      const depth = DEPTH[r.type] || 0;
      const connector = depth ? (r.type === 'SA' ? '└─ ' : '├─ ') : '';
      const lib = el('td.comp-lib', { style: { paddingLeft: (12 + depth * 26) + 'px' } }, [
        depth ? el('span.comp-tree-b', { text: connector }) : null,
        el('span', { text: (r.libelle || '').trim() }),
      ].filter(Boolean));
      const tr = el('tr.comp-row.cl-' + r.type, {}, [
        el('td', {}, [typeChip(r.type)]),
        el('td', { text: r.numero || '' }),
        lib,
        el('td', { text: r.responsable || '' }),
        el('td', { text: r.statut || '' }),
        el('td', { text: r.avancement == null ? '—' : `${Math.round(r.avancement * 100)}%` }),
        el('td.row-actions', {}, [
          el('button.ico-btn', { title: 'Modifier', text: '✏️', onclick: () => editComp(r) }),
          el('button.ico-btn', { title: 'Supprimer', text: '🗑️', onclick: async () => {
            if (await confirmDialog('Supprimer', `Supprimer « ${r.numero} ${r.libelle} » ?`)) { await DB.deleteComposante(r.id); toast('Supprimé', 'ok'); render(); }
          } }),
        ]),
      ]);
      tb.append(tr);
    }
    t.append(tb); wrap.append(t); host.append(wrap);
  };

  const editComp = (rec) => {
    const isEdit = !!rec; rec = rec || {};
    const fPid = field('Projet', { type: 'combo', options: pids.map(p => p.pid), value: rec.pid || selProj.value });
    const fType = field('Type', { type: 'combo', options: ['C', 'A', 'SA'], value: rec.type });
    const fNum = field('Numéro (ex: C1, A1.2)', { value: rec.numero });
    const fLib = field('Libellé', { required: true, value: rec.libelle });
    const fResp = field('Responsable', { value: rec.responsable });
    const fDeb = field('Date début', { value: rec.date_debut });
    const fFin = field('Date fin', { value: rec.date_fin });
    const fStat = field('Statut', { type: 'combo', options: STATUTS_PROJET, value: rec.statut });
    const fAvanc = field('Avancement (%)', { type: 'number', value: rec.avancement == null ? '' : Math.round(rec.avancement * 100) });
    const body = el('div.form-grid', {}, [fPid, fType, fNum, fLib, fResp, fDeb, fFin, fStat, fAvanc].map(x => x.node));
    modal(isEdit ? 'Modifier la composante' : 'Nouvelle composante', body, [
      { text: 'Annuler', kind: 'ghost', value: false },
      { text: 'Enregistrer', kind: 'primary', onClick: async () => {
        if (!fPid.get()) { toast('Choisissez un projet.', 'warn'); return false; }
        if (!fLib.get()) { toast('Le libellé est obligatoire.', 'warn'); return false; }
        const avancPct = fAvanc.get();
        const data = { pid: fPid.get(), type: fType.get() || 'C', numero: fNum.get(), libelle: fLib.get(),
          responsable: fResp.get(), date_debut: fDeb.get(), date_fin: fFin.get(), statut: fStat.get(),
          avancement: (avancPct === '' || avancPct == null) ? null : Number(avancPct) / 100 };
        if (isEdit) await DB.updateComposante(rec.id, data); else await DB.insertComposante(data);
        toast('Enregistré ✔', 'ok'); render();
      } },
    ]);
  };

  selProj.addEventListener('change', render);
  search.addEventListener('input', render);
  root.append(el('div.toolbar', {}, [selProj, search, addBtn]), host);
  root._onMount = render;
  return root;
};

// ═══════════════════════════════ RAPPORTS ═══════════════════════════════
function downloadFile(name, content, type = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name }); document.body.append(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
}
function toCSV(rows, cols) {
  const esc = v => { v = v == null ? '' : String(v); return /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const head = cols.map(c => esc(c.label)).join(';');
  const body = rows.map(r => cols.map(c => esc(r[c.key])).join(';')).join('\n');
  return '﻿' + head + '\n' + body; // BOM pour Excel
}

Pages.rapports = function () {
  const root = el('div.page');
  root.append(el('div.page-head', {}, [el('h1', { text: '📑 Rapports & Exports' })]));
  const card = (icon, title, desc, btns) => el('div.rep-card', {}, [
    el('div.rep-ico', { text: icon }),
    el('div', {}, [el('h3', { text: title }), el('p.muted', { text: desc }),
      el('div.rep-btns', {}, btns)]),
  ]);
  const grid = el('div.grid-rep');

  grid.append(card('📊', 'Export Projets (CSV/Excel)', 'Tableau complet des projets, ouvrable dans Excel.', [
    el('button.btn.btn-primary', { text: 'Télécharger CSV', onclick: () => {
      const cols = [['pid','ID'],['nom','Nom'],['maitre_ouvrage','Maître ouvrage'],['chef_projet','Chef'],['bailleur','Bailleur'],['source_financement','Source'],['statut','Statut'],['technologie','Techno'],['region','Région'],['departement','Département'],['commune','Commune'],['localite','Localité'],['date_debut','Début'],['date_fin','Fin'],['budget_total','Budget'],['montant_engage','Engagé'],['montant_decaisse','Décaissé'],['nb_villages','Villages'],['nb_menages_cibles','Ménages cibles'],['nb_menages_raccordes','Ménages raccordés'],['emplois_crees','Emplois'],['co2_evite','CO2'],['observations','Obs']].map(([key,label])=>({key,label}));
      downloadFile('ANPER_projets.csv', toCSV(DB.getAllProjets(), cols), 'text/csv'); toast('Export projets ✔', 'ok');
    } }),
  ]));
  grid.append(card('👥', 'Export Clients (CSV/Excel)', 'Tableau complet des clients raccordés.', [
    el('button.btn.btn-primary', { text: 'Télécharger CSV', onclick: () => {
      const cols = [['cid','ID'],['nom_prenoms','Nom & Prénoms'],['type_client','Type'],['genre','Genre'],['telephone','Tél'],['cni','CNI'],['region','Région'],['departement','Département'],['commune','Commune'],['localite','Localité'],['milieu','Milieu'],['projet_raccorde','Projet'],['date_raccordement','Date racc.'],['type_compteur','Compteur'],['puissance','Puissance'],['revenus','Revenus'],['statut_paiement','Paiement'],['consommation','Conso'],['solde','Solde']].map(([key,label])=>({key,label}));
      downloadFile('ANPER_clients.csv', toCSV(DB.getAllClients(), cols), 'text/csv'); toast('Export clients ✔', 'ok');
    } }),
  ]));
  grid.append(card('🔧', 'Export Composantes (CSV)', 'Cadre logique : composantes, activités, sous-activités.', [
    el('button.btn.btn-primary', { text: 'Télécharger CSV', onclick: () => {
      const cols = [['pid','Projet'],['type','Type'],['numero','N°'],['libelle','Libellé'],['responsable','Responsable'],['date_debut','Début'],['date_fin','Fin'],['statut','Statut']].map(([key,label])=>({key,label}));
      downloadFile('ANPER_composantes.csv', toCSV(DB.getComposantes(), cols), 'text/csv'); toast('Export composantes ✔', 'ok');
    } }),
  ]));
  grid.append(card('🖨️', 'Rapport de synthèse (Word / PDF)', 'Rapport complet et structuré (toutes les données) : page de garde, table des matières, figures, tableaux, analyses. Modifiable, export Word ou PDF.', [
    el('button.btn.btn-primary', { text: 'Générer le rapport', onclick: printReport }),
  ]));
  // ── Rapport périodique : mensuel / trimestriel / annuel ──
  {
    const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    const rType = el('select.field-in', { style: { maxWidth: '150px' } });
    ['Mensuel', 'Trimestriel', 'Annuel'].forEach(t => rType.append(el('option', { value: t, text: t })));
    const rYear = el('select.field-in', { style: { maxWidth: '110px' } });
    const nowY = new Date().getFullYear(); for (let y = nowY; y >= nowY - 4; y--) rYear.append(el('option', { value: y, text: y }));
    const rSub = el('select.field-in', { style: { maxWidth: '150px' } });
    const fillSub = () => {
      rSub.innerHTML = ''; const t = rType.value;
      if (t === 'Mensuel') { rSub.style.display = ''; MOIS.forEach((m, i) => rSub.append(el('option', { value: i + 1, text: m }))); rSub.value = new Date().getMonth() + 1; }
      else if (t === 'Trimestriel') { rSub.style.display = ''; [1, 2, 3, 4].forEach(q => rSub.append(el('option', { value: q, text: 'Trimestre ' + q }))); rSub.value = Math.floor(new Date().getMonth() / 3) + 1; }
      else { rSub.style.display = 'none'; }
    };
    rType.addEventListener('change', fillSub); fillSub();
    grid.append(el('div.rep-card', {}, [
      el('div.rep-ico', { text: '📅' }),
      el('div', {}, [
        el('h3', { text: 'Rapport périodique (mensuel / trimestriel / annuel)' }),
        el('p.muted', { text: 'Rapport imprimable de la période choisie : activité de la période + situation cumulée.' }),
        el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '8px 0 10px' } }, [rType, rYear, rSub]),
        el('div.rep-btns', {}, [el('button.btn.btn-primary', { text: '📄 Générer le rapport', onclick: () => printPeriodReport(rType.value, +rYear.value, rSub.value) })]),
      ]),
    ]));
  }
  grid.append(card('💾', 'Sauvegarde complète (JSON)', 'Exporte toutes les données (projets, clients, composantes, RENALOC) pour transfert ou sauvegarde.', [
    el('button.btn.btn-primary', { text: 'Exporter la sauvegarde', onclick: () => { downloadFile('ANPER_sauvegarde_' + Date.now() + '.json', DB.exportJSON(), 'application/json'); toast('Sauvegarde exportée ✔', 'ok'); } }),
    el('button.btn.btn-ghost', { text: 'Restaurer une sauvegarde', onclick: importBackup }),
  ]));
  grid.append(card('🤝', 'Partage en équipe (sans compte)', 'Échangez les données via un dossier OneDrive partagé : exportez votre fichier, déposez-le dans le dossier ; chacun fusionne les fichiers reçus (fusion par fiche, sans écrasement).', [
    el('button.btn.btn-primary', { text: '📤 Exporter pour partage', onclick: () => {
      const st = DB.exportState(); delete st.renaloc; // léger : pas de RENALOC
      const who = (localStorage.getItem('anper_user') || 'moi').replace(/[^\w-]/g, '');
      downloadFile(`ANPER_partage_${who}_${Date.now()}.json`, JSON.stringify(st), 'application/json');
      toast('Fichier de partage exporté ✔', 'ok');
    } }),
    el('button.btn.btn-ghost', { text: '🔀 Fusionner un fichier reçu', onclick: mergeBackup }),
  ]));
  root.append(grid);
  return root;
};

async function mergeBackup() {
  const inp = el('input', { type: 'file', accept: '.json', multiple: true });
  inp.addEventListener('change', async () => {
    if (!inp.files.length) return;
    let nb = 0;
    try {
      for (const file of inp.files) {
        const obj = JSON.parse(await file.text());
        await DB.mergeRemote(obj); nb++;
      }
      toast(`${nb} fichier(s) fusionné(s) ✔ — données combinées sans perte.`, 'ok', 4500);
      navigate('dashboard');
    } catch (e) { toast('Fichier invalide : ' + e.message, 'err', 6000); }
  });
  inp.click();
}

async function importBackup() {
  const inp = el('input', { type: 'file', accept: '.json' });
  inp.addEventListener('change', async () => {
    const file = inp.files[0]; if (!file) return;
    try {
      const obj = JSON.parse(await file.text());
      if (!await confirmDialog('Restaurer', 'Ceci remplacera les données actuelles. Continuer ?')) return;
      await DB.importJSON(obj, { replaceRenaloc: true });
      toast('Sauvegarde restaurée ✔', 'ok'); navigate('dashboard');
    } catch (e) { toast('Fichier invalide : ' + e.message, 'err'); }
  });
  inp.click();
}

function printPeriodReport(type, year, sub) {
  const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  let a, b, label;
  const typeLbl = type === 'Synthèse' ? 'de synthèse' : type.toLowerCase();
  const coverTtl = type === 'Synthèse' ? 'RAPPORT DE SYNTHÈSE' : 'RAPPORT ' + type.toUpperCase();
  if (type === 'Synthèse') { a = new Date(2000, 0, 1); b = new Date(2100, 0, 1); label = 'Situation générale arrêtée au ' + new Date().toLocaleDateString('fr-FR'); }
  else if (type === 'Annuel') { a = new Date(year, 0, 1); b = new Date(year, 11, 31, 23, 59, 59); label = 'Année ' + year; }
  else if (type === 'Trimestriel') { const q = +sub || 1; const m0 = (q - 1) * 3; a = new Date(year, m0, 1); b = new Date(year, m0 + 3, 0, 23, 59, 59); label = 'Trimestre ' + q + ' — ' + year; }
  else { const m = +sub || 1; a = new Date(year, m - 1, 1); b = new Date(year, m, 0, 23, 59, 59); label = MOIS[m - 1] + ' ' + year; }
  const pd = s => { if (!s) return null; s = String(s).trim(); let m; if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return new Date(+m[1], +m[2] - 1, +m[3]); if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return new Date(+m[3], +m[2] - 1, +m[1]); const d = new Date(s); return isNaN(d) ? null : d; };
  const inR = s => { const d = pd(s); return d && d >= a && d <= b; };

  // ── Données ──
  const projs = DB.getAllProjets(), clis = DB.getAllClients(), comps = DB.getComposantes();
  const sp = DB.statsProjets(), sc = DB.statsClients(), cd = DB.statsClientsDetail();
  const mr = DB.statsMenagesRegion(), ch = DB.statsCharts(), kc = DB.statsComposantes(), mc = DB.menagesCiblesTotal();
  const pP = projs.filter(p => inR(p.date_debut));
  const cP = clis.filter(c => inR(c.date_raccordement));
  const kP = comps.filter(k => inR(k.date_fin));
  const budgetP = pP.reduce((s, p) => s + (+p.budget_total || 0), 0);
  const decP = pP.reduce((s, p) => s + (+p.montant_decaisse || 0), 0);
  const menP = cP.filter(c => /m[eé]nage/i.test(c.type_client || '')).length;
  const puisP = cP.reduce((s, c) => s + (+c.puissance || 0), 0);
  const kTerm = kP.filter(k => k.statut === 'Terminé').length;
  const tDec = sp.budget ? (sp.decaisse / sp.budget * 100).toFixed(1) : '0';
  const tRac = mc ? (sp.menages / mc * 100).toFixed(1) : '0';
  const tRec = cd.total ? (cd.a_jour / cd.total * 100).toFixed(1) : '0';
  const coutMen = sp.menages ? Math.round(sp.budget / sp.menages) : 0;

  // ── Graphiques → images (canvas) ──
  const COLORS = ['#157C3D', '#2563EB', '#E67E22', '#7C3AED', '#DC2626', '#0891B2', '#CA8A04', '#64748B'];
  function barURL(rows, color) {
    const W = 620, H = 300, pad = 48, sc2 = 2; const cv = document.createElement('canvas'); cv.width = W * sc2; cv.height = H * sc2;
    const x = cv.getContext('2d'); x.scale(sc2, sc2); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
    const max = Math.max(1, ...rows.map(r => r.val)), n = rows.length || 1, slot = (W - 2 * pad) / n, bw = slot * 0.6;
    x.strokeStyle = '#cbd5e1'; x.beginPath(); x.moveTo(pad, H - pad); x.lineTo(W - pad, H - pad); x.stroke();
    rows.forEach((r, i) => {
      const bx = pad + i * slot + slot * 0.2, h = (r.val / max) * (H - 2 * pad - 10), by = H - pad - h;
      x.fillStyle = color; x.fillRect(bx, by, bw, h);
      x.fillStyle = '#0F172A'; x.font = '10px Segoe UI'; x.textAlign = 'center'; x.fillText(nf(r.val), bx + bw / 2, by - 4);
      x.save(); x.translate(bx + bw / 2, H - pad + 6); x.rotate(-Math.PI / 6); x.textAlign = 'right'; x.font = '9px Segoe UI'; x.fillStyle = '#334155'; x.fillText(String(r.label || '').slice(0, 16), 0, 6); x.restore();
    });
    return cv.toDataURL('image/png');
  }
  function donutURL(rows) {
    const W = 600, H = 300, sc2 = 2; const cv = document.createElement('canvas'); cv.width = W * sc2; cv.height = H * sc2;
    const x = cv.getContext('2d'); x.scale(sc2, sc2); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
    const cx = 150, cy = 150, r = 110, ri = 58, tot = rows.reduce((s, v) => s + v.val, 0) || 1; let ang = -Math.PI / 2;
    rows.forEach((row, i) => { const a2 = row.val / tot * 2 * Math.PI; x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, r, ang, ang + a2); x.closePath(); x.fillStyle = COLORS[i % COLORS.length]; x.fill(); ang += a2; });
    x.beginPath(); x.arc(cx, cy, ri, 0, 2 * Math.PI); x.fillStyle = '#fff'; x.fill();
    let ly = 46; x.font = '12px Segoe UI'; x.textAlign = 'left';
    rows.forEach((row, i) => { x.fillStyle = COLORS[i % COLORS.length]; x.fillRect(300, ly, 14, 14); x.fillStyle = '#0F172A'; x.fillText(String(row.label || '') + ' : ' + nf(row.val) + ' (' + Math.round(row.val / tot * 100) + '%)', 320, ly + 12); ly += 26; });
    return cv.toDataURL('image/png');
  }

  // ── Compteurs figures / tableaux ──
  let nT = 0, nF = 0; const listeT = [], listeF = [];
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function tbl(cap, headers, rows) {
    nT++; listeT.push([nT, cap]);
    const head = '<tr>' + headers.map((h, i) => '<th' + (i ? ' style="text-align:right"' : '') + '>' + esc(h) + '</th>').join('') + '</tr>';
    const body = rows.map(r => '<tr>' + r.map((c, i) => '<td' + (i ? ' style="text-align:right"' : '') + '>' + (c == null ? '' : c) + '</td>').join('') + '</tr>').join('');
    return '<p class="cap">Tableau ' + nT + ' — ' + esc(cap) + '</p><table><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
  }
  function fig(cap, url) { nF++; listeF.push([nF, cap]); return '<div class="figw"><img src="' + url + '"><p class="cap">Figure ' + nF + ' — ' + esc(cap) + '</p></div>'; }

  // Carte schématique du Niger (bulles par région) → image
  function mapURL() {
    const O = [[0.16, 14.55], [0.60, 14.22], [0.90, 14.95], [1.56, 15.30], [3.50, 15.40], [4.20, 16.40], [4.23, 19.15], [5.83, 19.45], [7.48, 20.87], [10.03, 22.52], [13.00, 23.00], [15.00, 23.20], [15.90, 21.35], [15.55, 19.00], [13.40, 15.62], [13.90, 13.35], [13.62, 13.32], [12.40, 13.30], [10.50, 13.35], [9.00, 12.86], [7.80, 13.35], [6.90, 13.00], [3.65, 13.70], [3.60, 11.90], [2.40, 11.90], [0.90, 12.30], [0.16, 14.55]];
    const W = 640, H = 380, sc2 = 2, pad = 22; const cv = document.createElement('canvas'); cv.width = W * sc2; cv.height = H * sc2; const x = cv.getContext('2d'); x.scale(sc2, sc2); x.fillStyle = '#EAF2FB'; x.fillRect(0, 0, W, H);
    const la = O.map(c => c[1]), lo = O.map(c => c[0]); const laMin = Math.min(...la) - .4, laMax = Math.max(...la) + .4, loMin = Math.min(...lo) - .4, loMax = Math.max(...lo) + .4;
    const s2 = Math.min((W - 2 * pad) / (loMax - loMin), (H - 2 * pad) / (laMax - laMin)); const ox = pad + ((W - 2 * pad) - s2 * (loMax - loMin)) / 2, oy = pad + ((H - 2 * pad) - s2 * (laMax - laMin)) / 2;
    const X = l => ox + (l - loMin) * s2, Y = l => (H - oy) - (l - laMin) * s2;
    x.beginPath(); O.forEach((c, i) => { const px = X(c[0]), py = Y(c[1]); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.closePath(); x.fillStyle = '#F5F1E4'; x.fill(); x.strokeStyle = '#8A7A55'; x.lineWidth = 2; x.stroke();
    const RC = (typeof REGION_COORDS !== 'undefined') ? REGION_COORDS : {}; const maxR = Math.max(1, ...mr.map(r => r.raccordes));
    mr.forEach(r => { const co = RC[r.region] || RC[(r.region || '').replace('é', 'e')]; if (!co) return; const cx = X(co[1]), cy = Y(co[0]); const rad = 6 + Math.sqrt(r.raccordes / maxR) * 30;
      x.beginPath(); x.arc(cx, cy, rad, 0, 2 * Math.PI); x.fillStyle = 'rgba(21,124,61,.6)'; x.fill(); x.strokeStyle = '#157C3D'; x.lineWidth = 1.5; x.stroke();
      x.fillStyle = '#0F172A'; x.font = '700 10px Segoe UI'; x.textAlign = 'center'; x.fillText(r.region, cx, cy - rad - 3);
      x.fillStyle = '#fff'; x.font = '700 9px Segoe UI'; x.fillText(nf(r.raccordes), cx, cy + 3); });
    return cv.toDataURL('image/png');
  }

  // ── Corps (numérotation automatique) ──
  let body = '', ns = 0; const secList = [];
  const h1 = t => { ns++; secList.push(ns + '. ' + t.replace(/&amp;/g, '&')); return '<h1 id="s' + ns + '">' + ns + '.  ' + t + '</h1>'; };
  const para = t => { body += '<p>' + t + '</p>'; };
  // Valeurs d'analyse pour la littérature
  const totStat = sp.by_statut.reduce((s, x) => s + x.n, 0) || 1;
  const topStat = sp.by_statut.slice().sort((a, b) => b.n - a.n)[0] || { statut: '—', n: 0 };
  const topReg = mr.slice().sort((a, b) => b.raccordes - a.raccordes)[0] || { region: '—', raccordes: 0 };
  const totType = cd.by_type.reduce((s, x) => s + x.n, 0) || 1;
  const topType = cd.by_type[0] || { t: '—', n: 0 };
  const gH = (ch.genre.find(g => /^m/i.test(g.g)) || { n: 0 }).n, gF = (ch.genre.find(g => /^f/i.test(g.g)) || { n: 0 }).n, gTot = (gH + gF) || 1;
  const topTech = ch.techno[0] || { t: '—', n: 0 };
  const pct = (x, t) => Math.round((x || 0) / t * 100);

  body += h1('Introduction');
  body += '<p>Le présent rapport ' + typeLbl + ' rend compte de l’état d’avancement du portefeuille de projets d’électrification rurale de l’Agence Nigérienne de Promotion de l’Électrification en Milieu Rural (ANPER) pour la période : <b>' + esc(label) + '</b>. Il présente l’activité de la période ainsi que la situation cumulée à date, à travers les indicateurs de suivi-évaluation.</p>';
  para('L’électrification rurale constitue un levier majeur de développement économique et social et contribue directement à l’atteinte de l’Objectif de Développement Durable n° 7 (énergie propre et d’un coût abordable). Ce rapport a pour objet de fournir aux responsables de l’Agence, aux autorités de tutelle et aux partenaires techniques et financiers une lecture claire et documentée des réalisations, des performances et des impacts du programme, ainsi que des recommandations pour la période à venir.');

  body += h1('Contexte');
  body += '<p>L’ANPER, Établissement Public à caractère Administratif, a pour mission de promouvoir l’accès à l’électricité en milieu rural au Niger, conformément à la politique nationale d’électrification. Le suivi-évaluation permet de mesurer les progrès vers les cibles de raccordement des ménages, l’exécution budgétaire et les impacts socio-économiques et environnementaux (emplois créés, émissions de CO₂ évitées).</p>';

  body += h1('Méthodologie');
  body += '<p>Les données sont issues de la base de la plateforme unifiée ANPER (fiches projets, fiches clients et cadre logique). Les indicateurs de la période sont filtrés sur les dates (début de projet, raccordement des clients, achèvement des activités). Les taux sont calculés à partir des valeurs cumulées enregistrées à la date de génération du rapport.</p>';

  body += h1('Indicateurs de base');
  para('Le tableau ci-dessous présente les indicateurs de base consolidés du portefeuille de projets à la date de génération du rapport. Ils constituent la photographie d’ensemble de l’activité de l’Agence en matière d’électrification rurale.');
  body += tbl('Indicateurs de base du portefeuille', ['Indicateur', 'Valeur'], [
    ['Nombre de projets', nf(sp.total)], ['Clients raccordés', nf(sc.total)],
    ['Budget total (FCFA)', nf(Math.round(sp.budget))], ['Montant décaissé (FCFA)', nf(Math.round(sp.decaisse))],
    ['Ménages raccordés', nf(sp.menages)], ['Ménages cibles', nf(mc)],
    ['Emplois créés', nf(sp.emplois)], ['CO₂ évité (tCO₂)', nf(Math.round(sp.co2))],
    ['Composantes / Activités / Sous-activités', kc.C + ' / ' + kc.A + ' / ' + kc.SA],
  ]);

  body += h1('Indicateurs de performance (S&amp;E)');
  body += tbl('Indicateurs de performance', ['Indicateur', 'Valeur'], [
    ['Taux de décaissement', tDec + ' %'], ['Taux de raccordement', tRac + ' %'],
    ['Taux de recouvrement des paiements', tRec + ' %'], ['Coût moyen par ménage raccordé (FCFA)', nf(coutMen)],
    ['Consommation moyenne (kWh/mois)', Math.round(cd.avg_conso)], ['Puissance totale installée (VA)', nf(Math.round(cd.puissance_totale))],
  ]);
  body += fig('Répartition des projets par statut', donutURL(sp.by_statut.map(s => ({ label: s.statut || 'N.C.', val: s.n }))));
  para('La figure ci-dessus illustre la répartition des projets selon leur statut d’avancement. Les projets « <b>' + esc(topStat.statut) + '</b> » sont les plus nombreux (' + nf(topStat.n) + ', soit ' + pct(topStat.n, totStat) + ' %). Le taux de décaissement global s’établit à <b>' + tDec + ' %</b> et le taux de raccordement des ménages à <b>' + tRac + ' %</b>, ce qui traduit le niveau d’exécution actuel du portefeuille.');

  body += h1('Profil et répartition des bénéficiaires');
  body += tbl('Répartition des clients par type', ['Type de client', 'Nombre'], cd.by_type.map(t => [esc(t.t), nf(t.n)]));
  if (cd.by_type.length) body += fig('Répartition des clients par type', barURL(cd.by_type.map(t => ({ label: t.t, val: t.n })), '#2563EB'));
  para('L’analyse du profil des bénéficiaires montre une prédominance des clients de type « <b>' + esc(topType.t) + '</b> » (' + nf(topType.n) + ', soit ' + pct(topType.n, totType) + ' % du total), ce qui confirme la vocation d’électrification domestique du programme en milieu rural.');

  body += h1('Analyse genre');
  body += tbl('Répartition des bénéficiaires par genre', ['Genre', 'Nombre'], ch.genre.map(g => [esc(g.g), nf(g.n)]));
  if (ch.genre.length) body += fig('Répartition des bénéficiaires par genre', donutURL(ch.genre.map(g => ({ label: g.g || 'N.C.', val: g.n }))));
  para('La ventilation par genre fait apparaître <b>' + nf(gH) + '</b> homme(s) et <b>' + nf(gF) + '</b> femme(s), soit respectivement ' + pct(gH, gTot) + ' % et ' + pct(gF, gTot) + ' %. Le renforcement de l’accès des femmes à l’électricité, et à ses usages productifs, demeure un axe d’attention pour l’inclusion et l’égalité de genre.');

  body += h1('Analyse des impacts régionaux');
  body += tbl('Impacts par région (ménages, CO₂, emplois)', ['Région', 'Cibles', 'Raccordés', 'CO₂ (t)', 'Emplois'],
    mr.map(r => [esc(r.region), nf(r.cibles), nf(r.raccordes), nf(Math.round(r.co2)), nf(r.emplois)]));
  if (mr.length) body += fig('Ménages raccordés par région', barURL(mr.map(r => ({ label: r.region, val: r.raccordes })), '#157C3D'));
  para('La région de <b>' + esc(topReg.region) + '</b> concentre le plus grand nombre de ménages raccordés (' + nf(topReg.raccordes) + '). Cette analyse régionale met en évidence les zones les plus avancées ainsi que celles à renforcer, afin de réduire les disparités d’accès à l’électricité entre les régions.');

  body += h1('Cartographie des projets');
  body += '<p>Répartition géographique des ménages raccordés sur le territoire national. La taille des bulles est proportionnelle au nombre de ménages raccordés par région.</p>';
  if (mr.length) body += fig('Carte des ménages raccordés par région', mapURL());
  para('La cartographie confirme la concentration des raccordements dans certaines régions du pays, la taille des bulles étant proportionnelle au nombre de ménages raccordés. Les zones à faible densité de raccordement appellent des efforts complémentaires de déploiement pour une couverture territoriale équilibrée.');

  body += h1('Analyse du portefeuille de projets');
  body += tbl('Répartition des projets par technologie', ['Technologie', 'Nombre'], ch.techno.map(t => [esc(t.t), nf(t.n)]));
  body += tbl('Répartition des projets par source de financement', ['Source', 'Nombre'], ch.source.map(s => [esc(s.s), nf(s.n)]));
  if (ch.budget.length) body += fig('Budget par région (7 premières)', barURL(ch.budget.map(r => ({ label: r.region, val: Math.round(r.budget) })), '#E67E22'));
  para('Sur le plan technologique, la solution « <b>' + esc(topTech.t) + '</b> » prédomine (' + nf(topTech.n) + ' projet(s)), en cohérence avec le fort potentiel solaire du Niger. Les financements proviennent de sources diversifiées — budget national et partenaires techniques et financiers (BAD, BOAD, UEMOA, Banque mondiale, etc.) — ce qui constitue un gage de soutenabilité du programme.');

  body += h1('Suivi financier par projet');
  body += tbl('Exécution budgétaire par projet', ['ID', 'Projet', 'Budget', 'Engagé', 'Décaissé', '% exéc.', 'Reste'],
    projs.map(p => { const bt = +p.budget_total || 0, de = +p.montant_decaisse || 0, en = +p.montant_engage || 0; return [esc(p.pid), esc(String(p.nom || '').slice(0, 32)), nf(Math.round(bt)), nf(Math.round(en)), nf(Math.round(de)), (bt ? Math.round(de / bt * 100) : 0) + ' %', nf(Math.round(bt - de))]; }));
  body += tbl('Décaissements trimestriels par projet (FCFA)', ['ID', 'Projet', 'T1', 'T2', 'T3', 'T4', 'Total'],
    projs.map(p => { const q = [p.decaisse_q1, p.decaisse_q2, p.decaisse_q3, p.decaisse_q4].map(v => +v || 0); return [esc(p.pid), esc(String(p.nom || '').slice(0, 30)), nf(Math.round(q[0])), nf(Math.round(q[1])), nf(Math.round(q[2])), nf(Math.round(q[3])), nf(Math.round(q.reduce((s, v) => s + v, 0)))]; }));
  para('Le suivi financier par projet met en évidence un taux d’exécution budgétaire global de <b>' + tDec + ' %</b>. Le détail des décaissements par trimestre (T1 à T4) permet de suivre le rythme d’engagement des ressources tout au long de l’exercice et d’identifier les projets présentant un retard d’exécution nécessitant une attention particulière.');

  body += h1((type === 'Synthèse' ? 'Activité globale' : 'Activité de la période') + ' (' + esc(label) + ')');
  body += tbl('Activité enregistrée sur la période', ['Indicateur', 'Valeur'], [
    ['Projets démarrés', nf(pP.length)], ['Budget des projets démarrés (FCFA)', nf(Math.round(budgetP))],
    ['Décaissements des projets démarrés (FCFA)', nf(Math.round(decP))], ['Clients raccordés', nf(cP.length)],
    ['dont ménages', nf(menP)], ['Puissance raccordée (VA)', nf(Math.round(puisP))],
    ['Activités / composantes achevées', nf(kTerm)],
  ]);
  if (pP.length) body += tbl('Projets démarrés sur la période', ['ID', 'Projet', 'Région', 'Budget (FCFA)'],
    pP.map(p => [esc(p.pid), esc(p.nom), esc(p.region), nf(Math.round(p.budget_total || 0))]));
  else body += '<p class="muted">Aucun projet démarré sur la période.</p>';
  para('Au cours de la période considérée, l’activité se traduit par <b>' + nf(pP.length) + '</b> projet(s) démarré(s) et <b>' + nf(cP.length) + '</b> client(s) nouvellement raccordé(s), pour une puissance additionnelle installée de <b>' + nf(Math.round(puisP)) + ' VA</b>. Ces réalisations témoignent de la dynamique de mise en œuvre sur la période.');

  body += h1('Conclusion');
  body += '<p>Au cours de la période <b>' + esc(label) + '</b>, l’ANPER a enregistré <b>' + nf(pP.length) + '</b> projet(s) démarré(s) et <b>' + nf(cP.length) + '</b> client(s) raccordé(s). À date, le portefeuille compte <b>' + nf(sp.total) + '</b> projets pour un budget total de <b>' + nf(Math.round(sp.budget)) + ' FCFA</b>, avec un taux de décaissement de <b>' + tDec + ' %</b> et un taux de raccordement de <b>' + tRac + ' %</b> des ménages cibles. Ces résultats traduisent la progression de la mission d’électrification rurale, tout en soulignant les efforts restant à fournir pour atteindre les cibles.</p>';
  para('Globalement, la mise en œuvre du programme progresse de manière satisfaisante, portée par des technologies adaptées au contexte sahélien et par un financement diversifié. Les principaux défis résident dans l’accélération de l’exécution budgétaire, la réduction des disparités régionales d’accès et la consolidation du recouvrement. La poursuite d’un suivi-évaluation rigoureux, appuyé sur des données fiables et régulièrement mises à jour, demeure essentielle au pilotage efficace du programme et à la reddition de comptes aux parties prenantes.');

  body += h1('Recommandations');
  body += '<ul class="reco">'
    + '<li>Accélérer les décaissements sur les projets en cours afin d’améliorer le taux d’exécution budgétaire.</li>'
    + '<li>Renforcer le suivi des raccordements dans les régions à faible taux pour réduire l’écart avec les cibles.</li>'
    + '<li>Consolider le recouvrement des paiements des clients pour la viabilité financière des projets.</li>'
    + '<li>Poursuivre la mise à jour régulière des fiches et du cadre logique pour un suivi-évaluation fiable.</li>'
    + '</ul>';

  // ── Front matter ──
  const ACR = [
    ['ANPER', 'Agence Nigérienne de Promotion de l’Électrification en Milieu Rural'],
    ['EPA', 'Établissement Public à caractère Administratif'], ['DG', 'Directeur Général'],
    ['DAAF', 'Direction des Affaires Administratives et Financières'], ['S&E', 'Suivi &amp; Évaluation'],
    ['SIG', 'Système d’Information Géographique'], ['RENALOC', 'Répertoire National des Localités'],
    ['KPI', 'Indicateur Clé de Performance'], ['PV', 'Photovoltaïque'], ['kWh', 'Kilowattheure'],
    ['VA', 'Voltampère'], ['FCFA', 'Franc de la Communauté Financière Africaine'], ['CO₂', 'Dioxyde de carbone'],
    ['FP', 'Fonds Public / Budget National'], ['BAD', 'Banque Africaine de Développement'],
    ['BOAD', 'Banque Ouest-Africaine de Développement'], ['UEMOA', 'Union Économique et Monétaire Ouest-Africaine'],
  ];
  const acrTable = '<table><thead><tr><th>Sigle</th><th style="text-align:left">Signification</th></tr></thead><tbody>'
    + ACR.map(([s, d]) => '<tr><td><b>' + s + '</b></td><td style="text-align:left">' + d + '</td></tr>').join('') + '</tbody></table>';
  const somm = '<ol class="somm">' + secList.map(s => '<li>' + s.replace(/^\d+\.\s*/, '') + '</li>').join('') + '</ol>';
  const listeFig = listeF.length ? '<ul class="lst">' + listeF.map(([n, c]) => '<li>Figure ' + n + ' — ' + esc(c) + '</li>').join('') + '</ul>' : '<p class="muted">—</p>';
  const listeTab = listeT.length ? '<ul class="lst">' + listeT.map(([n, c]) => '<li>Tableau ' + n + ' — ' + esc(c) + '</li>').join('') + '</ul>' : '<p class="muted">—</p>';
  const logo = location.origin + '/icons/logo.png';
  const docname = ('Rapport_' + type + '_' + label).replace(/[^\w-]+/g, '_');

  const w = window.open('', '_blank');
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Rapport ${type} — ${esc(label)}</title>
  <style>
  body{font-family:'Segoe UI',Arial,sans-serif;color:#0F172A;margin:0}
  .page{padding:26mm 20mm}
  h1{color:#157C3D;font-size:19px;border-bottom:2px solid #157C3D;padding-bottom:6px;margin:26px 0 10px}
  h2{color:#1E3A5F;font-size:15px;margin:18px 0 6px}
  p{line-height:1.55;text-align:justify;margin:6px 0}
  table{border-collapse:collapse;width:100%;margin:6px 0 4px;font-size:12.5px}
  th,td{border:1px solid #D1D5DB;padding:6px 10px;text-align:right}
  th:first-child,td:first-child{text-align:left}
  th{background:#EAF2FB;color:#1E3A5F}
  .cap{font-size:11.5px;color:#475569;font-style:italic;margin:4px 0 12px}
  .figw{text-align:center;margin:10px 0 14px}
  .figw img{max-width:100%;border:1px solid #E5E7EB;border-radius:6px}
  .muted{color:#64748B}
  ul.reco li,ol.somm li,ul.lst li{margin:4px 0;line-height:1.5}
  .cover{height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 20mm}
  .cover img{width:120px;margin-bottom:12px}
  .cover .rep{color:#0F172A;font-size:13px;letter-spacing:.5px}
  .cover .ttl{color:#157C3D;font-size:34px;font-weight:800;margin:22px 0 6px}
  .cover .per{font-size:20px;color:#1E3A5F;font-weight:700}
  .cover .org{margin-top:26px;font-size:14px;font-weight:700;color:#157C3D}
  .cover .meta{color:#64748B;font-size:12px;margin-top:6px}
  .toolbar{position:sticky;top:0;background:#1E3A5F;color:#fff;padding:8px 14px;display:flex;gap:12px;align-items:center;z-index:99;font-size:13px}
  .toolbar button{background:#157C3D;color:#fff;border:0;border-radius:6px;padding:8px 14px;font-weight:600;cursor:pointer}
  [contenteditable="true"]:focus{outline:none;background:#f7fdf9}
  .runhead,.runfoot{display:none}
  @media print{
    @page{size:A4;margin:16mm 0 12mm}
    .brk{page-break-before:always} .no-print{display:none!important}
    .runhead{display:flex;position:fixed;top:-12mm;left:0;right:0;align-items:center;gap:8px;padding:0 14mm;font-size:9px;color:#475569;border-bottom:1px solid #E5E7EB}
    .runhead img{height:9mm}
    .runfoot{display:block;position:fixed;bottom:-9mm;left:0;right:0;text-align:center;font-size:8.5px;color:#94A3B8}
    .page{padding:8mm 14mm}
    .cover{height:auto;min-height:250mm}
  }
  </style></head><body>

  <div class="toolbar no-print"><button onclick="window.print()">🖨 Imprimer / PDF</button><button onclick="dlWord()">📝 Télécharger en Word</button><span>✏️ Cliquez dans le rapport pour <b>modifier le texte</b> avant d’imprimer ou d’exporter.</span></div>
  <div class="runhead"><img src="${logo}" onerror="this.style.display='none'"><span><b>ANPER</b> — Rapport ${typeLbl} · ${esc(label)}</span></div>
  <div class="runfoot">Agence Nigérienne de Promotion de l’Électrification en Milieu Rural — Suivi &amp; Évaluation</div>

  <div class="cover" contenteditable="true">
    <img src="${logo}" onerror="this.style.display='none'">
    <div class="rep"><b>RÉPUBLIQUE DU NIGER</b><br><i>Fraternité – Travail – Progrès</i><br>MINISTÈRE DE L’ÉNERGIE</div>
    <div class="ttl">${coverTtl}</div>
    <div class="per">${esc(label)}</div>
    <div class="org">Agence Nigérienne de Promotion de l’Électrification en Milieu Rural (ANPER)</div>
    <div class="meta">Établissement Public à caractère Administratif — Niamey, Niger</div>
    <div class="meta">Suivi &amp; Évaluation · Généré le ${new Date().toLocaleDateString('fr-FR')}</div>
  </div>

  <div class="page brk" contenteditable="true"><h1>Liste des acronymes et abréviations</h1>${acrTable}</div>
  <div class="page brk" contenteditable="true"><h1>Table des matières</h1>${somm}
    <h1 style="margin-top:22px">Liste des figures</h1>${listeFig}
    <h1 style="margin-top:22px">Liste des tableaux</h1>${listeTab}</div>
  <div class="page brk" contenteditable="true">${body}</div>

  <script>
  var DOCNAME=${JSON.stringify(docname)};
  function dlWord(){
    var clone=document.body.cloneNode(true);
    clone.querySelectorAll('.no-print,.runhead,.runfoot').forEach(function(e){e.remove();});
    var css=document.querySelector('style').innerHTML;
    var html='<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>'+css+' body{margin:0} .page{padding:18px 26px} .cover{min-height:900px}</style></head>'+clone.outerHTML+'</html>';
    var blob=new Blob(['\\ufeff'+html],{type:'application/msword'});
    var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=DOCNAME+'.doc';
    document.body.appendChild(a); a.click(); setTimeout(function(){a.remove();URL.revokeObjectURL(a.href);},1500);
  }
  </script>
  </body></html>`);
  w.document.close();
}

// Rapport de synthèse global = rapport complet en mode « Synthèse » (toutes les données)
function printReport() { printPeriodReport('Synthèse'); }

// ═══════════════════════════════ CARTE SIG ═══════════════════════════════
// Carte SIG — localités des projets sur fond cartographique réel (Leaflet + OSM),
// points colorés par statut, filtres Projet/Statut/Région/Département/Commune.
Pages.sig = function () {
  const root = el('div.page');
  const head = el('div.page-head', {}, [el('h1', { text: '🗺️ Carte SIG — Localités des projets ANPER' })]);
  const countEl = el('span.sig-count', { text: '' });
  head.append(countEl);
  root.append(head);

  const STATUT_COLORS = { 'En cours': '#16a34a', 'Terminé': '#2563eb', 'Suspendu': '#f59e0b', 'En attente': '#6b7280' };
  const RCOORDS = {
    'Agadez': [17.0, 8.0], 'Diffa': [13.3, 12.6], 'Dosso': [13.1, 3.2], 'Maradi': [13.5, 7.1],
    'Niamey': [13.5, 2.1], 'Tahoua': [14.9, 5.3], 'Tillabéri': [14.2, 1.5], 'Tillaberi': [14.2, 1.5], 'Zinder': [13.8, 8.9]
  };
  const DEPT_COORDS = {
    'Agadez': [16.97, 7.99], 'Arlit': [18.74, 7.39], 'Bilma': [18.69, 12.92], 'Tchirozerine': [17.44, 8.53], 'Tchirozérine': [17.44, 8.53],
    'Diffa': [13.32, 12.61], 'Maine-Soroa': [13.21, 12.02], "N'Guigmi": [14.25, 13.11], 'Bosso': [13.70, 13.32],
    "Birni N'Gaouré": [13.08, 2.90], 'Boboye': [13.35, 3.03], 'Dogondoutchi': [13.64, 4.03], 'Dosso': [13.05, 3.20], 'Gaya': [11.88, 3.45], 'Loga': [13.62, 3.74],
    'Aguié': [13.51, 7.78], 'Dakoro': [14.51, 6.77], 'Guidan Roumdji': [13.66, 6.69], 'Madarounfa': [13.08, 7.16], 'Maradi': [13.50, 7.10], 'Mayahi': [13.97, 7.67], 'Tessaoua': [13.75, 7.99],
    'Niamey 1': [13.52, 2.11], 'Niamey 2': [13.52, 2.12], 'Niamey 3': [13.51, 2.10], 'Niamey 4': [13.50, 2.09], 'Niamey 5': [13.53, 2.13],
    'Abalak': [15.46, 6.28], "Birni N'Konni": [13.80, 5.25], 'Bouza': [14.42, 6.04], 'Illela': [14.13, 5.27], 'Keita': [14.75, 5.77], 'Madaoua': [14.08, 5.96], 'Malbaza': [13.97, 5.52], 'Tahoua': [14.89, 5.27], 'Tchintabaraden': [15.08, 5.93],
    'Ayorou': [14.73, 0.92], 'Balleyara': [13.97, 2.84], 'Filingué': [14.35, 3.32], 'Gothèye': [13.64, 1.54], 'Kollo': [13.31, 2.32], 'Say': [13.11, 2.37], 'Téra': [14.00, 0.75], 'Tillabéri': [14.21, 1.46], 'Torodi': [13.09, 1.78],
    'Gouré': [13.98, 10.27], 'Kantché': [13.52, 8.51], 'Magaria': [12.99, 8.91], 'Matameye': [13.42, 8.47], 'Mirriah': [13.71, 9.17], 'Takeita': [13.55, 8.68], 'Tanout': [14.97, 8.89], 'Zinder': [13.80, 8.99]
  };

  const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const split = v => String(v || '').split(/[,;/]/).map(x => x.trim()).filter(Boolean);
  const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const dictGet = (d, key) => { if (d[key]) return d[key]; const nk = norm(key); for (const k in d) if (norm(k) === nk) return d[k]; return null; };
  const jitter = (name, scale) => { let h = 0; const s = String(name || ''); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xFFFF; const dlat = ((h & 0xFF) / 255 - 0.5) * 2 * scale; const dlng = (((h >> 8) & 0xFF) / 255 - 0.5) * 2 * scale; return [dlat, dlng]; };
  const coordsFor = (reg, dept, comm) => {
    const dc = dept ? dictGet(DEPT_COORDS, dept) : null;
    if (dc) { const [a, b] = jitter(comm || dept, 0.10); return [dc[0] + a, dc[1] + b]; }
    const rc = reg ? dictGet(RCOORDS, reg) : null;
    if (rc) { const [a, b] = jitter((dept || '') + (comm || '') + reg, 0.20); return [rc[0] + a, rc[1] + b]; }
    const [a, b] = jitter(reg + dept + comm, 0.15); return [16.0 + a, 8.0 + b];
  };
  // Coordonnées RÉELLES par localité (RENALOC INS, 29 569 localités géoréférencées),
  // chargées à la demande (fichier ~1,2 Mo, mis en cache par le service worker).
  // Clé « commune|localité » normalisée. À défaut, on retombe sur coordsFor (dépt/région).
  let RENA_COORDS = (typeof window !== 'undefined' && window.__renaCoords) || null;
  // Référentiel des sites des projets (commune/département/région + GPS relevés), prioritaire
  // sur RENALOC : sites absents de RENALOC ou homonymes (source : Situation_Electrification_ANPER).
  let PROJ_LOCS = (typeof window !== 'undefined' && window.__projLocs) || null;
  function loadCoords() {
    const a = RENA_COORDS ? Promise.resolve(RENA_COORDS) : fetch('data/renaloc_coords.json').then(r => r.ok ? r.json() : {})
      .then(j => { RENA_COORDS = j; try { window.__renaCoords = j; } catch (e) {} return j; })
      .catch(() => { RENA_COORDS = {}; return {}; });
    const b = PROJ_LOCS ? Promise.resolve(PROJ_LOCS) : fetch('data/localites_projets.json').then(r => r.ok ? r.json() : {})
      .then(j => { PROJ_LOCS = j; try { window.__projLocs = j; } catch (e) {} return j; })
      .catch(() => { PROJ_LOCS = {}; return {}; });
    return Promise.all([a, b]);
  }
  // Les colonnes région/département/commune des projets ne sont PAS alignées avec la
  // liste des localités (un projet liste 1200 localités mais 3 régions). Le seul champ
  // fiable par point est le NOM de la localité. On désambiguïse les homonymes en essayant
  // chaque région du projet (RENA_COORDS.rl = « région|localité »), puis on retombe sur le
  // nom seul (RENA_COORDS.loc), puis sur la position approchée (coordsFor).
  const resolveCoord = (it) => {
    const ln = norm(it.localite);
    if (it.ll) return { ll: it.ll, exact: true };   // GPS relevé du site (référentiel projets)
    if (RENA_COORDS && RENA_COORDS.rl && ln && !it.noRena) {   // noRena : site connu sans GPS, homonyme RENALOC à éviter
      // Région réelle de la localité d'abord (placeLoc), puis les autres régions du projet ;
      // le nom seul (tout le Niger) seulement si le projet n'a pas de région : sinon on
      // tomberait sur un homonyme d'une autre région.
      const regs = [...new Set([it.region, ...(it.pregs || [])].filter(Boolean))];
      for (const r of regs) { const c = RENA_COORDS.rl[norm(r) + '|' + ln]; if (c) return { ll: c, exact: true }; }
      if (!regs.length) { const c2 = RENA_COORDS.loc && RENA_COORDS.loc[ln]; if (c2) return { ll: c2, exact: true }; }
    }
    return { ll: coordsFor(it.region || (it.pregs || [])[0], it.departement, it.commune), exact: false };
  };
  // Index RENALOC « localité normalisée » -> [{r, d, c}] pour retrouver la région, le
  // département et la commune RÉELS de chaque localité d'un projet (les listes région /
  // département / commune de la fiche ne sont pas alignées terme à terme avec les localités).
  let LOC_IDX = null;
  const locIndex = () => {
    if (LOC_IDX) return LOC_IDX;
    LOC_IDX = new Map();
    for (const r in renaloc) for (const d in renaloc[r]) for (const c in renaloc[r][d])
      for (const l of (renaloc[r][d][c] || [])) {
        const k = norm(l); if (!k) continue;
        if (!LOC_IDX.has(k)) LOC_IDX.set(k, []);
        LOC_IDX.get(k).push({ r, d, c });
      }
    return LOC_IDX;
  };
  const inList = (v, lst) => lst.some(x => norm(x) === norm(v));
  function placeLoc(loc, regs, depts, comms) {
    const ref = ((PROJ_LOCS || {})[norm(loc)] || []).filter(x => !regs.length || inList(x.r, regs));
    if (ref.length) {
      const x = ref.find(e => inList(e.c, comms)) || ref[0];
      return { region: x.r, departement: x.d, commune: x.c, ...(x.lat ? { ll: [x.lat, x.lng] } : { noRena: true }) };
    }
    const cands = (locIndex().get(norm(loc)) || []).filter(x => !regs.length || inList(x.r, regs));
    let best = null, bs = -1;
    for (const x of cands) {
      const s = (inList(x.c, comms) ? 4 : 0) + (inList(x.d, depts) ? 2 : 0) + (inList(x.r, regs) ? 1 : 0);
      if (s > bs) { bs = s; best = x; }
    }
    if (best) return { region: best.r, departement: best.d, commune: best.c };
    // Localité absente de RENALOC : on ne garde que ce qui est certain (valeur unique)
    return { region: regs.length === 1 ? regs[0] : '', departement: depts.length === 1 ? depts[0] : '', commune: comms.length === 1 ? comms[0] : '' };
  }

  const projets = DB.cache.projets || [];
  const renaloc = DB.cache.renaloc || {};

  // ── Panneau de filtres ──────────────────────────────────────────────────
  const mkSelect = (label, opts) => {
    const sel = el('select.sig-select');
    opts.forEach(([v, t]) => sel.append(el('option', { value: v }, [t])));
    const field = el('div.field', {}, [el('label', { text: label }), sel]);
    return { field, sel };
  };
  const projOpts = [['', '— Tous —']].concat(projets.map(p => [p.pid, (p.pid || '') + ' — ' + (p.nom || '')]));
  const statuts = [...new Set(projets.map(p => p.statut).filter(Boolean))];
  const statOpts = [['', '— Tous —']].concat(statuts.map(s => [s, s]));
  const regionKeys = Object.keys(renaloc).length ? Object.keys(renaloc) : [...new Set(projets.flatMap(p => split(p.region)))];
  const regOpts = [['', '— Toutes —']].concat(regionKeys.map(r => [r, r]));

  const fProj = mkSelect('Projet', projOpts);
  const fStat = mkSelect('Statut', statOpts);
  const fReg = mkSelect('Région', regOpts);
  const fDept = mkSelect('Département', [['', '— Tous —']]);
  const fComm = mkSelect('Commune', [['', '— Toutes —']]);

  const setOpts = (sel, opts) => { sel.innerHTML = ''; opts.forEach(([v, t]) => sel.append(el('option', { value: v }, [t]))); };
  fReg.sel.addEventListener('change', () => {
    const r = fReg.sel.value; const depts = (r && renaloc[r]) ? Object.keys(renaloc[r]) : [];
    setOpts(fDept.sel, [['', '— Tous —']].concat(depts.map(d => [d, d])));
    setOpts(fComm.sel, [['', '— Toutes —']]);
  });
  fDept.sel.addEventListener('change', () => {
    const r = fReg.sel.value, d = fDept.sel.value;
    const comms = (r && d && renaloc[r] && renaloc[r][d]) ? Object.keys(renaloc[r][d]) : [];
    setOpts(fComm.sel, [['', '— Toutes —']].concat(comms.map(c => [c, c])));
  });

  const btnGen = el('button.btn.btn-primary.sig-btn', { text: '🗺️  Générer la carte' });
  const btnReset = el('button.btn.btn-ghost.sig-btn', { text: '✖  Réinitialiser' });
  const side = el('div.sig-side.panel', {}, [
    el('h3', { text: '🔎 Filtres', style: { marginTop: '0' } }),
    fProj.field, fStat.field, fReg.field, fDept.field, fComm.field,
    el('div', { style: { marginTop: '10px' } }, [btnGen]),
    el('div', { style: { marginTop: '6px' } }, [btnReset])
  ]);

  const mapDiv = el('div#sigmap');
  const legend = el('div.sig-legend', { html:
    '<b>Statut des projets</b><br><br>' +
    '<span class="dot" style="background:#16a34a"></span>En cours<br>' +
    '<span class="dot" style="background:#2563eb"></span>Terminé<br>' +
    '<span class="dot" style="background:#f59e0b"></span>Suspendu<br>' +
    '<span class="dot" style="background:#6b7280"></span>En attente' });
  const mapBox = el('div.sig-mapbox', {}, [mapDiv, legend]);
  root.append(el('div.sig-wrap', {}, [side, mapBox]));

  // ── Données filtrées ────────────────────────────────────────────────────
  function buildData() {
    const pidF = fProj.sel.value, statF = fStat.sel.value, regF = fReg.sel.value, deptF = fDept.sel.value, commF = fComm.sel.value;
    const rows = [];
    for (const p of projets) {
      if (pidF && p.pid !== pidF) continue;
      if (statF && (p.statut || '') !== statF) continue;
      const regs = split(p.region), depts = split(p.departement), comms = split(p.commune), locs = split(p.localite);
      const base = { pid: p.pid || '', nom: p.nom || '', statut: p.statut || '', budget: p.budget_total || 0, pregs: regs };
      if (locs.length) {
        locs.forEach(loc => rows.push({ ...base, localite: loc, ...placeLoc(loc, regs, depts, comms) }));
      } else {
        rows.push({ ...base, localite: comms[0] || depts[0] || regs[0] || (p.pid || ''), commune: comms[0] || '', departement: depts[0] || '', region: regs[0] || '' });
      }
    }
    return rows.filter(r => {
      if (regF && norm(r.region) !== norm(regF)) return false;
      if (deptF && norm(r.departement) !== norm(deptF)) return false;
      if (commF && norm(r.commune) !== norm(commF)) return false;
      return true;
    });
  }

  function popup(it) {
    const bud = (Number(it.budget) || 0).toLocaleString('fr-FR');
    return "<div style='font-family:Segoe UI,Arial;min-width:230px;padding:4px'>" +
      "<h4 style='margin:0 0 6px;color:#157C3D;font-size:13px'>📍 " + esc(it.localite) + "</h4>" +
      "<b style='font-size:12px'>" + esc(it.nom) + "</b> <small style='color:#888'>(" + esc(it.pid) + ")</small><br><br>" +
      "<span style='color:#555'>🏘️ Commune :</span> <b>" + esc(it.commune) + "</b><br>" +
      "<span style='color:#555'>🗺️ Département :</span> <b>" + esc(it.departement) + "</b><br>" +
      "<span style='color:#555'>📍 Région :</span> <b>" + esc(it.region) + "</b><br>" +
      "<span style='color:#555'>📊 Statut :</span> <b>" + esc(it.statut) + "</b><br>" +
      "<span style='color:#555'>💰 Budget :</span> <b>" + bud + " FCFA</b></div>";
  }

  // ── Chargement de Leaflet (local, embarqué) ───────────────────────────────
  let leafletPromise = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise((res, rej) => {
      if (!document.querySelector('link[data-leaflet]')) {
        const css = el('link', { rel: 'stylesheet', href: 'vendor/leaflet/leaflet.css' }); css.dataset.leaflet = '1'; document.head.append(css);
      }
      const js = document.createElement('script'); js.src = 'vendor/leaflet/leaflet.js';
      js.onload = () => res(); js.onerror = () => rej(new Error('Leaflet introuvable'));
      document.head.append(js);
    });
    return leafletPromise;
  }

  let map = null, layer = null;
  async function generate() {
    await loadCoords();   // avant buildData : placeLoc s'appuie sur le référentiel des sites
    const data = buildData();
    const MAX = 200, trunc = data.length > MAX, rows = data.slice(0, MAX);
    const n = rows.length, s = n > 1 ? 's' : '';
    try { await loadLeaflet(); }
    catch (e) { mapDiv.innerHTML = '<div class="sig-empty">Carte indisponible (Leaflet introuvable). Vérifiez la connexion pour le fond de carte.</div>'; return; }
    if (!map) {
      map = L.map(mapDiv, { zoomControl: true }).setView([14.5, 8.0], 6);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 18 }).addTo(map);
      layer = L.layerGroup().addTo(map);
    }
    setTimeout(() => map.invalidateSize(), 60);
    layer.clearLayers();
    const pts = []; let exactN = 0;
    rows.forEach(it => {
      const { ll, exact } = resolveCoord(it);
      const [lat, lng] = ll; pts.push([lat, lng]); if (exact) exactN++;
      const color = STATUT_COLORS[it.statut] || '#6b7280';
      L.circleMarker([lat, lng], { radius: 9, fillColor: color, color: '#fff', weight: 2, opacity: 1, fillOpacity: 0.88 })
        .bindPopup(popup(it), { maxWidth: 320 })
        .bindTooltip((it.localite || '') + ' (' + (it.commune || '') + ')', { sticky: true })
        .addTo(layer);
    });
    countEl.textContent = n
      ? ('|  ' + n + ' localité' + s + ' affichée' + s + (exactN ? ' — ' + exactN + ' géolocalisée' + (exactN > 1 ? 's' : '') + ' (RENALOC)' : '') + (trunc ? ' — limité à 200' : ''))
      : '|  Aucune localité';
    if (pts.length) { try { map.fitBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: 12 }); } catch (e) {} }
  }

  btnGen.addEventListener('click', generate);
  btnReset.addEventListener('click', () => {
    fProj.sel.value = ''; fStat.sel.value = ''; fReg.sel.value = '';
    setOpts(fDept.sel, [['', '— Tous —']]); setOpts(fComm.sel, [['', '— Toutes —']]);
    generate();
  });

  root._onMount = () => { generate(); };
  return root;
};
