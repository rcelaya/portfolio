# Notas de trabajo — portfolio

## Flujo de Pull Requests
- **SIEMPRE verifica si un PR ya está mergeado antes de sugerir mergearlo.** Usa
  `git fetch origin main` y `git merge-base --is-ancestor <commit> origin/main`
  (o revisa el estado del PR vía GitHub MCP). Ya ha pasado más de una vez que se
  sugiere mergear un PR que ya estaba mergeado, o que un commit nuevo quedó fuera
  de un PR ya cerrado. Antes de pedirle al usuario que mergee, confirma:
  1. ¿El PR sigue abierto?
  2. ¿`main` ya contiene los commits relevantes? (si sí, no hay nada que mergear)
  3. Si hay commits en la rama que no están en `main`, abre un PR nuevo.

## Despliegue
- El dashboard (`index.html` / `styles.css` / `app.js`) se sirve por **GitHub Pages
  desde `main`** → los cambios requieren mergear a `main` + refresh fuerte.
- El **Worker** (`worker/index.js`) se despliega **manualmente en Cloudflare**
  (pegar + Deploy), independiente de git. La API key vive como secret
  (`env.ANTHROPIC_KEY`), nunca en el repo.

## Auth
- Login real con Google Sign-In (allow-list `AUTH.ALLOWED_EMAILS` en `app.js`).
- El Worker verifica la firma del ID token contra JWKS de Google (no usa
  `tokeninfo`, que tiene rate-limit).
