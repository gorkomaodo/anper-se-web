/* Synchronisation multi-utilisateur via OneDrive (Microsoft Graph + MSAL).
   Modèle : un fichier partagé « anper_data.json » dans OneDrive. Chaque save fait
   un read-merge-write (fusion par fiche, cf. DB.mergeRemote) → convergence.
   RENALOC n'est PAS synchronisé (donnée de référence statique, déjà embarquée). */

const Sync = (() => {
  const MSAL_CDN = 'https://alcdn.msauth.net/browser/2.38.3/js/msal-browser.min.js';
  const GRAPH = 'https://graph.microsoft.com/v1.0';
  const SCOPES = ['User.Read', 'Files.ReadWrite.All'];
  const FOLDER = 'ANPER SE';
  const FILE = 'anper_data.json';

  let msalApp = null, account = null;
  let cfg = { clientId: '', shareLink: '', target: null }; // target = {driveId, itemId}
  let pushTimer = null, busy = false;
  const listeners = [];
  const state = { status: 'off', lastSync: null, account: null, error: '' };
  const onStatus = (fn) => { listeners.push(fn); };
  const emit = () => listeners.forEach(f => { try { f(state); } catch (e) {} });
  const setStatus = (s, extra = {}) => { Object.assign(state, { status: s }, extra); emit(); };

  async function loadConfig() {
    cfg.clientId = (await DB.syncGet('clientId')) || '';
    cfg.shareLink = (await DB.syncGet('shareLink')) || '';
    cfg.target = (await DB.syncGet('target')) || null;
    state.lastSync = (await DB.syncGet('lastSync')) || null;
  }
  const isConfigured = () => !!cfg.clientId;
  const getConfig = () => ({ ...cfg });
  async function setClientId(id) { cfg.clientId = (id || '').trim(); await DB.syncSet('clientId', cfg.clientId); }
  async function setShareLink(link) {
    cfg.shareLink = (link || '').trim(); cfg.target = null;
    await DB.syncSet('shareLink', cfg.shareLink); await DB.syncSet('target', null);
  }

  function loadScript(src) {
    return new Promise((res, rej) => {
      if ([...document.scripts].some(s => s.src === src)) return res();
      const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Chargement MSAL impossible (hors-ligne ?)'));
      document.head.append(s);
    });
  }

  async function ensureMsal() {
    if (!isConfigured()) throw new Error("Identifiant d'application (client_id) non configuré.");
    if (msalApp) return msalApp;
    await loadScript(MSAL_CDN);
    msalApp = new msal.PublicClientApplication({
      auth: {
        clientId: cfg.clientId,
        authority: 'https://login.microsoftonline.com/common',
        // URI de redirection stable (dossier de l'app, sans index.html) =
        // exactement la valeur à inscrire dans Azure.
        redirectUri: location.origin + location.pathname.replace(/index\.html$/, ''),
      },
      cache: { cacheLocation: 'localStorage' },
    });
    await msalApp.initialize();
    const accts = msalApp.getAllAccounts();
    if (accts.length) { account = accts[0]; state.account = account.username; }
    return msalApp;
  }

  async function signIn() {
    await ensureMsal();
    const res = await msalApp.loginPopup({ scopes: SCOPES, prompt: 'select_account' });
    account = res.account; msalApp.setActiveAccount(account);
    state.account = account.username; setStatus('idle');
    return account.username;
  }
  async function signOut() {
    if (msalApp && account) { try { await msalApp.logoutPopup({ account }); } catch (e) {} }
    account = null; state.account = null; setStatus('off');
  }
  function signedIn() { return !!account; }

  async function getToken() {
    await ensureMsal();
    if (!account) { const a = msalApp.getAllAccounts(); if (a.length) account = a[0]; else throw new Error('Non connecté à Microsoft.'); }
    try { const r = await msalApp.acquireTokenSilent({ scopes: SCOPES, account }); return r.accessToken; }
    catch (e) { const r = await msalApp.acquireTokenPopup({ scopes: SCOPES, account }); return r.accessToken; }
  }

  async function graph(method, path, body, raw = false) {
    const token = await getToken();
    const opt = { method, headers: { Authorization: 'Bearer ' + token } };
    if (body !== undefined) {
      if (typeof body === 'string') { opt.headers['Content-Type'] = 'application/json'; opt.body = body; }
      else { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    }
    const r = await fetch(GRAPH + path, opt);
    if (!r.ok) {
      let msg = r.status + ' ' + r.statusText;
      try { const j = await r.json(); if (j.error) msg = j.error.message || msg; } catch (e) {}
      const err = new Error(msg); err.status = r.status; throw err;
    }
    if (raw) return r;
    if (r.status === 204) return null;
    const ct = r.headers.get('content-type') || '';
    return ct.includes('json') ? r.json() : r.text();
  }

  // Encode une URL de partage en token Graph (/shares/{token})
  function encodeShare(url) {
    const b64 = btoa(unescape(encodeURIComponent(url)));
    return 'u!' + b64.replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
  }

  // Résout la cible {driveId, itemId} (création côté propriétaire ou résolution du lien)
  async function resolveTarget() {
    if (cfg.target && cfg.target.driveId && cfg.target.itemId) return cfg.target;
    if (cfg.shareLink) {
      const item = await graph('GET', '/shares/' + encodeShare(cfg.shareLink) + '/driveItem?$select=id,parentReference');
      cfg.target = { driveId: item.parentReference.driveId, itemId: item.id };
    } else {
      // Propriétaire : crée le dossier + fichier dans SON OneDrive s'il n'existe pas
      try { await graph('POST', '/me/drive/root/children', { name: FOLDER, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }); }
      catch (e) { if (e.status !== 409) throw e; } // 409 = existe déjà
      let item;
      try { item = await graph('GET', `/me/drive/root:/${encodeURIComponent(FOLDER)}/${FILE}`); }
      catch (e) {
        if (e.status === 404) item = await graph('PUT', `/me/drive/root:/${encodeURIComponent(FOLDER)}/${FILE}:/content`, JSON.stringify(payload()));
        else throw e;
      }
      cfg.target = { driveId: item.parentReference.driveId, itemId: item.id };
    }
    await DB.syncSet('target', cfg.target);
    return cfg.target;
  }

  // Crée (côté propriétaire) un lien d'édition partageable à diffuser aux collègues
  async function createShareLink() {
    const t = await resolveTarget();
    const res = await graph('POST', `/drives/${t.driveId}/items/${t.itemId}/createLink`, { type: 'edit', scope: 'anonymous' });
    return res.link.webUrl;
  }

  function payload() {
    const s = DB.exportState();
    delete s.renaloc;                       // pas de synchro RENALOC (statique, lourd)
    return s;
  }

  async function readRemote() {
    const t = await resolveTarget();
    try {
      const txt = await graph('GET', `/drives/${t.driveId}/items/${t.itemId}/content`, undefined, true).then(r => r.text());
      return txt ? JSON.parse(txt) : null;
    } catch (e) { if (e.status === 404) return null; throw e; }
  }
  async function writeRemote(obj) {
    const t = await resolveTarget();
    await graph('PUT', `/drives/${t.driveId}/items/${t.itemId}/content`, JSON.stringify(obj));
  }

  // Synchro complète : read → merge → write. refreshUI() appelé si données changées.
  async function syncNow(refreshUI) {
    if (busy) return; if (!signedIn()) { setStatus('off'); return; }
    busy = true; setStatus('syncing', { error: '' });
    try {
      const remote = await readRemote();
      if (remote) await DB.mergeRemote(remote);
      await writeRemote(payload());
      state.lastSync = Date.now(); await DB.syncSet('lastSync', state.lastSync);
      setStatus('idle');
      if (remote && refreshUI) refreshUI();
    } catch (e) {
      setStatus('error', { error: e.message });
      throw e;
    } finally { busy = false; }
  }

  // Pull seul (à l'ouverture) : read → merge → refreshUI
  async function pull(refreshUI) {
    if (!signedIn()) return;
    setStatus('syncing', { error: '' });
    try {
      const remote = await readRemote();
      if (remote) { await DB.mergeRemote(remote); if (refreshUI) refreshUI(); }
      state.lastSync = Date.now(); await DB.syncSet('lastSync', state.lastSync);
      setStatus('idle');
    } catch (e) { setStatus('error', { error: e.message }); }
  }

  // Auto-sync : déclenché après chaque mutation locale (débounce)
  function enableAutoSync(refreshUI) {
    DB.setOnChange(() => {
      if (!signedIn()) return;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(() => { syncNow(refreshUI).catch(() => {}); }, 2500);
    });
  }

  async function tryAutoSignIn() {
    if (!isConfigured()) return false;
    try { await ensureMsal(); return signedIn(); } catch (e) { return false; }
  }

  return {
    loadConfig, isConfigured, getConfig, setClientId, setShareLink,
    signIn, signOut, signedIn, createShareLink,
    syncNow, pull, enableAutoSync, tryAutoSignIn, onStatus, state,
  };
})();
