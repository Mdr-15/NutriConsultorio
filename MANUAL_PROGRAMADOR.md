# NutriConsultorio · Manual del programador

Versión del documento: corresponde al backend `NUTRI7`.
Público: quien vaya a mantener, extender o desplegar el proyecto. Para el uso diario de la aplicación existe una guía de usuario aparte; para instalar paso a paso (sin programar) ver `LEEME.md`.

---

## 1. Visión general

NutriConsultorio es una aplicación web de gestión de un consultorio de nutrición: expedientes, historia nutricional, consultas, agenda, mediciones antropométricas, planes alimentarios y una base de alimentos de consulta.

Decisiones de diseño que explican casi todo lo demás:

- **Sin servidor propio y sin base de datos.** Los datos viven en una hoja de cálculo de Google (Google Sheets). La lógica de servidor es un Google Apps Script publicado como aplicación web.
- **Frontend estático sin compilación.** Un solo `index.html` con el JavaScript dentro, más CSS y un par de archivos pequeños. No hay `npm install`, bundler ni framework. Se despliega en Cloudflare Pages (o cualquier hosting estático).
- **Capa opcional de seguridad en Cloudflare**: un proxy (`functions/api.js`) que oculta la URL de Apps Script y agrega una llave secreta, y una puerta con contraseña (`functions/_middleware.js`).
- **Interfaz en español.** Todo texto visible, mensajes de error del servidor y nombres de campos de datos están en español.

### Diagrama

```
Navegador (index.html + JS)
      │  POST /api  (JSON como text/plain)
      ▼
Cloudflare Pages Function  functions/api.js   ← agrega `llave` (APP_KEY)
      │  POST a la URL /exec
      ▼
Google Apps Script  NutriConsultorio_Backend.gs   ← valida llave, sesión, rol, datos
      │
      ▼
Google Sheets  (pacientes, consultas, agenda, mediciones, planes_alimentarios, …)
```

Sin el proxy, el navegador llama directamente a la URL `/exec` (la URL va en `config.js`); el resto es igual.

---

## 2. Estructura del proyecto

```
NutriConsultorio/
├─ index.html                      Interfaz completa (HTML + JS inline, ~2,000 líneas)
├─ styles.css                      Estilos base, temas (variables CSS) y componentes
├─ tema_moderno.css                Capa visual moderna y arte de la pantalla de acceso
├─ config.js                       Configuración pública (URL del API, paleta de acceso, borradores)
├─ alimentos.js                    Base de alimentos de consulta (datos, no lógica)
├─ NutriConsultorio_Backend.gs     Backend de Apps Script (~1,000 líneas)
├─ functions/
│   ├─ api.js                      Proxy hacia Apps Script (Cloudflare Pages Function)
│   └─ _middleware.js              Puerta con usuario/contraseña para todo el sitio (opcional)
├─ pruebas/                        Pruebas automáticas (ver sección 11)
├─ nutri_static.test.js            Pruebas estáticas de consistencia del código
├─ LEEME.md                        Instalación para no programadores
├─ PROXY_CLOUDFLARE.md             Guía del proxy
├─ ACCESO_CON_CONTRASENA.md        Guía de la puerta con contraseña
└─ MANUAL_PROGRAMADOR.md           Este documento
```

El orden de carga en `index.html` es: `config.js` → `alimentos.js` → script principal (inline). `config.js` y `alimentos.js` solo definen `window.NUTRI_CONFIG` y `window.NUTRI_ALIMENTOS`.

---

## 3. Entorno de desarrollo

No hay paso de compilación. Para trabajar en local:

1. Sirve la carpeta con cualquier servidor estático (por ejemplo `npx serve .` o `python3 -m http.server`). Abrir `index.html` con `file://` no es recomendable (los `fetch` y los módulos de Cloudflare no se comportan igual).
2. Necesitas un backend con el que hablar. Dos opciones:
   - **Real:** una hoja de prueba con el script desplegado y su URL en `config.js` (`API_URL`).
   - **Simulado:** el servidor de pruebas `pruebas/mock.js`, que sirve el proyecto y simula el API en memoria: `node pruebas/mock.js . 8099` y abrir `http://localhost:8099`. Usuario `admin`, contraseña `clave-segura-123`.
3. Para las pruebas con navegador: Node 18 o superior y Playwright (`npm i -D playwright && npx playwright install chromium`).

**Verificar sintaxis rápido** (sin ejecutar nada): extraer los `<script>` de `index.html` y pasarlos por `node --check`; para el `.gs`, copiarlo a un `.js` temporal y hacer lo mismo. Las pruebas de `pruebas/` ya cargan el `.gs` completo dentro de un contexto de Node.

> Regla práctica: toda modificación del `.gs` obliga a **volver a publicar una nueva versión** de la implementación de Apps Script; si solo cambias el frontend basta con subir los archivos al hosting.

---

## 4. Configuración y despliegue

### 4.1 Apps Script (backend)

