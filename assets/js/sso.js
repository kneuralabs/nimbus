/* ── Users ── */
const STORE_KEY    = 'kn-users-v3';        // legacy full-snapshot store (migrated away from)
const OVERRIDE_KEY = 'kn-users-overrides-v1'; // persists ONLY deltas on top of the code-defined seed
const DEFAULT_PW   = 'Kneuralabs@2026';

const USERS = {
  'admin':       { password: '2d7e38d6f21338fad753eb282c54b74c05b48f017674074fce9f33de583d60d4', name: 'Administrator', role: 'admin'    },
  'KN-2026-001': { password: '71b5dbfbb27c4799097fde2419b63e899746958d00a79584c65862e2434f8a90', name: 'Piyal Gupta',   role: 'employee' },
  'KN-2026-002': { password: '71b5dbfbb27c4799097fde2419b63e899746958d00a79584c65862e2434f8a90', name: 'Piyali Dhar',   role: 'employee' },
  'KN-2026-003': { password: '71b5dbfbb27c4799097fde2419b63e899746958d00a79584c65862e2434f8a90', name: 'Gautham Dhar',  role: 'employee' },
};

async function _sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* Persistence model — overrides on top of the code-defined seed.
 *
 * The user store is the merge of two layers:
 *   1. USERS          — the seed defined in this file. Always the source of truth
 *                       for which accounts exist by default. Shipping a new hire in
 *                       a deploy must reach every browser, even returning ones.
 *   2. local overrides — ONLY the deltas a browser has made (password changes,
 *                       admin-created users, renames, deletions). Never a full
 *                       snapshot, so it can never shadow a freshly-seeded account.
 *
 * Storing full snapshots (the previous behaviour) froze the seed at the moment of
 * the first write: any account added to USERS in a later deploy became invisible to
 * any browser that had ever touched the store, and resetting required hand-bumping
 * STORE_KEY (which also wiped every real change). Persisting deltas removes both.
 */
function _readOverrides() {
  // One-time migration: fold any legacy full snapshot into the delta model.
  const legacy = localStorage.getItem(STORE_KEY);
  if (legacy !== null) {
    // A legacy snapshot is stale: a seed account absent from it may simply not
    // have existed yet, so we must NOT infer deletions from it (detectDeletes=false).
    try { _writeOverrides(_diffOverrides(JSON.parse(legacy), false)); } catch {}
    localStorage.removeItem(STORE_KEY);
  }
  try { return JSON.parse(localStorage.getItem(OVERRIDE_KEY) || '{}') || {}; }
  catch { return {}; }
}
function _writeOverrides(ov) { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(ov)); }

/* Reduce a full user map to only what differs from the seed.
 * detectDeletes: treat a seed account missing from `u` as an intentional deletion.
 * Safe for a live in-memory map (always built from the current seed); must be off
 * for a stale legacy snapshot, where a missing seed account may just be newer. */
function _diffOverrides(u, detectDeletes = true) {
  const ov = {};
  for (const [id, rec] of Object.entries(u || {})) {
    const seed = USERS[id];
    if (!seed) { ov[id] = rec; continue; }                 // admin-created account
    const d = {};
    for (const k of ['password', 'name', 'role'])
      if (rec[k] !== seed[k]) d[k] = rec[k];
    if (Object.keys(d).length) ov[id] = d;                 // mutated seed account
  }
  if (detectDeletes)
    for (const id of Object.keys(USERS))
      if (!(id in (u || {}))) ov[id] = { deleted: true };  // deleted seed account
  return ov;
}

function _loadUsers() {
  const out = JSON.parse(JSON.stringify(USERS));           // fresh seed every load
  const ov  = _readOverrides();
  for (const [id, rec] of Object.entries(ov)) {
    if (rec && rec.deleted) { delete out[id]; continue; }
    out[id] = Object.assign(out[id] || {}, rec);
  }
  return out;
}

function _saveUsers(u) { _writeOverrides(_diffOverrides(u)); }

/* ── Session state ── */
let currentID = '';
let currentPw = '';








/* ── Theme ── */




/* ── Screen management ── */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  clearErrors();
}

function clearErrors() {
  document.querySelectorAll('.errmsg').forEach(e => e.classList.remove('show'));
  document.querySelectorAll('input.err').forEach(e => e.classList.remove('err'));
}

/* ── ID formatting ── */
function fmtID(el) {
  if (el.value.toLowerCase().startsWith('a'))
    el.value = el.value.toLowerCase().replace(/[^a-z]/g, '');
  else
    el.value = el.value.toUpperCase().replace(/[^KN0-9\-]/g, '');
}

function fmtEmpID(el) {
  el.value = el.value.toUpperCase().replace(/[^KN0-9\-]/g, '');
}

function validEmpID(v) { return /^KN-\d{4}-\d{3}$/.test(v); }
function validID(v)    { return v === 'admin' || validEmpID(v); }

