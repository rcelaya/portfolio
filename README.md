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
`Authorization: Bearer <id_token>` y el Worker lo **verifica** antes de reenviar a Anthropic.

El código del Worker vive en la carpeta [`worker/`](worker/):

- `worker/index.js` — proxy con verificación del token de Google + CORS restringido a GitHub Pages.
- `worker/wrangler.toml` — config de despliegue.

> La API key de Anthropic **no** está en el repo: vive como secret (`env.ANTHROPIC_KEY`) en Cloudflare.

### Desplegar el Worker

**Opción A — Editor web (rápido):**
1. https://dash.cloudflare.com → *Workers & Pages* → `portfolio-proxy` → *Edit code*.
2. Reemplaza el contenido con el de `worker/index.js` y dale *Deploy*.

**Opción B — wrangler (versionado):**
```bash
npm install -g wrangler
cd worker
wrangler login
wrangler deploy
# La API key como secret (una vez):
wrangler secret put ANTHROPIC_KEY
```

### Notas
- Ajusta `ALLOWED_ORIGIN` en `worker/index.js` si tu URL de GitHub Pages cambia.
- El header `Authorization` **debe** estar en `Access-Control-Allow-Headers` (ya incluido), si no el navegador bloquea la petición.
- Mejora opcional: *rate limiting* para evitar abuso.
