# Proxy con Cloudflare Pages (oculta la URL de Apps Script)

**Para qué sirve.** Hoy `config.js` contiene la URL `/exec` de Apps Script y cualquiera que abra tu sitio puede leerla. Con el proxy, el navegador solo llama a `/api` en tu propio dominio; una función de Cloudflare agrega una llave secreta y reenvía la petición a Apps Script. La URL de Google y la llave viven solo como secretos en Cloudflare, y el backend rechaza cualquier petición que no traiga la llave.

**Es opcional.** Si no haces nada de esto, la aplicación sigue funcionando como hasta ahora. El login de la aplicación no cambia.

## Archivos
- `functions/api.js`: la función del proxy. Debe quedar en la **raíz del proyecto de Pages**, en la carpeta `functions/`. Cloudflare la detecta sola al publicar; no hace falta compilar nada.
- `NutriConsultorio_Backend.gs`: ahora revisa la propiedad de script `LLAVE_APP`. Si no existe, acepta todo (como antes).
- `config.js`: **no cambia hasta el paso 3.**

## Orden de activación (para no quedarte sin acceso)
1. **Publica el backend nuevo con una implementación nueva.**
   En Apps Script pega `NutriConsultorio_Backend.gs` → Implementar → **Nueva implementación** → Aplicación web → *Ejecutar como* **Yo**, *Usuarios con acceso* **Cualquiera**. Copia la URL `/exec` nueva (llámala URL B). La anterior (URL A) sigue funcionando por ahora.
2. **Crea los secretos en Cloudflare.**
   Pages → tu proyecto → Settings → *Variables and Secrets* → agrega, como **Secret**, en Producción (y en Preview si lo usas):
   - `APPS_SCRIPT_URL` = la URL B.
   - `APP_KEY` = una llave larga y aleatoria de 40 o más caracteres, solo letras y números (genérala con tu gestor de contraseñas).
3. **Apunta la aplicación al proxy.**
   En `config.js` cambia `API_URL` a `'/api'`, sube `functions/api.js` y `config.js`, y deja que Pages publique. Entra y prueba el login y guardar algo con datos ficticios. En este punto todavía **no** hay llave en Apps Script, así que debe funcionar.
4. **Activa la llave en Apps Script.**
   Apps Script → Configuración del proyecto (engrane) → *Propiedades de script* → agrega `LLAVE_APP` con **exactamente la misma llave** que `APP_KEY`. Vuelve a probar el login: debe seguir funcionando.
5. **Archiva la implementación anterior.**
   Implementar → Administrar implementaciones → archiva la URL A, que estuvo pública.

## Cómo comprobar que funciona
- La aplicación inicia sesión y guarda con normalidad.
- En el navegador (F12 → Red) las llamadas van a `/api`, no a `script.google.com`.
- Si llamas directamente a la URL B con una petición POST sin llave, responde `Solicitud no autorizada.`

## Si algo sale mal
- «El proxy no está configurado»: faltan `APPS_SCRIPT_URL` o `APP_KEY` (revisa que estén en el entorno correcto y vuelve a publicar).
- «Solicitud no autorizada»: la llave de Cloudflare y la de Apps Script no coinciden (copia y pega sin espacios).
- Volver atrás: en `config.js` pon la URL B en `API_URL` y borra la propiedad `LLAVE_APP` de Apps Script.

## Notas
- Cambiar la llave: cámbiala en los dos lugares a la vez.
- La URL `/exec` seguirá respondiendo la pantalla de salud al abrirla en el navegador (no contiene datos).
- Plan gratuito de Cloudflare: 100,000 peticiones al día, de sobra para un solo usuario.
- La función solo acepta peticiones del mismo dominio, hasta 2 MB, y no guarda nada.
