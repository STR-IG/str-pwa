async function privateAccess(client) {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (!data?.session) return false;
  const [identity, access] = await Promise.all([
    client.auth.getUser(), client.rpc('is_current_user_private_access_allowed')
  ]);
  if (identity.error || access.error) throw identity.error || access.error;
  return Boolean(identity.data?.user) && access.data === true;
}

const content = document.getElementById('private-content');
const status = document.getElementById('access-status');
const login = 'acceso-privado.html?next=calendarios.html';

try {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const client = createClient(
    'https://icneigdnuntzugisexaz.supabase.co',
    'sb_publishable_apKjcPClIBTHS2wwN6qPsA_6Vm4tk9m',
    { auth: { detectSessionInUrl: false, persistSession: true, autoRefreshToken: true } }
  );
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
      content.hidden = true;
      window.location.replace(login);
    }
  });
  if (await privateAccess(client)) {
    status.hidden = true;
    content.hidden = false;
  } else {
    window.location.replace(login);
  }
} catch {
  status.textContent = 'No se ha podido verificar el acceso. Comprueba tu conexión y recarga la página.';
}
