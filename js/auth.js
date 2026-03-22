// ============================================================
//  auth.js — Deploy this file to EVERY repo
//  Version: Final
// ============================================================

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

const SESSION_TOKEN_KEY = 'sb_device_token';

// ── The ONE place that controls where login lives ─────────────
// This is the same in every repo — always points to quiz-bizz
const LOGIN_URL = 'https://quiz-bizz.learnwithcole.com/index.html';
const NO_ACCESS_URL = 'https://quiz-bizz.learnwithcole.com/no-access.html';

// ── Absorb session tokens passed in the URL ───────────────────
// When quiz-bizz redirects back to a separate app after login,
// it passes ?_at=&_rt=&_dt= in the URL.
// This function picks them up, stores them locally, then cleans the URL.
async function absorbSessionFromUrl() {
  const p  = new URLSearchParams(location.search);
  const at = p.get('_at');
  const rt = p.get('_rt');
  const dt = p.get('_dt');
  if (!at || !rt) return;

  const { error } = await sb.auth.setSession({ access_token: at, refresh_token: rt });
  if (!error && dt) localStorage.setItem(SESSION_TOKEN_KEY, dt);

  // Clean tokens out of the URL immediately
  p.delete('_at'); p.delete('_rt'); p.delete('_dt');
  const clean = location.pathname + (p.toString() ? '?' + p.toString() : '') + location.hash;
  history.replaceState(null, '', clean);
}

// ── Get session and profile ───────────────────────────────────
async function getSessionAndProfile() {
  await absorbSessionFromUrl();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return { session: null, profile: null };
  const { data: profile, error } = await sb
    .from('profiles')
    .select('*, plans(id, name)')
    .eq('id', session.user.id)
    .single();
  return { session, profile: error ? null : profile };
}

// ── Build URL that sends user to login and brings them back ───
function buildLoginUrl() {
  return LOGIN_URL + '?next=' + encodeURIComponent(location.href);
}

// ── requireAuth — must be logged in and active ────────────────
async function requireAuth() {
  const { session, profile } = await getSessionAndProfile();

  if (!session) {
    location.href = buildLoginUrl();
    return null;
  }
  if (!profile || !profile.is_active) {
    await sb.auth.signOut();
    localStorage.removeItem(SESSION_TOKEN_KEY);
    location.href = LOGIN_URL + '?reason=inactive';
    return null;
  }
  if (profile.session_token) {
    const local = localStorage.getItem(SESSION_TOKEN_KEY);
    if (local !== profile.session_token) {
      await sb.auth.signOut();
      localStorage.removeItem(SESSION_TOKEN_KEY);
      location.href = LOGIN_URL + '?reason=session_invalid';
      return null;
    }
  }
  return { session, profile };
}

// ── requireAdmin ──────────────────────────────────────────────
async function requireAdmin() {
  const result = await requireAuth();
  if (!result) return null;
  if (result.profile.role !== 'admin') {
    location.href = LOGIN_URL + '?reason=forbidden';
    return null;
  }
  return result;
}

// ── requireAppAccess — must have the app in their plan ────────
// Usage:  const result = await requireAppAccess('myslug');
async function requireAppAccess(appSlug) {
  const result = await requireAuth();
  if (!result) return null;

  const { profile } = result;

  // Admins always get in
  if (profile.role === 'admin') return result;

  // Must have a plan
  if (!profile.plan_id) {
    location.href = NO_ACCESS_URL + '?reason=no_plan';
    return null;
  }

  // App must exist and be active
  const { data: app, error: appErr } = await sb
    .from('apps')
    .select('id, name')
    .eq('slug', appSlug)
    .eq('is_active', true)
    .single();

  if (appErr || !app) {
    location.href = NO_ACCESS_URL + '?reason=app_unavailable';
    return null;
  }

  // Plan must include the app
  const { data: access } = await sb
    .from('plan_apps')
    .select('app_id')
    .eq('plan_id', profile.plan_id)
    .eq('app_id', app.id)
    .maybeSingle();

  if (!access) {
    location.href = NO_ACCESS_URL + '?reason=no_access&app=' + encodeURIComponent(app.name);
    return null;
  }

  return result;
}

// ── Sign out ──────────────────────────────────────────────────
async function signOut() {
  localStorage.removeItem(SESSION_TOKEN_KEY);
  await sb.auth.signOut();
  location.href = LOGIN_URL;
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const existing = document.querySelector('.sb-toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = `sb-toast sb-toast-${type}`;
  t.textContent = message;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('sb-toast-show'));
  setTimeout(() => { t.classList.remove('sb-toast-show'); setTimeout(() => t.remove(), 400); }, 3500);
}

// ── Shared styles ─────────────────────────────────────────────
(function injectSharedStyles() {
  if (document.getElementById('sb-shared-styles')) return;
  const s = document.createElement('style');
  s.id = 'sb-shared-styles';
  s.textContent = `
    .sb-toast { position:fixed; bottom:1.5rem; right:1.5rem; z-index:9999; padding:.75rem 1.25rem; border-radius:8px; font-size:.875rem; font-family:inherit; max-width:320px; opacity:0; transform:translateY(8px); transition:opacity .3s,transform .3s; }
    .sb-toast-show { opacity:1; transform:translateY(0); }
    .sb-toast-info    { background:rgba(20,184,166,.15); border:1px solid #14b8a6; color:#5eead4; }
    .sb-toast-success { background:rgba(34,197,94,.15);  border:1px solid #22c55e; color:#86efac; }
    .sb-toast-error   { background:rgba(239,68,68,.15);  border:1px solid #ef4444; color:#fca5a5; }
    .sb-toast-warn    { background:rgba(234,179,8,.15);  border:1px solid #eab308; color:#fde047; }
    .sb-spinner { width:20px; height:20px; border:2px solid rgba(255,255,255,.15); border-top-color:var(--accent,#14b8a6); border-radius:50%; animation:sb-spin .7s linear infinite; display:inline-block; }
    @keyframes sb-spin { to { transform:rotate(360deg); } }
  `;
  document.head.appendChild(s);
})();
