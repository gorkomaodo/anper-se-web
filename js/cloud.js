/* Synchronisation multi-utilisateur via Supabase (base Postgres centrale + temps réel).
   Aucun Microsoft/Azure. Données protégées par authentification (e-mail + mot de passe)
   + RLS : seuls les utilisateurs connectés lisent/écrivent. Modèle de fusion identique
   à db.js (uid/_updated/tombstones) : convergence même en cas d'édition concurrente. */

const Cloud = (() => {
  const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  // Projet Supabase partagé ANPER (org gorkomaodo) — figé en dur pour que tous les
  // appareils se connectent automatiquement, sans saisie manuelle de l'étape 1. La
  // clé « publishable » est conçue pour être publique (sécurité = authentification,
  // pas secret de clé) : sans risque à l'embarquer dans le code client.
  const DEFAULT_URL = '';
  const DEFAULT_KEY = '';
  // Compte Supabase technique partagé : la RLS n'exige qu'un utilisateur "authenticated"
  // (peu importe lequel — l'identité affichée dans le chat vient du compte LOCAL de
  // l'app, jamais de Supabase). Connexion automatique et silencieuse pour tous les
  // appareils : plus aucune saisie d'e-mail/mot de passe requise pour activer la
  // synchronisation ou la messagerie/appels.
  const AUTO_SYNC_EMAIL = '';
  const AUTO_SYNC_PASSWORD = '';
  let sb = null;                 // client supabase
  let cfg = { url: '', key: '' };
  let user = null;
  let pushTimer = null, busy = false, channel = null;
  let _refreshUI = null;
  const listeners = [];
  const state = { status: 'off', lastSync: null, account: null, error: '' };
  const onStatus = (fn) => { listeners.push(fn); fn(state); };
  const emit = () => listeners.forEach(f => { try { f(state); } catch (e) {} });
  const setStatus = (s, extra = {}) => { Object.assign(state, { status: s }, extra); emit(); };

  async function loadConfig() {
    cfg.url = (await DB.syncGet('sb_url')) || DEFAULT_URL;
    cfg.key = (await DB.syncGet('sb_key')) || DEFAULT_KEY;
    state.lastSync = (await DB.syncGet('sb_lastSync')) || null;
  }
  const isConfigured = () => !!(cfg.url && cfg.key);
  const getConfig = () => ({ ...cfg });
  async function configure(url, key) {
    cfg.url = (url || '').trim().replace(/\/$/, ''); cfg.key = (key || '').trim();
    await DB.syncSet('sb_url', cfg.url); await DB.syncSet('sb_key', cfg.key);
    sb = null; // forcera une recréation
  }

  function loadScript(src) {
    return new Promise((res, rej) => {
      if (window.supabase && window.supabase.createClient) return res();
      if ([...document.scripts].some(s => s.src === src)) { const t = setInterval(() => { if (window.supabase) { clearInterval(t); res(); } }, 50); return; }
      const s = document.createElement('script'); s.src = src; s.onload = res;
      s.onerror = () => rej(new Error('Chargement de Supabase impossible (hors-ligne ?)'));
      document.head.append(s);
    });
  }
  async function ensureClient() {
    if (!isConfigured()) throw new Error('Adresse du projet et clé Supabase non configurées.');
    await loadScript(CDN);
    if (!sb) sb = window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: true, storageKey: 'anper_sb_auth' } });
    return sb;
  }

  async function init() {
    await loadConfig();
    if (!isConfigured()) { setStatus('off'); return; }
    try {
      await ensureClient();
      const { data } = await sb.auth.getSession();
      if (data && data.session) { user = data.session.user; state.account = user.email; setStatus('idle'); }
      else setStatus('off');
      sb.auth.onAuthStateChange((_e, session) => {
        user = session ? session.user : null;
        state.account = user ? user.email : null;
        setStatus(user ? 'idle' : 'off');
      });
    } catch (e) { setStatus('error', { error: e.message }); }
  }

  async function signUp(email, password) {
    await ensureClient();
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) throw error;
    if (data.user && !data.session) return 'confirm'; // confirmation e-mail requise
    user = data.user; state.account = user.email; setStatus('idle'); return 'ok';
  }
  async function signIn(email, password) {
    await ensureClient();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    user = data.user; state.account = user.email; setStatus('idle'); return 'ok';
  }
  async function signOut() {
    if (sb) { try { await sb.auth.signOut(); } catch (e) {} }
    user = null; state.account = null; if (channel) { sb.removeChannel(channel); channel = null; }
    setStatus('off');
  }
  const signedIn = () => !!user;

  // Connexion silencieuse au compte technique partagé, sans jamais afficher de
  // formulaire à l'utilisateur. Créé automatiquement au tout premier appel (sur
  // n'importe quel appareil) si le compte n'existe pas encore sur le projet.
  let autoTried = false;
  async function ensureAutoAccount() {
    if (!isConfigured() || signedIn() || autoTried) return;
    autoTried = true;
    try { await signIn(AUTO_SYNC_EMAIL, AUTO_SYNC_PASSWORD); }
    catch (e) {
      try { await signUp(AUTO_SYNC_EMAIL, AUTO_SYNC_PASSWORD); }
      catch (e2) { /* hors-ligne ou erreur réseau : l'app reste utilisable sans synchro */ }
    }
  }

  // ── Conversion records Supabase <-> état db.js ───────────────────────────────
  const KINDS = { projets: 'projet', clients: 'client', composantes: 'composante' };
  const KIND_REV = { projet: 'projets', client: 'clients', composante: 'composantes' };

  async function pull() {
    if (!signedIn()) return;
    await ensureClient();
    setStatus('syncing', { error: '' });
    try {
      const { data: recs, error: e1 } = await sb.from('records').select('uid,kind,data,updated');
      if (e1) throw e1;
      const { data: tombs, error: e2 } = await sb.from('tombstones').select('uid,updated');
      if (e2) throw e2;
      const remote = { projets: [], clients: [], composantes: [], tombstones: [] };
      for (const r of (recs || [])) { const k = KIND_REV[r.kind]; if (k) remote[k].push(r.data); }
      for (const t of (tombs || [])) remote.tombstones.push({ uid: t.uid, _updated: t.updated });
      await DB.mergeRemote(remote);
      // Données administratives (clé-valeur, dernier-écrivain-gagne par module data:*)
      for (const r of (recs || [])) {
        if (r.kind === 'adm_kv' && r.data && r.data.k && String(r.data.k).startsWith('data:')) {
          const lt = (await DB.adminTs(r.data.k)) || 0;
          if ((r.updated || 0) > lt) await DB.adminApply(r.data.k, r.data.v, r.updated);
        }
      }
      await syncUsers();
      state.lastSync = Date.now(); await DB.syncSet('sb_lastSync', state.lastSync);
      setStatus('idle');
      if (_refreshUI) _refreshUI();
    } catch (e) { setStatus('error', { error: e.message }); }
  }

  // Pousse les fiches modifiées depuis le dernier envoi + applique les suppressions
  async function push() {
    if (busy || !signedIn()) return;
    busy = true; setStatus('syncing', { error: '' });
    try {
      await ensureClient();
      const lastPush = (await DB.syncGet('sb_lastPush')) || 0;
      const now = Date.now();
      const rows = [];
      for (const [store, kind] of Object.entries(KINDS)) {
        for (const r of DB.cache[store]) {
          if (!r.uid) continue;
          // fiche du seed jamais modifiée (_updated = 1) : ne pas l'envoyer, elle
          // écraserait la version plus récente du même uid déjà présente dans le cloud
          if ((r._updated || 0) <= 1) continue;
          if ((r._updated || 0) > lastPush) rows.push({ uid: r.uid, kind, data: r, updated: r._updated || now });
        }
      }
      if (rows.length) {
        const { error } = await sb.from('records').upsert(rows, { onConflict: 'uid' });
        if (error) throw error;
      }
      const newTombs = (DB.cache.tombstones || []).filter(t => (t._updated || 0) > lastPush);
      if (newTombs.length) {
        const { error: te } = await sb.from('tombstones').upsert(newTombs.map(t => ({ uid: t.uid, updated: t._updated })), { onConflict: 'uid' });
        if (te) throw te;
        // retire les fiches supprimées de la table records
        await sb.from('records').delete().in('uid', newTombs.map(t => t.uid));
      }
      // Pousse les données administratives modifiées (modules data:* uniquement)
      const lastAdminPush = (await DB.syncGet('sb_lastAdminPush')) || 0;
      const admRows = [];
      for (const a of await DB.adminAll()) {
        if (!a.key.startsWith('data:')) continue;
        if ((a.ts || 0) > lastAdminPush) admRows.push({ uid: 'adm:' + a.key, kind: 'adm_kv', data: { k: a.key, v: a.value }, updated: a.ts || now });
      }
      if (admRows.length) { const { error: ae } = await sb.from('records').upsert(admRows, { onConflict: 'uid' }); if (ae) throw ae; }
      await DB.syncSet('sb_lastAdminPush', now);
      await DB.syncSet('sb_lastPush', now);
      await syncUsers();   // compte créé, modifié ou mot de passe changé sur cet appareil
      state.lastSync = now; await DB.syncSet('sb_lastSync', now);
      setStatus('idle');
    } catch (e) { setStatus('error', { error: e.message }); }
    finally { busy = false; }
  }

  // Synchro complète : envoi local puis réception (+ abonnement temps réel)
  async function syncNow() {
    await push();
    await pull();
    subscribeRealtime();
  }

  function subscribeRealtime() {
    if (!sb || !signedIn() || channel) return;
    channel = sb.channel('anper-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'records' }, () => schedulePull())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tombstones' }, () => schedulePull())
      .subscribe();
  }
  // Comptes de connexion partagés entre appareils (lignes kind='adm_user',
  // uid 'usr:<identifiant>') : fusion par AUTH.mergeUsers (le plus récent gagne).
  let usersBusy = false;
  async function syncUsers() {
    if (usersBusy || !signedIn() || !window.AUTH || !AUTH.mergeUsers) return false;
    usersBusy = true;
    try {
      await ensureClient();
      const { data, error } = await sb.from('records').select('data,updated').eq('kind', 'adm_user');
      if (error) throw error;
      const remote = (data || []).filter(r => r.data && r.data.username).map(r => ({ ...r.data, _updated: r.updated }));
      const snap = (await DB.syncGet('usr_snap')) || {};
      const { out, changed } = await AUTH.mergeUsers(remote, snap);
      if (out.length) {
        const rows = out.map(u => ({ uid: 'usr:' + String(u.username).toLowerCase(), kind: 'adm_user', data: u, updated: u._updated || Date.now() }));
        const { error: e2 } = await sb.from('records').upsert(rows, { onConflict: 'uid' });
        if (e2) throw e2;
      }
      await DB.syncSet('usr_snap', snap);
      return changed;
    } catch (e) { console.warn('Synchro des comptes :', e); return false; }
    finally { usersBusy = false; }
  }

  let pullTimer = null;
  function schedulePull() { clearTimeout(pullTimer); pullTimer = setTimeout(() => pull(), 800); }

  function enableAutoSync(refreshUI) {
    _refreshUI = refreshUI;
    DB.setOnChange(() => {
      if (!signedIn()) return;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(() => push(), 1500);
    });
  }

  return {
    init, loadConfig, isConfigured, getConfig, configure,
    signUp, signIn, signOut, signedIn, ensureAutoAccount,
    pull, push, syncNow, syncUsers, enableAutoSync, subscribeRealtime, onStatus, state,
    ensureClient, client: () => sb, currentEmail: () => (user ? user.email : null),
  };
})();
