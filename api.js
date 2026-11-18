/* Proxy de NutriConsultorio hacia Google Apps Script (Cloudflare Pages Function).
 *
 * El navegador llama a /api en TU dominio. Esta función agrega una llave secreta y
 * reenvía la petición a Apps Script, de modo que la URL /exec y la llave nunca
 * aparecen en el código ni en el navegador.
 *
 * Variables (Cloudflare Pages → Settings → Variables and Secrets):
 *   APPS_SCRIPT_URL  URL /exec de la implementación de Apps Script (secreto)
 *   APP_KEY          llave larga y aleatoria; la misma que LLAVE_APP en Apps Script (secreto)
 */
const MAX_BYTES = 2000000;
const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

export async function onRequestPost({ request, env }) {
  if (!env.APPS_SCRIPT_URL || !env.APP_KEY) return json({ status: 'error', message: 'El proxy no está configurado.' }, 500);
  const origin = request.headers.get('Origin');
  if (origin) { let ok = false; try { ok = new URL(origin).host === new URL(request.url).host; } catch (e) {} if (!ok) return json({ status: 'error', message: 'Origen no permitido.' }, 403); }
  const texto = await request.text();
  if (texto.length > MAX_BYTES) return json({ status: 'error', message: 'La solicitud es demasiado grande.' }, 413);
  let datos;
  try { datos = JSON.parse(texto); } catch (e) { return json({ status: 'error', message: 'Solicitud no válida.' }, 400); }
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return json({ status: 'error', message: 'Solicitud no válida.' }, 400);
  datos.llave = env.APP_KEY;
  try {
    const r = await fetch(env.APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(datos), redirect: 'follow' });
    const cuerpo = await r.text();
    if (!r.ok) return json({ status: 'error', message: 'El servidor de datos no respondió (' + r.status + ').' }, 502);
    return new Response(cuerpo, { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (e) {
    return json({ status: 'error', message: 'No se pudo contactar al servidor de datos.' }, 502);
  }
}

export async function onRequest() { return json({ status: 'error', message: 'Método no permitido.' }, 405); }
