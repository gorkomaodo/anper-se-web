/* Messagerie interne ANPER — chat texte + appels audio/vidéo entre agents.
   Communication VoIP navigateur-à-navigateur (WebRTC), PAS de vrai SMS ni
   d'appel téléphonique GSM : fonctionne uniquement entre agents connectés
   à l'application ET au Partage (☁️ Supabase). Signalisation par canaux
   Realtime "broadcast" (aucun serveur dédié à héberger) ; messages texte
   persistés dans la table chat_messages (voir supabase_setup_chat.sql). */

const Chat = (() => {
  let subscribed = false;
  let presenceCh = null, inboxCh = null;
  let online = new Set();
  let unread = {};              // { username: count }
  let activeConv = null;        // username du contact affiché
  let refreshMsgs = null;       // repeint la conversation ouverte
  let renderContactsRef = null; // repeint la liste de contacts (présence/badges)
  let call = null;              // appel en cours (1:1 : voir startCall/acceptCall — ou de groupe : voir startGroupCall/acceptGroupCall)
  let pendingOffer = null;      // appel 1:1 entrant en attente de réponse
  let pendingGroupOffer = null; // invitation à un appel de groupe en attente de réponse
  let ringTimer = null, callTimerInt = null, callStart = null, callVideoEls = null;

  const me = () => (window.AUTH && AUTH.current()) ? AUTH.current().username : null;
  const meName = () => (window.AUTH && AUTH.current()) ? AUTH.current().name : '';
  const convId = (a, b) => [a, b].sort().join('::');
  // Tous les comptes sauf soi-même et le poste de badgeuse (compte technique « pointage »), triés par nom
  const contactsList = () => (window.AUTH ? AUTH.listUsers() : []).filter(u => u.username !== me() && u.username !== 'pointage')
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr'));
  const contactName = (u) => { const c = contactsList().find(x => x.username === u); return c ? c.name : u; };

  // ── Petite sonnerie générée (aucun fichier audio requis) ─────────────────────
  let actx = null;
  function beep(freq = 880, dur = 0.12, delay = 0) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = actx.currentTime + delay;
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = freq; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.15, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) {}
  }
  function ringtone() { beep(660, .18, 0); beep(880, .18, .22); }

  // ── Badge non-lus dans le menu latéral ────────────────────────────────────────
  function updateNavBadge() {
    const total = Object.values(unread).reduce((a, b) => a + b, 0);
    // Titre « (n) … » : visible dans la barre des tâches ; les applications Windows
    // s'en servent pour faire clignoter l'icône et afficher une notification.
    const base = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = total > 0 ? '(' + total + ') ' + base : base;
    const btn = $('.nav-btn[data-page="communication"]'); if (!btn) return;
    let old = btn.querySelector('.chat-nav-badge'); if (old) old.remove();
    if (total > 0) btn.append(el('span.chat-nav-badge', { text: String(total) }));
  }

  // ── Cache local hors-ligne (indépendant de la synchro admin data:*) ──────────
  const cacheGet = (conv) => DB.syncGet('chat_cache_' + conv);
  const cacheSet = (conv, arr) => DB.syncSet('chat_cache_' + conv, arr.slice(-300));
  async function cacheAppend(conv, m) {
    const arr = (await cacheGet(conv)) || [];
    if (m.id && arr.some(x => x.id === m.id)) return;
    arr.push(m); await cacheSet(conv, arr);
  }

  function reconcile(local, remote) {
    const remoteKeys = new Set(remote.map(m => m.from_user + '|' + m.body + '|' + Math.round(m.created / 2000)));
    const unconfirmed = local.filter(m => !m.id && !remoteKeys.has(m.from_user + '|' + m.body + '|' + Math.round(m.created / 2000)));
    return [...unconfirmed, ...remote].sort((a, b) => a.created - b.created);
  }

  async function fetchHistory(conv) {
    const local = (await cacheGet(conv)) || [];
    let remote = [];
    try {
      if (Cloud.signedIn()) {
        const sb = await Cloud.ensureClient();
        const { data, error } = await sb.from('chat_messages').select('id,conv,from_user,to_user,body,created')
          .eq('conv', conv).order('created', { ascending: true }).limit(500);
        if (!error) remote = data || [];
      }
    } catch (e) { /* hors-ligne : on garde le cache local */ }
    const merged = remote.length ? reconcile(local, remote) : local;
    await cacheSet(conv, merged);
    return merged;
  }

  async function sendMessage(toUser, body) {
    body = (body || '').trim(); if (!body) return;
    const conv = convId(me(), toUser);
    const msg = { conv, from_user: me(), to_user: toUser, body, created: Date.now() };
    await cacheAppend(conv, msg);
    if (refreshMsgs && activeConv === toUser) refreshMsgs();
    if (!Cloud.signedIn()) { toast('Hors-ligne : message gardé localement (non envoyé). Connectez-vous au Partage ☁️.', 'info', 5000); return; }
    try {
      const sb = await Cloud.ensureClient();
      const { error } = await sb.from('chat_messages').insert(msg);
      if (error) throw error;
    } catch (e) { toast('Envoi impossible : ' + e.message, 'err'); }
  }

  // ── Abonnements temps réel (messages, présence, signalisation d'appel) ───────
  async function subscribeRealtime() {
    if (subscribed || !Cloud.signedIn()) return;
    const meU = me(); if (!meU) return;
    let sb; try { sb = await Cloud.ensureClient(); } catch (e) { return; }
    subscribed = true;

    sb.channel('chat-inbox-' + meU)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'to_user=eq.' + meU }, (payload) => {
        const m = payload.new;
        cacheAppend(m.conv, m);
        if (activeConv === m.from_user) { if (refreshMsgs) refreshMsgs(); }
        else {
          unread[m.from_user] = (unread[m.from_user] || 0) + 1;
          beep(520, .1);
          toast('💬 ' + contactName(m.from_user) + ' : ' + m.body.slice(0, 60), 'info', 4500);
        }
        updateNavBadge();
        if (renderContactsRef) try { renderContactsRef(); } catch (e) {}
      })
      .subscribe();

    presenceCh = sb.channel('presence-agents', { config: { presence: { key: meU } } });
    presenceCh.on('presence', { event: 'sync' }, () => {
      online = new Set(Object.keys(presenceCh.presenceState()));
      if (renderContactsRef) try { renderContactsRef(); } catch (e) {}
    }).subscribe((status) => { if (status === 'SUBSCRIBED') presenceCh.track({ user: meU, at: Date.now() }); });

    inboxCh = sb.channel('call-' + meU)
      .on('broadcast', { event: 'offer' }, ({ payload }) => handleOffer(payload))
      .on('broadcast', { event: 'answer' }, ({ payload }) => handleAnswer(payload))
      .on('broadcast', { event: 'ice' }, ({ payload }) => handleIce(payload))
      .on('broadcast', { event: 'hangup' }, ({ payload }) => handleHangup(payload))
      .on('broadcast', { event: 'group-invite' }, ({ payload }) => handleGroupInvite(payload))
      .on('broadcast', { event: 'group-join' }, ({ payload }) => handleGroupJoin(payload))
      .on('broadcast', { event: 'group-roster' }, ({ payload }) => handleGroupRoster(payload))
      .on('broadcast', { event: 'group-decline' }, ({ payload }) => handleGroupDecline(payload))
      .subscribe();
  }

  // ── Appels audio/vidéo (WebRTC, signalisation via canaux broadcast) ──────────
  // Serveur TURN de secours (Open Relay Project — staticauth.openrelay.metered.ca,
  // gratuit, sans inscription) : indispensable quand les deux agents sont derrière
  // un NAT/pare-feu restrictif où le simple STUN ne suffit pas à établir la
  // connexion directe. Identifiants temporaires calculés côté client (HMAC-SHA1,
  // secret partagé public documenté par le fournisseur — même mécanisme que
  // Nextcloud Talk), valables 24 h, régénérés à chaque appel.
  const TURN_STATIC_SECRET = 'openrelayprojectsecret';
  async function turnCredential(secret) {
    const username = String(Math.floor(Date.now() / 1000) + 24 * 3600);
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(username));
    const credential = btoa(String.fromCharCode(...new Uint8Array(sig)));
    return { username, credential };
  }
  async function iceServers() {
    const servers = [{ urls: 'stun:stun.l.google.com:19302' }];
    try {
      const { username, credential } = await turnCredential(TURN_STATIC_SECRET);
      const host = 'staticauth.openrelay.metered.ca';
      for (const urls of ['turn:' + host + ':80', 'turn:' + host + ':80?transport=tcp', 'turn:' + host + ':443', 'turns:' + host + ':443?transport=tcp']) {
        servers.push({ urls, username, credential });
      }
    } catch (e) { /* pas de Web Crypto (contexte non sécurisé) : on reste en STUN seul */ }
    return servers;
  }
  const newCallId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  async function ensureSendChannel(otherUser) {
    const sb = await Cloud.ensureClient();
    return new Promise((resolve, reject) => {
      const ch = sb.channel('call-' + otherUser);
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve(ch);
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error('connexion impossible'));
      });
    });
  }
  function sendSignal(event, extra) {
    if (!call || !call.sendCh) return;
    call.sendCh.send({ type: 'broadcast', event, payload: { callId: call.id, from: me(), ...extra } });
  }
  function sendHangupTo(otherUser, callId, reason) {
    Cloud.ensureClient().then(sb => {
      const ch = sb.channel('call-' + otherUser);
      ch.subscribe((status) => { if (status === 'SUBSCRIBED') { ch.send({ type: 'broadcast', event: 'hangup', payload: { callId, from: me(), reason } }); setTimeout(() => sb.removeChannel(ch), 1500); } });
    }).catch(() => {});
  }

  async function startCall(otherUser, otherName, video) {
    if (call) { toast('Un appel est déjà en cours.', 'err'); return; }
    if (!Cloud.signedIn()) { toast('Connectez-vous au Partage (☁️) pour appeler un collègue.', 'err', 4500); return; }
    if (!online.has(otherUser)) toast(otherName + ' semble hors ligne — l\'appel peut ne pas aboutir.', 'info', 4000);
    const id = newCallId();
    call = { id, other: otherUser, otherName, video: !!video, dir: 'out', status: 'connecting' };
    try { call.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: !!video }); }
    catch (e) { toast('Micro/caméra inaccessible : ' + e.message, 'err'); call = null; return; }
    const pc = new RTCPeerConnection({ iceServers: await iceServers() });
    call.pc = pc;
    call.localStream.getTracks().forEach(t => pc.addTrack(t, call.localStream));
    pc.ontrack = (e) => { call.remoteStream = e.streams[0]; updateCallUI(); };
    pc.onicecandidate = (e) => { if (e.candidate) sendSignal('ice', { candidate: e.candidate }); };
    pc.onconnectionstatechange = () => { if (call && (pc.connectionState === 'failed' || pc.connectionState === 'disconnected')) endCall(false, 'Connexion perdue'); };
    showCallUI();
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      call.sendCh = await ensureSendChannel(otherUser);
      sendSignal('offer', { name: meName(), sdp: pc.localDescription, video: !!video });
      call.status = 'ringing'; updateCallUI();
      call.timer = setTimeout(() => { if (call && call.status !== 'active') endCall(true, 'Pas de réponse'); }, 30000);
    } catch (e) { toast('Appel impossible : ' + e.message, 'err'); endCall(false); }
  }

  function handleOffer(p) {
    if (p.groupId) return handleGroupOffer(p);
    if (call || pendingOffer || pendingGroupOffer) { quickReject(p); return; }
    pendingOffer = p;
    showIncomingCallUI(p);
    ringLoop();
    pendingOffer.timeout = setTimeout(() => { if (pendingOffer && pendingOffer.callId === p.callId) declineCall('Non décroché'); }, 25000);
  }
  function quickReject(p) { sendHangupTo(p.from, p.callId, 'occupé'); }

  async function acceptCall() {
    if (!pendingOffer) return;
    const p = pendingOffer; pendingOffer = null; clearTimeout(p.timeout); stopRing(); closeIncomingCallUI();
    call = { id: p.callId, other: p.from, otherName: p.name || contactName(p.from), video: !!p.video, dir: 'in', status: 'connecting' };
    try { call.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: !!p.video }); }
    catch (e) { toast('Micro/caméra inaccessible : ' + e.message, 'err'); const cid = call.id, oth = call.other; call = null; sendHangupTo(oth, cid, 'micro indisponible'); return; }
    const pc = new RTCPeerConnection({ iceServers: await iceServers() });
    call.pc = pc;
    call.localStream.getTracks().forEach(t => pc.addTrack(t, call.localStream));
    pc.ontrack = (e) => { call.remoteStream = e.streams[0]; updateCallUI(); };
    pc.onicecandidate = (e) => { if (e.candidate) sendSignal('ice', { candidate: e.candidate }); };
    pc.onconnectionstatechange = () => { if (call && (pc.connectionState === 'failed' || pc.connectionState === 'disconnected')) endCall(false, 'Connexion perdue'); };
    showCallUI();
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(p.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      call.sendCh = await ensureSendChannel(p.from);
      sendSignal('answer', { sdp: pc.localDescription });
      call.status = 'active'; updateCallUI();
    } catch (e) { toast('Connexion impossible : ' + e.message, 'err'); endCall(false); }
  }
  function declineCall(reason) {
    if (!pendingOffer) return;
    const p = pendingOffer; pendingOffer = null; clearTimeout(p.timeout); stopRing(); closeIncomingCallUI();
    sendHangupTo(p.from, p.callId, reason || 'refusé');
  }
  function handleAnswer(p) {
    if (p.groupId) return handleGroupAnswer(p);
    if (!call || call.id !== p.callId || !call.pc) return;
    call.pc.setRemoteDescription(new RTCSessionDescription(p.sdp))
      .then(() => { call.status = 'active'; clearTimeout(call.timer); updateCallUI(); }).catch(() => {});
  }
  function handleIce(p) {
    if (p.groupId) return handleGroupIce(p);
    if (!call || call.id !== p.callId || !call.pc) return;
    call.pc.addIceCandidate(new RTCIceCandidate(p.candidate)).catch(() => {});
  }
  function handleHangup(p) {
    if (p.groupId) return handleGroupHangup(p);
    if (pendingOffer && pendingOffer.callId === p.callId) { clearTimeout(pendingOffer.timeout); pendingOffer = null; stopRing(); closeIncomingCallUI(); toast('Appel annulé (' + (p.reason || '') + ')', 'info'); return; }
    if (call && call.id === p.callId) endCall(false, p.reason || 'Appel terminé');
  }
  function endCall(notify, reason) {
    if (!call) return;
    if (notify) sendSignal('hangup', { reason: reason || 'raccroché' });
    clearTimeout(call.timer);
    try { if (call.pc) call.pc.close(); } catch (e) {}
    try { if (call.localStream) call.localStream.getTracks().forEach(t => t.stop()); } catch (e) {}
    if (call.sendCh) { const ch = call.sendCh; Cloud.ensureClient().then(sb => sb.removeChannel(ch)).catch(() => {}); }
    call = null;
    closeCallUI(reason);
  }
  // « 📞 » en tête du titre pendant la sonnerie (repéré par les applications Windows)
  function ringLoop() { clearInterval(ringTimer); ringtone(); ringTimer = setInterval(ringtone, 2500); if (!/^📞/.test(document.title)) document.title = '📞 ' + document.title; }
  function stopRing() { clearInterval(ringTimer); ringTimer = null; document.title = document.title.replace(/^📞\s*/, ''); }

  // ── Appels de groupe (vidéoconférence, maillage WebRTC N-à-N) ────────────────
  // Chaque participant ouvre une connexion RTCPeerConnection directe vers chaque
  // autre participant (pas de serveur média central). L'hôte joue seulement le
  // rôle d'annuaire : il indique à chaque nouvel arrivant qui est déjà présent
  // (« group-roster ») ; c'est systématiquement le nouvel arrivant qui initie
  // la connexion (offer) vers les membres déjà là, ce qui évite tout conflit
  // d'offres simultanées (glare) sans négociation complexe.
  function sendGroupSignal(peerUser, event, extra) {
    const entry = call && call.peers && call.peers.get(peerUser);
    if (!entry || !entry.sendCh) return;
    entry.sendCh.send({ type: 'broadcast', event, payload: { groupId: call.id, from: me(), ...extra } });
  }
  function removeGroupPeer(username, reason) {
    if (!call || !call.peers) return;
    const entry = call.peers.get(username); if (!entry) return;
    try { if (entry.pc) entry.pc.close(); } catch (e) {}
    if (entry.sendCh) Cloud.ensureClient().then(sb => sb.removeChannel(entry.sendCh)).catch(() => {});
    call.peers.delete(username);
    if (call.isHost && call.joined) call.joined.delete(username);
    updateGroupCallUI();
    if (reason) toast((entry.name || contactName(username)) + ' a quitté l\'appel' + (reason ? ' (' + reason + ')' : ''), 'info');
  }
  async function connectToGroupPeer(peerUsername) {
    if (!call || call.peers.has(peerUsername) || peerUsername === me()) return;
    const entry = { pc: null, stream: null, name: contactName(peerUsername), sendCh: null };
    call.peers.set(peerUsername, entry);
    const pc = new RTCPeerConnection({ iceServers: await iceServers() });
    entry.pc = pc;
    call.localStream.getTracks().forEach(t => pc.addTrack(t, call.localStream));
    pc.ontrack = (e) => { entry.stream = e.streams[0]; updateGroupCallUI(); };
    pc.onicecandidate = (e) => { if (e.candidate) sendGroupSignal(peerUsername, 'ice', { candidate: e.candidate }); };
    pc.onconnectionstatechange = () => { if (call && (pc.connectionState === 'failed' || pc.connectionState === 'disconnected')) removeGroupPeer(peerUsername, 'Connexion perdue'); };
    updateGroupCallUI();
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      entry.sendCh = await ensureSendChannel(peerUsername);
      sendGroupSignal(peerUsername, 'offer', { sdp: pc.localDescription, video: call.video, name: meName() });
    } catch (e) { removeGroupPeer(peerUsername); }
  }
  async function handleGroupOffer(p) {
    if (!call || !call.group || call.id !== p.groupId) return;
    let entry = call.peers.get(p.from);
    if (!entry) { entry = { pc: null, stream: null, name: p.name || contactName(p.from), sendCh: null }; call.peers.set(p.from, entry); }
    const pc = new RTCPeerConnection({ iceServers: await iceServers() });
    entry.pc = pc;
    call.localStream.getTracks().forEach(t => pc.addTrack(t, call.localStream));
    pc.ontrack = (e) => { entry.stream = e.streams[0]; updateGroupCallUI(); };
    pc.onicecandidate = (e) => { if (e.candidate) sendGroupSignal(p.from, 'ice', { candidate: e.candidate }); };
    pc.onconnectionstatechange = () => { if (call && (pc.connectionState === 'failed' || pc.connectionState === 'disconnected')) removeGroupPeer(p.from, 'Connexion perdue'); };
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(p.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      entry.sendCh = await ensureSendChannel(p.from);
      sendGroupSignal(p.from, 'answer', { sdp: pc.localDescription });
      call.status = 'active';
      updateGroupCallUI();
    } catch (e) { removeGroupPeer(p.from); }
  }
  function handleGroupAnswer(p) {
    if (!call || !call.group || call.id !== p.groupId) return;
    const entry = call.peers.get(p.from); if (!entry || !entry.pc) return;
    entry.pc.setRemoteDescription(new RTCSessionDescription(p.sdp)).then(() => updateGroupCallUI()).catch(() => {});
  }
  function handleGroupIce(p) {
    if (!call || !call.group || call.id !== p.groupId) return;
    const entry = call.peers.get(p.from); if (!entry || !entry.pc) return;
    entry.pc.addIceCandidate(new RTCIceCandidate(p.candidate)).catch(() => {});
  }
  function handleGroupHangup(p) {
    if (!call || !call.group || call.id !== p.groupId) return;
    removeGroupPeer(p.from, p.reason || 'raccroché');
  }
  function sendGroupDecline(hostUser, groupId, reason) {
    Cloud.ensureClient().then(sb => {
      const ch = sb.channel('call-' + hostUser);
      ch.subscribe((status) => { if (status === 'SUBSCRIBED') { ch.send({ type: 'broadcast', event: 'group-decline', payload: { groupId, from: me(), reason } }); setTimeout(() => sb.removeChannel(ch), 1500); } });
    }).catch(() => {});
  }
  function handleGroupDecline(p) {
    if (!call || !call.group || call.id !== p.groupId) return;
    toast(contactName(p.from) + ' a refusé l\'appel de groupe' + (p.reason ? ' (' + p.reason + ')' : ''), 'info');
  }
  function handleGroupInvite(p) {
    if (call || pendingOffer || pendingGroupOffer) { sendGroupDecline(p.from, p.groupId, 'occupé'); return; }
    pendingGroupOffer = p;
    showIncomingGroupCallUI(p);
    ringLoop();
    pendingGroupOffer.timeout = setTimeout(() => { if (pendingGroupOffer && pendingGroupOffer.groupId === p.groupId) declineGroupCall('Non décroché'); }, 25000);
  }
  async function acceptGroupCall() {
    if (!pendingGroupOffer) return;
    const p = pendingGroupOffer; pendingGroupOffer = null; clearTimeout(p.timeout); stopRing(); closeIncomingGroupCallUI();
    call = { id: p.groupId, group: true, video: !!p.video, status: 'connecting', isHost: false, hostUser: p.from, peers: new Map(), hostSendCh: null };
    try { call.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: !!p.video }); }
    catch (e) { toast('Micro/caméra inaccessible : ' + e.message, 'err'); const gid = call.id; call = null; sendGroupDecline(p.from, gid, 'micro indisponible'); return; }
    showGroupCallUI();
    try {
      const ch = await ensureSendChannel(p.from);
      call.hostSendCh = ch;
      ch.send({ type: 'broadcast', event: 'group-join', payload: { groupId: p.groupId, from: me() } });
    } catch (e) { toast('Connexion impossible : ' + e.message, 'err'); endGroupCall(); }
  }
  function declineGroupCall(reason) {
    if (!pendingGroupOffer) return;
    const p = pendingGroupOffer; pendingGroupOffer = null; clearTimeout(p.timeout); stopRing(); closeIncomingGroupCallUI();
    sendGroupDecline(p.from, p.groupId, reason || 'refusé');
  }
  function handleGroupJoin(p) {
    if (!call || !call.group || !call.isHost || call.id !== p.groupId) return;
    const existing = [...call.joined, me()];
    call.joined.add(p.from);
    sendRosterTo(p.from, existing);
    updateGroupCallUI();
  }
  async function sendRosterTo(target, members) {
    try {
      const ch = await ensureSendChannel(target);
      ch.send({ type: 'broadcast', event: 'group-roster', payload: { groupId: call.id, members } });
      setTimeout(() => Cloud.ensureClient().then(sb => sb.removeChannel(ch)).catch(() => {}), 4000);
    } catch (e) {}
  }
  function handleGroupRoster(p) {
    if (!call || !call.group || call.isHost || call.id !== p.groupId) return;
    call.status = 'active';
    for (const m of p.members) connectToGroupPeer(m);
    if (call.hostSendCh) { const ch = call.hostSendCh; call.hostSendCh = null; setTimeout(() => Cloud.ensureClient().then(sb => sb.removeChannel(ch)).catch(() => {}), 3000); }
    updateGroupCallUI();
  }
  async function startGroupCall(usernames, video) {
    if (call) { toast('Un appel est déjà en cours.', 'err'); return; }
    if (!Cloud.signedIn()) { toast('Connectez-vous au Partage (☁️) pour appeler des collègues.', 'err', 4500); return; }
    if (!usernames.length) return;
    const id = newCallId();
    call = { id, group: true, video: !!video, status: 'active', isHost: true, joined: new Set(), peers: new Map() };
    try { call.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: !!video }); }
    catch (e) { toast('Micro/caméra inaccessible : ' + e.message, 'err'); call = null; return; }
    showGroupCallUI();
    for (const u of usernames) {
      if (!online.has(u)) toast(contactName(u) + ' semble hors ligne — l\'invitation peut ne pas aboutir.', 'info', 3500);
      Cloud.ensureClient().then(sb => {
        const ch = sb.channel('call-' + u);
        ch.subscribe((status) => { if (status === 'SUBSCRIBED') { ch.send({ type: 'broadcast', event: 'group-invite', payload: { groupId: id, from: me(), name: meName(), video: !!video } }); setTimeout(() => sb.removeChannel(ch), 4000); } });
      }).catch(() => {});
    }
  }
  function endGroupCall() {
    if (!call || !call.group) return;
    for (const [, entry] of call.peers) {
      try { entry.sendCh && entry.sendCh.send({ type: 'broadcast', event: 'hangup', payload: { groupId: call.id, from: me(), reason: 'raccroché' } }); } catch (e) {}
      try { if (entry.pc) entry.pc.close(); } catch (e) {}
      if (entry.sendCh) Cloud.ensureClient().then(sb => sb.removeChannel(entry.sendCh)).catch(() => {});
    }
    if (call.hostSendCh) {
      try { call.hostSendCh.send({ type: 'broadcast', event: 'hangup', payload: { groupId: call.id, from: me(), reason: 'raccroché' } }); } catch (e) {}
      Cloud.ensureClient().then(sb => sb.removeChannel(call.hostSendCh)).catch(() => {});
    }
    try { if (call.localStream) call.localStream.getTracks().forEach(t => t.stop()); } catch (e) {}
    call = null;
    closeCallUI();
  }

  // ── UI : appel entrant (bandeau plein écran) ──────────────────────────────────
  function showIncomingCallUI(p) {
    closeIncomingCallUI();
    const box = el('div#incoming-call.call-incoming', {}, [
      el('div.call-incoming-ava', { text: (p.name || p.from || '?')[0].toUpperCase() }),
      el('div.call-incoming-name', { text: p.name || contactName(p.from) }),
      el('div.call-incoming-sub', { text: (p.video ? '📹 Appel vidéo entrant…' : '📞 Appel audio entrant…') }),
      el('div.call-incoming-actions', {}, [
        el('button.btn.btn-danger', { text: '✕ Refuser', onclick: () => declineCall('refusé') }),
        el('button.btn.btn-primary', { text: '✓ Répondre', onclick: () => acceptCall() }),
      ]),
    ]);
    document.body.append(box);
  }
  function closeIncomingCallUI() { const n = $('#incoming-call'); if (n) n.remove(); }

  function showIncomingGroupCallUI(p) {
    closeIncomingGroupCallUI();
    const box = el('div#incoming-call.call-incoming', {}, [
      el('div.call-incoming-ava', { text: '👥' }),
      el('div.call-incoming-name', { text: p.name || contactName(p.from) }),
      el('div.call-incoming-sub', { text: (p.video ? '📹 Appel de groupe (vidéo) entrant…' : '📞 Appel de groupe (audio) entrant…') }),
      el('div.call-incoming-actions', {}, [
        el('button.btn.btn-danger', { text: '✕ Refuser', onclick: () => declineGroupCall('refusé') }),
        el('button.btn.btn-primary', { text: '✓ Rejoindre', onclick: () => acceptGroupCall() }),
      ]),
    ]);
    document.body.append(box);
  }
  function closeIncomingGroupCallUI() { const n = $('#incoming-call'); if (n) n.remove(); }

  // ── UI : appel en cours (panneau flottant) ────────────────────────────────────
  function showCallUI() {
    closeCallUI();
    const remoteV = el('video#call-remote-video', { autoplay: true, playsinline: true });
    const localV = el('video#call-local-video', { autoplay: true, playsinline: true, muted: true });
    const box = el('div#call-panel.call-panel', {}, [
      el('div.call-panel-head', {}, [
        el('div.call-panel-ava', { text: (call.otherName || '?')[0].toUpperCase() }),
        el('div', {}, [el('div.call-panel-name', { text: call.otherName }), el('div.call-panel-status#call-status', { text: 'Connexion…' })]),
      ]),
      el('div.call-videos' + (call.video ? '' : '.audio-only'), {}, [remoteV, localV]),
      el('div.call-panel-actions', {}, [
        el('button.ico-btn.call-btn#call-mute', { title: 'Couper le micro', text: '🎤', onclick: toggleMute }),
        call.video ? el('button.ico-btn.call-btn#call-cam', { title: 'Couper la caméra', text: '📹', onclick: toggleCam }) : null,
        el('button.btn.btn-danger', { text: '📞 Raccrocher', onclick: () => endCall(true) }),
      ]),
    ]);
    document.body.append(box);
    callVideoEls = { remoteV, localV };
    if (call.localStream) localV.srcObject = call.localStream;
    callTimerInt = setInterval(updateCallTimer, 1000);
  }
  function updateCallUI() {
    if (!call) return;
    if (call.remoteStream && callVideoEls) callVideoEls.remoteV.srcObject = call.remoteStream;
    const st = $('#call-status'); if (!st) return;
    if (call.status === 'ringing') st.textContent = 'Sonnerie…';
    else if (call.status === 'connecting') st.textContent = 'Connexion…';
    else if (call.status === 'active' && !callStart) { callStart = Date.now(); st.textContent = '00:00'; }
  }
  function updateCallTimer() {
    const st = $('#call-status'); if (!st || !call || call.status !== 'active' || !callStart) return;
    const s = Math.floor((Date.now() - callStart) / 1000);
    st.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  // ── UI : appel de groupe en cours (panneau flottant, grille de tuiles) ────────
  function showGroupCallUI() {
    closeCallUI();
    const box = el('div#call-panel.call-panel.call-panel-group', {}, [
      el('div.call-panel-head', {}, [
        el('div.call-panel-ava', { text: '👥' }),
        el('div', {}, [el('div.call-panel-name', { text: 'Appel de groupe' }), el('div.call-panel-status#call-status', { text: 'Connexion…' })]),
      ]),
      el('div.call-grid#call-grid'),
      el('div.call-panel-actions', {}, [
        el('button.ico-btn.call-btn#call-mute', { title: 'Couper le micro', text: '🎤', onclick: toggleMute }),
        call.video ? el('button.ico-btn.call-btn#call-cam', { title: 'Couper la caméra', text: '📹', onclick: toggleCam }) : null,
        el('button.btn.btn-danger', { text: '📞 Quitter', onclick: () => endGroupCall() }),
      ]),
    ]);
    document.body.append(box);
    callTimerInt = setInterval(() => { if (call && call.group) updateGroupCallUI(); }, 1000);
    updateGroupCallUI();
  }
  function updateGroupCallUI() {
    if (!call || !call.group) return;
    const grid = $('#call-grid'); if (!grid) return;
    grid.innerHTML = '';
    const localV = el('video', { autoplay: true, playsinline: true, muted: true });
    if (call.localStream) localV.srcObject = call.localStream;
    grid.append(el('div.call-tile', {}, [localV, el('div.call-tile-name', { text: meName() + ' (moi)' })]));
    for (const [u, entry] of call.peers) {
      const v = el('video', { autoplay: true, playsinline: true });
      if (entry.stream) v.srcObject = entry.stream;
      grid.append(el('div.call-tile' + (entry.stream ? '' : '.connecting'), {}, [v, el('div.call-tile-name', { text: entry.name || contactName(u) })]));
    }
    const st = $('#call-status'); if (!st) return;
    if (call.status === 'active' && !callStart) callStart = Date.now();
    const n = call.peers.size;
    let txt = n + ' participant' + (n === 1 ? '' : 's');
    if (callStart) { const s = Math.floor((Date.now() - callStart) / 1000); txt = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') + ' · ' + txt; }
    st.textContent = txt;
  }
  function toggleMute() {
    if (!call || !call.localStream) return;
    const t = call.localStream.getAudioTracks()[0]; if (!t) return;
    t.enabled = !t.enabled;
    const b = $('#call-mute'); if (b) b.classList.toggle('off', !t.enabled);
  }
  function toggleCam() {
    if (!call || !call.localStream) return;
    const t = call.localStream.getVideoTracks()[0]; if (!t) return;
    t.enabled = !t.enabled;
    const b = $('#call-cam'); if (b) b.classList.toggle('off', !t.enabled);
  }
  function closeCallUI(reason) {
    clearInterval(callTimerInt); callTimerInt = null; callStart = null; callVideoEls = null;
    const n = $('#call-panel'); if (n) n.remove();
    if (reason) toast(reason, 'info');
  }

  // ── Sélecteur de participants pour un appel de groupe ─────────────────────────
  function openGroupCallPicker() {
    if (call) { toast('Un appel est déjà en cours.', 'err'); return; }
    const contacts = contactsList();
    if (!contacts.length) { toast('Aucun collègue disponible.', 'info'); return; }
    const rows = contacts.map(c => ({ c, cb: el('input', { type: 'checkbox' }) }));
    const videoChk = el('input', { type: 'checkbox' }); videoChk.checked = true;
    const list = el('div.group-call-picker-list', {}, rows.map(({ c, cb }) => el('label.group-call-picker-row', {}, [
      cb,
      el('span.chat-dot' + (online.has(c.username) ? '.on' : '')),
      el('span', { text: c.name }),
    ])));
    const body = el('div', {}, [
      el('p.muted', { text: 'Sélectionnez les collègues à inviter (au moins un).' }),
      list,
      el('label.group-call-picker-row', { style: { marginTop: '10px' } }, [videoChk, el('span', { text: 'Appel vidéo (sinon audio seul)' })]),
    ]);
    modal('👥 Démarrer un appel de groupe', body, [
      { text: 'Annuler', kind: 'ghost', value: false },
      { text: 'Démarrer', kind: 'primary', onClick: () => {
        const sel = rows.filter(x => x.cb.checked).map(x => x.c.username);
        if (!sel.length) { toast('Sélectionnez au moins un collègue.', 'err'); return false; }
        startGroupCall(sel, videoChk.checked);
      } },
    ]);
  }

  // ── Page « Messagerie » ────────────────────────────────────────────────────────
  function renderPage() {
    const meU = me();
    const root = el('div.page.chat-page');
    if (!meU) { root.append(el('p', { text: 'Connectez-vous.' })); return root; }

    root.append(el('div.page-head', {}, [
      el('div', {}, [
        el('h1', { text: '💬 Messagerie interne' }),
        el('div.sub', { text: 'Discussion et appels entre agents connectés à l\'application et au Partage (☁️). Ne remplace pas les SMS/appels téléphoniques réels.' }),
      ]),
      el('div.sync-row', {}, [
        Cloud.signedIn() ? el('button.btn.btn-ghost', { text: '👥 Appel de groupe', onclick: () => openGroupCallPicker() }) : null,
        !Cloud.signedIn() ? el('button.btn.btn-ghost', { text: '☁️ Se connecter au Partage', onclick: () => openSyncModal() }) : null,
      ]),
    ]));

    const layout = el('div.chat-layout');
    const contactsBox = el('div.chat-contacts');
    const convBox = el('div.chat-conv', {}, [el('div.chat-empty', { text: '← Choisissez un agent pour démarrer une discussion.' })]);
    layout.append(contactsBox, convBox);
    root.append(layout);

    const contacts = contactsList();

    function renderContacts() {
      contactsBox.innerHTML = '';
      contactsBox.append(el('div.chat-contacts-title', { text: contacts.length + ' agent(s)' }));
      for (const c of contacts) {
        const isOnline = online.has(c.username);
        const n = unread[c.username] || 0;
        contactsBox.append(el('button.chat-contact' + (activeConv === c.username ? '.active' : ''), { onclick: () => openConv(c.username, c.name) }, [
          el('span.chat-dot' + (isOnline ? '.on' : '')),
          el('span.chat-contact-body', {}, [
            el('span.chat-contact-name', { text: c.name }),
          ]),
          n ? el('span.chat-badge-count', { text: String(n) }) : null,
        ]));
      }
    }
    renderContactsRef = renderContacts;

    function openConv(username, name) {
      activeConv = username;
      unread[username] = 0; updateNavBadge();
      renderContacts();
      renderConv(username, name);
    }

    async function renderConv(username, name) {
      convBox.innerHTML = '';
      const head = el('div.chat-conv-head', {}, [
        el('div.chat-conv-who', {}, [
          el('div.chat-conv-name', { text: name }),
          el('div.chat-conv-status' + (online.has(username) ? '.on' : ''), { text: online.has(username) ? '● en ligne' : '○ hors ligne' }),
        ]),
        el('div.chat-conv-actions', {}, [
          el('button.ico-btn', { title: 'Appel audio', text: '📞', onclick: () => startCall(username, name, false) }),
          el('button.ico-btn', { title: 'Appel vidéo', text: '📹', onclick: () => startCall(username, name, true) }),
        ]),
      ]);
      const list = el('div.chat-msgs', { text: 'Chargement…' });
      convBox.append(head, list);
      const inputRow = el('div.chat-input-row');
      const inp = el('textarea.chat-input', { placeholder: 'Écrire un message…', rows: 1 });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } });
      const sendBtn = el('button.btn.btn-primary', { text: 'Envoyer', onclick: doSend });
      inputRow.append(inp, sendBtn);
      convBox.append(inputRow);

      async function paint() {
        const msgs = await fetchHistory(convId(meU, username));
        list.innerHTML = '';
        if (!msgs.length) list.append(el('div.chat-empty-conv', { text: 'Aucun message pour l\'instant — dites bonjour 👋' }));
        let lastDay = '';
        for (const m of msgs) {
          const day = new Date(m.created).toLocaleDateString('fr-FR');
          if (day !== lastDay) { list.append(el('div.chat-day', { text: day })); lastDay = day; }
          const mine = m.from_user === meU;
          list.append(el('div.chat-bubble' + (mine ? '.mine' : ''), {}, [
            el('div.chat-bubble-text', { text: m.body }),
            el('div.chat-bubble-time', { text: new Date(m.created).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) }),
          ]));
        }
        list.scrollTop = list.scrollHeight;
      }
      refreshMsgs = paint;
      await paint();

      function doSend() {
        const v = inp.value; if (!v.trim()) return;
        inp.value = ''; sendMessage(username, v);
      }
      inp.focus();
    }

    renderContacts();
    if (activeConv && contacts.some(c => c.username === activeConv)) {
      const c = contacts.find(c => c.username === activeConv);
      openConv(c.username, c.name);
    }

    root._onMount = () => { renderContacts(); };
    return root;
  }
  Pages.communication = renderPage;

  return { subscribeRealtime };
})();
window.Chat = Chat;