1. Crear una hoja de cálculo nueva → Extensiones → Apps Script.
2. Pegar el contenido de `NutriConsultorio_Backend.gs`.
3. Ejecutar **`prepararHojas`** una vez: crea (si faltan) las hojas `pacientes`, `consultas`, `agenda`, `mediciones`, `planes_alimentarios` y `plantillas_plan` con sus encabezados. No borra nada.
4. Editar la clave en `configurarPrimerUsuario()` y ejecutarla una vez: crea el usuario `admin` (la contraseña debe tener 12 caracteres o más). Después, cambiar la contraseña desde la propia aplicación y borrar la clave del código.
5. Implementar → Nueva implementación → Aplicación web: ejecutar como **yo**, acceso **cualquier persona** (la autenticación la hace la aplicación, no Google). Copiar la URL `/exec`.
6. No hay activadores que crear: `onEdit` es un activador simple que Apps Script ejecuta solo y limpia la caché cuando alguien edita la hoja a mano (ver 8.3).

Comprobación: abrir la URL `/exec` en el navegador (GET). Responde un JSON con `servicio`, `version` y `requiredSheetsReady`.

**Propiedades de script** (Configuración del proyecto → Propiedades de script):

| Propiedad | Uso |
|---|---|
| `LLAVE_APP` | Opcional. Si existe, el backend solo atiende peticiones que traigan esa llave (la agrega el proxy). Debe coincidir con `APP_KEY` en Cloudflare. |
| `NUTRICONSULTORIO_AGENDA_CONFIG_V1` | La escribe la propia aplicación (horarios de agenda). No tocar a mano. |

### 4.2 Frontend (Cloudflare Pages)

1. Subir la carpeta a un repositorio (privado) y conectarlo a Cloudflare Pages. Framework: ninguno; comando de compilación: vacío; directorio de salida: la raíz.
2. En `config.js`:
   - Sin proxy: `API_URL: 'https://script.google.com/macros/s/…/exec'`.
   - Con proxy: `API_URL: '/api'`.
3. Variables en Cloudflare Pages (como *Secret*):

| Variable | Uso |
|---|---|
| `APPS_SCRIPT_URL` | URL `/exec` (solo la usa el proxy). |
| `APP_KEY` | Llave larga y aleatoria; igual a `LLAVE_APP` en Apps Script. |
| `SITE_USER`, `SITE_PASSWORD` | Activan la puerta con contraseña del sitio completo. Si falta alguna, la puerta queda desactivada. |

No hay Cloudflare Access en este proyecto; la puerta de contraseña (`_middleware.js`) es la alternativa sin costo.

### 4.3 Versionado

La cadena de versión está en `doGet()` del backend (`version:'NUTRI7'`, dos veces). Súbela cuando cambie el contrato entre frontend y backend; sirve para diagnosticar que el usuario publicó la versión correcta del script.

---

## 5. Modelo de datos (hojas de cálculo)

La **primera fila de cada hoja son los encabezados**. El backend lee y escribe **por nombre de encabezado**, no por posición: puedes reordenar columnas o agregar columnas extra a mano sin romper nada. Si falta una columna que el código espera, se agrega sola al final (`asegurarColumnasModulo_`, `asegurarColumnasEntidad_`). Esa es la vía de migración: **agregar un campo no requiere migrar datos.**

Los identificadores son texto con prefijo y consecutivo: `PAC-0001`, `CON-0001`, `CIT-0001`, `MED-0001`, `PLA-0001`, `PLT-0001`. Se generan en el servidor (dentro del bloqueo) tomando el máximo existente + 1.

### 5.1 Hojas

| Hoja | Id | Columnas |
|---|---|---|
| `pacientes` | `Id_pacientes` | Id_pacientes, Fecha, Nombre, Primer_apellido, Segundo_Apellido, edad, Sexo, Fecha_Nacimiento, Telefono, Email, Calle, N, Colonia, Ciudad, Area_Registro, Tipo_Expediente, Tutor_Nombre, Tutor_Parentesco, Tutor_Telefono, Tutor_Email, Contacto_Emergencia, Ocupacion, Consentimiento_Fecha, Motivo_Consulta, Objetivo_Nutricional, Patologias_Medicamentos, Antecedentes_Familiares, Alergias_Intolerancias, Habitos_Alimentarios, Actividad_Sueno |
| `consultas` | `Id_consulta` | Id_consulta, Id_pacientes, Fecha, Modalidad, Tipo_consulta, Acompanante_Consulta, Sintomas, Exploracion_Fisica, Diagnostico, Plan_Clinico |
| `agenda` | `Id_cita` | Id_cita, Id_pacientes, Fecha, Hora, Motivo, Estado, Notas, ActualizadoPor |
| `mediciones` | `Id_medicion` | Id_medicion, Id_pacientes, Fecha, Peso_kg, Talla_cm, Cintura_cm, Cadera_cm, Grasa_pct, Masa_muscular_kg, Notas, ActualizadoPor |
| `planes_alimentarios` | `Id_plan` | Id_plan, Id_pacientes, FechaInicio, Objetivo, Kcal, Proteina_g, Carbohidratos_g, Grasas_g, Desayuno, Colacion1, Comida, Colacion2, Cena, Indicaciones, Estado, FechaRevision, ActualizadoPor, Meta_peso_kg, Equivalentes, MenuSemanal |
| `plantillas_plan` | `Id_plantilla` | Id_plantilla, Nombre, Kcal, Proteina_g, Carbohidratos_g, Grasas_g, Equivalentes, MenuSemanal, Desayuno, Colacion1, Comida, Colacion2, Cena, Indicaciones, ActualizadoPor |
| `usuarios` | `Usuario` | Usuario, Sal, Hash, Rol, Activo, Nombre, Correo, Areas, Superusuario |
| `antecedentes` | `Id_pacientes` | Una fila por paciente: el id y un JSON con la historia nutricional (ver 5.3) |
| `preferencias_usuario` | `Usuario` | Usuario, Tema, TamanoLetra, TamanoFormulario, Actualizado, InactividadMinutos, Densidad, ColorPrincipal |
| `configuracion_compartida` | `Clave` | Clave, Valor, ActualizadoPor, Actualizado (marca compartida: nombre, logotipo, imagen de acceso) |
| `bitacora` | — | Fecha, Usuario, Acción, Registro (solo se agrega; no se lee desde la aplicación) |

