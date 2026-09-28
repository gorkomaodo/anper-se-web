/* Pointage des agents ANPER — badgeuse logicielle sur le PC de l'entrée du
   bâtiment (pas encore de lecteur d'empreinte/caméra/bouton dédié : un seul
   poste partagé). Identification par matricule + code PIN personnel (issu
   de la fiche Personnel), horaire de référence lundi–jeudi 08h00–17h30 et
   vendredi 08h00–13h30 pour détecter retards / départs anticipés.
   Enregistrements poussés vers la table Supabase "pointages" (voir
   supabase_setup_pointage.sql) ; mise en cache locale hors-ligne (DB.syncGet/Set),
   retentée à la reconnexion — même logique que chat.js pour les messages. */

const Pointage = (() => {
  let clockTimer = null;

  // ── Horaire de référence (minutes depuis minuit), par jour JS (0=dim..6=sam) ──
  const SCHEDULE = { 1: [480, 1050], 2: [480, 1050], 3: [480, 1050], 4: [480, 1050], 5: [480, 810] };
  const scheduleFor = (date) => SCHEDULE[date.getDay()] || null;
  const minutesOfDay = (date) => date.getHours() * 60 + date.getMinutes();
  const dayKey = (date) => { const p = n => String(n).padStart(2, '0'); return date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate()); };
  const fmtTime = (ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const fmtDate = (ts) => new Date(ts).toLocaleDateString('fr-FR');
  const cid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function workdaysBetween(fromDay, toDay) {
    let n = 0, d = new Date(fromDay + 'T00:00:00');
    const end = new Date(toDay + 'T00:00:00');
    while (d <= end) { if (scheduleFor(d)) n++; d.setDate(d.getDate() + 1); }
    return n;
  }
  function monthRange(d = new Date()) {
    const first = new Date(d.getFullYear(), d.getMonth(), 1), last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return [dayKey(first), dayKey(last)];
  }

  // ── Cache local hors-ligne (file d'attente + secours de lecture) ────────────
  const cacheGet = () => DB.syncGet('pointage_cache');
  const cacheSet = (arr) => DB.syncSet('pointage_cache', arr.slice(-4000));
  async function cacheAppend(p) { const arr = (await cacheGet()) || []; arr.push(p); await cacheSet(arr); }
  async function cacheUpdate(clientId, patch) {
    const arr = (await cacheGet()) || []; const i = arr.findIndex(x => x.clientId === clientId);
    if (i >= 0) { arr[i] = { ...arr[i], ...patch }; await cacheSet(arr); }
  }

  async function pushOne(punch) {
    if (!Cloud.signedIn()) return;
    try {
      const sb = await Cloud.ensureClient();
      const { data, error } = await sb.from('pointages').insert({
        matricule: punch.matricule, nom: punch.nom, type: punch.type, ts: punch.ts, day: punch.day,
        late: punch.late, late_min: punch.lateMin, early: punch.early, early_min: punch.earlyMin, source: punch.source,
      }).select('id').single();
      if (error) throw error;
      await cacheUpdate(punch.clientId, { id: data.id, synced: true });
    } catch (e) { /* reste en file locale, retenté à la reconnexion (trySync) */ }
  }
  async function trySync() {
    const arr = (await cacheGet()) || [];
    for (const p of arr.filter(p => !p.synced)) await pushOne(p);
  }

  async function recordPunch(agent, type) {
    const now = Date.now(), d = new Date(now), sched = scheduleFor(d);
    let late = false, lateMin = 0, early = false, earlyMin = 0;
    if (sched) {
      const mins = minutesOfDay(d);
      if (type === 'in' && mins > sched[0]) { late = true; lateMin = mins - sched[0]; }
      if (type === 'out' && mins < sched[1]) { early = true; earlyMin = sched[1] - mins; }
    }
    const punch = {
      clientId: cid(), matricule: agent.matricule, nom: ((agent.nom || '') + ' ' + (agent.prenom || '')).trim(),
      type, ts: now, day: dayKey(d), late, lateMin, early, earlyMin, source: 'kiosk',
    };
    await cacheAppend(punch);
    pushOne(punch);
    return punch;
  }

  // Fusionne local (non confirmé) + distant sur une plage de jours [from,to] inclus.
  async function fetchRange(fromDay, toDay) {
    const local = ((await cacheGet()) || []).filter(p => p.day >= fromDay && p.day <= toDay);
    let remote = [];
    try {
      if (Cloud.signedIn()) {
        const sb = await Cloud.ensureClient();
        const { data, error } = await sb.from('pointages')
          .select('id,matricule,nom,type,ts,day,late,late_min,early,early_min')
          .gte('day', fromDay).lte('day', toDay).order('ts', { ascending: true }).limit(5000);
        if (!error) remote = (data || []).map(r => ({ id: r.id, matricule: r.matricule, nom: r.nom, type: r.type, ts: r.ts, day: r.day, late: r.late, lateMin: r.late_min, early: r.early, earlyMin: r.early_min }));
      }
    } catch (e) { /* hors-ligne : on garde le cache local */ }
    if (!remote.length) return local.sort((a, b) => a.ts - b.ts);
    const remoteKeys = new Set(remote.map(r => r.matricule + '|' + r.type + '|' + Math.round(r.ts / 2000)));
    const unconfirmed = local.filter(p => !p.id && !remoteKeys.has(p.matricule + '|' + p.type + '|' + Math.round(p.ts / 2000)));
    return [...unconfirmed, ...remote].sort((a, b) => a.ts - b.ts);
  }

  // ── Clavier numérique tactile (le PC n'a pour l'instant qu'un clavier/souris,
  //    mais un pavé à l'écran évite d'avoir à chercher le clavier physique et
  //    prépare un futur écran tactile) ─────────────────────────────────────────
  function keypad(inputEl, onEnter) {
    const pad = el('div.kiosk-pad');
    const press = (d) => { inputEl.value += d; inputEl.focus(); };
    for (const d of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) pad.append(el('button.kiosk-key', { type: 'button', text: d, onclick: () => press(d) }));
    pad.append(el('button.kiosk-key.kiosk-key-back', { type: 'button', text: '⌫', onclick: () => { inputEl.value = inputEl.value.slice(0, -1); inputEl.focus(); } }));
    pad.append(el('button.kiosk-key', { type: 'button', text: '0', onclick: () => press('0') }));
    pad.append(el('button.kiosk-key.kiosk-key-ok', { type: 'button', text: '✓', onclick: onEnter }));
    return pad;
  }

  // Clavier alphanumérique + caractères spéciaux pour le matricule (format
  // maison "NNN/L" ou "NNN/LL" — chiffres, lettres ET "/"). Le PIN, lui, reste
  // sur le pavé numérique ci-dessus (toujours 4 chiffres).
  function alphaKeypad(inputEl, onEnter) {
    const pad = el('div.kiosk-pad-alpha');
    const press = (d) => { inputEl.value += d; inputEl.focus(); };
    const rows = [
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
      ['K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'],
      ['U', 'V', 'W', 'X', 'Y', 'Z', '/', '-', '_', '.'],
    ];
    for (const row of rows) for (const d of row) pad.append(el('button.kiosk-key', { type: 'button', text: d, onclick: () => press(d) }));
    const actions = el('div.kiosk-pad-actions');
    actions.append(
      el('button.kiosk-key.kiosk-key-back', { type: 'button', text: '⌫ Effacer', onclick: () => { inputEl.value = inputEl.value.slice(0, -1); inputEl.focus(); } }),
      el('button.kiosk-key.kiosk-key-ok', { type: 'button', text: '✓ Valider', onclick: onEnter }),
    );
    return el('div', {}, [pad, actions]);
  }

  // ── Page « Badgeuse » (poste dédié à l'entrée) ────────────────────────────────
  function renderKiosk() {
    const root = el('div.page.kiosk-page');
    let agent = null, nextType = 'in', pinTries = 0;
    clearInterval(clockTimer);

    const clock = el('div.kiosk-clock#kiosk-clock');
    const stage = el('div.kiosk-stage');
    root.append(el('div.kiosk-wrap', {}, [
      el('div.kiosk-head', {}, [el('div.kiosk-title', { text: '🕐 Pointage ANPER' }), clock]),
      stage,
    ]));

    function tickClock() {
      const c = $('#kiosk-clock'); if (!c) { clearInterval(clockTimer); return; }
      const d = new Date();
      c.textContent = d.toLocaleTimeString('fr-FR') + ' — ' + d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' });
    }
    tickClock(); clockTimer = setInterval(tickClock, 1000);

    function showId() {
      agent = null; pinTries = 0;
      stage.innerHTML = '';
      const inp = el('input.kiosk-input', { placeholder: 'Matricule', autocomplete: 'off' });
      const msg = el('div.kiosk-msg');
      const go = async () => {
        const m = (inp.value || '').trim(); if (!m) return;
        const personnel = (await DB.adminGet('data:personnel')) || [];
        const found = personnel.find(p => (p.matricule || '').trim().toLowerCase() === m.toLowerCase());
        if (!found) { msg.textContent = 'Matricule inconnu — vérifiez et réessayez.'; msg.className = 'kiosk-msg err'; inp.value = ''; inp.focus(); return; }
        if (found.statut === 'Sorti') { msg.textContent = 'Cet agent n’est plus actif.'; msg.className = 'kiosk-msg err'; inp.value = ''; inp.focus(); return; }
        agent = found;
        const today = dayKey(new Date());
        const todays = (await fetchRange(today, today)).filter(p => p.matricule === agent.matricule);
        const last = todays[todays.length - 1];
        nextType = (last && last.type === 'in') ? 'out' : 'in';
        if ((found.pin || '').toString().trim()) showPin(); else finish();
      };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      stage.append(el('div.kiosk-card.kiosk-card-wide', {}, [
        el('div.kiosk-lbl', { text: 'Saisissez votre matricule' }), inp, alphaKeypad(inp, go), msg,
      ]));
      inp.focus();
    }

    function showPin() {
      stage.innerHTML = '';
      const nm = ((agent.nom || '') + ' ' + (agent.prenom || '')).trim();
      const inp = el('input.kiosk-input', { type: 'password', placeholder: 'Code (4 chiffres)', inputmode: 'numeric' });
      const msg = el('div.kiosk-msg');
      const go = () => {
        if ((inp.value || '').trim() !== String(agent.pin).trim()) {
          pinTries++;
          if (pinTries >= 3) { toast('Trop de tentatives — recommencez.', 'err'); showId(); return; }
          msg.textContent = 'Code incorrect (' + pinTries + '/3).'; msg.className = 'kiosk-msg err'; inp.value = ''; inp.focus(); return;
        }
        finish();
      };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      stage.append(el('div.kiosk-card', {}, [
        el('div.kiosk-ava', { text: (nm[0] || '?').toUpperCase() }),
        el('div.kiosk-name', { text: nm }),
        el('div.kiosk-lbl', { text: nextType === 'in' ? 'Confirmez votre code pour pointer l’ENTRÉE' : 'Confirmez votre code pour pointer la SORTIE' }),
        inp, keypad(inp, go), msg,
        el('button.btn.btn-ghost', { text: '← Recommencer', onclick: showId, style: { marginTop: '10px' } }),
      ]));
      inp.focus();
    }

    async function finish() {
      const p = await recordPunch(agent, nextType);
      const nm = ((agent.nom || '') + ' ' + (agent.prenom || '')).trim();
      stage.innerHTML = '';
      stage.append(el('div.kiosk-card.kiosk-done', {}, [
        el('div.kiosk-check', { text: '✓' }),
        el('div.kiosk-name', { text: nm }),
        el('div.kiosk-action', { text: (nextType === 'in' ? 'Entrée enregistrée à ' : 'Sortie enregistrée à ') + fmtTime(p.ts) }),
        p.late ? el('div.kiosk-flag.late', { text: '⚠ Retard de ' + p.lateMin + ' min' }) : null,
        p.early ? el('div.kiosk-flag.early', { text: '⚠ Départ anticipé de ' + p.earlyMin + ' min' }) : null,
      ]));
      setTimeout(showId, 3000);
    }

    showId();
    return root;
  }
  Pages.pointage_kiosk = renderKiosk;

  // ── Page « Suivi des pointages » (RH) ─────────────────────────────────────────
  function renderRhReport() {
    const root = el('div.page');
    root.append(el('div.page-head', {}, [
      el('div', {}, [el('h1', { text: '📆 Suivi des pointages' }),
        el('div.sub', { text: 'Horaire de référence : lundi–jeudi 08h00–17h30, vendredi 08h00–13h30.' })]),
    ]));

    const [defFrom, defTo] = monthRange();
    const fromInp = el('input.field-in', { type: 'date', value: defFrom });
    const toInp = el('input.field-in', { type: 'date', value: defTo });
    const btnToday = el('button.btn.btn-ghost.btn-sm', { text: 'Aujourd’hui' });
    const btnMonth = el('button.btn.btn-ghost.btn-sm', { text: 'Ce mois' });
    const applyBtn = el('button.btn.btn-primary.btn-sm', { text: 'Actualiser' });
    root.append(el('div.adm-toolbar', {}, [
      el('label.field-lbl', { text: 'Du' }), fromInp, el('label.field-lbl', { text: 'au' }), toInp, btnToday, btnMonth, applyBtn,
    ]));

    const kpiBox = el('div.adm-kpis');
    const sumHead = el('div.page-head');
    const sumTableBox = el('div');
    const jrnHead = el('div.page-head');
    const jrnTableBox = el('div');
    root.append(kpiBox, sumHead, sumTableBox, jrnHead, jrnTableBox);

    btnToday.onclick = () => { const t = dayKey(new Date()); fromInp.value = t; toInp.value = t; load(); };
    btnMonth.onclick = () => { const [a, b] = monthRange(); fromInp.value = a; toInp.value = b; load(); };
    applyBtn.onclick = load;

    async function load() {
      const from = fromInp.value, to = toInp.value;
      if (!from || !to || from > to) { toast('Plage de dates invalide.', 'err'); return; }
      const personnel = ((await DB.adminGet('data:personnel')) || []).filter(p => p.statut !== 'Sorti');
      const punches = await fetchRange(from, to);
      const today = dayKey(new Date());

      // KPI du jour
      const todaysP = punches.filter(p => p.day === today);
      const presentsToday = new Set(todaysP.filter(p => p.type === 'in').map(p => p.matricule)).size;
      const retardsToday = todaysP.filter(p => p.type === 'in' && p.late).length;
      const isTodayWorkday = !!scheduleFor(new Date());
      const absentsToday = isTodayWorkday ? Math.max(0, personnel.length - presentsToday) : 0;
      kpiBox.innerHTML = '';
      const kpi = (v, l) => el('div.adm-kpi', {}, [el('div.adm-kpi-v', { text: String(v) }), el('div.adm-kpi-l', { text: l })]);
      kpiBox.append(
        kpi(presentsToday, 'Présents aujourd’hui'),
        kpi(absentsToday, isTodayWorkday ? 'Absents aujourd’hui' : 'Jour non ouvré'),
        kpi(retardsToday, 'Retards aujourd’hui'),
      );

      // Résumé par agent sur la période
      const joursOuvres = workdaysBetween(from, to);
      const byAgent = {};
      for (const p of personnel) byAgent[p.matricule] = { matricule: p.matricule, nom: ((p.nom || '') + ' ' + (p.prenom || '')).trim(), direction: p.direction || '', jours: new Set(), retards: 0, precoces: 0, dernier: null };
      for (const pu of punches) {
        const a = byAgent[pu.matricule]; if (!a) continue;
        if (pu.type === 'in') { a.jours.add(pu.day); if (pu.late) a.retards++; }
        if (pu.type === 'out' && pu.early) a.precoces++;
        if (!a.dernier || pu.ts > a.dernier.ts) a.dernier = pu;
      }
      const rows = Object.values(byAgent).map(a => ({
        matricule: a.matricule, nom: a.nom, direction: a.direction,
        presents: a.jours.size, attendus: joursOuvres, absences: Math.max(0, joursOuvres - a.jours.size),
        retards: a.retards, precoces: a.precoces,
        dernier: a.dernier ? (fmtDate(a.dernier.ts) + ' ' + fmtTime(a.dernier.ts) + ' (' + (a.dernier.type === 'in' ? 'Entrée' : 'Sortie') + ')') : '—',
      })).sort((x, y) => x.nom.localeCompare(y.nom, 'fr'));

      const sumCols = [
        { key: 'matricule', label: 'Matricule' }, { key: 'nom', label: 'Nom' }, { key: 'direction', label: 'Direction' },
        { key: 'presents', label: 'Jours présents' }, { key: 'attendus', label: 'Jours attendus' }, { key: 'absences', label: 'Absences' },
        { key: 'retards', label: 'Retards' }, { key: 'precoces', label: 'Départs anticipés' }, { key: 'dernier', label: 'Dernier pointage' },
      ];
      sumHead.innerHTML = '';
      sumHead.append(el('h2', { text: 'Résumé par agent' }),
        el('button.btn.btn-ghost.btn-sm', { text: '⬇ Export CSV', onclick: () => downloadFile('pointages_resume_' + from + '_' + to + '.csv', toCSV(rows, sumCols), 'text/csv;charset=utf-8') }));
      sumTableBox.innerHTML = '';
      const table = el('table.adm-table');
      table.append(el('thead', {}, [el('tr', {}, sumCols.map(c => el('th', { text: c.label })))]));
      const tb = el('tbody');
      for (const r of rows) tb.append(el('tr', {}, sumCols.map(c => el('td', { text: String(r[c.key]) }))));
      table.append(tb); sumTableBox.append(table);

      // Journal brut
      const journal = [...punches].sort((a, b) => b.ts - a.ts).slice(0, 300);
      const jrnRows = journal.map(p => ({ date: fmtDate(p.ts), heure: fmtTime(p.ts), matricule: p.matricule, nom: p.nom, type: p.type === 'in' ? 'Entrée' : 'Sortie', alerte: p.late ? 'Retard' : (p.early ? 'Départ anticipé' : '') }));
      const jrnCols = [
        { key: 'date', label: 'Date' }, { key: 'heure', label: 'Heure' }, { key: 'matricule', label: 'Matricule' },
        { key: 'nom', label: 'Agent' }, { key: 'type', label: 'Type' }, { key: 'alerte', label: 'Alerte' },
      ];
      jrnHead.innerHTML = '';
      jrnHead.append(el('h2', { text: 'Journal des pointages (300 derniers)' }),
        el('button.btn.btn-ghost.btn-sm', { text: '⬇ Export CSV', onclick: () => downloadFile('pointages_journal_' + from + '_' + to + '.csv', toCSV(jrnRows, jrnCols), 'text/csv;charset=utf-8') }));
      jrnTableBox.innerHTML = '';
      const jt = el('table.adm-table');
      jt.append(el('thead', {}, [el('tr', {}, jrnCols.map(c => el('th', { text: c.label })))]));
      const jb = el('tbody');
      for (const r of jrnRows) jb.append(el('tr', {}, [
        el('td', { text: r.date }), el('td', { text: r.heure }), el('td', { text: r.matricule }), el('td', { text: r.nom }),
        el('td', { text: r.type }), el('td', {}, [r.alerte ? el('span.chip.chip-warn', { text: r.alerte }) : null]),
      ]));
      jt.append(jb); jrnTableBox.append(jt);
    }

    root._onMount = load;
    return root;
  }
  Pages.adm_pointage = renderRhReport;

  return { trySync, recordPunch, fetchRange };
})();
window.Pointage = Pointage;
