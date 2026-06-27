/* Helpers d'interface ANPER SE. */

// Création concise d'éléments : el('div.card', {id:'x'}, [child, 'texte'])
function el(sel, attrs = {}, children = []) {
  const parts = sel.split(/(?=[.#])/);
  const tag = parts[0].match(/^[.#]/) ? 'div' : parts.shift();
  const node = document.createElement(tag || 'div');
  for (const p of parts) {
    if (p[0] === '.') node.classList.add(p.slice(1));
    else if (p[0] === '#') node.id = p.slice(1);
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className += ' ' + v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(c));
  }
  return node;
}
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function toast(msg, kind = 'info', ms = 3200) {
  let host = $('#toasts');
  if (!host) { host = el('div#toasts'); document.body.append(host); }
  const t = el('div.toast.toast-' + kind, { text: msg });
  host.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}

// Modale générique. body = noeud DOM ; buttons = [{text, kind, onClick→ferme si renvoie !== false}]
function modal(titre, body, buttons = []) {
  return new Promise((resolve) => {
    const overlay = el('div.overlay');
    const box = el('div.modal');
    const close = (val) => { overlay.remove(); resolve(val); };
    box.append(el('div.modal-head', {}, [
      el('span', { text: titre }),
      el('button.modal-x', { text: '✕', onclick: () => close(undefined) }),
    ]));
    box.append(el('div.modal-body', {}, [body]));
    const foot = el('div.modal-foot');
    if (!buttons.length) buttons = [{ text: 'Fermer', kind: 'ghost' }];
    for (const b of buttons) {
      foot.append(el('button.btn.btn-' + (b.kind || 'ghost'), {
        text: b.text,
        onclick: () => { const r = b.onClick ? b.onClick() : undefined; if (r !== false) close(b.value !== undefined ? b.value : true); },
      }));
    }
    box.append(foot);
    overlay.append(box);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(undefined); });
    document.body.append(overlay);
    return overlay;
  });
}
function confirmDialog(titre, message) {
  return modal(titre, el('p', { text: message, style: { margin: '4px 2px' } }), [
    { text: 'Annuler', kind: 'ghost', value: false },
    { text: 'Confirmer', kind: 'danger', value: true },
  ]);
}

/* Widget multi-sélection en cascade (Région→Dépt→Commune→Localité).
   options() renvoie la liste courante ; onChange() prévient les enfants. */
class MultiSelect {
  constructor(label, optionsFn, onChange = null, required = false) {
    this.optionsFn = optionsFn; this.onChange = onChange; this.selected = new Set();
    this.node = el('div.field');
    this.node.append(el('label.field-lbl', { html: label + (required ? ' <span class="req">*</span>' : '') }));
    this.summary = el('button.ms-summary', { type: 'button', text: '— Choisir —',
      onclick: () => this.toggle() });
    this.panel = el('div.ms-panel', { style: { display: 'none' } });
    this.node.append(this.summary, this.panel);
    document.addEventListener('click', (e) => { if (!this.node.contains(e.target)) this.close(); });
  }
  toggle() { this.panel.style.display === 'none' ? this.openPanel() : this.close(); }
  close() { this.panel.style.display = 'none'; }
  openPanel() {
    this.panel.innerHTML = '';
    const opts = this.optionsFn() || [];
    const search = el('input.ms-search', { placeholder: 'Filtrer…', oninput: (e) => {
      const q = e.target.value.toLowerCase();
      $$('.ms-opt', list).forEach(o => { o.style.display = o.dataset.v.toLowerCase().includes(q) ? '' : 'none'; });
    }});
    const list = el('div.ms-list');
    if (!opts.length) list.append(el('div.ms-empty', { text: 'Aucune option (choisir le niveau parent)' }));
    for (const o of opts) {
      const id = 'ms' + Math.random().toString(36).slice(2);
      const cb = el('input', { type: 'checkbox', id });
      cb.checked = this.selected.has(o);
      cb.addEventListener('change', () => {
        cb.checked ? this.selected.add(o) : this.selected.delete(o);
        this.refresh(); if (this.onChange) this.onChange();
      });
      const row = el('label.ms-opt', { for: id }, [cb, el('span', { text: o })]);
      row.dataset.v = o; list.append(row);
    }
    this.panel.append(search, list);
    this.panel.style.display = 'block';
    search.focus();
  }
  refresh() {
    const a = [...this.selected];
    this.summary.textContent = a.length ? (a.length <= 2 ? a.join(', ') : `${a.length} sélectionnés`) : '— Choisir —';
    this.summary.classList.toggle('has-val', a.length > 0);
  }
  getList() { return [...this.selected]; }
  get() { return [...this.selected].join(', '); }
  set(str) { this.selected = new Set(String(str || '').split(',').map(s => s.trim()).filter(Boolean)); this.refresh(); }
  clear() { this.selected.clear(); this.refresh(); }
}
