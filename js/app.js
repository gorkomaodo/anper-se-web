/* Shell applicatif ANPER SE — routeur, navigation, installation PWA. */

let currentPage = 'dashboard';
let deferredPrompt = null;

function navigate(page, arg) {
  currentPage = page;
  const content = $('#content');
  content.innerHTML = '';
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  const fn = Pages[page];
  let node;
  if (!fn) node = el('div.page', {}, [el('h1', { text: 'Page indisponible' })]);
  else node = fn(arg);
  content.append(node);
  if (node._onMount) node._onMount();
  content.scrollTop = 0;
  closeSidebar();
  location.hash = page;
}
window.navigate = navigate;

function buildSidebar() {
  const side = $('#sidebar');
  side.append(el('div.brand', {}, [
    el('img.brand-logo', { src: 'icons/logo.png', alt: 'ANPER', onerror: function () { this.style.display = 'none'; } }),
    el('div.brand-name', { text: 'ANPER SE' }),
    el('div.brand-sub', { text: 'Gestion Énergies Renouvelables' }),
  ]));
  side.append(el('div.nav-label', { text: 'NAVIGATION' }));
  for (const [icon, label, page] of NAV_ITEMS) {
    side.append(el('button.nav-btn', { 'data-page': page, onclick: () => navigate(page) }, [
      el('span.nav-ico', { text: icon }), el('span', { text: label }),
    ]));
  }
  const tools = el('div.nav-tools');
  tools.append(el('button.nav-btn.small', { onclick: importRenaloc }, [el('span.nav-ico', { text: '⚙️' }), el('span', { text: 'Importer RENALOC' })]));
  tools.append(el('button.nav-btn.small', { onclick: resetData }, [el('span.nav-ico', { text: '🧹' }), el('span', { text: 'Réinitialiser' })]));
  side.append(tools);
  side.append(el('div.version', { text: 'ANPER SE v1.0 (Web/Android) · 2026' }));
}

function closeSidebar() { $('#sidebar').classList.remove('open'); $('#scrim').classList.remove('show'); }
function openSidebar() { $('#sidebar').classList.add('open'); $('#scrim').classList.add('show'); }

// ── Import RENALOC depuis un CSV (region;departement;commune;localite) ──────────
function importRenaloc() {
  const inp = el('input', { type: 'file', accept: '.csv,.txt' });
  inp.addEventListener('change', async () => {
    const file = inp.files[0]; if (!file) return;
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      const sep = lines[0].includes(';') ? ';' : (lines[0].includes('\t') ? '\t' : ',');
      const header = lines[0].toLowerCase().split(sep).map(s => s.trim());
      const idx = (names) => header.findIndex(h => names.some(n => h.includes(n)));
      const iR = idx(['region', 'région']), iD = idx(['depart']), iC = idx(['commune']), iL = idx(['localit']);
      if (iR < 0) { toast('Colonne « région » introuvable dans le CSV.', 'err'); return; }
      const rows = lines.slice(1).map(l => { const c = l.split(sep);
        return { region: (c[iR] || '').trim(), departement: (c[iD] || '').trim(), commune: (c[iC] || '').trim(), localite: (c[iL] || '').trim() }; });
      const n = await DB.importRenalocRows(rows);
      toast(`${nf(n)} localités importées ✔`, 'ok');
    } catch (e) { toast('Erreur import : ' + e.message, 'err'); }
  });
  modal('Importer RENALOC', el('div', {}, [
    el('p', { text: 'Sélectionnez un fichier CSV avec les colonnes : région, département, commune, localité (séparateur ; , ou tabulation).' }),
    el('p.muted', { text: 'Astuce : depuis Excel, « Enregistrer sous → CSV UTF-8 ».' }),
  ]), [{ text: 'Annuler', kind: 'ghost', value: false }, { text: 'Choisir un fichier', kind: 'primary', onClick: () => { inp.click(); } }]);
}

async function resetData() {
  if (!await confirmDialog('Réinitialiser', 'Effacer TOUTES les données locales (projets, clients, composantes, RENALOC) et recharger les données initiales ?')) return;
  await DB.resetAll();
  await DB.init();
  toast('Données réinitialisées ✔', 'ok');
  navigate('dashboard');
}

// ── Synchronisation OneDrive (multi-utilisateur) ──────────────────────────────
function refreshCurrent() {
  // Évite d'écraser un formulaire en cours de saisie
  if (currentPage === 'fiche_projet' || currentPage === 'fiche_client') return;
  const n = $('#content').firstChild;
  if (n && n._onMount) n._onMount();
}

function updateCloudBadge(s) {
  const lbl = $('#cloud-state'); if (!lbl) return;
  const map = { off: 'Connexion…', idle: 'Synchronisé', syncing: 'Synchro…', error: 'Erreur' };
  if (!s.account) lbl.textContent = 'Partage';
  else if (s.status === 'idle' && s.lastSync) lbl.textContent = '✓ ' + new Date(s.lastSync).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  else lbl.textContent = map[s.status] || 'Partage';
  $('#cloud-btn').classList.toggle('cloud-on', !!s.account);
  $('#cloud-btn').classList.toggle('cloud-err', s.status === 'error');
}