`prepararHojas()` crea las seis primeras. `usuarios` la crea `configurarPrimerUsuario`; `antecedentes`, `preferencias_usuario`, `configuracion_compartida` y `bitacora` se crean en el primer uso.

### 5.2 Convenciones de datos

- **Fechas:** texto `YYYY-MM-DD`. Horas: `HH:mm`. El backend normaliza los objetos `Date` que Sheets devuelve (`normalizarFechaAgenda_`, `normalizarHoraAgenda_`).
- **Decimales:** el frontend acepta coma o punto; el servidor convierte a número (`numeroEnRango_`).
- **Rol interno `medico`:** se muestra como «Nutriólogo(a)». Se conservó el valor interno por compatibilidad con la base original (`ROLES = ['admin','medico','lectura']`). Cambiarlo exige migrar la hoja `usuarios` y todos los chequeos `ses.rol`.
- **Campos heredados:** `Area_Registro` (siempre `general`), `Areas` y `Superusuario` en `usuarios`, y los controles de «área» vienen de la plantilla original de varias áreas. Hoy existe un solo espacio de trabajo (`appMode='general'`); el código los mantiene por compatibilidad. Se pueden simplificar, pero hay que hacerlo en backend y frontend a la vez.

### 5.3 Campos serializados en una celda

Tres campos guardan JSON como texto; siempre se **validan y normalizan en el servidor** antes de escribirse:

- `planes_alimentarios.Equivalentes` y `plantillas_plan.Equivalentes`: `{ "Grupo": { "Comida": n } }`.
  - Grupos permitidos (`GRUPOS_EQ_`): Verduras, Frutas, Cereales y tubérculos, Leguminosas, Alimentos de origen animal, Lácteos, Grasas, Azúcares.
  - Comidas permitidas (`COMIDAS_EQ_`): Desayuno, Colación 1, Comida, Colación 2, Cena.
  - Valores 0–30, redondeados a cuartos; los ceros se descartan. Máximo 3,000 caracteres.
  - **Las porciones no calculan calorías**: es una decisión deliberada (el valor energético por equivalente depende del sistema de equivalentes que use cada nutriólogo).
- `MenuSemanal`: `{ "Lunes": "texto", … "Domingo": "texto" }`. Solo días válidos, máximo 600 caracteres por día (`normalizarMenuSemanal_`).
- `antecedentes`: un objeto con siete claves (`ANTECEDENTES_KEYS_`): `historialPeso`, `dietasPrevias`, `recordatorio24h`, `preferencias`, `frecuenciaConsumo`, `digestivo`, `laboratorio`. Cada una: `{estado, detalle, observaciones}` (detalle ≤ 3,000 caracteres; observaciones ≤ 2,000). El campo `estado` lo deriva el frontend (`Con antecedente` / `No interrogado`).

Al guardar antecedentes se fusiona con lo que ya había en la hoja; una clave nueva no destruye las claves de versiones anteriores.

---

## 6. API del backend

### 6.1 Protocolo

- Un único endpoint: `doPost`. Se envía **JSON como texto plano** (`Content-Type: text/plain;charset=utf-8`) para evitar la verificación previa (preflight) de CORS que Apps Script no responde.
- Todas las respuestas son JSON con `status`: `success`, `error` o `auth` (sesión no válida o vencida; el frontend cierra la sesión).
- Cualquier excepción inesperada se atrapa en `doPost` y se devuelve como JSON genérico (nunca una página HTML de error de Apps Script). El detalle va a la `bitacora`.
- Toda petición autenticada lleva `token` y `area`. El frontend los agrega en `call()`.

Ejemplo:

