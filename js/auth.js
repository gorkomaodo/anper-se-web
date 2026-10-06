/* Authentification unifiée ANPER (RH/admin + Suivi-Évaluation).
   Login unique, rôles (admin/gestionnaire/consultation) et cloisonnement par
   périmètre (allow = clés de pages visibles, S&E et administratives confondues).
   Mots de passe hachés PBKDF2-SHA256 (repli salé). Comptes stockés via DB.adminSet. */

const AUTH = (() => {
  let CURRENT = null;
  let onAuthed = null;
  const SEED_V = '5';

  // ── Hachage des mots de passe ───────────────────────────────────────────────
  const CRYPTO_OK = !!(window.crypto && crypto.subtle && crypto.subtle.deriveBits);
  const PWD_ITER = 120000;
  const buf2hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  const hex2buf = h => { const a = new Uint8Array(h.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16); return a.buffer; };
  function randSalt() { const a = new Uint8Array(16); crypto.getRandomValues(a); return buf2hex(a.buffer); }
  async function pbkdf2(pw, salt, iter) {
    const enc = new TextEncoder();
    const k = await crypto.subtle.importKey('raw', enc.encode(pw), { name: 'PBKDF2' }, false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: hex2buf(salt), iterations: iter, hash: 'SHA-256' }, k, 256);
    return buf2hex(bits);
  }
  function legacyHash(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; } return 'h' + (h >>> 0).toString(36); }
  function fallbackHash(pw, salt, iter) { let h = legacyHash(salt + '|' + pw); for (let i = 0; i < iter; i++) h = legacyHash(h + '|' + pw + '|' + i); return h; }
  async function makePass(pw) {
    const salt = randSalt();
    if (CRYPTO_OK) return { v: 2, salt, iter: PWD_ITER, hash: await pbkdf2(pw, salt, PWD_ITER) };
    return { v: 1, salt, iter: 4000, hash: fallbackHash(pw, salt, 4000) };
  }
  async function checkPass(pw, st) {
    if (!st) return false;
    if (st.v === 2 && CRYPTO_OK) return (await pbkdf2(pw, st.salt, st.iter)) === st.hash;
    if (st.v === 1) return fallbackHash(pw, st.salt, st.iter) === st.hash;
    return false;
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ── Comptes par défaut (mot de passe initial = identifiant) ─────────────────
  // allow = null → accès complet ; sinon liste des clés de pages autorisées.
  const SE_PAGES = ['dashboard', 'fiche_projet', 'fiche_client', 'registre_projets', 'registre_clients', 'registre_composantes', 'rapports', 'sig'];
  const SEED_USERS = [
    { username: 'oumarou', name: 'OUMAROU Adamou — Administrateur', role: 'admin', allow: null },
    { username: 'dg', name: 'ZAKAOUANOU Nouhou — Directeur Général', role: 'consultation', allow: null },
    { username: 'daaf', name: 'ABDELLATIF HAROU Djibo Waziry — DAAF', role: 'gestionnaire', allow: null },
    { username: 'rh', name: 'Ressources Humaines', role: 'gestionnaire', allow: ['adm_rhboard', 'adm_personnel', 'adm_actes', 'adm_conges', 'adm_ordremission', 'adm_assurances', 'adm_assures', 'adm_sinistres', 'adm_pointage', 'communication'] },
    { username: 'courrier', name: 'Bureau d’ordre — Courrier & Archives', role: 'gestionnaire', allow: ['adm_courrier', 'adm_archives', 'communication'] },
    { username: 'logistique', name: 'Logistique & Approvisionnement', role: 'gestionnaire', allow: ['adm_fournitures', 'adm_patrimoine', 'adm_inventaire', 'communication'] },
    { username: 'hse', name: 'Hygiène, Sécurité & Santé (HSE)', role: 'gestionnaire', allow: ['adm_hse', 'communication'] },
    { username: 'se', name: 'Suivi & Évaluation', role: 'gestionnaire', allow: [...SE_PAGES, 'communication'] },
    { username: 'pointage', name: 'Poste de pointage (accueil)', role: 'gestionnaire', allow: ['pointage_kiosk'] },
  ];
  async function buildUsers() { const a = []; for (const u of SEED_USERS) a.push({ id: uid(), username: u.username, pass: await makePass(u.username), name: u.name, role: u.role, allow: u.allow || null }); return a; }

  let _users = [];
  let _deleted = new Set();   // identifiants supprimés par l'administrateur (jamais recréés automatiquement)
  async function init() {
    _users = (await DB.adminGet('users')) || [];
    _deleted = new Set((await DB.adminGet('users_deleted')) || []);
    const stamped = await DB.adminGet('userseed_v');
    const KNOWN = ['admin', 'chefrh', 'oumarou', 'dg', 'daaf', 'rh', 'courrier', 'logistique', 'hse', 'se', 'coordonnateur', 'comptable', 'assurances'];
    const isFactory = async (us) => { try { for (const u of us) { if (!KNOWN.includes(u.username)) return false; if (!(await checkPass(u.username, u.pass))) return false; } return true; } catch (e) { return false; } };
    if (!_users.length) { _users = await buildUsers(); await DB.adminSet('users', _users); await DB.adminSet('userseed_v', SEED_V); }
    else if (stamped !== SEED_V && await isFactory(_users)) { _users = await buildUsers(); await DB.adminSet('users', _users); await DB.adminSet('userseed_v', SEED_V); }
    else if (stamped !== SEED_V) { await DB.adminSet('userseed_v', SEED_V); }
    // Migration douce : compléter les pages autorisées des comptes cloisonnés avec les
    // nouvelles pages ajoutées au périmètre par défaut (n'ajoute jamais, ne réinitialise rien).
    const seedAllow = {}; SEED_USERS.forEach(u => { if (Array.isArray(u.allow)) seedAllow[u.username] = u.allow; });
    let changed = false;
    for (const u of _users) {
      if (Array.isArray(u.allow) && seedAllow[u.username]) {
        for (const p of seedAllow[u.username]) if (!u.allow.includes(p)) { u.allow.push(p); changed = true; }
      }
    }
    // Compte « pointage » (poste kiosque à l'entrée) : créé aussi sur les
    // installations déjà en place (buildUsers() ne rejoue pas pour elles).
    if (!_users.some(u => u.username === 'pointage')) {
      _users.push({ id: uid(), username: 'pointage', name: 'Poste de pointage (accueil)', role: 'gestionnaire', allow: ['pointage_kiosk'], pass: await makePass('pointage') });
      changed = true;
    }
    if (changed) await DB.adminSet('users', _users);
  }

  // ── Périmètre d'accès ───────────────────────────────────────────────────────
  function isScoped() { return !!(CURRENT && CURRENT.role !== 'admin' && Array.isArray(CURRENT.allow)); }
  function canSee(key) { if (!CURRENT) return false; if (CURRENT.role === 'admin') return true; if (!Array.isArray(CURRENT.allow)) return true; return CURRENT.allow.includes(key); }
  function canWrite() { return !!CURRENT && (CURRENT.role === 'admin' || CURRENT.role === 'gestionnaire'); }
  function isAdmin() { return !!CURRENT && CURRENT.role === 'admin'; }
  function landingPage() { if (isScoped()) return CURRENT.allow[0] || 'dashboard'; return 'dashboard'; }
  const ROLE_LABEL = { admin: 'Administrateur', gestionnaire: 'Gestionnaire', consultation: 'Consultation' };

  // ── Écran de connexion ──────────────────────────────────────────────────────
  function renderLogin() {
    document.body.classList.add('pre-auth');
    const host = $('#login') || (() => { const d = el('div#login'); document.body.append(d); return d; })();
    host.innerHTML = '';
    const err = el('div.login-err');
    const user = el('input.field-in', { id: 'li-user', placeholder: 'ex. chefrh', autocomplete: 'username' });
    const pass = el('input.field-in', { id: 'li-pass', type: 'password', placeholder: '••••••••', autocomplete: 'current-password' });
    const eye = el('button.pw-eye', { type: 'button', title: 'Afficher / masquer', text: '👁', onclick: () => { const s = pass.type === 'password'; pass.type = s ? 'text' : 'password'; eye.textContent = s ? '🙈' : '👁'; } });
    pass.addEventListener('focus', () => { pass.type = 'text'; eye.textContent = '🙈'; });
    const submit = async () => {
      err.textContent = '';
      const u = user.value.trim(), p = pass.value;
      if (!u || !p) { err.textContent = 'Renseignez identifiant et mot de passe.'; return; }
      const found = _users.find(x => x.username.toLowerCase() === u.toLowerCase());
      if (!found || !(await checkPass(p, found.pass))) { err.textContent = 'Identifiant ou mot de passe incorrect.'; return; }
      CURRENT = found; pass.value = '';
      host.remove(); document.body.classList.remove('pre-auth');
      if (onAuthed) onAuthed();
    };
    pass.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    const card = el('div.login-card', {}, [
      el('div.login-head', {}, [
        el('img.login-logo', { src: 'icons/logo.png', alt: 'ANPER', onerror: function () { this.style.display = 'none'; } }),
        el('div', {}, [el('div.login-brand', { text: 'ANPER' }), el('div.login-sub', { text: (window.ANPER_APP === 'messagerie' || new URLSearchParams(location.search).has('messagerie')) ?'Messagerie interne — messages et appels entre agents' : 'Plateforme unifiée — Administration & Suivi-Évaluation' })]),
      ]),
      el('div.login-body', {}, [
        el('h2', { text: 'Connexion' }),
        el('label.field-lbl', { text: 'Identifiant' }), user,
        el('label.field-lbl', { text: 'Mot de passe', style: { marginTop: '10px' } }),
        el('div.pw-wrap', {}, [pass, eye]),
        el('button.btn.btn-primary.btn-block', { text: 'Se connecter', onclick: submit, style: { marginTop: '16px' } }),
        err,
      ]),
    ]);
    host.append(card);
    user.focus();
  }

  // Connexion automatique pour le raccourci « Pointage » (fenêtre Chrome dédiée,
  // ?kiosk=1 dans l'URL) : ne se connecte JAMAIS qu'au compte 'pointage' — la
  // valeur du paramètre n'est pas utilisée comme identifiant, pour éviter tout
  // détournement vers un autre compte. Échoue silencieusement (→ écran de
  // connexion normal) si le mot de passe du compte a été changé depuis la valeur
  // par défaut, pour ne jamais court-circuiter une vraie protection par mot de passe.
  const KIOSK_AUTOLOGIN_USER = 'pointage';
  async function tryKioskLogin() {
    const found = _users.find(x => x.username.toLowerCase() === KIOSK_AUTOLOGIN_USER);
    if (!found) return false;
    if (!(await checkPass(KIOSK_AUTOLOGIN_USER, found.pass))) return false;
    CURRENT = found;
    document.body.classList.remove('pre-auth');
    if (onAuthed) onAuthed();
    return true;
  }
  // ── Messagerie : connexion SANS mot de passe (demande de l'utilisateur, 28/09/2026) ──
  // L'agent choisit son nom dans la liste ; l'appareil s'en souvient (localStorage).
  // Ne vaut que pour la messagerie : cette session ne donne accès à aucune autre page,
  // et ouvrir la plateforme recharge la page, qui redemande identifiant + mot de passe.
  const MSG_LOGIN = false;   // plateforme : toujours identifiant + mot de passe (la messagerie est une application séparée)
  const MSG_KEY = 'anper_msg_user';
  const msgChoices = () => _users.filter(u => u.username !== 'pointage').sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr'));
  function msgEnter(u) {
    CURRENT = u;
    try { localStorage.setItem(MSG_KEY, u.username); } catch (e) {}
    const host = $('#login'); if (host) host.remove();
    document.body.classList.remove('pre-auth');
    if (onAuthed) onAuthed();
  }
  function renderMsgLogin() {
    document.body.classList.add('pre-auth');
    const host = $('#login') || (() => { const d = el('div#login'); document.body.append(d); return d; })();
    host.innerHTML = '';
    const search = el('input.field-in', { placeholder: 'Tapez votre nom…', autocomplete: 'off' });
    const list = el('div', { style: { maxHeight: '46vh', overflowY: 'auto', marginTop: '10px', border: '1px solid #E2E8F0', borderRadius: '8px' } });
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const paint = () => {
      const q = norm(search.value.trim());
      list.innerHTML = '';
      const rows = msgChoices().filter(u => !q || norm(u.name).includes(q) || norm(u.username).includes(q));
      if (!rows.length) { list.append(el('div', { text: 'Aucun agent trouvé.', style: { padding: '12px', color: '#64748B' } })); return; }
      for (const u of rows) list.append(el('button', {
        type: 'button', text: u.name, onclick: () => msgEnter(u),
        style: { display: 'block', width: '100%', textAlign: 'left', padding: '11px 14px', border: '0', borderBottom: '1px solid #EEF2F6', background: '#fff', cursor: 'pointer', font: 'inherit' },
      }));
    };
    search.addEventListener('input', paint);
    const card = el('div.login-card', {}, [
      el('div.login-head', {}, [
        el('img.login-logo', { src: 'icons/logo.png', alt: 'ANPER', onerror: function () { this.style.display = 'none'; } }),
        el('div', {}, [el('div.login-brand', { text: 'ANPER Messagerie' }), el('div.login-sub', { text: 'Messages et appels entre agents' })]),
      ]),
      el('div.login-body', {}, [
        el('h2', { text: 'Qui êtes-vous ?' }),
        el('p', { text: 'Choisissez votre nom (une seule fois sur cet appareil).', style: { margin: '0 0 8px', color: '#64748B', fontSize: '13px' } }),
        search, list,
      ]),
    ]);
    host.append(card);
    paint(); search.focus();
  }

  function start(cb) {
    onAuthed = cb;
    if (new URLSearchParams(location.search).has('kiosk')) {
      history.replaceState(null, '', location.pathname);
      tryKioskLogin().then(ok => { if (!ok) renderLogin(); });
      return;
    }
    if (MSG_LOGIN) {
      let saved = null; try { saved = localStorage.getItem(MSG_KEY); } catch (e) {}
      const u = saved && _users.find(x => x.username.toLowerCase() === saved.toLowerCase());
      if (u) { msgEnter(u); return; }
      renderMsgLogin();
      return;
    }
    renderLogin();
  }
  // Messagerie : « se déconnecter » = changer d'utilisateur sur cet appareil
  function logout() { CURRENT = null; if (MSG_LOGIN) { try { localStorage.removeItem(MSG_KEY); } catch (e) {} } location.reload(); }

  // ── Changer son mot de passe ────────────────────────────────────────────────
  function changePassword() {
    if (!CURRENT) return;
    const mk = ph => { const i = el('input.field-in', { type: 'password', placeholder: ph }); const w = el('div.pw-wrap', {}, [i, el('button.pw-eye', { type: 'button', text: '👁', onclick: () => { i.type = i.type === 'password' ? 'text' : 'password'; } })]); return { i, w }; };
    const a = mk('mot de passe actuel'), b = mk('nouveau (min. 6 car.)'), c = mk('confirmer');
    modal('Changer mon mot de passe', el('div', {}, [
      el('label.field-lbl', { text: 'Mot de passe actuel' }), a.w,
      el('label.field-lbl', { text: 'Nouveau mot de passe' }), b.w,
      el('label.field-lbl', { text: 'Confirmation' }), c.w,
    ]), [
      { text: 'Annuler', kind: 'ghost', value: false },
      { text: 'Modifier', kind: 'primary', onClick: async () => {
        if (!a.i.value || !b.i.value) { toast('Renseignez tous les champs.', 'err'); return false; }
        if (b.i.value.length < 6) { toast('6 caractères minimum.', 'err'); return false; }
        if (b.i.value !== c.i.value) { toast('La confirmation ne correspond pas.', 'err'); return false; }
        const me = _users.find(x => x.id === CURRENT.id);
        if (!me || !(await checkPass(a.i.value, me.pass))) { toast('Mot de passe actuel incorrect.', 'err'); return false; }
        me.pass = await makePass(b.i.value); await DB.adminSet('users', _users); CURRENT = me;
        toast('Mot de passe modifié ✔', 'ok');
      } },
    ]);
  }

  // ── Gestion des comptes (administrateur) ────────────────────────────────────
  function listUsers() { return _users.map(u => ({ id: u.id, username: u.username, name: u.name, role: u.role, allow: u.allow ? u.allow.slice() : null, isMe: !!(CURRENT && CURRENT.id === u.id) })); }
  async function saveUser(d) {
    const uname = (d.username || '').trim();
    if (!uname) throw new Error('Identifiant requis.');
    if (!(d.name || '').trim()) throw new Error('Nom requis.');
    if (_users.some(x => x.username.toLowerCase() === uname.toLowerCase() && x.id !== d.id)) throw new Error('Cet identifiant existe déjà.');
    const allow = (d.role === 'admin') ? null : (Array.isArray(d.allow) ? d.allow : null);
    let u = d.id ? _users.find(x => x.id === d.id) : null;
    if (u) {
      if (u.role === 'admin' && d.role !== 'admin' && _users.filter(x => x.role === 'admin').length <= 1) throw new Error('Impossible : ce serait le dernier administrateur.');
      u.username = uname; u.name = d.name.trim(); u.role = d.role; u.allow = allow;
      if (d.password) u.pass = await makePass(d.password);
      if (CURRENT && CURRENT.id === u.id) CURRENT = u;
    } else {
      u = { id: uid(), username: uname, name: d.name.trim(), role: d.role, allow, pass: await makePass(d.password || uname) };
      _users.push(u);
    }
    await DB.adminSet('users', _users);
    return u.id;
  }
  async function deleteUser(id) {
    const u = _users.find(x => x.id === id); if (!u) return;
    if (CURRENT && CURRENT.id === id) throw new Error('Vous ne pouvez pas supprimer votre propre compte.');
    if (u.role === 'admin' && _users.filter(x => x.role === 'admin').length <= 1) throw new Error('Impossible : c’est le dernier administrateur.');
    _users = _users.filter(x => x.id !== id); await DB.adminSet('users', _users);
    _deleted.add(u.username.toLowerCase()); await DB.adminSet('users_deleted', [..._deleted]);
  }
  async function resetPassword(id, pwd) {
    const u = _users.find(x => x.id === id); if (!u) throw new Error('Compte introuvable.');
    if (!pwd || pwd.length < 4) throw new Error('Mot de passe trop court (min. 4).');
    u.pass = await makePass(pwd); await DB.adminSet('users', _users);
    if (CURRENT && CURRENT.id === id) CURRENT = u;
  }

  // ── Création en masse d'un compte par agent du module Personnel ─────────────
  // Un agent qui a déjà un compte (comparaison par nom, insensible aux accents/
  // casse — couvre aussi bien les comptes de service « dg »/« rh »… que ceux
  // déjà générés lors d'un appel précédent) est ignoré : opération rejouable
  // sans jamais créer de doublons. Accès par défaut restreint à la Messagerie
  // (rôle gestionnaire, allow=['communication']) — l'administrateur élargit le
  // périmètre au cas par cas via ✎ dans Utilisateurs.
  const stripAccents = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const normName = s => stripAccents(s).toLowerCase().replace(/\s+/g, ' ').trim();
  const slug = s => stripAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, '').trim();
  async function bulkCreateFromPersonnel(list, opts = {}) {
    const existingNames = _users.map(u => normName(u.name));
    const takenUsernames = new Set(_users.map(u => u.username.toLowerCase()));
    let created = 0, skipped = 0;
    for (const p of (list || [])) {
      const nom = (p.nom || '').trim(), prenom = (p.prenom || '').trim();
      if (!nom && !prenom) { skipped++; continue; }
      const nomN = normName(nom), preN = normName(prenom);
      const hasAccount = existingNames.some(n => (!nomN || n.includes(nomN)) && (!preN || n.includes(preN)));
      if (hasAccount) { skipped++; continue; }
      let base = slug(prenom) + (prenom && nom ? '.' : '') + slug(nom);
      if (!base) { skipped++; continue; }
      let username = base, i = 2;
      while (takenUsernames.has(username)) { username = base + '-' + i; i++; }
      if (opts.auto && _deleted.has(username)) { skipped++; continue; }
      takenUsernames.add(username);
      const name = (nom + ' ' + prenom).trim();
      existingNames.push(normName(name));
      _users.push({ id: uid(), username, name, role: 'gestionnaire', allow: ['communication'], pass: await makePass(username) });
      created++;
    }
    if (created) await DB.adminSet('users', _users);
    return { created, skipped };
  }

  // ── Attribution automatique du périmètre selon la direction/service ─────────
  // Périmètre par défaut par direction (sans le préfixe 'communication', ajouté
  // systématiquement). null = ne pas toucher (ex. DAAF déjà couvert par le
  // compte de service existant, allow=null = accès complet).
  const DIRECTION_SCOPE = {
    'Direction Générale': ['dashboard', 'adm_courrier', 'adm_archives'],
    'Direction des Affaires Administratives et Financières': null,
    'Direction de l’Ingénierie': ['dashboard', 'fiche_projet', 'registre_projets', 'registre_composantes', 'sig'],
    'Unité de Gestion de Projets (Banque Mondiale)': ['dashboard', 'fiche_projet', 'registre_projets', 'rapports'],
    'Service Ressources Humaines': ['adm_rhboard', 'adm_personnel', 'adm_actes', 'adm_conges', 'adm_ordremission', 'adm_assurances', 'adm_assures', 'adm_sinistres', 'adm_pointage'],
    'Service Communication': ['adm_courrier', 'adm_archives'],
    'Service Passation des Marchés': ['adm_fournitures', 'adm_patrimoine', 'adm_inventaire'],
    'Service Comptabilité & Finances': ['dashboard', 'rapports'],
    'Service Suivi-Évaluation': ['dashboard', 'fiche_projet', 'fiche_client', 'registre_projets', 'registre_clients', 'registre_composantes', 'rapports', 'sig'],
    'Cellule Sauvegardes Environnementales & Sociales': ['adm_hse', 'dashboard', 'rapports'],
  };
  // Les catégories « Exécution » (chauffeurs, secrétaires, coursiers, gardien,
  // manœuvre…) restent volontairement à Messagerie uniquement : leur fonction
  // ne justifie pas l'accès aux modules RH/finances/projets de leur direction.
  const EXEC_CATS = ['Exécution'];
  async function bulkAssignByDirection(list) {
    let updated = 0, skipped = 0;
    for (const p of (list || [])) {
      const nom = (p.nom || '').trim(), prenom = (p.prenom || '').trim();
      const nomN = normName(nom), preN = normName(prenom);
      const u = _users.find(x => { const n = normName(x.name); return !!nomN && !!preN && n.includes(nomN) && n.includes(preN); });
      if (!u || u.role !== 'gestionnaire') { skipped++; continue; }
      if (EXEC_CATS.includes(p.categorie)) { skipped++; continue; }
      const scope = DIRECTION_SCOPE[p.service || p.direction];
      if (!scope) { skipped++; continue; }
      u.allow = [...scope, 'communication'];
      updated++;
    }
    if (updated) await DB.adminSet('users', _users);
    return { updated, skipped };
  }

  // ── Comptes identiques sur tous les appareils (synchro via Cloud.syncUsers) ──
  // Chaque compte est une ligne partagée, identifiée par son identifiant (username),
  // horodatée par _updated : la version la plus récente l'emporte partout (mot de
  // passe changé, compte créé ou supprimé par l'administrateur…). snap = état des
  // comptes lors de la dernière synchro, pour repérer les changements locaux.
  const userJson = u => JSON.stringify([u.username, u.name, u.role, u.allow || null, u.pass]);
  const shareable = u => ({ id: u.id, username: u.username, name: u.name, role: u.role, allow: u.allow || null, pass: u.pass, _updated: u._updated });
  const lc = s => String(s || '').toLowerCase();
  async function mergeUsers(remote, snap) {
    let changed = false;
    const now = Date.now();
    // Première synchro de cet appareil : un mot de passe personnalisé (≠ identifiant)
    // l'emporte sur un compte d'usine resté au mot de passe initial. Ensuite, un
    // compte sans horodatage vient d'être créé ici : il prend l'heure actuelle.
    const firstSync = !Object.keys(snap).length;
    for (const u of _users) if (!u._updated) { u._updated = firstSync ? ((await checkPass(u.username, u.pass)) ? 1 : 2) : now; changed = true; }
    const deletedHere = [];
    const ids = new Set(_users.map(u => u.id));
    for (const u of _users) {
      const s = snap[u.id];
      if (s && s.json !== userJson(u)) { u._updated = now; changed = true; if (lc(s.username) !== lc(u.username)) deletedHere.push(s.username); }
    }
    for (const id of Object.keys(snap)) if (!ids.has(id)) deletedHere.push(snap[id].username);
    const out = deletedHere.filter(n => !_users.some(x => lc(x.username) === lc(n))).map(n => ({ username: n, deleted: true, _updated: now }));
    const byName = new Map(remote.map(r => [lc(r.username), r]));
    for (const r of remote) {
      const i = _users.findIndex(x => lc(x.username) === lc(r.username));
      const l = i >= 0 ? _users[i] : null;
      if (r.deleted) {
        if (!_deleted.has(lc(r.username))) { _deleted.add(lc(r.username)); await DB.adminSet('users_deleted', [..._deleted]); }
        if (l && (r._updated || 0) > (l._updated || 0) && !(CURRENT && CURRENT.id === l.id)) { _users.splice(i, 1); changed = true; }
        continue;
      }
      if (!l) {
        if (!deletedHere.some(n => lc(n) === lc(r.username))) { _users.push({ ...shareable(r), id: r.id || uid() }); changed = true; }
        continue;
      }
      if ((r._updated || 0) > (l._updated || 0)) {
        Object.assign(l, { username: r.username, name: r.name, role: r.role, allow: r.allow || null, pass: r.pass, _updated: r._updated });
        if (CURRENT && CURRENT.id === l.id) CURRENT = l;
        changed = true;
      }
    }
    for (const u of _users) { const r = byName.get(lc(u.username)); if (!r || (u._updated || 0) > (r._updated || 0)) out.push(shareable(u)); }
    for (const k of Object.keys(snap)) delete snap[k];
    for (const u of _users) snap[u.id] = { username: u.username, json: userJson(u) };
    if (changed) await DB.adminSet('users', _users);
    return { out, changed };
  }

  return { init, start, logout, changePassword, canSee, canWrite, isAdmin, isScoped, landingPage,
    listUsers, saveUser, deleteUser, resetPassword, bulkCreateFromPersonnel, bulkAssignByDirection, mergeUsers,
    current: () => CURRENT, roleLabel: () => ROLE_LABEL[CURRENT ? CURRENT.role : ''] || '' };
})();
window.AUTH = AUTH;
