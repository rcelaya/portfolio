// Proxy a la API de Anthropic con autenticación.
// Verifica la FIRMA del ID token de Google contra sus llaves públicas (JWKS),
// sin depender del endpoint tokeninfo (que tiene rate-limit).
// La API key vive como secret en Cloudflare (env.ANTHROPIC_KEY), nunca aquí.

const CLIENT_ID = '962184983103-paqoo5arm1f79jtkmlt8simhjq0cvb1s.apps.googleusercontent.com';
const ALLOWED_EMAILS = ['rcelaya@artogroup.com'];
const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

// Rate limit best-effort por IP (en memoria, por isolate). El control real lo da
// la verificación del token; esto es una barrera extra contra ráfagas/abuso.
const RATE_LIMIT = { windowMs: 60_000, max: 30 };
const hits = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  if (hits.size > 5000) hits.clear(); // evita crecimiento ilimitado de memoria
  const entry = hits.get(ip);
  if (!entry || now > entry.reset) {
    hits.set(ip, { count: 1, reset: now + RATE_LIMIT.windowMs });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT.max;
}

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

function b64urlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const bin = atob(b64 + pad);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function decodeSegment(seg) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(seg)));
}

async function verifyGoogleToken(idToken) {
  const parts = idToken.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };

  const header = decodeSegment(parts[0]);
  const payload = decodeSegment(parts[1]);

  const certs = await fetch(CERTS_URL).then(r => r.json());
  const jwk = (certs.keys || []).find(k => k.kid === header.kid);
  if (!jwk) return { ok: false, reason: 'no_matching_kid' };

  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
  );
  const data = new TextEncoder().encode(parts[0] + '.' + parts[1]);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), data);
  if (!valid) return { ok: false, reason: 'bad_signature' };

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) return { ok: false, reason: 'expired', payload };

  return { ok: true, payload };
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request);

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (isRateLimited(ip)) {
      return json({ error: 'Demasiadas solicitudes. Espera un momento.', reason: 'rate_limited' }, 429, request);
    }

    const auth = request.headers.get('Authorization') || '';
    const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!idToken) return json({ error: 'No autorizado: falta sesión de Google', reason: 'no_token' }, 401, request);

    const result = await verifyGoogleToken(idToken).catch(e => ({ ok: false, reason: 'verify_error', msg: String(e) }));
    if (!result.ok) {
      return json({ error: 'Token rechazado', reason: result.reason, msg: result.msg || null }, 403, request);
    }

    const p = result.payload;
    const emailVerified = p.email_verified === true || p.email_verified === 'true';
    const checks = {
      iss_ok: p.iss === 'accounts.google.com' || p.iss === 'https://accounts.google.com',
      aud_ok: p.aud === CLIENT_ID,
      email_verified: emailVerified,
      email_allowed: ALLOWED_EMAILS.includes(String(p.email || '').toLowerCase()),
    };

    if (!(checks.iss_ok && checks.aud_ok && checks.email_verified && checks.email_allowed)) {
      return json({ error: 'Acceso denegado', reason: 'checks_failed', checks, email: p.email || null, aud: p.aud || null }, 403, request);
    }

    // ── Reenviar a Anthropic ──
    const body = await request.json();
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
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