```json
// petición
{ "action": "recordSave", "modulo": "mediciones", "token": "…", "area": "general",
  "Id_pacientes": "PAC-0001", "Fecha": "2026-11-17", "Peso_kg": "77,4", "Talla_cm": "163" }
// respuesta
{ "status": "success", "id": "MED-0004" }
```

### 6.2 Acciones

| Acción | Quién | Descripción |
|---|---|---|
| `login` | público | Usuario y clave → token de sesión. Máx. 5 intentos fallidos por usuario; luego 10 minutos de espera. |
| `resetRequest` | público | Envía por correo un código de 6 dígitos. Respuesta siempre genérica (no revela si el usuario existe). Una solicitud por minuto por usuario. |
| `resetPassword` | público | Cambia la clave con el código (válido 10 min, 5 intentos, clave nueva ≥ 12 caracteres). |
| `loginBrandGet` | público | Marca compartida (nombre, imagen) para la pantalla de acceso. |
| `logout` | sesión | Cierra la sesión. |
| `getData` | sesión | Pacientes, consultas y agenda (con caché). Las mediciones y planes se piden aparte. |
| `createPaciente`, `updatePaciente`, `deletePaciente` | admin, nutriólogo | CRUD de expedientes. No se elimina un expediente con consultas, citas, mediciones o planes. |
| `createConsulta`, `updateConsulta`, `deleteConsulta` | admin, nutriólogo | CRUD de consultas. |
| `recordSave`, `recordDelete` | admin, nutriólogo | CRUD genérico de los módulos de `MODULOS_` (agenda, mediciones, planes, plantillas) indicando `modulo`. Eliminar: solo admin y nutriólogo. |
| `nutriRecordsGet` | sesión | Registros de `mediciones`, `planes` o `plantillas`. Con `Id_pacientes` devuelve los de ese paciente; con `todos:'1'` devuelve todos (los usa el aviso de pendientes); las plantillas siempre se devuelven completas. |
| `antecedentesGet`, `antecedentesSave` | sesión / escribe: admin, nutriólogo | Historia nutricional del paciente. |
| `agendaConfigGet`, `agendaConfigSave` | sesión / guarda: admin, nutriólogo | Horarios de la agenda (en propiedades de script). |
| `preferencesGet`, `preferencesSave` | sesión | Preferencias visuales por usuario; la marca compartida solo la guardan admin y nutriólogo. |
| `userList`, `userSave`, `userStatus` | solo admin | Gestión de usuarios (alta, edición, activar/desactivar). No se puede dejar el sistema sin administrador activo. |

El rol `lectura` nunca puede escribir. **La autorización siempre se aplica en el servidor**; los botones ocultos en la interfaz son solo comodidad.

---

## 7. Seguridad

Lo que hay:

- **Contraseñas:** SHA-256 con sal individual (`hash(sal, clave)`), longitud mínima 12. Nunca se guardan ni se envían de vuelta.
- **Sesión:** token aleatorio (dos UUID) guardado en `CacheService` con vida de 6 horas (`SESION_TTL`), renovado en cada petición. El navegador lo guarda en `sessionStorage` (se pierde al cerrar la pestaña). Además el frontend cierra la sesión por inactividad (`InactividadMinutos`).
- **Fuerza bruta:** contador de intentos por usuario en caché (5 intentos / 10 minutos) y retraso fijo en la puerta de contraseña del sitio.
- **Recuperación de contraseña:** código de 6 dígitos con hash en caché, 10 min de vigencia, 5 intentos, respuesta genérica, límite de una solicitud por minuto por usuario.
- **Llave de aplicación:** con `LLAVE_APP`/`APP_KEY` solo el proxy puede hablar con Apps Script; la URL `/exec` y la llave no están en el código del navegador.
- **Concurrencia:** `LockService.getScriptLock()` en toda escritura de módulos (agenda, mediciones, planes, plantillas), en eliminaciones, pacientes, consultas, antecedentes y preferencias; las citas verifican además que el horario esté libre dentro del mismo bloqueo.
- **Validación en servidor:** rangos numéricos (peso, talla, kcal, macros), fechas coherentes, listas cerradas (grupos, comidas, días, estados, roles), longitudes máximas y verificación de que el paciente existe.
- **XSS:** todo texto de usuario que entra a `innerHTML` pasa por `esc()`. Al agregar vistas nuevas hay que mantener esa disciplina; el HTML de documentos imprimibles también escapa.
- **Auditoría:** `bitacora` registra inicios de sesión (y fallidos), altas, cambios y eliminaciones con usuario y registro.
- **Borradores de consulta:** en `localStorage`, por usuario y paciente, con caducidad (`BORRADORES.horas`) y se borran al guardar o al salir.

Límites y riesgos conocidos (ver también la sección 13):

