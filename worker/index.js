// Proxy a la API de Anthropic con autenticación.
// Verifica el token de Google que envía el dashboard antes de gastar tokens de Claude.
//
// La seguridad real la da la verificación del token de Google (abajo), no el CORS.
// Por eso reflejamos el origen que llega: así funciona desde cualquier URL del
// dashboard sin tener que adivinar el origen exacto.
// La API key vive como secret en Cloudflare (env.ANTHROPIC_KEY), nunca aquí.

const CLIENT_ID = '962184983103-paqoo5arm1f79jtkmlt8simhjq0cvb1s.apps.googleusercontent.com';
const ALLOWED_EMAILS = ['rcelaya@artogroup.com'];

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

function json(obj, status, request) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
  });
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: cors });
    }

    // ── Verificar el token de Google ──
    const auth = request.headers.get('Authorization') || '';
    const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!idToken) {
      return json({ error: 'No autorizado: falta sesión de Google' }, 401, request);
    }

    const info = await fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken)
    ).then(r => (r.ok ? r.json() : null)).catch(() => null);

    const authorized = info
      && info.aud === CLIENT_ID
      && info.email_verified === 'true'
      && ALLOWED_EMAILS.includes(String(info.email || '').toLowerCase());

    if (!authorized) {
      return json({ error: 'Acceso denegado' }, 403, request);
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
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  },
};
