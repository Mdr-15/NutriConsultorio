# NutriConsultorio

Gestión de consultorio de nutrición sobre Google Sheets + Google Apps Script. Hecha a partir de la base de PsicoConsultorio.

## Qué incluye (versión 1)
- Expediente nutricional: objetivo, enfermedades y medicamentos, alergias e intolerancias, hábitos, actividad y sueño, fecha de consentimiento informado, tutor (niñas, niños y adolescentes).
- Antecedentes permanentes: historial de peso, dietas previas, recordatorio de 24 h, frecuencia de consumo, salud digestiva, laboratorio, suplementos y entorno.
- Consultas con nota, diagnóstico nutricional e indicaciones.
- **Mediciones**: peso, talla, cintura, cadera, % de grasa y masa muscular; IMC e índice cintura-cadera automáticos; gráficas de evolución (también en el expediente y en el resumen impreso).
- **Plan alimentario**: calculadora de energía (Mifflin-St Jeor × factor de actividad ± ajuste) con reparto de macronutrientes, menú por tiempos de comida, impresión/descarga con tu logo.
- Agenda de citas, Mi día, borradores, usuarios y roles, logo e imagen de acceso configurables.

## Instalación
1. Crea una hoja de cálculo de Google nueva (vacía).
2. Extensiones → Apps Script. Pega el contenido de `NutriConsultorio_Backend.gs`.
3. En Apps Script, elige la función `prepararHojas` y pulsa Ejecutar (autoriza los permisos). Crea las hojas `pacientes`, `consultas`, `agenda`, `mediciones` y `planes_alimentarios` con todas sus columnas. No borra nada si ya existen.
4. Edita en el backend la clave de `configurarPrimerUsuario()` (usuario `admin`, mínimo 12 caracteres), ejecútala una vez y luego borra esa clave del código. Crea la hoja `usuarios`. Entra y cambia la contraseña.
5. Implementar → Nueva implementación → Aplicación web → Ejecutar como: **Yo**, Acceso: **Cualquiera**.
6. Copia la URL `/exec` en `config.js` (`API_URL`).
7. Sube la carpeta a tu repositorio de GitHub y publícala en Cloudflare Pages.

Las hojas `antecedentes`, `bitacora`, `preferencias_usuario` y `configuracion_compartida` se crean solas cuando se usan por primera vez.
Las carpetas `functions/` (proxy con llave y contraseña del sitio) son opcionales: ver `PROXY_CLOUDFLARE.md` y `ACCESO_CON_CONTRASENA.md`.

## Alcances y límites
- El IMC se clasifica (OMS) solo en personas adultas. En niñas, niños y adolescentes se muestra el valor y un aviso: se interpreta con las curvas de crecimiento de la OMS, que esta versión no incluye.
- Las fórmulas energéticas son estimaciones; el criterio clínico es del profesional.
- No incluye catálogo de alimentos ni cálculo de micronutrientes (las bases de datos de alimentos tienen licencias y son demasiado grandes para Sheets).
- El expediente electrónico debe cumplir la NOM-004-SSA3-2012 y la NOM-024-SSA3-2012: confirma los requisitos con la norma oficial. La conservación mínima es de 5 años desde el último acto médico y los respaldos de la hoja son responsabilidad tuya.
- Sin respaldos automáticos todavía.

## Pruebas
`node nutri_static.test.js` revisa la estructura del proyecto.