- `CacheService` es un caché y no una base de sesiones: Google puede expulsar entradas antes de tiempo; el efecto es que el usuario debe volver a iniciar sesión.
- La URL de Apps Script publicada con acceso «cualquier persona» es pública; sin `LLAVE_APP` cualquiera que la conozca puede enviar peticiones (seguirá necesitando credenciales). Por eso se recomienda el proxy.
- Los datos de salud son sensibles. La hoja de cálculo debe estar compartida solo con quien administra el sistema; el acceso a la hoja equivale a acceso a todo.
- No hay respaldos automáticos en el proyecto.

---

## 8. Backend por dentro

### 8.1 Dos mecanismos de CRUD

1. **Entidades clásicas** (`ENT`: pacientes y consultas): acciones `createPaciente`, `updateConsulta`… resueltas con una expresión regular `^(create|update|delete)(Paciente|Consulta)$`. Definidas por `ENT.Paciente` y `ENT.Consulta` (`hoja`, `id`, `claves`).
2. **Módulos genéricos** (`MODULOS_`: agenda, mediciones, planes, plantillas): `recordSave` / `recordDelete` + `modulo`. Cada módulo es una entrada `{hoja, id, keys}`. Es el camino recomendado para cualquier módulo nuevo.

### 8.2 Flujo de `recordSave`

`doPost` → `doPostInterno_` (llave, sesión, rol) → `guardarRegistroModulo_` (agenda: bloqueo + horario libre) → `guardarRegistroModuloInterno_`:

1. Obtiene el módulo y la hoja; la crea si falta y asegura columnas.
2. Verifica que el paciente exista (excepto en `plantillas`, que no pertenecen a un paciente).
3. Valida por tipo (rangos, listas, JSON normalizado).
4. Si hay `id`, actualiza esa fila **conservando los campos que no se enviaron**; si no, genera folio nuevo.
5. Escribe por encabezados, limpia la caché de datos y registra en `bitacora`.

### 8.3 Caché de datos

`datosJson()` guarda en `CacheService` la serialización de pacientes, consultas y agenda, partida en trozos de 30,000 caracteres (`CHUNK`, el límite por clave es ~100 KB) con vida de 10 minutos (`CACHE_TTL`). Las escrituras de la aplicación llaman `limpiarCache()`. El activador simple `onEdit` también la limpia, pero **solo se dispara con ediciones manuales en la hoja**, no con escrituras hechas por el script.

### 8.4 Cómo agregar un campo a un módulo existente

Ejemplo: agregar `Circunferencia_brazo_cm` a mediciones.

1. **Backend:** añadirlo a `MODULOS_.mediciones.keys` y, si debe validarse, a la rama `tipo==='mediciones'` de `guardarRegistroModuloInterno_` con `numeroEnRango_`.
2. **Frontend:** agregar el `<input name="Circunferencia_brazo_cm">` al formulario de `medicionesHtml()`, a la lista de la vista (si aplica) y, si se quiere graficar, a `MED_SERIES`.
3. Publicar el backend. La columna se crea sola en la primera escritura; los registros viejos simplemente quedan con la celda vacía.
4. Añadir un caso a `pruebas/backend.test.js`.

Para un campo de **pacientes** o **consultas** hay que sumarlo en cuatro sitios: `ENT.*.claves`, la lista de campos permitidos de `datosPorArea_` (`patientKeys` / `sessionKeys`; si no, el servidor no lo devuelve al navegador), la validación en `normalizarYValidarPaciente_` y la definición de formulario `FORM` del frontend.

### 8.5 Cómo agregar un módulo nuevo (ejemplo: «laboratorios»)

1. `MODULOS_.laboratorios = {hoja:'laboratorios', id:'Id_laboratorio', keys:[…]}`.
2. Prefijo de folio: en `guardarRegistroModuloInterno_`, junto a `CIT-`/`MED-`/`PLT-`/`PLA-`.
3. Validaciones en una rama `else if(tipo==='laboratorios')`.
4. Si se consulta por paciente: añadir el nombre a la lista permitida de `nutriRecordsGet` y a `obtenerRegistrosPaciente_`.
5. `prepararHojas()` ya recorre `MODULOS_`, así que crea la hoja sola.
6. Si el paciente tiene registros del módulo, sumarlos a `contarRegistrosDePaciente_` para impedir eliminar un expediente con datos.
7. Frontend: ver 9.6.

---

## 9. Frontend por dentro

Todo el JavaScript está en un bloque `<script>` de `index.html`. Se lee de arriba hacia abajo en este orden aproximado: utilidades y temas → capa de datos → preferencias y marca → borradores → vistas → rutas → eventos → inicio de sesión.

### 9.1 Capa de datos

- `post(body)`: `fetch` a `API_URL`, JSON como texto plano, tiempo máximo de 60 s, error claro si la respuesta no es JSON.
- `call(body)`: añade `token` y `area`; ante `status:'auth'` cierra la sesión y lanza `Error('auth')` (los `catch` deben ignorarlo).
- `db`: caché en memoria de `pacientes`, `consultas`, `agenda`, `mediciones`, `planes` (y `plantillas`), persistida en `sessionStorage`. `load()` llama `getData` y reemplaza `db`; las mediciones/planes se cargan bajo demanda con `nutriLoad(modulo, idPaciente)` y `nutriLoadAll()` (todas, para alertas).
- `send(ent, mode, data)`: escritura **optimista** para pacientes y consultas: actualiza `db`, repinta, envía y, si el servidor rechaza, recarga desde la hoja. Los módulos genéricos usan un flujo propio con `saveUI`.

