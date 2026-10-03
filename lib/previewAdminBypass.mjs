// Preview acceptance only. The deployment remains behind Vercel Authentication.
import { createClient } from '@supabase/supabase-js';

export function previewAdminBypassEnabled(env = process.env) {
  return env.VERCEL_ENV === 'preview' && env.ADMIN_AUTH_BYPASS_PREVIEW === 'true';
}

export function previewAdminUserId(env = process.env) {
  const value = String(env.ADMIN_AUTH_BYPASS_PREVIEW_USER_ID || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

// Resolve only an explicitly selected, existing, active Admin. No Auth user is created
// and the service-role client is used only for this membership check.
export async function verifiedPreviewAdminUserId(env = process.env) {
  if (!previewAdminBypassEnabled(env)) return null;
  const id = previewAdminUserId(env);
  if (!id || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await supabase.from('admin_members')
    .select('active').eq('user_id', id).maybeSingle();
  return !error && data?.active === true ? id : null;
}
