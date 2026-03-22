// ============================================================
//  auth.js  v2  –  Shared authentication & access helpers
//  Depends on: config.js  +  Supabase JS v2 (CDN)
// ============================================================

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── Get current session + profile ────────────────────────────
async function getSessionAndProfile() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return { session: null, profile: null };

  const { data: profile, error } = await sb
    .from('profiles')
    .select('*, plans(id, name)')
    .eq('id', session.user.id)
    .single();

  return { session, profile: error ? null : profile };
}

// ── Guard: must be logged in AND active ──────────────────────
async function requireAuth(redirectTo = 'index.html') {
  const { session, profile } = await getSessionAndProfile();

  if (!session) {
    location.href = redirectTo;
    return null;
  }
  if (!profile || !profile.is_active) {
    await sb.auth.signOut();
    location.href = redirectTo + '?reason=inactive';
    return null;
  }
  return { session, profile };
}

// ── Guard: must be admin ──────────────────────────────────────
async function requireAdmin(redirectTo = 'app.html') {
  const result = await requireAuth('index.html');
  if (!result) return null;

  if (result.profile.role !== 'admin') {
    location.href = redirectTo + '?reason=forbidden';
    return null;
  }
  return result;
}

// ── Guard: must have access to a specific app by slug ────────
//
//  Usage in any app:
//    const result = await requireAppAccess('mcq', 'index.html');
//    if (!result) return;
//
//  Admins always pass. Regular users need a plan that includes
//  the app with the given slug.
//
async function requireAppAccess(appSlug, noAccessPage = 'no-access.html') {
  const result = await requireAuth('index.html');
  if (!result) return null;

  const { session, profile } = result;

  // Admins bypass app-level checks entirely
  if (profile.role === 'admin') return result;

  // User has no plan assigned
  if (!profile.plan_id) {
    location.href = redirectTo + '?reason=no_plan';
    return null;
  }

  // Look up the app by slug
  const { data: app, error: appErr } = await sb
    .from('apps')
    .select('id, name')
    .eq('slug', appSlug)
    .eq('is_active', true)
    .single();

  if (appErr || !app) {
    location.href = redirectTo + '?reason=app_unavailable';
    return null;
  }

  // Check if user's plan includes this app
  const { data: access } = await sb
    .from('plan_apps')
    .select('app_id')
    .eq('plan_id', profile.plan_id)
    .eq('app_id', app.id)
    .maybeSingle();

  if (!access) {
    // Pass the app name so the no-access page can show it
    const params = new URLSearchParams({
      reason: 'no_access',
      app: app.name
    });
    location.href = redirectTo + '?' + params.toString();
    return null;
  }

  return result;
}

// ── Sign out ──────────────────────────────────────────────────
async function signOut() {
  await sb.auth.signOut();
  location.href = 'index.html';
}

// ── Toast notification helper ─────────────────────────────────
function showToast(message, type = 'info') {
  const existing = document.querySelector('.sb-toast');
  if (existing) existing.remove();

  const t = document.createElement('div');
  t.className = `sb-toast sb-toast-${type}`;
  t.textContent = message;
  document.body.appendChild(t);

  requestAnimationFrame(() => t.classList.add('sb-toast-show'));
  setTimeout(() => {
    t.classList.remove('sb-toast-show');
    setTimeout(() => t.remove(), 400);
  }, 3500);
}

// ── Shared styles (injected once) ────────────────────────────
(function injectSharedStyles() {
  if (document.getElementById('sb-shared-styles')) return;
  const s = document.createElement('style');
  s.id = 'sb-shared-styles';
  s.textContent = `
    .sb-toast {
      position: fixed; bottom: 1.5rem; right: 1.5rem; z-index: 9999;
      padding: .75rem 1.25rem; border-radius: 8px; font-size: .875rem;
      font-family: inherit; max-width: 320px;
      opacity: 0; transform: translateY(8px);
      transition: opacity .3s, transform .3s;
    }
    .sb-toast-show { opacity: 1; transform: translateY(0); }
    .sb-toast-info    { background: rgba(20,184,166,.15); border:1px solid #14b8a6; color:#5eead4; }
    .sb-toast-success { background: rgba(34,197,94,.15);  border:1px solid #22c55e; color:#86efac; }
    .sb-toast-error   { background: rgba(239,68,68,.15);  border:1px solid #ef4444; color:#fca5a5; }
    .sb-toast-warn    { background: rgba(234,179,8,.15);  border:1px solid #eab308; color:#fde047; }
    .sb-spinner {
      width: 20px; height: 20px;
      border: 2px solid rgba(255,255,255,.15);
      border-top-color: var(--accent, #14b8a6);
      border-radius: 50%;
      animation: sb-spin .7s linear infinite;
      display: inline-block;
    }
    @keyframes sb-spin { to { transform: rotate(360deg); } }
  `;
  document.head.appendChild(s);
})();