function openSyncModal() {
  const cfg = Sync.getConfig();
  const s = Sync.state;
  const body = el('div.sync-modal');

  // 1. Identifiant d'application Azure
  body.append(el('div.sync-step', {}, [
    el('h4', { text: '1. Identifiant d\'application (Azure)' }),
    el('p.muted', { text: 'Collez le « ID d\'application (client) » obtenu lors de l\'inscription Azure (voir README). Une seule fois.' }),
  ]));
  const fClient = el('input.field-in', { placeholder: 'client_id (ex: 1234abcd-…)', value: cfg.clientId });
  body.append(fClient);

  // 2. Connexion Microsoft
  const accLine = el('div.sync-acc', { text: s.account ? '✓ Connecté : ' + s.account : 'Non connecté.' });
  const btnSign = el('button.btn.btn-primary', { text: s.account ? 'Se déconnecter' : 'Se connecter à Microsoft', onclick: async () => {
    try {
      await Sync.setClientId(fClient.value);
      if (Sync.signedIn()) { await Sync.signOut(); }
      else { await Sync.signIn(); }
      reopen();
    } catch (e) { toast('Connexion : ' + e.message, 'err', 5000); }
  } });
  body.append(el('div.sync-step', {}, [el('h4', { text: '2. Compte Microsoft (OneDrive)' }), accLine, btnSign]));

  // 3. Partage
  const fLink = el('input.field-in', { placeholder: 'Lien de partage reçu (collègues)', value: cfg.shareLink });
  const ownerBtn = el('button.btn.btn-ghost', { text: '👑 Je suis l\'administrateur : créer le lien à partager', onclick: async () => {
    if (!Sync.signedIn()) return toast('Connectez-vous d\'abord.', 'warn');
    try {
      toast('Création du fichier partagé…', 'info');
      const link = await Sync.createShareLink();
      fLink.value = '';
      await navigator.clipboard?.writeText(link).catch(() => {});
      modal('Lien de partage créé ✔', el('div', {}, [
        el('p', { text: 'Envoyez ce lien à vos collègues. Ils le collent dans le champ « Lien de partage reçu » puis se connectent avec leur compte Microsoft.' }),
        el('textarea.field-in', { rows: 3, readonly: true, onclick: e => e.target.select() }, [link]),
        el('p.muted', { text: 'Lien copié dans le presse-papiers.' }),
      ]));
    } catch (e) { toast('Erreur : ' + e.message, 'err', 6000); }
  } });
  const joinBtn = el('button.btn.btn-primary', { text: 'Utiliser ce lien de partage', onclick: async () => {
    try { await Sync.setShareLink(fLink.value); toast('Lien enregistré ✔', 'ok'); await Sync.syncNow(refreshCurrent); reopen(); }
    catch (e) { toast('Erreur : ' + e.message, 'err', 6000); }
  } });
  body.append(el('div.sync-step', {}, [
    el('h4', { text: '3. Partage des données' }),
    el('p.muted', { text: 'Administrateur (propriétaire des données) : créez le lien. Collègues : collez le lien reçu.' }),
    ownerBtn, el('div.sync-or', { text: '— ou —' }), fLink, joinBtn,
  ]));

  // 4. Synchro
  body.append(el('div.sync-step', {}, [
    el('h4', { text: '4. Synchronisation' }),
    el('p.muted', { text: s.lastSync ? 'Dernière synchro : ' + new Date(s.lastSync).toLocaleString('fr-FR') : 'Jamais synchronisé.' }),
    s.error ? el('p', { text: '⚠ ' + s.error, style: { color: '#B91C1C' } }) : null,
    el('button.btn.btn-primary', { text: '🔄 Synchroniser maintenant', onclick: async () => {
      try { await Sync.syncNow(refreshCurrent); toast('Synchronisé ✔', 'ok'); reopen(); }
      catch (e) { toast('Synchro : ' + e.message, 'err', 6000); }
    } }),
    el('p.muted', { text: 'La synchro est automatique après chaque modification (toutes les ~3 s).' }),
  ]));

  const overlay = modal('☁️ Partage OneDrive — multi-utilisateur', body);
  function reopen() { document.querySelector('.overlay')?.remove(); openSyncModal(); }
}

// ── Installation PWA ──────────────────────────────────────────────────────────
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); deferredPrompt = e;
  const btn = $('#install-btn'); if (btn) btn.style.display = 'inline-flex';
});
async function doInstall() {
  if (!deferredPrompt) { toast('Pour installer : menu du navigateur → « Ajouter à l\'écran d\'accueil ».', 'info', 5000); return; }
  deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null;
  $('#install-btn').style.display = 'none';
}

// ── Démarrage ─────────────────────────────────────────────────────────────────
async function boot() {
  try { await DB.init(); }
  catch (e) { document.body.innerHTML = '<p style="padding:40px;color:#B91C1C">Erreur d\'initialisation : ' + e.message + '</p>'; return; }
  buildSidebar();
  $('#menu-btn').addEventListener('click', openSidebar);
  $('#scrim').addEventListener('click', closeSidebar);
  $('#install-btn').addEventListener('click', doInstall);
  $('#cloud-btn').addEventListener('click', openSyncModal);

  // Synchronisation OneDrive
  try {
    await Sync.loadConfig();
    Sync.onStatus(updateCloudBadge);
    Sync.enableAutoSync(refreshCurrent);
    updateCloudBadge(Sync.state);
    if (Sync.isConfigured()) {
      const ok = await Sync.tryAutoSignIn();
      updateCloudBadge(Sync.state);
      if (ok) Sync.pull(refreshCurrent).catch(() => {});
    }
  } catch (e) { console.warn('Sync init:', e); }

  window.addEventListener('hashchange', () => { const p = location.hash.slice(1); if (p && p !== currentPage && Pages[p]) navigate(p); });
  window.addEventListener('resize', () => { if (Pages[currentPage] && $('#content').firstChild && $('#content').firstChild._onMount) {
    clearTimeout(window._rz); window._rz = setTimeout(() => { const n = $('#content').firstChild; if (n && n._onMount) n._onMount(); }, 200);
  } });
  const start = location.hash.slice(1);
  navigate(Pages[start] ? start : 'dashboard');
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
