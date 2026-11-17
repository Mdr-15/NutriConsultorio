# Contraseña de acceso al sitio (Cloudflare Pages, sin Zero Trust)

**Para qué sirve.** Pide usuario y contraseña **antes de entregar cualquier archivo del sitio**: `index.html`, `config.js`, estilos y `/api`. Quien no los tenga no ve ni el código fuente ni la pantalla de acceso. Es gratuito y no requiere tarjeta. Es una capa aparte del login de NutriConsultorio, que no cambia.

## Archivo
- `functions/_middleware.js`: debe quedar en la carpeta `functions/` de la **raíz del proyecto de Pages**. Cloudflare lo detecta al publicar; no hay que compilar nada.

## Activación
1. Sube `functions/_middleware.js` al repositorio y deja que Pages publique. Mientras no existan las variables, **no hace nada** y el sitio funciona igual.
2. En Cloudflare: Workers & Pages → tu proyecto → **Settings → Variables and Secrets** → agrega, como **Secret**, en Producción (y en Preview, si usas despliegues de prueba):
   - `SITE_USER`: el usuario que quieras (por ejemplo, `consultorio`).
   - `SITE_PASSWORD`: una contraseña **larga y aleatoria de 20 o más caracteres** (créala con un gestor de contraseñas; no es la de la aplicación).
3. **Vuelve a publicar** (Deployments → Retry deployment, o un commit nuevo). Las variables solo aplican a despliegues nuevos.
4. Abre el sitio en una **ventana de incógnito**: el navegador muestra una ventana pidiendo usuario y contraseña. Después de escribirlos aparece la pantalla de acceso de NutriConsultorio.

## Cómo se usa a diario
- El navegador recuerda las credenciales mientras la sesión del navegador siga abierta; al cerrar el navegador por completo, vuelve a pedirlas. Si tu gestor de contraseñas las guarda, se rellenan solas.
- Es una ventana del navegador, no una pantalla con tu diseño.
- Luego sigue el login normal de la aplicación, con su propio usuario y contraseña.

## Para desactivarla
Borra `SITE_USER` o `SITE_PASSWORD` en Cloudflare y vuelve a publicar.

## Límites que conviene conocer
- **No tiene segundo factor ni lista de correos**, a diferencia de Cloudflare Access. Por eso la contraseña debe ser larga y aleatoria.
- **No hay bloqueo por intentos fallidos.** Cada intento fallido tarda 1.5 segundos en responder, lo que frena la adivinación, pero no la impide.
- Hay que cambiar la contraseña a mano si se filtra (cámbiala en Cloudflare y publica de nuevo).
- Protege el sitio publicado, no el repositorio de GitHub: este sigue siendo privado por sí mismo.
- Si más adelante activas Cloudflare Access, borra estas dos variables para no pedir dos veces.

## Orden recomendado con el proxy (`PROXY_CLOUDFLARE.md`)
1. Esta contraseña de acceso (sin tocar nada más).
2. El proxy, siguiendo su guía. El proxy y la contraseña funcionan juntos: las llamadas a `/api` van desde tu navegador, que ya tiene las credenciales.
