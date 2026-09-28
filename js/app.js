/* Shell applicatif ANPER SE — routeur, navigation, installation PWA. */

let currentPage = 'dashboard';
let deferredPrompt = null;

// Messagerie détachée : ?messagerie=1 ouvre une fenêtre dédiée qui n'affiche QUE la
// messagerie (onglet indépendant du menu ANPER / de l'app Windows). La plateforme
// n'a plus la messagerie dans son menu latéral, seulement un bouton pour l'ouvrir à part.
// App « ANPER Messagerie » autonome (messagerie.html : window.ANPER_APP = 'messagerie') :
// même mode, sans aucun lien vers la plateforme.
const MSG_STANDALONE = window.ANPER_APP === 'messagerie';
const MSG_MODE = MSG_STANDALONE || new URLSearchParams(location.search).has('messagerie');
const MSG_PAGE = 'communication';
function messagerieUrl() { return location.pathname + '?messagerie=1'; }
function openMessagerie() {
  // App Android (Capacitor) : une seule fenêtre → on bascule ; ailleurs : fenêtre à part
  if (window.Capacitor) location.href = messagerieUrl();
  else { const w = window.open(messagerieUrl(), 'anper_messagerie'); if (!w) location.href = messagerieUrl(); }
}
window.openMessagerie = openMessagerie;