/* ── Check ID ── */
function checkID() {
  const raw   = document.getElementById('emp-id').value.trim();
  const v     = raw.toLowerCase() === 'admin' ? 'admin' : raw.toUpperCase();
  const errEl = document.getElementById('err-id');
  if (!validID(v)) {
    errEl.textContent = 'Enter a valid Employee ID (KN-YYYY-NNN)';
    errEl.classList.add('show');
    document.getElementById('emp-id').classList.add('err');
    return;
  }
  currentID = v;
  document.getElementById('pw-who').textContent = v;
  document.getElementById('pw-input').value = '';
  showScreen('s-pw');
  setTimeout(() => document.getElementById('pw-input').focus(), 100);
}

/* ── Password check ── */
async function checkPW() {
  const pw    = document.getElementById('pw-input').value;
  const errEl = document.getElementById('err-pw');
  const btn   = document.querySelector('#s-pw .sso-btn-primary');
  btn.disabled = true; btn.textContent = 'Verifying…';
  const users = _loadUsers();
  const user  = users[currentID];
  const hash  = await _sha256(pw);
  if (!user || user.password !== hash) {
    errEl.classList.add('show');
    document.getElementById('pw-input').classList.add('err');
    document.getElementById('pw-input').focus();
    btn.disabled = false; btn.textContent = 'Sign in';
    return;
  }
  errEl.classList.remove('show');
  currentPw = pw;
  btn.disabled = false; btn.textContent = 'Sign in';
  if (currentID === 'admin' || user.role === 'admin') {
    refreshUserList();
    showScreen('s-admin');
  } else {
    ssoOnLogin(currentID, user.name || currentID, user.role || 'employee');
    ssoToast('Signed in successfully ✓', 'ok');
  }
}

/* ── Password changes ── */
async function changePassword() {
  const oldPw  = document.getElementById('old-pw').value;
  const newPw  = document.getElementById('new-pw').value;
  const confPw = document.getElementById('conf-pw').value;
  if (newPw !== confPw) { document.getElementById('err-conf').classList.add('show'); return; }
  if (newPw.length < 8) { ssoToast('Password must be at least 8 characters.', 'err'); return; }
  const users    = _loadUsers();
  const user     = users[currentID];
  const oldHash  = await _sha256(oldPw);
  if (user?.password !== oldHash && users['admin']?.password !== oldHash) {
    document.getElementById('err-old').classList.add('show'); return;
  }
  users[currentID].password = await _sha256(newPw);
  _saveUsers(users);
  currentPw = newPw;
  ssoOnLogin(currentID, user.name || currentID, user.role || 'employee');
  ssoToast('Password updated ✓', 'ok');
}

async function changeSelfPassword() {
  const oldPw  = document.getElementById('self-old-pw').value;
  const newPw  = document.getElementById('self-new-pw').value;
  const confPw = document.getElementById('self-conf-pw').value;
  if (newPw !== confPw) { document.getElementById('err-self-conf').classList.add('show'); return; }
  if (newPw.length < 8) { ssoToast('Password must be at least 8 characters.', 'err'); return; }
  const users   = _loadUsers();
  const user    = users[currentID];
  const oldHash = await _sha256(oldPw);
  if (!user || user.password !== oldHash) {
    document.getElementById('err-self-old').classList.add('show'); return;
  }
  users[currentID].password = await _sha256(newPw);
  _saveUsers(users);
  currentPw = newPw;
  ssoOnLogin(currentID, users[currentID]?.name || currentID, 'employee');
  ssoToast('Password updated ✓', 'ok');
}

/* ── Admin operations ── */
function refreshUserList() {
  const users = _loadUsers();
  const el    = document.getElementById('user-list');
  const rows  = Object.entries(users).filter(([id]) => id !== 'admin');
  if (!rows.length) { el.innerHTML = '<div style="font-size:.82rem;color:var(--text-muted)">No users yet.</div>'; return; }
  el.innerHTML = rows.map(([id, u]) =>
    `<div class="user-row" role="listitem">
      <span>${id}</span>
      <span style="display:flex;align-items:center;gap:.5rem">
        <span class="user-badge">${u.name || '—'}</span>
        <button onclick="adminReset('${id}')" style="background:none;border:none;cursor:pointer;color:var(--kn-slate);font-size:.75rem;font-weight:600;font-family:var(--font);padding:2px 6px;border-radius:4px;line-height:1" title="Reset to default password">↺</button>
        <button onclick="adminDelete('${id}')" style="background:none;border:none;cursor:pointer;color:var(--kn-red);font-size:.75rem;font-weight:600;font-family:var(--font);padding:2px 6px;border-radius:4px;line-height:1" title="Delete user">✕</button>
      </span>
    </div>`
  ).join('');
}

async function adminCreate() {
  const id   = document.getElementById('admin-new-id').value.trim().toUpperCase();
  const name = document.getElementById('admin-new-name').value.trim();
  if (!validEmpID(id)) { ssoToast('Enter a valid Employee ID.', 'err'); return; }
  const users = _loadUsers();
  users[id]   = { password: await _sha256(DEFAULT_PW), name: name || id, role: 'employee' };
  _saveUsers(users);
  document.getElementById('admin-new-id').value   = '';
  document.getElementById('admin-new-name').value = '';
  refreshUserList();
  ssoToast('User saved ✓', 'ok');
}

