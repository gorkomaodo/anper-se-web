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
  f.mo = field("Maître d'Ouvrage", { value: p.maitre_ouvrage });
  f.cp = field('Chef de Projet', { value: p.chef_projet });
  f.bailleur = field('Bailleur', { value: p.bailleur });
  f.source = field('Source de Financement', { type: 'combo', options: SOURCES_FIN, value: p.source_financement });
  f.statut = field('Statut', { type: 'combo', options: STATUTS_PROJET, value: p.statut });
  f.techno = field('Technologie', { type: 'combo', options: TECHNOS, value: p.technologie });
  f.debut = field('Date Début (JJ/MM/AAAA)', { value: p.date_debut });
  f.fin = field('Date Fin Prévue (JJ/MM/AAAA)', { value: p.date_fin });
  [f.nom, f.mo, f.cp, f.bailleur, f.source, f.statut, f.techno, f.debut, f.fin].forEach(x => s1.grid.append(x.node));

  // Localisation cascade
  const s2 = formSection('📍 Localisation RENALOC');
  f.region = new MultiSelect('Région(s)', () => DB.getRegions(), () => { f.dept.clear(); f.commune.clear(); f.localite.clear(); }, true);
  f.dept = new MultiSelect('Département(s)', () => DB.getDepartements(f.region.getList()), () => { f.commune.clear(); f.localite.clear(); });
  f.commune = new MultiSelect('Commune(s)', () => DB.getCommunes(f.dept.getList()), () => { f.localite.clear(); });
  f.localite = new MultiSelect('Localité(s)', () => DB.getLocalites(f.commune.getList()));
  [f.region, f.dept, f.commune, f.localite].forEach(x => s2.grid.append(x.node));

  // Finances
  const s3 = formSection('💰 Données financières');
  f.budget = field('Budget Total (FCFA)', { type: 'number', value: p.budget_total });
  f.engage = field('Montant Engagé (FCFA)', { type: 'number', value: p.montant_engage });
  f.decaisse = field('Montant Décaissé (FCFA)', { type: 'number', value: p.montant_decaisse });
  [f.budget, f.engage, f.decaisse].forEach(x => s3.grid.append(x.node));

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
    const data = {
      nom: f.nom.get(), maitre_ouvrage: f.mo.get(), chef_projet: f.cp.get(), bailleur: f.bailleur.get(),
      source_financement: f.source.get(), statut: f.statut.get(), technologie: f.techno.get(),
      date_debut: f.debut.get(), date_fin: f.fin.get(),
      region: f.region.get(), departement: f.dept.get(), commune: f.commune.get(), localite: f.localite.get(),
      budget_total: num(f.budget.get()), montant_engage: num(f.engage.get()), montant_decaisse: num(f.decaisse.get()),
      nb_villages: Math.round(num(f.villages.get())), nb_menages_cibles: Math.round(num(f.menCib.get())),
      nb_menages_raccordes: Math.round(num(f.menRac.get())), emplois_crees: Math.round(num(f.emplois.get())),
      co2_evite: num(f.co2.get()), observations: f.obs.get(),
    };
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

  const s2 = formSection('📍 Localisation RENALOC');
  f.region = new MultiSelect('Région(s)', () => DB.getRegions(), () => { f.dept.clear(); f.commune.clear(); f.localite.clear(); }, true);
  f.dept = new MultiSelect('Département(s)', () => DB.getDepartements(f.region.getList()), () => { f.commune.clear(); f.localite.clear(); });
  f.commune = new MultiSelect('Commune(s)', () => DB.getCommunes(f.dept.getList()), () => { f.localite.clear(); });
  f.localite = new MultiSelect('Localité(s)', () => DB.getLocalites(f.commune.getList()));
  f.milieu = field('Milieu', { type: 'combo', options: MILIEUX, value: c.milieu });
  [f.region, f.dept, f.commune, f.localite].forEach(x => s2.grid.append(x.node));
  s2.grid.append(f.milieu.node);

  const s3 = formSection('⚡ Raccordement');
  const pids = DB.getAllPids().map(p => `${p.pid} — ${p.nom}`);
  f.projet = field('Projet Raccordé', { type: 'combo', options: pids });
  f.dateRac = field('Date Raccordement (JJ/MM/AAAA)', { value: c.date_raccordement });
  f.compteur = field('Type Compteur', { type: 'combo', options: TYPES_COMPTEUR, value: c.type_compteur });
  f.puissance = field('Puissance (W)', { type: 'number', value: c.puissance });
  [f.projet, f.dateRac, f.compteur, f.puissance].forEach(x => s3.grid.append(x.node));

  const s4 = formSection('💳 Données financières');
  f.revenus = field('Revenus Mensuels (FCFA)', { type: 'number', value: c.revenus });
  f.statutP = field('Statut Paiement', { type: 'combo', options: STATUTS_PAIEMENT, value: c.statut_paiement });
  f.conso = field('Consommation (kWh)', { type: 'number', value: c.consommation });
  f.solde = field('Solde Compteur (FCFA)', { type: 'number', value: c.solde });
  [f.revenus, f.statutP, f.conso, f.solde].forEach(x => s4.grid.append(x.node));

  const s5 = formSection('📝 Observations');
  f.obs = field('Observations', { type: 'text-area', value: c.observations });
  s5.grid.append(f.obs.node); s5.grid.classList.add('one-col');

  for (const s of [s1, s2, s3, s4, s5]) root.append(s.head, s.grid);
  if (editCid) {
    f.region.set(c.region); f.dept.set(c.departement); f.commune.set(c.commune); f.localite.set(c.localite);
    const lbl = pids.find(x => x.startsWith((c.projet_raccorde || '') + ' ')) || c.projet_raccorde || '';
    f.projet.set(lbl);
  }

  const save = async () => {
    if (!f.nom.get()) return toast('Le nom & prénoms est obligatoire.', 'warn');
    if (!f.region.getList().length) return toast('Sélectionnez au moins une région.', 'warn');
    const proj = f.projet.get().includes(' — ') ? f.projet.get().split(' — ')[0].trim() : f.projet.get();
    const data = {
      nom_prenoms: f.nom.get(), type_client: f.type.get(), genre: f.genre.get(), telephone: f.tel.get(),
      cni: f.cni.get(), date_naissance: f.dn.get(), region: f.region.get(), departement: f.dept.get(),
      commune: f.commune.get(), localite: f.localite.get(), milieu: f.milieu.get(),
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
function dataTable(cols, rows, rowActions) {
  const wrap = el('div.table-wrap');
  const t = el('table.tbl');
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

// ═══════════════════════════════ REGISTRE PROJETS ═══════════════════════════════
Pages.registre_projets = function () {
  const root = el('div.page');
  const search = el('input.search', { placeholder: '🔍 Rechercher (nom, région, statut, bailleur…)' });
  root.append(el('div.page-head', {}, [
    el('h1', { text: '📊 Registre des Projets' }),
    el('button.btn.btn-primary', { text: '＋ Nouveau projet', onclick: () => navigate('fiche_projet') }),
  ]));
  const host = el('div');
  const render = () => {
    host.innerHTML = '';
    const rows = DB.getAllProjets(search.value.trim());
    host.append(el('p.muted', { text: rows.length + ' projet(s)' }));
    host.append(dataTable([
      { key: 'pid', label: 'ID' },
      { key: 'nom', label: 'Nom' },
      { key: 'region', label: 'Région' },
      { key: 'technologie', label: 'Techno' },
      { label: 'Statut', render: r => { const s = STATUT_COLORS[r.statut]; return s ? chip(r.statut, { background: s.bg, color: s.fg }) : el('span', { text: r.statut || '' }); } },
      { label: 'Budget (FCFA)', render: r => el('span', { text: nf(Math.round(r.budget_total || 0)) }) },
      { label: 'Décaissé', render: r => el('span', { text: nf(Math.round(r.montant_decaisse || 0)) }) },
      { key: 'nb_menages_raccordes', label: 'Ménages' },
    ], rows, r => [
      el('button.ico-btn', { title: 'Modifier', text: '✏️', onclick: () => navigate('fiche_projet', r.pid) }),
      el('button.ico-btn', { title: 'Supprimer', text: '🗑️', onclick: async () => {
        if (await confirmDialog('Supprimer', `Supprimer ${r.pid} — « ${r.nom} » et ses composantes ?`)) { await DB.deleteProjet(r.pid); toast('Projet supprimé', 'ok'); render(); }
      } }),
    ]));
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

  const render = () => {
    host.innerHTML = '';
    const rows = DB.getComposantes(selProj.value, search.value.trim());
    const st = DB.statsComposantes(selProj.value);
    host.append(el('p.muted', { text: `${st.total} ligne(s) — ${st.C} composantes · ${st.A} activités · ${st.SA} sous-activités` }));
    host.append(dataTable([
      { key: 'pid', label: 'Projet' },
      { label: 'Type', render: r => typeChip(r.type) },
      { key: 'numero', label: 'N°' },
      { key: 'libelle', label: 'Libellé' },
      { key: 'responsable', label: 'Responsable' },
      { key: 'statut', label: 'Statut' },
    ], rows, r => [
      el('button.ico-btn', { title: 'Modifier', text: '✏️', onclick: () => editComp(r) }),
      el('button.ico-btn', { title: 'Supprimer', text: '🗑️', onclick: async () => {
        if (await confirmDialog('Supprimer', `Supprimer « ${r.numero} ${r.libelle} » ?`)) { await DB.deleteComposante(r.id); toast('Supprimé', 'ok'); render(); }
      } }),
    ]));
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
    const body = el('div.form-grid', {}, [fPid, fType, fNum, fLib, fResp, fDeb, fFin, fStat].map(x => x.node));
    modal(isEdit ? 'Modifier la composante' : 'Nouvelle composante', body, [
      { text: 'Annuler', kind: 'ghost', value: false },
      { text: 'Enregistrer', kind: 'primary', onClick: async () => {
        if (!fPid.get()) { toast('Choisissez un projet.', 'warn'); return false; }
        if (!fLib.get()) { toast('Le libellé est obligatoire.', 'warn'); return false; }
        const data = { pid: fPid.get(), type: fType.get() || 'C', numero: fNum.get(), libelle: fLib.get(),
          responsable: fResp.get(), date_debut: fDeb.get(), date_fin: fFin.get(), statut: fStat.get() };
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
  grid.append(card('🖨️', 'Rapport de synthèse (PDF)', 'Synthèse imprimable des indicateurs clés (Imprimer → Enregistrer en PDF).', [
    el('button.btn.btn-primary', { text: 'Générer le rapport', onclick: printReport }),
  ]));
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

function printReport() {
  const sp = DB.statsProjets(), sc = DB.statsClients(), cd = DB.statsClientsDetail(), mc = DB.menagesCiblesTotal();
  const tDec = sp.budget ? (sp.decaisse / sp.budget * 100).toFixed(1) : '0';
  const tRac = mc ? (sp.menages / mc * 100).toFixed(1) : '0';
  const tRec = cd.total ? (cd.a_jour / cd.total * 100).toFixed(1) : '0';
  const w = window.open('', '_blank');
  const row = (a, b) => `<tr><td>${a}</td><td style="text-align:right;font-weight:700">${b}</td></tr>`;
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Rapport ANPER SE</title>
  <style>body{font-family:Segoe UI,Arial,sans-serif;color:#0F172A;margin:40px;}
  h1{color:#157C3D;border-bottom:3px solid #157C3D;padding-bottom:8px}
  h2{color:#1E3A5F;margin-top:28px}
  table{border-collapse:collapse;width:100%;margin-top:8px}
  td{border:1px solid #E5E7EB;padding:8px 12px}
  .date{color:#64748B}</style></head><body>
  <h1>ANPER SE — Rapport de synthèse</h1>
  <p class="date">Agence Nigérienne pour la Promotion de l'Électrification Rurale — Niamey, Niger<br>Généré le ${new Date().toLocaleString('fr-FR')}</p>
  <h2>Indicateurs de base</h2><table>
  ${row('Nombre de projets', nf(sp.total))}${row('Clients raccordés', nf(sc.total))}
  ${row('Budget total (FCFA)', nf(Math.round(sp.budget)))}${row('Montant décaissé (FCFA)', nf(Math.round(sp.decaisse)))}
  ${row('Ménages raccordés', nf(sp.menages))}${row('Ménages cibles', nf(mc))}
  ${row('CO₂ évité (tCO₂)', nf(Math.round(sp.co2)))}${row('Emplois créés', nf(sp.emplois))}</table>
  <h2>Indicateurs calculés</h2><table>
  ${row('Taux de décaissement', tDec + ' %')}${row('Taux de raccordement', tRac + ' %')}
  ${row('Taux de recouvrement', tRec + ' %')}
  ${row('Consommation moyenne', Math.round(cd.avg_conso) + ' kWh/mois')}
  ${row('Puissance totale installée', nf(Math.round(cd.puissance_totale)) + ' VA')}</table>
  <script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

// ═══════════════════════════════ CARTE SIG ═══════════════════════════════
Pages.sig = function () {
  const root = el('div.page');
  root.append(el('div.page-head', {}, [el('h1', { text: '🗺️ Carte SIG — Répartition régionale' })]));
  const byReg = {};
  for (const p of DB.cache.projets) { const r = (p.region || '').trim(); if (!r) continue;
    byReg[r] = byReg[r] || { projets: 0, menages: 0 }; byReg[r].projets++; byReg[r].menages += +p.nb_menages_raccordes || 0; }
  const cv = el('canvas.sig-map'); cv.dataset.h = 460;
  root.append(el('p.muted', { text: 'Taille des bulles ∝ ménages raccordés. Carte schématique des 8 régions du Niger (fonctionne hors-ligne).' }));
  root.append(el('div.panel', { style: { padding: '8px' } }, [cv]));
  // tableau récap
  const rows = Object.entries(byReg).map(([region, d]) => ({ region, projets: d.projets, menages: nf(d.menages) }));
  root.append(dataTable([{ key: 'region', label: 'Région' }, { key: 'projets', label: 'Projets' }, { key: 'menages', label: 'Ménages raccordés' }], rows));

  root._onMount = () => {
    const { ctx, w, h } = Charts.setup(cv);
    // bornes lat/lng du Niger
    const lats = Object.values(REGION_COORDS).map(c => c[0]), lngs = Object.values(REGION_COORDS).map(c => c[1]);
    const latMin = Math.min(...lats) - 1, latMax = Math.max(...lats) + 1, lngMin = Math.min(...lngs) - 1, lngMax = Math.max(...lngs) + 1;
    const pad = 40;
    const X = lng => pad + (lng - lngMin) / (lngMax - lngMin) * (w - 2 * pad);
    const Y = lat => h - pad - (lat - latMin) / (latMax - latMin) * (h - 2 * pad);
    ctx.fillStyle = '#EAF2FB'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#CBD5E1'; ctx.strokeRect(8, 8, w - 16, h - 16);
    const maxMen = Math.max(1, ...Object.values(byReg).map(d => d.menages));
    for (const reg of REGIONS) {
      const co = REGION_COORDS[reg] || REGION_COORDS[reg.replace('é', 'e')]; if (!co) continue;
      const d = byReg[reg] || byReg[reg.replace('é', 'e')] || { projets: 0, menages: 0 };
      const x = X(co[1]), y = Y(co[0]);
      const r = 6 + Math.sqrt(d.menages / maxMen) * 34;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = d.projets ? 'rgba(21,124,61,0.55)' : 'rgba(148,163,184,0.5)'; ctx.fill();
      ctx.strokeStyle = d.projets ? T.PRIMARY : '#94A3B8'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#0F172A'; ctx.font = '700 11px Segoe UI'; ctx.textAlign = 'center';
      ctx.fillText(reg, x, y - r - 4);
      if (d.projets) { ctx.fillStyle = '#fff'; ctx.font = '700 10px Segoe UI'; ctx.fillText(d.projets, x, y + 3); }
    }
  };
  return root;
};