function navigate(page, arg) {
  if (MSG_MODE) page = MSG_PAGE;
  // Cloisonnement : rediriger si la page n'est pas dans le périmètre de l'utilisateur
  else if (window.AUTH && AUTH.current() && !AUTH.canSee(page)) page = AUTH.landingPage();
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
  side.innerHTML = '';
  side.append(el('div.brand', {}, [
    el('img.brand-logo', { src: 'icons/logo.png', alt: 'ANPER', onerror: function () { this.style.display = 'none'; } }),
    el('div.brand-name', { text: 'ANPER' }),
    el('div.brand-sub', { text: MSG_MODE ? 'Messagerie interne' : 'Plateforme unifiée' }),
  ]));
  const groups = MSG_MODE ? []
    : ((typeof NAV_GROUPS !== 'undefined') ? NAV_GROUPS : [{ label: 'NAVIGATION', items: NAV_ITEMS }])
        .map(g => ({ ...g, items: g.items.filter(([i, l, p]) => p !== MSG_PAGE) }));
  for (const g of groups) {
    const items = g.items.filter(([i, l, p]) => !window.AUTH || AUTH.canSee(p));
    if (!items.length) continue;
    side.append(el('div.nav-label', { text: g.label }));
    for (const [icon, label, page] of items) {
      side.append(el('button.nav-btn', { 'data-page': page, onclick: () => navigate(page) }, [
        el('span.nav-ico', { text: icon }), el('span', { text: label }),
      ]));
    }
  }
  if (!MSG_STANDALONE && window.AUTH && AUTH.canSee(MSG_PAGE)) {
    side.append(el('div.nav-label', { text: 'Communication' }));
    side.append(MSG_MODE
      ? el('button.nav-btn', { onclick: () => { location.href = location.pathname; } }, [el('span.nav-ico', { text: '🏠' }), el('span', { text: 'Ouvrir la plateforme' })])
      : el('button.nav-btn', { onclick: openMessagerie }, [el('span.nav-ico', { text: '💬' }), el('span', { text: 'Messagerie (fenêtre à part)' })]));
  }
  if (!MSG_MODE && window.AUTH && AUTH.isAdmin()) {
    side.append(el('div.nav-label', { text: 'Administration' }));
    side.append(el('button.nav-btn', { 'data-page': 'adm_users', onclick: () => navigate('adm_users') }, [el('span.nav-ico', { text: '👥' }), el('span', { text: 'Utilisateurs' })]));
    side.append(el('button.nav-btn', { 'data-page': 'adm_journal', onclick: () => navigate('adm_journal') }, [el('span.nav-ico', { text: '📑' }), el('span', { text: 'Journal d’activité' })]));
    side.append(el('button.nav-btn', { 'data-page': 'adm_sauvegarde', onclick: () => navigate('adm_sauvegarde') }, [el('span.nav-ico', { text: '💾' }), el('span', { text: 'Sauvegarde' })]));
  }
  if (!MSG_MODE && (!window.AUTH || AUTH.isAdmin())) {
    const tools = el('div.nav-tools');
    tools.append(el('button.nav-btn.small', { onclick: importRenaloc }, [el('span.nav-ico', { text: '⚙️' }), el('span', { text: 'Importer RENALOC' })]));
    tools.append(el('button.nav-btn.small', { onclick: resetData }, [el('span.nav-ico', { text: '🧹' }), el('span', { text: 'Réinitialiser' })]));
    side.append(tools);
  }
  if (window.AUTH && AUTH.current()) {
    const u = AUTH.current();
    side.append(el('div.user-chip', {}, [
      el('div.user-av', { text: (u.name[0] || 'U').toUpperCase() }),
      el('div.user-meta', {}, [el('div.user-nm', { text: u.name }), el('div.user-rl', { text: AUTH.roleLabel() })]),
      MSG_MODE ? null : el('button.user-ic', { title: 'Changer mon mot de passe', text: '🔑', onclick: () => AUTH.changePassword() }),
      el('button.user-ic', { title: MSG_MODE ? 'Changer d’utilisateur' : 'Se déconnecter', text: '⎋', onclick: () => AUTH.logout() }),
    ]));
  }
  side.append(el('div.version', { text: MSG_STANDALONE ? 'ANPER Messagerie · 2026' : 'ANPER · Plateforme unifiée v1.0 · 2026' }));
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
  const cfg = Cloud.getConfig();
  const s = Cloud.state;
  const body = el('div.sync-modal');

  // 1. Connexion au projet Supabase (adresse + clé publique « anon »)
  body.append(el('div.sync-step', {}, [
    el('h4', { text: '1. Connexion au projet partagé (Supabase)' }),
    el('p.muted', { text: 'Collez l\'adresse du projet et la clé publique « anon » (fournies par l\'administrateur, voir PARTAGE_SUPABASE.md). Une seule fois par appareil.' }),
  ]));
  const fUrl = el('input.field-in', { placeholder: 'https://xxxx.supabase.co', value: cfg.url });
  const fKey = el('input.field-in', { placeholder: 'Clé anon (eyJhbGciOi…)', value: cfg.key });
  const saveBtn = el('button.btn.btn-ghost', { text: 'Enregistrer la connexion', onclick: async () => {
    try { await Cloud.configure(fUrl.value, fKey.value); await Cloud.init(); toast('Connexion enregistrée ✔', 'ok'); reopen(); }
    catch (e) { toast('Erreur : ' + e.message, 'err', 6000); }
  } });
  body.append(fUrl, fKey, saveBtn);

  // 2. Compte utilisateur (e-mail + mot de passe)
  const accLine = el('div.sync-acc', { text: s.account ? '✓ Connecté : ' + s.account : 'Non connecté.' });
  const fEmail = el('input.field-in', { type: 'email', placeholder: 'votre e-mail' });
  const fPwd = el('input.field-in', { type: 'password', placeholder: 'mot de passe (min. 6 caractères)' });
  const fPwdEye = el('button.pw-eye', { type: 'button', title: 'Afficher / masquer', text: '👁', onclick: () => { const s = fPwd.type === 'password'; fPwd.type = s ? 'text' : 'password'; fPwdEye.textContent = s ? '🙈' : '👁'; } });
  fPwd.addEventListener('focus', () => { fPwd.type = 'text'; fPwdEye.textContent = '🙈'; });
  const fPwdWrap = el('div.pw-wrap', {}, [fPwd, fPwdEye]);
  const inBtn = el('button.btn.btn-primary', { text: 'Se connecter', onclick: async () => {
    try { await Cloud.signIn(fEmail.value.trim(), fPwd.value); toast('Connecté ✔', 'ok'); await Cloud.syncNow(); reopen(); }
    catch (e) { toast('Connexion : ' + e.message, 'err', 6000); }
  } });
  const upBtn = el('button.btn.btn-ghost', { text: 'Créer un compte', onclick: async () => {
    try { const r = await Cloud.signUp(fEmail.value.trim(), fPwd.value);
      if (r === 'confirm') toast('Compte créé — confirmez via l\'e-mail reçu, puis connectez-vous.', 'info', 7000);
      else { toast('Compte créé et connecté ✔', 'ok'); await Cloud.syncNow(); }
      reopen();
    } catch (e) { toast('Création : ' + e.message, 'err', 6000); }
  } });
  const outBtn = el('button.btn.btn-ghost', { text: 'Se déconnecter', onclick: async () => { await Cloud.signOut(); reopen(); } });
  const step2 = el('div.sync-step', {}, [el('h4', { text: '2. Votre compte' }), accLine]);
  if (s.account) step2.append(outBtn);
  else if (Cloud.isConfigured()) step2.append(fEmail, fPwdWrap, el('div.sync-row', {}, [inBtn, upBtn]));
  else step2.append(el('p.muted', { text: '➳ Enregistrez d\'abord la connexion (étape 1).' }));
  body.append(step2);

  // 3. Synchro
  body.append(el('div.sync-step', {}, [
    el('h4', { text: '3. Synchronisation temps réel' }),
    el('p.muted', { text: s.lastSync ? 'Dernière synchro : ' + new Date(s.lastSync).toLocaleString('fr-FR') : 'Jamais synchronisé.' }),
    s.error ? el('p', { text: '⚠ ' + s.error, style: { color: '#B91C1C' } }) : null,
    s.account ? el('button.btn.btn-primary', { text: '🔄 Synchroniser maintenant', onclick: async () => {
      try { await Cloud.syncNow(); toast('Synchronisé ✔', 'ok'); refreshCurrent(); reopen(); }
      catch (e) { toast('Synchro : ' + e.message, 'err', 6000); }
    } }) : null,
    el('p.muted', { text: 'Une fois connecté : synchro automatique en temps réel entre tous les utilisateurs.' }),
  ]));

  modal('☁️ Partage multi-utilisateur (Supabase)', body);
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

// Tous les agents dans la messagerie : un compte par agent actif du module Personnel
// (identifiant prenom.nom, mot de passe initial = identifiant, accès Messagerie seule),
// créé une fois puis partagé entre appareils par la synchro des comptes. Un compte
// supprimé par l'administrateur n'est jamais recréé automatiquement.
async function ensureAgentAccounts() {
  try {
    const pers = ((await DB.adminGet('data:personnel')) || []).filter(p => p.statut !== 'Sorti');
    const r = await AUTH.bulkCreateFromPersonnel(pers, { auto: true });
    if (r.created && Cloud.signedIn()) await Cloud.syncUsers();
    return r.created;
  } catch (e) { console.warn('Comptes agents :', e); return 0; }
}

// ── Démarrage ─────────────────────────────────────────────────────────────────
async function boot() {
  try { await DB.init(); }
  catch (e) { document.body.innerHTML = '<p style="padding:40px;color:#B91C1C">Erreur d\'initialisation : ' + e.message + '</p>'; return; }
  // Authentification + domaine administratif
  try { await AUTH.init(); await ADM.init(); ADM.register(); }
  catch (e) { console.warn('Init auth/admin :', e); }

  $('#menu-btn').addEventListener('click', openSidebar);
  $('#scrim').addEventListener('click', closeSidebar);
  $('#install-btn').addEventListener('click', doInstall);
  $('#cloud-btn').addEventListener('click', openSyncModal);
  { const hb = $('#help-btn'); if (hb) hb.addEventListener('click', () => window.Help && Help.open(currentPage)); }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    let swRefreshed = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (swRefreshed) return;
      swRefreshed = true;
      window.location.reload();
    });
  }

  // Comptes à jour AVANT la connexion : un agent retrouve son compte (et son dernier
  // mot de passe) sur un appareil neuf. Hors connexion : on n'attend pas plus de 5 s.
  try {
    await Promise.race([
      (async () => { await Cloud.init(); if (!Cloud.signedIn()) await Cloud.ensureAutoAccount(); await Cloud.syncUsers(); })(),
      new Promise(r => setTimeout(r, 5000)),
    ]);
  } catch (e) { console.warn('Synchro des comptes avant connexion :', e); }
  await ensureAgentAccounts();

  AUTH.start(afterLogin);  // affiche le login ; afterLogin() appelé une fois connecté
}