function adminDelete(empId) {
  const users = _loadUsers();
  delete users[empId];
  _saveUsers(users);
  refreshUserList();
  ssoToast('Deleted ' + empId + ' ✓', 'ok');
}

async function adminReset(empId) {
  const users = _loadUsers();
  if (!users[empId]) { ssoToast('User not found.', 'err'); return; }
  users[empId].password = await _sha256(DEFAULT_PW);
  _saveUsers(users);
  ssoToast('Password reset to default for ' + empId + ' ✓', 'ok');
}

/* ── Close helpers ── */
function doClose(){const u=_loadUsers()[currentID]||{};ssoOnLogin(currentID,u.name||currentID,u.role||'employee');}


function strengthScore(v) {
  let s = 0;
  if (v.length >= 8) s++;
  if (/[A-Z]/.test(v)) s++;
  if (/[0-9]/.test(v)) s++;
  if (/[^A-Za-z0-9]/.test(v)) s++;
  return s;
}

function applyStrength(v, fillId, labelId) {
  const colors = ['#C8281E','#D97706','#16A34A','#1C5CAA'];
  const labels = ['Weak','Fair','Good','Strong'];
  const fill   = document.getElementById(fillId);
  const label  = document.getElementById(labelId);
  if (!v) { fill.style.width = '0%'; label.textContent = ''; return; }
  const s = strengthScore(v);
  fill.style.width      = (s * 25) + '%';
  fill.style.background = colors[Math.max(s - 1, 0)];
  label.textContent     = labels[Math.max(s - 1, 0)];
  label.style.color     = colors[Math.max(s - 1, 0)];
}

function checkStrength(v)  { applyStrength(v, 'str-fill',  'str-label'); }
function checkStrength2(v) { applyStrength(v, 'str-fill2', 'str-label2'); }

let toastTimer;
function ssoToast(msg, type) {
  const t = document.getElementById('sso-toast');
  t.textContent = msg;
  t.className = 'sso-toast show' + (type === 'err' ? ' err-t' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}



// ── SSO INTEGRATION ──
const SSO_SESSION_KEY='kn-sso-session';
function ssoValidSession(s){return !!(s&&typeof s==='object'&&typeof s.id==='string'&&s.id&&typeof s.name==='string'&&s.name);}
function ssoGetSession(){
  try{const s=JSON.parse(sessionStorage.getItem(SSO_SESSION_KEY)||'null');if(ssoValidSession(s))return s;}catch{}
  return ssoValidSession(window.__KN_SSO__)?window.__KN_SSO__:null;
}
function ssoSetSession(obj){
  window.__KN_SSO__=obj||null;
  try{
    if(obj){sessionStorage.setItem(SSO_SESSION_KEY,JSON.stringify(obj));sessionStorage.setItem('kn-session','1');}
    else{sessionStorage.removeItem(SSO_SESSION_KEY);sessionStorage.removeItem('kn-session');}
  }catch{}
}

function ssoInitials(name){return String(name||'').split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase()||'?';}

function ssoOnLogin(id,name,role){
  id=String(id||'');name=String(name||id||'User');role=role||'employee';
  ssoSetSession({id,name,role});
  document.getElementById('sso-gate').style.display='none';
  document.getElementById('user-avatar').textContent=ssoInitials(name);
  document.getElementById('avatar-name').textContent=name;
  document.getElementById('avatar-id').textContent=id;
  document.getElementById('avatar-admin-item').style.display=role==='admin'?'flex':'none';
}

function ssoLogout(){
  ssoSetSession(null);
  document.getElementById('avatar-menu').classList.remove('open');
  // Reset SSO form
  const empInput=document.getElementById('emp-id');if(empInput)empInput.value='';
  currentID='';currentPw='';
  showScreen('s-id');
  document.getElementById('sso-gate').style.display='flex';
}

function toggleAvatarMenu(e){
  e.stopPropagation();
  const m=document.getElementById('avatar-menu');
  if(m.classList.contains('open')){m.classList.remove('open');return;}
  m.classList.add('open');
  // Position below the avatar
  const av=document.getElementById('user-avatar');
  const r=av.getBoundingClientRect();
  m.style.right=(window.innerWidth-r.right)+'px';
  m.style.top=(r.bottom+6)+'px';
}

function ssoOpenChangePassword(){
  document.getElementById('avatar-menu').classList.remove('open');
  showScreen('s-change-self');
  document.getElementById('sso-gate').style.display='flex';
}

function ssoOpenAdmin(){
  document.getElementById('avatar-menu').classList.remove('open');
  refreshUserList();
  showScreen('s-admin');
  document.getElementById('sso-gate').style.display='flex';
}

// Close avatar menu on outside click
document.addEventListener('click', e => {
  if(!e.target.closest('#user-avatar')&&!e.target.closest('#avatar-menu'))
    document.getElementById('avatar-menu').classList.remove('open');
});

// On boot: check for existing session
(function ssoBootCheck(){
  const s=ssoGetSession();
  if(s){ssoOnLogin(s.id,s.name,s.role);}
  else{document.getElementById('sso-gate').style.display='flex';}
})();
