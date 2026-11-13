/* Configuración pública del frontend NutriConsultorio.
 * Esta URL NO es una contraseña ni un secreto: cualquier navegador puede verla.
 * Pega aquí la URL de tu implementación de Apps Script (termina en /exec).
 */
window.NUTRI_CONFIG = Object.freeze({
  API_URL: '',
  /* Aspecto de la pantalla de acceso: 'salvia' (predeterminada), 'marino', 'ciruela' o 'arena'. */
  LOGIN: { paleta: 'salvia' },
  /* Borradores automáticos de notas de consulta.
   * Se guardan SOLO en este navegador, caducan a las `horas` y se borran al guardar o al pulsar «Salir».
   * Pon guardar:false si el equipo es compartido. */
  BORRADORES: { guardar: true, horas: 72 }
});
