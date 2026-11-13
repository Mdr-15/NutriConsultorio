/* Contraseña de acceso al sitio (Cloudflare Pages Function, sin Zero Trust y sin costo).
 *
 * Pide usuario y contraseña ANTES de entregar cualquier archivo del sitio (index.html,
 * config.js, CSS, /api…). Quien no los tenga no puede ver ni el código fuente.
 *
 * Variables (Cloudflare Pages → Settings → Variables and Secrets), como Secret:
 *   SITE_USER       usuario de acceso al sitio
 *   SITE_PASSWORD   contraseña larga y aleatoria (20 o más caracteres)
 * Si alguna de las dos NO está definida, esta puerta queda desactivada y el sitio se
 * comporta como siempre. Es una capa aparte del login de la aplicación.
 */
const REALM = 'NutriConsultorio';

async function huella(texto) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(texto)));
  return new Uint8Array(buf);
}
async function iguales(a, b) {
  const x = await huella(a), y = await huella(b);
  let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
function pedirCredenciales() {
  return new Response('Acceso restringido.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="' + REALM + '", charset="UTF-8"', 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

export async function onRequest({ request, env, next }) {
  if (!env.SITE_USER || !env.SITE_PASSWORD) return next();
  const cab = request.headers.get('Authorization') || '';
  let usuario = '', clave = '', valido = false;
  if (cab.startsWith('Basic ')) {
    try {
      const bytes = Uint8Array.from(atob(cab.slice(6).trim()), c => c.charCodeAt(0));
      const texto = new TextDecoder().decode(bytes), i = texto.indexOf(':');
      if (i >= 0) { usuario = texto.slice(0, i); clave = texto.slice(i + 1); valido = true; }
    } catch (e) { valido = false; }
  }
  if (valido) {
    const okU = await iguales(usuario, env.SITE_USER), okP = await iguales(clave, env.SITE_PASSWORD);
    if (okU && okP) {
      const r = await next();
      const h = new Headers(r.headers); h.set('Cache-Control', 'private, no-store'); h.set('X-Robots-Tag', 'noindex, nofollow');
      return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
    }
    await new Promise(res => setTimeout(res, 1500)); // frena la adivinación de contraseñas
  }
  return pedirCredenciales();
}
