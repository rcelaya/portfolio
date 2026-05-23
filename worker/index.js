// Proxy a la API de Anthropic con autenticación.
// Verifica el token de Google que envía el dashboard antes de gastar tokens de Claude.
//
// Config: ajusta ALLOWED_ORIGIN si tu URL de GitHub Pages es distinta.
// La API key vive como secret en Cloudflare (env.ANTHROPIC_KEY), nunca aquí.

const CLIENT_ID = '962184983103-paqoo5arm1f79jtkmlt8simhjq0cvb1s.apps.googleusercontent.com';
const ALLOWED_EMAILS = ['rcelaya@artogroup.com'];
const ALLOWED_ORIGIN = 'https://rcelaya.github.io';

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    // ── Verificar el token de Google ──
    const auth = request.headers.get('Authorization') || '';
    const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!idToken) {
      return json({ error: 'No autorizado: falta sesión de Google' }, 401);
    }

    const info = await fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken)
    ).then(r => (r.ok ? r.json() : null)).catch(() => null);

    const authorized = info
      && info.aud === CLIENT_ID
      && info.email_verified === 'true'
      && ALLOWED_EMAILS.includes(String(info.email || '').toLowerCase());

    if (!authorized) {
      return json({ error: 'Acceso denegado' }, 403);
    }

    // ── Reenviar a Anthropic ──
    const body = await request.json();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'interleaved-thinking-2025-05-14',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  },
};