### 9.2 Vistas y rutas

Cada pantalla es un objeto en `V`: `V.hoy`, `V.resumen`, `V.pacientes`, `V.expediente`, `V.consultas`, `V.agenda`, `V.mediciones`, `V.planes`, `V.alimentos`, `V.usuarios`:

```js
V.nombre = { t: 'Título', html: () => '<…>', init() { /* eventos, carga */ }, draw() { /* repintar con db */ } };
```

El enrutador usa el `hash` (`#/hoy`, `#/consultas/PAC-0001`, `#/expediente/PAC-0001`). El expediente admite un tercer segmento con la pestaña: `#/expediente/PAC-0001/<general|historia|consultas|mediciones|plan>`. `route()` toma el primer segmento como nombre de vista y el segundo como argumento. El menú lateral sale del arreglo `NAV` (`[ruta, icono, etiqueta]`); `usuarios` solo aparece para administradores.

### 9.2.1 Expediente con pestañas

`V.expediente.draw()` pinta cabecera, barra `nav.hub-tabs` y un panel `#hubPane`. Las pestañas *Resumen*, *Historia* y *Consultas* se renderizan como HTML estático; *Mediciones* y *Plan alimentario* inyectan `medicionesHtml()` / `planesHtml()` y llaman a `nutriInit()`, reutilizando los mismos formularios que las vistas independientes (`#/mediciones`, `#/planes`). El selector de paciente se oculta por CSS (`.hub-embed`) y `S.nutriPatient` fija el paciente. Un guardián evita repintar el panel si ya está en la misma pestaña y paciente (así una sincronización de datos no borra un formulario a medio llenar). Estado: `S.profileTab`, `S.profileTabFor`.

### 9.2.2 Inicio y estilo

`V.hoy` incluye `#dayQuick` (accesos rápidos, clases `.quick-grid/.quick-tile`). El menú lateral se agrupa en `renderNav()` con el mapa `GR` (encabezados `.nav-group` antes de Consultas, Alimentos y Usuarios). Las tarjetas de plan (`.plan-card`) muestran kcal, estado y una barra de macronutrientes calculada con 4/4/9 kcal por gramo.

`planPreviewUpdate()` pinta `#planPreview` (tarjeta «Vista previa del plan») a partir de los campos del formulario; se dispara con `input` del formulario y desde `wkRecalc()` (que también corre al editar o resetear).

### 9.3 Acciones por delegación de eventos

Los botones llevan `data-a="nombre"` (más `data-e`, `data-id`); un solo `click` global busca la función en el mapa `A` (por ejemplo `A['print-plan']`, `A['go-mediciones']`). Para agregar una acción: poner el `data-a` en el HTML y definir la clave en `A`.

### 9.4 Utilidades que conviene conocer

`v(obj, 'Campo')` lectura tolerante de campos, `nm(paciente)` nombre completo, `esc()` escapado HTML, `norm()` normaliza para búsquedas (sin acentos ni mayúsculas), `iso()`/`fd()`/`today()` fechas, `num()` número tolerante a coma, `f1()` redondeo a un decimal, `ic('nombre')` íconos SVG (mapa `I`), `toast()` aviso temporal, `saveUI(boton)` (ver 9.5).

### 9.5 Confirmación de guardado: `saveUI`

Todo botón de guardar usa `saveUI(boton)`, que devuelve `{start, ok(msg), fail(msg)}`: deshabilita el botón y muestra «Guardando…», y al terminar deja un **texto fijo** (`.save-status`, verde con ✓ o rojo con ✕) junto al botón. La razón: un botón que solo muestra una animación no da certeza de que se guardó, y con «reducir movimiento» activado la animación ni se ve. Para formularios que se vuelven a pintar tras guardar hay que llamar `ok()` **después** del repintado (ver el guardado de antecedentes).

### 9.6 Cómo agregar una vista nueva

1. Función de HTML (`laboratoriosHtml()`) y objeto `V.laboratorios = {t, html, init, draw}`.
2. Entrada en `NAV` y, si usa un ícono nuevo, su trazo SVG en `I`.
3. En `init()`: cargar los datos con `call({action:'nutriRecordsGet', modulo:'laboratorios', Id_pacientes})` y guardar con `call({action:'recordSave', modulo:'laboratorios', …})` envuelto en `saveUI`.
4. Las acciones de botones en el mapa `A`.
5. Estilos en `styles.css` (usar las variables de color, ver 9.8).

### 9.7 Calculadoras y fórmulas