async function afterLogin() {
  if (MSG_MODE) {
    document.title = MSG_STANDALONE ? 'ANPER Messagerie' : 'ANPER — Messagerie interne';
    const t = $('.topbar-title'); if (t) t.textContent = 'ANPER — Messagerie interne (messages et appels)';
  } else {
    // Accès direct à la messagerie détachée depuis la barre du haut
    const hb = $('#help-btn');
    if (hb && AUTH.canSee(MSG_PAGE)) hb.before(el('button.btn.btn-install', { title: 'Ouvrir la messagerie dans une fenêtre à part', text: '💬 Messagerie', onclick: openMessagerie }));
  }
  buildSidebar();
  // Synchronisation multi-utilisateur (Supabase) — données S&E
  try {
    Cloud.onStatus(updateCloudBadge);
    // Messages et appels reçus uniquement dans la fenêtre Messagerie (évite une double
    // sonnerie quand la plateforme et la messagerie sont ouvertes en même temps)
    Cloud.onStatus((s) => { if (MSG_MODE && s.account && window.Chat) Chat.subscribeRealtime(); });
    Cloud.onStatus((s) => { if (s.account && window.Pointage) Pointage.trySync(); });
    Cloud.enableAutoSync(refreshCurrent);
    await Cloud.init();
    if (!Cloud.signedIn()) { try { await Cloud.ensureAutoAccount(); } catch (e) {} }
    if (Cloud.signedIn()) { await Cloud.pull(); await ensureAgentAccounts(); Cloud.subscribeRealtime(); refreshCurrent(); }
  } catch (e) { console.warn('Cloud init:', e); }
  // Numérotation continue des projets (trou laissé par une suppression) — même
  // résultat sur tous les appareils, poussé ensuite par l'auto-synchro
  try { const pl = await DB.renumberProjets(true); if (pl.length) toast(pl.length + ' projet(s) renuméroté(s)', 'ok'); } catch (e) { console.warn('Renumérotation :', e); }

  window.addEventListener('hashchange', () => { const p = location.hash.slice(1); if (p && p !== currentPage && Pages[p]) navigate(p); });
  window.addEventListener('resize', () => { if (Pages[currentPage] && $('#content').firstChild && $('#content').firstChild._onMount) {
    clearTimeout(window._rz); window._rz = setTimeout(() => { const n = $('#content').firstChild; if (n && n._onMount) n._onMount(); }, 200);
  } });
  const start = location.hash.slice(1);
  const ok = start && start !== MSG_PAGE && Pages[start] && AUTH.canSee(start);
  const land = AUTH.landingPage();
  // Compte « Messagerie uniquement » ouvert sur la plateforme : bascule sur la messagerie
  if (!MSG_MODE && !ok && land === MSG_PAGE) { location.href = messagerieUrl(); return; }
  navigate(ok ? start : land);
}
boot();
