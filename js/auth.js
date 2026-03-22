// ============================================================
//  auth.js  –  Shared authentication & profile helpers
//  Depends on: config.js  +  Supabase JS v2 (CDN)
// ============================================================

// ── Supabase client (singleton) ──────────────────────────────
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── Path helpers (works on GitHub Pages sub-paths too) ───────
function rootPath(file) {
  // Works whether app is at / or /repo-name/
  const base = document.querySelector('base')?.href || location.origin + '/';
  return new URL(file, base).href;
}

// ── Get current session + profile ────────────────────────────
async function getSessionAndProfile() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return { session: null, profile: null };

  const { data: profile, error } = await sb
    .from('profiles')
    .select('*')
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

// ── Shared toast + spinner CSS (injected once) ────────────────
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
      backdrop-filter: blur(8px);
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