- **IMC** = kg / m². Solo se clasifica con las categorías de la OMS en **adultos**; en menores (`esExpedienteMenor`) se muestra el valor y un aviso para usar las curvas/percentiles de la OMS.
- **Índice cintura-cadera** = cintura / cadera.
- **Gasto energético:** Mifflin-St Jeor — `10·kg + 6.25·cm − 5·edad` y `+5` (hombres) o `−161` (mujeres); luego factor de actividad (1.2, 1.375, 1.55, 1.725, 1.9) y ajuste en kcal. Macros a 4/4/9 kcal por gramo; los porcentajes deben sumar 100. Es una **referencia** pensada para adultos.
- **Equivalentes:** `eqGridHtml`, `eqRead`, `eqWrite`, `eqRecalc` (totales por grupo y por comida), `eqSummaryText`, `eqPrintHtml`. El valor serializado viaja en el campo oculto `#planEq`.
- **Menú semanal:** `wkHtml`, `wkRead`, `wkWrite`, `wkRecalc`, `wkSections` (para impresión); campo oculto `#planWk`.

### 9.8 Estilos y temas

Los colores salen de variables CSS en `:root` (`--bg --s --s2 --tx --mu --ln --pr --prd --on --ps --gd --rd --sh`). Los temas se aplican con `data-` en el `body`/`html` y redefinen esas variables; los componentes nuevos deben usar las variables y no colores fijos, para que funcionen en todos los temas (incluidos oscuro y alto contraste). El tamaño de letra y de formularios también se controlan con atributos (`data-font`, etc.). `tema_moderno.css` solo contiene la capa visual moderna y el arte vectorial de la pantalla de acceso.

### 9.9 Impresión y documentos

`exportRecord(tipo, id, modo)` genera un documento HTML autónomo con `nutriDocumentHtml(titulo, paciente, secciones, extra)`. Tipos: `profile` (ficha), `session` (nota de consulta), `plan`, `summary` (resumen de seguimiento) y `closing` (informe de cierre). `modo` = `print` (abre ventana lista para imprimir) o `download` (archivo `.html`). Qué documentos están disponibles y los datos profesionales del pie se configuran en «Documentos e impresión» y se guardan en `localStorage` del navegador (no en la hoja).

### 9.10 Base de alimentos

`alimentos.js` define `window.NUTRI_ALIMENTOS`: una lista de filas

```js
[nombre, grupo, kcal, proteina_g, carbohidratos_g, grasa_g, porcionComun, gramosPorcion]
```

con valores **por 100 g**. La vista (`V.alimentos`) calcula los valores por porción y por cantidad en una calculadora (`alCalc`). Para agregar o corregir alimentos solo hay que editar ese archivo (el grupo debe ser uno de `AL_GRUPOS`). Los valores actuales son aproximados de referencia (tipo USDA) y **conviene validarlos contra las tablas oficiales que use la nutrióloga** (por ejemplo el SMAE) antes de darlos por buenos.

### 9.11 Alertas de seguimiento

`nutriAlertsCompute` calcula con datos ya cargados: planes activos con revisión vencida, pacientes con consultas pero sin plan vigente, y pacientes sin medición en los últimos 60 días (los umbrales son constantes dentro de la función). Se dibujan en Mi día y en Resumen (`nutriAlertsHtml`, `drawNutriAlerts`). Necesita `nutriLoadAll()` para tener todas las mediciones y planes.

---

## 10. Cloudflare Pages Functions

- `functions/api.js` — recibe `POST /api`, valida que el `Origin` sea el mismo host, limita el tamaño del cuerpo (2 MB), exige JSON de objeto, agrega `llave` y reenvía a `APPS_SCRIPT_URL`. Devuelve siempre JSON; los fallos del servidor de datos salen como 502.
- `functions/_middleware.js` — Basic Auth en **todas** las rutas del sitio (incluido el código fuente). Compara usuario y contraseña en tiempo constante (hash SHA-256 de ambos lados) y añade 1.5 s de espera a cada fallo. Sin `SITE_USER`/`SITE_PASSWORD` se desactiva.

Es una capa independiente del inicio de sesión de la aplicación.

---

## 11. Pruebas

Todas las pruebas de `pruebas/` usan **datos ficticios** y no tocan ninguna hoja real.

| Archivo | Qué hace |
|---|---|
| `backend.test.js` | Carga el `.gs` real dentro de un contexto de Node con un `SpreadsheetApp` falso en memoria y prueba validaciones, folios, edición conservando campos, equivalentes, menú semanal, plantillas, lectura global y eliminación. |
| `mock.js` | Servidor local: sirve el proyecto y simula el API en memoria (`node pruebas/mock.js <raiz> <puerto>`). Lo usan las pruebas de navegador y sirve también para desarrollar sin Apps Script. |
| `e2e_basico.js` | Playwright: acceso, menú, expedientes, consultas, mediciones y gráficas, calculadora, planes y caso de niños (IMC sin clasificar). |
| `e2e_funciones.js` | Playwright: equivalentes, plantillas, copiar plan, concluir plan anterior, meta en la gráfica, menú semanal, alertas, resumen en consulta, base de alimentos y botón cancelar. |
| `e2e_pestanas.js` | Playwright: pestañas del expediente, captura de medición y plan dentro de la ficha, selector oculto y pestaña conservada al recargar. |
| `e2e_historia.js` | Playwright: historia nutricional (siete apartados, contador, formato de 24 h, aviso de guardado persistente). |
| `../nutri_static.test.js` | Verificaciones estáticas de consistencia: menú, hojas del backend, acción `nutriRecordsGet` presente en ambos lados, fórmulas (Mifflin-St Jeor, IMC), campos nutricionales, configuración propia, y que no queden restos del proyecto de origen. |

