/* Synchronisation multi-utilisateur via Supabase (base Postgres centrale + temps réel).
   Aucun Microsoft/Azure. Données protégées par authentification (e-mail + mot de passe)
   + RLS : seuls les utilisateurs connectés lisent/écrivent. Modèle de fusion identique
   à db.js (uid/_updated/tombstones) : convergence même en cas d'édition concurrente. */

const Cloud = (() => {
  const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
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
    cfg.url = (await DB.syncGet('sb_url')) || '';
    cfg.key = (await DB.syncGet('sb_key')) || '';
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
      await DB.syncSet('sb_lastPush', now);
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
    signUp, signIn, signOut, signedIn,
    pull, push, syncNow, enableAutoSync, subscribeRealtime, onStatus, state,
  };
})();
