/* Scaffale — account, sincronizzazione e amici (Firebase).
   Si attiva solo se firebase-config.txt contiene la configurazione del tuo progetto.
   I dati restano anche sul telefono: se la rete manca, l'app funziona lo stesso. */
'use strict';

const FB_URL = 'https://www.gstatic.com/firebasejs/10.12.2/';
const cloud = { status: 'off', user: null, me: null, err: '', syncErr: '', auth: null, fs: null, A: null, F: null, unsubs: [], ready: 0, lastSync: 0 };
let friends = {};        // uid -> { name, db }
let friendsLoadedAt = 0;
let friendsLoading = false;
let pendingRender = false;

/* ---------- configurazione ---------- */
function parseConfig(t) {
  t = t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/[^\n]*/g, '$1');
  const k = t.indexOf('firebaseConfig');
  const i = t.indexOf('{', k < 0 ? 0 : k);
  if (i < 0) return null;
  let depth = 0, j = i;
  for (; j < t.length; j++) { if (t[j] === '{') depth++; else if (t[j] === '}') { depth--; if (!depth) break; } }
  const o = t.slice(i, j + 1).replace(/'/g, '"').replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":').replace(/,\s*}/g, '}');
  try { const c = JSON.parse(o); return c.apiKey && c.projectId ? c : null; } catch (e) { return null; }
}
const appConfig = { ponte: '', firebase: null };
async function loadAppConfig() {
  let t = '';
  try { const r = await fetch('config.txt', { cache: 'no-store' }); if (r.ok) t = await r.text(); } catch (e) { /* offline */ }
  if (!t) { try { t = localStorage.getItem('scaffale-config') || ''; } catch (e) { /* */ } }
  else { try { localStorage.setItem('scaffale-config', t); } catch (e) { /* */ } }
  const m = t.match(/ponte\s*[=:]\s*["']?(https:\/\/[^\s"'<>]+)/i);
  appConfig.ponte = m && !/INDIRIZZO/i.test(m[1]) ? m[1].replace(/\/+$/, '') : '';
  appConfig.firebase = parseConfig(t);
}

/* ---------- avvio ---------- */
async function initCloud() {
  const cfg = appConfig.firebase;
  if (!cfg) { cloud.status = 'off'; return; }
  cloud.status = 'loading';
  softRender();
  try {
    const [A, Au, F] = await Promise.all([import(FB_URL + 'firebase-app.js'), import(FB_URL + 'firebase-auth.js'), import(FB_URL + 'firebase-firestore.js')]);
    cloud.A = Au; cloud.F = F;
    const app = A.initializeApp(cfg);
    cloud.auth = Au.getAuth(app);
    cloud.fs = F.getFirestore(app);
  } catch (e) {
    cloud.status = 'error';
    cloud.err = 'Non riesco a collegarmi al server. Sei offline? L\'app funziona lo stesso, i dati si sincronizzano al prossimo avvio con la rete.';
    softRender();
    return;
  }
  cloud.A.onAuthStateChanged(cloud.auth, async (u) => {
    stopSync();
    cloud.user = u;
    friends = {}; friendsLoadedAt = 0;
    if (!u) { cloud.status = 'out'; cloud.me = null; softRender(); return; }
    cloud.status = 'in';
    try { await ensureProfile(); } catch (e) { cloud.syncErr = errText(e); }
    startSync();
    loadFriends(true);
    softRender();
  });
}

function softRender() {
  const a = document.activeElement;
  if ((typeof sheet !== 'undefined' && sheet.open) || (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) { pendingRender = true; return; }
  pendingRender = false;
  if (typeof render === 'function') render();
}
document.addEventListener('focusout', () => setTimeout(() => { if (pendingRender) softRender(); }, 50));

/* ---------- profilo e codice amico ---------- */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const genCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
const fmtCode = (c) => (c ? c.slice(0, 4) + '-' + c.slice(4) : '');
async function ensureProfile() {
  const { F, fs, user } = cloud;
  const ref = F.doc(fs, 'users', user.uid);
  const snap = await F.getDoc(ref);
  const me = snap.exists() ? snap.data() : {};
  let changed = !snap.exists();
  if (!me.code) {
    me.code = genCode();
    await F.setDoc(F.doc(fs, 'codes', me.code), { uid: user.uid });
    changed = true;
  }
  if (!me.name) { const p = (user.email || 'io').split('@')[0]; me.name = p.charAt(0).toUpperCase() + p.slice(1); changed = true; }
  if (changed) await F.setDoc(ref, me, { merge: true });
  cloud.me = me;
}

/* ---------- accesso ---------- */
function errText(e) {
  const c = (e && e.code) || '';
  return ({
    'auth/invalid-credential': 'Email o password sbagliate.',
    'auth/wrong-password': 'Email o password sbagliate.',
    'auth/user-not-found': 'Nessun account con questa email: usa “Crea account”.',
    'auth/email-already-in-use': 'Esiste già un account con questa email: usa “Accedi”.',
    'auth/weak-password': 'La password deve avere almeno 6 caratteri.',
    'auth/invalid-email': 'L\'indirizzo email non è valido.',
    'auth/missing-password': 'Scrivi la password.',
    'auth/network-request-failed': 'Nessuna connessione. Riprova quando sei online.',
    'auth/too-many-requests': 'Troppi tentativi. Aspetta qualche minuto e riprova.',
    'auth/operation-not-allowed': 'In Firebase non è attivo l\'accesso con email e password (passaggio 3 della guida).',
    'auth/configuration-not-found': 'In Firebase non è attivo l\'accesso con email e password (passaggio 3 della guida).',
    'permission-denied': 'Il database non ha le regole giuste (passaggio 4 della guida).',
    'unavailable': 'Server non raggiungibile. Riprovo appena torni online.',
  })[c] || 'Qualcosa non è andato: ' + (e && e.message ? e.message : 'errore sconosciuto');
}
function loginFormHTML() {
  return `<form class="note" data-form="login" style="gap:12px">
    <p><b>Accedi per sincronizzare e seguire tuo fratello</b></p>
    <label class="field"><span>Email</span><input type="email" id="lg-email" autocomplete="email" inputmode="email" required></label>
    <label class="field"><span>Password (almeno 6 caratteri)</span><input type="password" id="lg-pass" autocomplete="current-password" required></label>
    ${cloud.err ? `<p class="small" style="color:var(--heart)">${esc(cloud.err)}</p>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-act="login">Accedi</button><button type="button" class="btn" data-act="signup">Crea account</button></div>
    <button type="button" class="linkish" data-act="reset-pass" style="justify-self:start">Password dimenticata?</button>
  </form>`;
}
async function doAuth(kind) {
  const email = ($('#lg-email') || {}).value || '';
  const pass = ($('#lg-pass') || {}).value || '';
  const A = cloud.A;
  cloud.err = '';
  try {
    if (kind === 'reset') {
      if (!email) { cloud.err = 'Scrivi la tua email, poi tocca di nuovo “Password dimenticata?”.'; render(); return; }
      await A.sendPasswordResetEmail(cloud.auth, email.trim());
      toast('Ti ho mandato un\'email per cambiare password');
      return;
    }
    if (kind === 'signup') await A.createUserWithEmailAndPassword(cloud.auth, email.trim(), pass);
    else await A.signInWithEmailAndPassword(cloud.auth, email.trim(), pass);
    toast(kind === 'signup' ? 'Account creato' : 'Accesso eseguito');
  } catch (e) { cloud.err = errText(e); pendingRender = false; render(); }
}

/* ---------- sincronizzazione ---------- */
// impronta di un oggetto (ordine delle chiavi ininfluente)
function stable(o) {
  if (Array.isArray(o)) return '[' + o.map(stable).join(',') + ']';
  if (o && typeof o === 'object') return '{' + Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => JSON.stringify(k) + ':' + stable(o[k])).join(',') + '}';
  return JSON.stringify(o === undefined ? null : o);
}
function hashOf(o) {
  const str = stable(o);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
const metaOf = () => ({ lists: db.lists, favorites: db.favorites });
const privOf = () => ({ settings: db.settings || {} });
// i dati online sono divisi in 32 blocchi di titoli (w) e 32 di voci (e): pochi documenti, letture veloci
const NB = 32;
function bucketOf(id) { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0; return String(Math.abs(h) % NB); }
function localBuckets(kind) {
  const b = {};
  for (let i = 0; i < NB; i++) b[i] = {};
  (kind === 'w' ? Object.values(db.works) : db.entries).forEach((x) => { b[bucketOf(x.id)][x.id] = x; });
  return b;
}
// sostituisce un blocco locale; gli oggetti già presenti e uguali restano gli stessi (chi li sta modificando non perde il riferimento)
function setLocalBucket(kind, b, items) {
  const keep = (old, x, id) => (old && (old === x || hashOf(old) === hashOf(x)) ? old : { ...x, id });
  if (kind === 'w') {
    Object.keys(db.works).forEach((id) => { if (bucketOf(id) === b && !items[id]) delete db.works[id]; });
    Object.entries(items).forEach(([id, x]) => { db.works[id] = keep(db.works[id], x, id); });
  } else {
    const old = new Map(db.entries.filter((e) => bucketOf(e.id) === b).map((e) => [e.id, e]));
    db.entries = db.entries.filter((e) => bucketOf(e.id) !== b).concat(Object.entries(items).map(([id, x]) => keep(old.get(id), x, id)));
  }
}
let synced = null;
const syncKey = () => 'scaffale-sync2-' + cloud.user.uid;
function loadSynced() {
  try { synced = JSON.parse(localStorage.getItem(syncKey())); } catch (e) { synced = null; }
  if (!synced || !synced.w) synced = { w: {}, e: {}, meta: null, priv: null };
}
function saveSynced() { try { localStorage.setItem(syncKey(), JSON.stringify(synced)); } catch (e) { /* */ } }

const seenFirst = new Set();
function stopSync() { cloud.unsubs.forEach((u) => u()); cloud.unsubs = []; cloud.ready = 0; synced = null; seenFirst.clear(); clearTimeout(syncTimer); }
function startSync() {
  loadSynced();
  const { F, fs } = cloud;
  const uid = cloud.user.uid;
  const onErr = (e) => { cloud.syncErr = errText(e); softRender(); };
  cloud.unsubs.push(F.onSnapshot(F.collection(fs, 'users', uid, 'w'), (s) => applyBuckets(s, 'w'), onErr));
  cloud.unsubs.push(F.onSnapshot(F.collection(fs, 'users', uid, 'e'), (s) => applyBuckets(s, 'e'), onErr));
  cloud.unsubs.push(F.onSnapshot(F.doc(fs, 'users', uid, 'meta', 'main'), (d) => applyDoc(d, 'meta'), onErr));
  cloud.unsubs.push(F.onSnapshot(F.doc(fs, 'users', uid, 'private', 'settings'), (d) => applyDoc(d, 'priv'), onErr));
}
function markReady(kind) {
  if (seenFirst.has(kind)) return;
  seenFirst.add(kind);
  if (seenFirst.size === 4) { cloud.ready = 1; scheduleSync(); }
}
const parseItems = (doc) => { try { return JSON.parse(doc.data().json || '{}'); } catch (e) { return {}; } };

function applyBuckets(snap, kind) {
  if (!synced) return;
  let changed = false;
  const lb = localBuckets(kind);
  snap.docChanges().forEach((ch) => {
    const b = ch.doc.id;
    const remote = ch.type === 'removed' ? {} : parseItems(ch.doc);
    const rh = hashOf(remote), lh = hashOf(lb[b] || {}), sh = synced[kind][b];
    if (rh === lh) { synced[kind][b] = rh; return; }
    // telefono invariato dall'ultima sincronizzazione: vale la versione online.
    // prima volta o modifiche locali non ancora inviate: si uniscono, il telefono vince sui doppioni.
    const result = sh !== undefined && lh === sh ? remote : { ...remote, ...(lb[b] || {}) };
    setLocalBucket(kind, b, result);
    synced[kind][b] = rh;
    changed = true;
  });
  saveSynced();
  if (changed) { persist(); softRender(); if (typeof runMatcher === 'function') runMatcher(); }
  markReady(kind);
  if (cloud.ready) scheduleSync();
}
function applyDoc(d, kind) {
  if (!synced) return;
  const data = d.exists() ? d.data() : null;
  const local = kind === 'meta' ? metaOf() : privOf();
  if (data) {
    const rh = hashOf(data), lh = hashOf(local);
    if (rh !== lh && (synced[kind] === null || synced[kind] === lh)) {
      if (kind === 'meta') {
        if (synced.meta === null) {
          const byId = new Map((data.lists || []).map((l) => [l.id, l]));
          db.lists.forEach((l) => byId.set(l.id, l));
          db.lists = [...byId.values()];
          TYPES.forEach((t) => { db.favorites[t] = [...new Set([...(db.favorites[t] || []), ...((data.favorites || {})[t] || [])])].slice(0, 4); });
        } else {
          db.lists = data.lists || [];
          db.favorites = { book: [], game: [], film: [], ...(data.favorites || {}) };
        }
      } else db.settings = { ...(synced.priv === null ? data.settings : {}), ...(synced.priv === null ? db.settings : data.settings) };
      persist();
      softRender();
    }
    synced[kind] = rh;
    saveSynced();
  }
  markReady(kind);
}

let syncTimer, pushing = false, pushAgain = false;
function scheduleSync() {
  if (cloud.status !== 'in' || !synced || !cloud.ready) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(push, 800);
}
async function push() {
  if (pushing) { pushAgain = true; return; }
  pushing = true;
  const { F, fs } = cloud;
  const uid = cloud.user.uid;
  const ops = [];
  let tooBig = false;
  ['w', 'e'].forEach((kind) => {
    const lb = localBuckets(kind);
    for (let i = 0; i < NB; i++) {
      const b = String(i), items = lb[i], h = hashOf(items);
      if (synced[kind][b] === h) continue;
      const n = Object.keys(items).length;
      if (!n && synced[kind][b] === undefined) { synced[kind][b] = h; continue; }
      const json = JSON.stringify(items);
      if (json.length > 900000) { tooBig = true; continue; }
      ops.push({ path: [kind, b], data: { json, n }, done: () => { synced[kind][b] = h; } });
    }
  });
  const m = metaOf(), mh = hashOf(m);
  if (synced.meta !== mh) ops.push({ path: ['meta', 'main'], data: JSON.parse(JSON.stringify(m)), done: () => { synced.meta = mh; } });
  const p = privOf(), ph = hashOf(p);
  if (synced.priv !== ph) ops.push({ path: ['private', 'settings'], data: JSON.parse(JSON.stringify(p)), done: () => { synced.priv = ph; } });
  try {
    for (let i = 0; i < ops.length; i += 20) {
      const chunk = ops.slice(i, i + 20);
      const b = F.writeBatch(fs);
      chunk.forEach((op) => b.set(F.doc(fs, 'users', uid, ...op.path), op.data));
      await b.commit();
      chunk.forEach((op) => op.done());
      saveSynced();
    }
    cloud.lastSync = Date.now();
    const msg = tooBig ? 'Troppe copertine caricate a mano: alcune modifiche restano solo su questo telefono.' : '';
    if (cloud.syncErr !== msg) { cloud.syncErr = msg; softRender(); }
  } catch (e) {
    cloud.syncErr = errText(e);
    setTimeout(scheduleSync, 20000);
    softRender();
  }
  pushing = false;
  if (pushAgain) { pushAgain = false; push(); }
}

/* ---------- amici ---------- */
async function loadFriends(force) {
  if (cloud.status !== 'in' || friendsLoading) return;
  if (!force && Date.now() - friendsLoadedAt < 120000) return;
  friendsLoading = true;
  const { F, fs } = cloud;
  const uid = cloud.user.uid;
  try {
    const fol = await F.getDocs(F.collection(fs, 'users', uid, 'followers'));
    const next = {};
    await Promise.all(fol.docs.map(async (d) => {
      const fid = d.id;
      try {
        const [u, w, e, m] = await Promise.all([
          F.getDoc(F.doc(fs, 'users', fid)), F.getDocs(F.collection(fs, 'users', fid, 'w')),
          F.getDocs(F.collection(fs, 'users', fid, 'e')), F.getDoc(F.doc(fs, 'users', fid, 'meta', 'main')),
        ]);
        const fdb = emptyDB();
        w.forEach((x) => { Object.entries(parseItems(x)).forEach(([id, it]) => { fdb.works[id] = { ...it, id }; }); });
        e.forEach((x) => { Object.entries(parseItems(x)).forEach(([id, it]) => { if (fdb.works[it.workId]) fdb.entries.push({ ...it, id }); }); });
        if (m.exists()) { const md = m.data(); fdb.lists = md.lists || []; fdb.favorites = { ...fdb.favorites, ...(md.favorites || {}) }; }
        next[fid] = { name: (u.data() || {}).name || 'Amico', db: fdb };
      } catch (err) { /* non più collegati */ }
    }));
    friends = next;
    friendsLoadedAt = Date.now();
  } catch (e) { cloud.syncErr = errText(e); }
  friendsLoading = false;
  softRender();
}
async function addFriend(raw) {
  const code = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 8) { toast('Il codice ha 8 caratteri, tipo ABCD-1234'); return; }
  const { F, fs } = cloud;
  const uid = cloud.user.uid;
  try {
    const c = await F.getDoc(F.doc(fs, 'codes', code));
    if (!c.exists()) { toast('Codice non trovato: controllalo'); return; }
    const fid = c.data().uid;
    if (fid === uid) { toast('Questo è il tuo codice: inserisci quello di tuo fratello'); return; }
    const at = new Date().toISOString();
    await F.setDoc(F.doc(fs, 'users', fid, 'followers', uid), { code, at });
    await F.setDoc(F.doc(fs, 'users', uid, 'followers', fid), { at });
    toast('Collegati! Ora vi vedete a vicenda');
    await loadFriends(true);
  } catch (e) { toast(errText(e)); }
}
async function removeFriend(fid) {
  const { F, fs } = cloud;
  const uid = cloud.user.uid;
  try {
    await F.deleteDoc(F.doc(fs, 'users', uid, 'followers', fid));
    await F.deleteDoc(F.doc(fs, 'users', fid, 'followers', uid)).catch(() => {});
    delete friends[fid];
    toast('Scollegato');
    go('#/amici', true);
  } catch (e) { toast(errText(e)); }
}
async function saveName(name) {
  name = name.trim().slice(0, 40);
  if (!name) return;
  try { await cloud.F.setDoc(cloud.F.doc(cloud.fs, 'users', cloud.user.uid), { name }, { merge: true }); cloud.me.name = name; toast('Nome salvato'); }
  catch (e) { toast(errText(e)); }
}

// stesso titolo nello scaffale di un altro?
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
function matchWork(w, other) {
  const all = Object.values(other.works);
  return all.find((x) => x.source && x.source !== 'manual' && x.source === w.source && String(x.sourceId) === String(w.sourceId))
    || all.find((x) => x.type === w.type && norm(x.title) === norm(w.title));
}

/* ---------- viste ---------- */
function codeBoxHTML() {
  return `<div class="note">
    <p class="small muted">Il tuo codice amico</p>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b class="code">${esc(fmtCode(cloud.me && cloud.me.code))}</b><button class="btn" data-act="copy-code">Copia</button></div>
    <p class="small muted">Mandalo a tuo fratello: quando lo inserisce nella sua app vi vedete a vicenda. Oppure inserisci tu il suo.</p>
    <form class="searchbar" data-form="friend" style="margin:0"><input type="text" id="friendCode" placeholder="Codice di tuo fratello" autocapitalize="characters" autocomplete="off"><button class="btn primary">Collega</button></form>
  </div>`;
}
function cloudNotice() {
  if (cloud.status === 'off') return `<div class="note"><p><b>Amici e sincronizzazione non sono ancora attivi.</b></p><p class="small muted">Serve collegare l'app a Firebase (gratis): segui la guida e incolla la configurazione nel file config.txt su GitHub.</p></div>`;
  if (cloud.status === 'loading') return '<div class="spinner">Mi collego…</div>';
  if (cloud.status === 'error') return `<div class="note"><p class="small">${esc(cloud.err)}</p></div>`;
  if (cloud.status === 'out') return loginFormHTML();
  return '';
}
function viewFriends() {
  let h = `<header class="top"><h1>Amici</h1>${cloud.status === 'in' ? `<button class="icon-btn" data-act="refresh-friends" aria-label="Aggiorna"><svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7L20 8.5M20 3v5.5h-5.5"/></svg></button>` : ''}</header>`;
  if (cloud.status !== 'in') return h + cloudNotice();
  loadFriends(false);
  const list = Object.entries(friends);
  if (!list.length) return h + (friendsLoading && !friendsLoadedAt ? '<div class="spinner">Carico…</div>' : `<p class="muted">Collegati con tuo fratello per vedere cosa legge e a cosa gioca.</p>${codeBoxHTML()}`);

  h += `<div class="friends">${list.map(([fid, f]) => `<a href="#/amico/${fid}" class="friend"><span class="avatar">${esc((f.name || '?').charAt(0).toUpperCase())}</span><span>${esc(f.name)}</span></a>`).join('')}</div>`;
  const all = [];
  list.forEach(([fid, f]) => f.db.entries.forEach((e) => all.push({ fid, f, e, w: f.db.works[e.workId] })));
  const cur = all.filter((x) => x.e.status === 'in_corso');
  if (cur.length) h += `<h2>Stanno ${cur.some((x) => x.w.type === 'book') ? 'leggendo e giocando' : 'giocando'}</h2><div class="strip">${cur.map((x) => `<a href="#/amico/${x.fid}/opera/${x.w.id}">${coverHTML(x.w)}<span class="cap">${esc(x.f.name)}</span></a>`).join('')}</div>`;
  const feed = all.filter((x) => x.e.status !== 'in_corso').sort((a, b) => entryDate(b.e).localeCompare(entryDate(a.e)) || (b.e.created || '').localeCompare(a.e.created || '')).slice(0, 50);
  h += '<h2>Attività recente</h2>';
  if (!feed.length) h += '<p class="muted small">Ancora niente da vedere.</p>';
  h += feed.map(({ fid, f, e, w }) => {
    const T = TYPE[w.type];
    return `<a class="feed" href="#/amico/${fid}/opera/${w.id}">${coverHTML(w)}
      <div style="min-width:0"><div class="who"><b>${esc(f.name)}</b> · ${esc((T.status[e.status] || '').toLowerCase())} · ${fmtDate(entryDate(e))}</div>
      <div class="t">${esc(w.title)}</div>
      <div class="meta">${starsHTML(e.rating)}${e.liked ? ICON.heartS : ''}${e.again ? ICON.again : ''}</div>
      ${e.review ? `<p class="snip">${e.spoiler ? '<i>Contiene spoiler</i>' : esc(e.review)}</p>` : ''}</div></a>`;
  }).join('');
  h += `<h2>Collega qualcun altro</h2>${codeBoxHTML()}`;
  return h;
}

function viewFriend(r) {
  const fid = r.parts[1];
  const f = friends[fid];
  const back = `<button class="icon-btn" data-act="back" aria-label="Indietro">${ICON.back}</button>`;
  if (!f) {
    if (cloud.status === 'in') loadFriends(false);
    return `<header class="top">${back}</header>` + (cloud.status === 'in' && (friendsLoading || !friendsLoadedAt) ? '<div class="spinner">Carico…</div>' : cloudNotice() || '<p class="muted">Non trovato.</p>');
  }
  const mine = db;
  const isWork = r.parts[2] === 'opera';
  const fw = isWork ? f.db.works[r.parts[3]] : null;
  const mw = fw ? matchWork(fw, mine) : null;
  ctx = { ro: true, link: `#/amico/${fid}/opera/`, name: f.name, fid, mineId: mw ? mw.id : '' };
  db = f.db;
  let h;
  try {
    if (isWork) h = viewWork({ name: 'opera', id: r.parts[3], parts: [], q: {} });
    else {
      const tab = r.q.tab || 'diario';
      const tabs = [['diario', 'Diario'], ['stats', 'Statistiche'], ['liste', 'Liste'], ['dafare', 'Da fare']];
      h = `<header class="top">${back}<h1>${esc(f.name)}</h1></header>
        <div class="seg wrap" role="group">${tabs.map(([k, l]) => `<a class="segl" href="#/amico/${fid}?tab=${k}" aria-pressed="${tab === k}">${l}</a>`).join('')}</div><div style="height:12px"></div>`;
      if (tab === 'stats') h += viewProfile();
      else if (tab === 'liste') {
        h += db.lists.length ? db.lists.map((l) => `<h2>${esc(l.name)} <span class="muted small" style="text-transform:none;letter-spacing:0">${l.items.length}</span></h2>${l.description ? `<p class="small muted">${esc(l.description)}</p>` : ''}<div class="shelf">${l.items.map((id, i) => { const w = work(id); return w ? `<a href="${ctx.link}${w.id}">${coverHTML(w, 'm', l.ranked ? String(i + 1) : '')}</a>` : ''; }).join('')}</div>`).join('') : '<div class="empty"><p>Nessuna lista.</p></div>';
      } else if (tab === 'dafare') {
        const ws = Object.values(db.works).filter((w) => w.wish);
        h += ws.length ? `<div class="shelf wide">${ws.map((w) => `<a href="${ctx.link}${w.id}">${coverHTML(w)}<span class="cap">${esc(w.title)}</span></a>`).join('')}</div>` : '<div class="empty"><p>Lista vuota.</p></div>';
      } else h += viewDiary({ q: {} });
      h += `<div style="margin-top:36px"><button class="btn danger" data-act="unfriend" data-id="${fid}">Scollega ${esc(f.name)}</button></div>`;
    }
  } finally {
    db = mine;
    ctx = { ro: false, link: '#/opera/', name: '', fid: '', mineId: '' };
  }
  return h;
}

// sulla scheda di un tuo titolo: cosa ne pensano gli amici
function friendsOnWork(w) {
  if (!w || cloud.status !== 'in') return '';
  const rows = [];
  Object.entries(friends).forEach(([fid, f]) => {
    const fw = matchWork(w, f.db);
    if (!fw) return;
    const es = f.db.entries.filter((e) => e.workId === fw.id).sort((a, b) => entryDate(b).localeCompare(entryDate(a)));
    const last = es.find((e) => e.rating) || es[0];
    rows.push(`<a class="pick" href="#/amico/${fid}/opera/${fw.id}" style="grid-template-columns:36px minmax(0,1fr) auto;text-decoration:none">
      <span class="avatar">${esc(f.name.charAt(0).toUpperCase())}</span>
      <span><b>${esc(f.name)}</b><br><span class="small muted">${last ? esc(TYPE[fw.type].status[last.status] || '') : esc(TYPE[fw.type].wish)}</span></span>
      <span style="display:flex;gap:6px;align-items:center">${last ? starsHTML(last.rating) : ''}${(last && last.liked) || fw.liked ? ICON.heartS : ''}</span></a>`);
  });
  return rows.length ? `<h2>Amici</h2><div>${rows.join('')}</div>` : '';
}

function accountHTML() {
  if (cloud.status !== 'in') return `<h2>Account e amici</h2>${cloudNotice()}`;
  return `<h2>Account e amici</h2>
  <div class="note">
    <p class="small">Connesso come <b>${esc(cloud.user.email)}</b></p>
    <p class="small ${cloud.syncErr ? '' : 'muted'}" ${cloud.syncErr ? 'style="color:var(--heart)"' : ''}>${cloud.syncErr ? esc(cloud.syncErr) : 'I dati si salvano anche online e li ritrovi su ogni dispositivo dove accedi.'}</p>
    <form class="searchbar" data-form="name" style="margin:0"><input type="text" id="myName" value="${esc(cloud.me ? cloud.me.name : '')}" placeholder="Il tuo nome" aria-label="Il tuo nome, come lo vedono gli amici"><button class="btn">Salva nome</button></form>
    <button class="btn" data-act="logout" style="justify-self:start">Esci</button>
  </div>`;
}