Cómo correrlas:

```bash
node pruebas/backend.test.js                 # no necesita navegador
node nutri_static.test.js
npm i -D playwright && npx playwright install chromium
node pruebas/e2e_basico.js
node pruebas/e2e_funciones.js
node pruebas/e2e_historia.js
node pruebas/e2e_pestanas.js
```

Cada script imprime `OK`/`FAIL` por comprobación y termina con código distinto de cero si algo falla. Las pruebas de navegador usan puertos fijos (8111, 8112, 8114); si un servidor anterior quedó vivo, el nuevo no arrancará y verás datos acumulados de otra corrida: cierra el proceso (`pkill -f mock.js`) y repite.

**Lo que las pruebas NO cubren:** Google Sheets reales (cuotas, tiempos, formatos de celda automáticos), `MailApp`, el proxy y la puerta de Cloudflare, diseño en pantallas móviles reales, ni volúmenes grandes. Antes de usar con pacientes reales conviene una prueba de humo en la instalación real.

Al cambiar el comportamiento de un módulo, actualiza también el `mock.js` (su `recordSave`/`nutriRecordsGet` imitan al backend) o las pruebas de navegador fallarán por motivos ajenos al cambio.

---

## 12. Límites de Google Apps Script y Sheets a tener presentes

- Una ejecución puede durar hasta 6 minutos; las llamadas del usuario deben ser rápidas, por eso `getData` usa caché.
- `getData` lee toda la hoja de pacientes, consultas y agenda en cada carga fría. Con decenas de miles de filas se volverá lento; si crece mucho habrá que paginar o filtrar por fecha.
- Cada celda admite 50,000 caracteres; el límite por clave de `CacheService` es ~100 KB (de ahí el trozado de 30,000).
- `MailApp` tiene cuota diaria (unos 100 correos al día en cuentas personales de Google): sirve para recuperación de contraseña, no para envíos masivos.
- Las escrituras toman el bloqueo de script; con muchos usuarios simultáneos habrá esperas (hasta 20 s antes de fallar con mensaje claro).
- Las celdas con formato automático pueden convertir texto en fecha o número; por eso el backend normaliza las fechas y horas que Sheets devuelve como `Date` y las vuelve a texto.

---

## 13. Deuda técnica y mejoras sugeridas

- **`index.html` monolítico (~2,000 líneas).** Funciona y simplifica el despliegue, pero conviene separar en módulos (`<script type="module">` o un bundler) si el equipo crece.
- **Restos de la plantilla multi-área** (`Area_Registro`, `Areas`, `Superusuario`, parámetro `area`). Pueden eliminarse con una limpieza coordinada.
- **Endurecer la recuperación de contraseña** (límites adicionales y bloqueo por abuso). Existen límites básicos (una solicitud por minuto y 5 intentos por código); queda pendiente decidir un esquema más estricto.
- **Respaldos.** No hay copias automáticas de la hoja; se recomienda un activador de Apps Script que copie la hoja con regularidad a una carpeta privada de Drive, o usar el historial de versiones de Google.
- **Consentimiento informado digital** y registro de aceptación (hoy solo hay una fecha en el expediente).
- **Curvas de crecimiento OMS** para percentiles en niñas, niños y adolescentes (hoy solo se muestra el aviso).
- **Verificar la base de alimentos** con una fuente oficial y, si se desea, agregar el valor energético por equivalente para calcular kcal desde las porciones.
- **Versión instalable (PWA)** y modo sin conexión de solo lectura.
- **Portal del paciente** (registro diario, mensajes, fotos): sería un proyecto separado con su propio esquema de autenticación y mucha más superficie de seguridad.

---

## 14. Lista de comprobación antes de publicar un cambio

1. `node pruebas/backend.test.js`, `node nutri_static.test.js` y las pruebas de navegador en verde.
2. Subir la cadena de versión en `doGet()` si cambió el contrato frontend-backend.
3. Pegar el `.gs` actualizado en Apps Script, ejecutar `prepararHojas` y **publicar una nueva versión** de la implementación (la URL no cambia).
4. Subir el frontend (incluido `alimentos.js` si se editó).
5. Prueba de humo en la instalación real con datos ficticios: iniciar sesión, crear paciente, registrar medición, guardar plan, imprimir.
6. Avisar a los usuarios si hay cambios visibles; recargar con Ctrl+F5 si el navegador conserva archivos antiguos.
