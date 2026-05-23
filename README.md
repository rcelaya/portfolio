# portfolio

Roche portfolio tracker — dashboard personal de inversión (acciones, ETFs, cripto, retiro)
con recomendaciones generadas por IA. Sitio estático servido en GitHub Pages.

## Estructura

| Archivo | Contenido |
|---|---|
| `index.html` | Solo el marcado (markup) y el overlay de login |
| `styles.css` | Todos los estilos (incluye modo oscuro y login) |
| `app.js` | Toda la lógica: datos, render, gráficas, DCA, IA y **autenticación** |

Antes todo vivía inline en un único `index.html`; se separó para que sea editable y mantenible.

## Datos

- **Acciones/ETFs y cripto**: Google Apps Script (Google Sheets) — se configura en la pestaña *Configurar*.
- **Retiro (AFORE / RRSP / AGF)**: valores manuales guardados en `localStorage`.
- **Recomendaciones IA**: Cloudflare Worker (`portfolio-proxy.rcelaya.workers.dev`) que reenvía a Claude.

---

## Autenticación (Google Sign-In)

El login por contraseña fue reemplazado por **Google Sign-In** restringido a tus correos.

### Configuración (una sola vez)

1. **Crea un OAuth Client ID** en Google Cloud Console:
   - Ve a https://console.cloud.google.com/apis/credentials
   - *Create credentials → OAuth client ID → Web application*
   - En **Authorized JavaScript origins** agrega la URL de tu GitHub Pages, p. ej.
     `https://rcelaya.github.io` (origen, sin la ruta `/portfolio`).
   - Copia el *Client ID* (`xxxxx.apps.googleusercontent.com`).
2. **Edita `app.js`** (constante `AUTH` arriba del todo):
   ```js
   const AUTH = {
     CLIENT_ID: 'TU_CLIENT_ID.apps.googleusercontent.com',
     ALLOWED_EMAILS: ['tucorreo@gmail.com'],
   };
   ```
3. Listo. Al abrir el dashboard verás el botón *Iniciar sesión con Google*; solo los
   correos en `ALLOWED_EMAILS` entran. La sesión dura mientras la pestaña esté abierta
   (el token de Google expira ~1 h).

> ⚠️ **Importante — alcance de esta protección.** La validación de email/expiración en
> `app.js` corre en el navegador, así que es solo la **puerta visual**: oculta el
> dashboard de visitantes casuales, pero un atacante determinado puede saltarse el JS o
> llamar directo a los endpoints. Para protección **real** hay que verificar el token en
> el servidor (ver siguiente sección) o poner [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/)
> delante del sitio.

---

## Asegurar el proxy de IA (Worker)

El Worker `portfolio-proxy.rcelaya.workers.dev` estaba **abierto**: cualquiera con la URL
podía gastar tus tokens de Claude. El cliente ahora envía el token de Google en el header
`Authorization: Bearer <id_token>`. Falta que el Worker lo **verifique** (su código no vive
en este repo, así que aplica este cambio en tu Worker):

```js
const ALLOWED_EMAILS = ['tucorreo@gmail.com'];
const CLIENT_ID = 'TU_CLIENT_ID.apps.googleusercontent.com';

export default {
  async fetch(req, env) {
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    // 1) Extraer y verificar el token de Google
    const auth = req.headers.get('Authorization') || '';
    const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!idToken) return new Response('Unauthorized', { status: 401 });

    const info = await fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken)
    ).then(r => r.ok ? r.json() : null);

    const ok = info
      && info.aud === CLIENT_ID
      && info.email_verified === 'true'
      && ALLOWED_EMAILS.includes((info.email || '').toLowerCase());
    if (!ok) return new Response('Forbidden', { status: 403 });

    // 2) Reenviar a Anthropic con la API key (secreto del Worker, nunca en el cliente)
    const body = await req.text();
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body,
    });
    return new Response(res.body, {
      status: res.status,
      headers: { 'content-type': 'application/json' },
    });
  },
};
```

Recomendaciones adicionales para el Worker:
- Restringe **CORS** al origen de tu GitHub Pages en vez de `*`.
- Agrega *rate limiting* (p. ej. con Durable Objects o el plan de Cloudflare) para evitar abuso.
- Guarda `ANTHROPIC_API_KEY` como **secret** (`wrangler secret put ANTHROPIC_API_KEY`), nunca en el código.
