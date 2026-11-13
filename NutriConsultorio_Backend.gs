/**
 * NutriConsultorio - Backend (Google Apps Script)
 * Hojas principales: pacientes, consultas, agenda, mediciones y planes_alimentarios.
 * Hoja usuarios: Usuario | Sal | Hash | Rol | Activo | Nombre
 * La primera fila de cada hoja contiene encabezados.
 */
var ENT = {
  Paciente: { hoja: 'pacientes', id: 'Id_pacientes', claves: ['Id_pacientes','Fecha','Nombre','Primer_apellido','Segundo_Apellido','edad','Sexo','Fecha_Nacimiento','Telefono','Email','Calle','N','Colonia','Ciudad','Area_Registro','Tipo_Expediente','Tutor_Nombre','Tutor_Parentesco','Tutor_Telefono','Tutor_Email','Contacto_Emergencia','Ocupacion','Consentimiento_Fecha','Motivo_Consulta','Objetivo_Nutricional','Patologias_Medicamentos','Antecedentes_Familiares','Alergias_Intolerancias','Habitos_Alimentarios','Actividad_Sueno'] },
  Consulta: { hoja: 'consultas', id: 'Id_consulta', claves: ['Id_consulta','Id_pacientes','Fecha','Modalidad','Tipo_consulta','Acompanante_Consulta','Sintomas','Exploracion_Fisica','Diagnostico','Plan_Clinico'] }
};
var SESION_TTL = 21600;
var ROLES = ['admin','medico','lectura'];
var CACHE_TTL = 600;
var CHUNK = 30000;

function doGet() {
  try {
    var ss=SpreadsheetApp.getActiveSpreadsheet(), accessible=!!ss;
    var required=accessible && !!ss.getSheetByName('pacientes') && !!ss.getSheetByName('consultas');
    return salida({status:required?'ok':'error',servicio:'NutriConsultorio',version:'NUTRI2',spreadsheetAccessible:accessible,requiredSheetsReady:required});
  } catch(err) {
    return salida({status:'error',servicio:'NutriConsultorio',version:'NUTRI2',spreadsheetAccessible:false,requiredSheetsReady:false});
  }
}

function doPost(e) {
  // Cualquier error inesperado debe llegar al navegador como JSON, no como página HTML de Apps Script.
  try { return doPostInterno_(e); }
  catch (err) { try { bitacora('sistema','errorInterno',String(err && err.message || err).slice(0,200)); } catch(x) {} return salida({status:'error',message:'Ocurrió un error inesperado en el servidor. Inténtalo de nuevo.'}); }
}
function doPostInterno_(e) {
  var p;
  try { p = leerParams(e); } catch (err) { return salida({status:'error',message:'Solicitud no válida'}); }
  // Llave de aplicación (opcional): si existe la propiedad de script LLAVE_APP, solo se atienden
  // las peticiones que traigan esa llave (las agrega el proxy de Cloudflare). Sin la propiedad, todo sigue igual.
  var llaveApp = PropertiesService.getScriptProperties().getProperty('LLAVE_APP');
  if (llaveApp && String(p.llave || '') !== llaveApp) return salida({status:'error',message:'Solicitud no autorizada.'});
  delete p.llave;
  if (p.action === 'login') return salida(iniciarSesion(p));
  if (p.action === 'resetRequest') return salida(solicitarCodigoRecuperacion_(p));
  if (p.action === 'resetPassword') return salida(restablecerConCodigo_(p));
  if (p.action === 'loginBrandGet') return salida({status:'success',brand:obtenerMarcaCompartida_()});
  var ses = validarSesion(p.token);
  if (!ses) return salida({status:'auth',message:'Sesión no válida'});
  var accionAreaLibre = ['logout','preferencesGet','preferencesSave','userList','userSave','userStatus'].indexOf(String(p.action||'')) >= 0;
  if (!accionAreaLibre && p.area && !usuarioPuedeArea_(ses, p.area)) return salida({status:'error',message:'Tu cuenta no tiene acceso al área solicitada.'});
  if (p.action === 'preferencesGet') {
    try { var prefData=obtenerPreferencias_(ses.usuario); return salida({status:'success',preferences:prefData,brand:obtenerMarcaCompartida_()}); }
    catch (err) { return salida({status:'error',message:'No se pudieron leer las preferencias.'}); }
  }
  if (p.action === 'preferencesSave') {
    try { var savedPrefs=guardarPreferencias_(ses.usuario,p.preferences); var savedBrand=obtenerMarcaCompartida_(); if(p.brand && (ses.rol==='admin'||ses.rol==='medico')) savedBrand=guardarMarcaCompartida_(p.brand,ses); return salida({status:'success',preferences:savedPrefs,brand:savedBrand}); }
    catch (err) { return salida({status:'error',message:String(err.message || 'No se pudieron guardar las preferencias.')}); }
  }
  if (p.action === 'agendaConfigGet') {
    try { return salida({status:'success',config:obtenerConfigAgenda_()}); }
    catch (err) { return salida({status:'error',message:String(err.message || 'No se pudo leer la configuración de agenda.')}); }
  }
  if (p.action === 'agendaConfigSave') {
    if (ses.rol !== 'admin' && ses.rol !== 'medico') return salida({status:'error',message:'Tu rol no permite cambiar los horarios de agenda.'});
    try { return salida({status:'success',config:guardarConfigAgenda_(p.config)}); }
    catch (err) { return salida({status:'error',message:String(err.message || 'No se pudo guardar la configuración de agenda.')}); }
  }
  // Antecedentes clínicos: acceso por sesión y una única fila por paciente.
  if (p.action === 'antecedentesGet') {
    try { validarPacienteEnArea_(p.Id_pacientes,p.area||'general',ses); return salida(obtenerAntecedentes_(p.Id_pacientes, ses)); }
    catch (err) { return salida({status:'error',message:String(err.message || 'No se pudieron leer los antecedentes.')}); }
  }
  if (p.action === 'antecedentesSave') {
    if (ses.rol === 'lectura') return salida({status:'error',message:'Tu rol solo permite consultar antecedentes.'});
    try { validarPacienteEnArea_(p.Id_pacientes,p.area||'general',ses); return salida(guardarAntecedentes_(p, ses)); }
    catch (err) { return salida({status:'error',message:String(err.message || 'No se pudieron guardar los antecedentes.')}); }
  }
  if (p.action === 'logout') { CacheService.getScriptCache().remove('s_' + p.token); return salida({status:'success'}); }
  if (p.action === 'recordSave' || p.action === 'recordDelete') {
    if (ses.rol === 'lectura' || (p.action === 'recordDelete' && ses.rol !== 'admin' && ses.rol !== 'medico')) return salida({status:'error',message:'Tu rol no permite esta acción.'});
    try { return salida(p.action === 'recordDelete' ? borrarRegistroModulo_(p,ses) : guardarRegistroModulo_(p, ses)); }
    catch (err) { return salida({status:'error',message:String(err.message || err)}); }
  }
  if (p.action === 'nutriRecordsGet') {
    try {
      var mod=String(p.modulo||''); if(['mediciones','planes'].indexOf(mod)<0) throw new Error('Módulo no válido.');
      validarPacienteEnArea_(p.Id_pacientes,'general',ses);
      return salida({status:'success',records:obtenerRegistrosPaciente_(mod,p.Id_pacientes)});
    } catch(err) { return salida({status:'error',message:String(err.message||'No se pudieron consultar los registros.')}); }
  }
  if (p.action === 'getData') {
    // Usa la caché de datos; las escrituras de la aplicación la invalidan.
    // El trigger onEdit invalida cambios manuales en Sheets. Evita reconstruir
    // todas las hojas en cada carga, lo que ralentizaba cada operación CRUD.
    return salida({status:'success',data:datosPorArea_(p.area || 'general', ses)});
  }
  // La administración de usuarios se autoriza siempre en el servidor.
  if (p.action === 'userList') {
    if (ses.rol !== 'admin') return salida({status:'error',message:'Solo un administrador puede consultar usuarios'});
    return salida({status:'success',users:listarUsuariosPublicos(),currentSuperusuario:ses.superusuario===true,currentAreas:ses.areas||['general']});
  }
  if (p.action === 'userSave') {
    if (ses.rol !== 'admin') return salida({status:'error',message:'Solo un administrador puede administrar usuarios'});
    try { return salida(guardarUsuarioDesdePanel(p, ses)); }
    catch (err) { return salida({status:'error',message:String(err.message || err)}); }
  }
  if (p.action === 'userStatus') {
    if (ses.rol !== 'admin') return salida({status:'error',message:'Solo un administrador puede administrar usuarios'});
    try { return salida(cambiarEstadoUsuario(p, ses)); }
    catch (err) { return salida({status:'error',message:String(err.message || err)}); }
  }

  var m = /^(create|update|delete)(Paciente|Consulta)$/.exec(String(p.action || ''));
  if (!m) return salida({status:'error',message:'Acción no reconocida'});
  var op = m[1], cfg = ENT[m[2]];
  if (ROLES.indexOf(ses.rol) < 0) return salida({status:'error',message:'Rol de sesión inválido'});
  if (ses.rol === 'lectura' || (op === 'delete' && ses.rol !== 'admin' && ses.rol !== 'medico')) return salida({status:'error',message:'Tu rol no permite esta acción'});

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(cfg.hoja);
    if (!sheet) return salida({status:'error',message:'No existe la hoja ' + cfg.hoja});
    asegurarColumnasEntidad_(sheet,cfg);
    var id = String(p[cfg.id] || p.id || '').trim();
    // Validación en servidor: una consulta nunca debe quedar asociada a un paciente inexistente.
    if (m[2] === 'Consulta') {
      var pacientesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('pacientes');
      if (op === 'delete' || op === 'update') {
        var existingConsultRow = buscarFilaPorClave_(sheet, cfg.id, id);
        if (existingConsultRow < 0) return salida({status:'error',message:'No se encontró la consulta ' + id});
        var existingConsult = leerHoja(sheet).filter(function(c){return String(c.Id_consulta||'')===id;})[0];
        if (existingConsult && existingConsult.Id_pacientes) validarPacienteEnArea_(existingConsult.Id_pacientes, p.area || 'general', ses);
      }
      if (op !== 'delete') {
        var pacienteId = String(p.Id_pacientes || '').trim();
        if (!pacienteId || !pacientesSheet || buscarFila(pacientesSheet, pacienteId) < 0) {
          return salida({status:'error',message:'No se guardó la consulta: selecciona un paciente existente.'});
        }
        validarPacienteEnArea_(pacienteId, p.area || 'general', ses);
      }
    }
    if (m[2] === 'Paciente') {
      p.Area_Registro = 'general';
      if (op !== 'delete') normalizarYValidarPaciente_(p);
      if (op === 'delete') verificarPacienteSinRegistros_(id);
      if (op === 'create') validarPacienteNuevoEnArea_(p,p.area||'general');
      else if (op === 'update' || op === 'delete') validarPacienteEnArea_(id,p.area||'general',ses);
      if (op === 'update') validarPacienteNuevoEnArea_(p,p.area||'general');
    }
    if (op === 'create') {
      if (m[2] === 'Consulta') {
        // Folio secuencial de consultas.
        id = siguienteId(columnaIds(sheet),'CON-');
      } else if (!id || buscarFila(sheet,id) > 0) {
        if (m[2] !== 'Paciente') return salida({status:'error',message:'La clave o folio está vacío o ya existe: ' + id});
        id = siguienteId(columnaIds(sheet),'PAC-');
      }
      p[cfg.id] = id;
      sheet.appendRow(armarFilaPorEncabezados_(sheet,cfg,p,id));
    } else {
      if (!id) return salida({status:'error',message:'Falta el identificador del registro'});
      var fila = buscarFilaPorClave_(sheet,cfg.id,id);
      if (fila < 0) return salida({status:'error',message:'No se encontró el registro ' + id});
      if (op === 'update') { var filaActual=sheet.getRange(fila,1,1,sheet.getLastColumn()).getValues()[0]; sheet.getRange(fila,1,1,sheet.getLastColumn()).setValues([armarFilaPorEncabezados_(sheet,cfg,p,id,filaActual)]); }
      else { sheet.deleteRow(fila); if (m[2] === 'Paciente') eliminarAntecedentesDePaciente_(id); }
    }
    limpiarCache();
    bitacora(ses.usuario,p.action,id);
    return salida({status:'success',id:id});
  } catch (err) {
    return salida({status:'error',message:String(err.message || err)});
  } finally { try { lock.releaseLock(); } catch (x) {} }
}

/* ------------------------- ANTECEDENTES CLÍNICOS ------------------------- */
var ANTECEDENTES_KEYS_ = ['historialPeso','dietasPrevias','recordatorio24h','frecuenciaConsumo','digestivo','laboratorio','suplementos','entorno'];
var ANTECEDENTES_ESTADOS_ = ['Niega','Desconoce','No interrogado','Con antecedente'];
function hojaAntecedentes_(crear) {
  var ss=SpreadsheetApp.getActiveSpreadsheet(), sh=ss.getSheetByName('antecedentes');
  if (!sh && crear) { sh=ss.insertSheet('antecedentes'); sh.appendRow(['Id_pacientes','DatosJSON','ActualizadoEn','ActualizadoPor']); }
  if (sh && sh.getLastRow()===0 && crear) sh.appendRow(['Id_pacientes','DatosJSON','ActualizadoEn','ActualizadoPor']);
  return sh;
}
function validarPacienteAntecedentes_(id) {
  id=String(id||'').trim();
  if (!id || id.length>100) throw new Error('Identificador de paciente no válido.');
  var ss=SpreadsheetApp.getActiveSpreadsheet(), sh=ss.getSheetByName('pacientes');
  if (!sh || buscarFila(sh,id)<0) throw new Error('El paciente no existe. Selecciona un expediente válido.');
  return id;
}
function obtenerAntecedentes_(id,ses) {
  if (!ses || ROLES.indexOf(ses.rol)<0) throw new Error('Sesión no válida.');
  id=validarPacienteAntecedentes_(id);
  var sh=hojaAntecedentes_(false);
  if (!sh || sh.getLastRow()<2) return {status:'success',record:null};
  var fila=buscarFila(sh,id);
  if (fila<0) return {status:'success',record:null};
  var row=sh.getRange(fila,1,1,4).getValues()[0], datos={};
  try { datos=JSON.parse(String(row[1]||'{}')); } catch(e) { throw new Error('Los antecedentes guardados tienen un formato inválido; solicita revisión técnica.'); }
  return {status:'success',record:{datos:datos,actualizado:row[2] instanceof Date?Utilities.formatDate(row[2],Session.getScriptTimeZone(),'yyyy-MM-dd HH:mm'):String(row[2]||''),por:String(row[3]||'')}};
}
function guardarAntecedentes_(p,ses) {
  if (!ses || ['admin','medico'].indexOf(ses.rol)<0) throw new Error('Tu rol no permite modificar antecedentes clínicos.');
  var id=validarPacienteAntecedentes_(p.Id_pacientes), raw=String(p.datos||'');
  if (!raw || raw.length>60000) throw new Error('Los datos están vacíos o exceden el tamaño permitido.');
  var incoming; try { incoming=JSON.parse(raw); } catch(e) { throw new Error('Los datos del formulario no tienen un formato válido.'); }
  var clean={}, existingSheet=hojaAntecedentes_(false);
  if(existingSheet && existingSheet.getLastRow()>1){var existingRow=buscarFila(existingSheet,id);if(existingRow>0){try{clean=JSON.parse(String(existingSheet.getRange(existingRow,2).getValue()||'{}'))||{};}catch(e){clean={};}}}
  ANTECEDENTES_KEYS_.forEach(function(key){
    var x=incoming[key]||{}, estado=String(x.estado||'No interrogado'), detalle=String(x.detalle||'').trim(), obs=String(x.observaciones||'').trim();
    if (ANTECEDENTES_ESTADOS_.indexOf(estado)<0) throw new Error('Estado clínico no válido en '+key+'.');
    if (detalle.length>3000 || obs.length>2000) throw new Error('Un campo de antecedentes supera el límite permitido.');
    clean[key]={estado:estado,detalle:detalle,observaciones:obs};
  });
  var lock=LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var sh=hojaAntecedentes_(true), fila=buscarFila(sh,id), now=new Date(), timestamp=Utilities.formatDate(now,Session.getScriptTimeZone(),'yyyy-MM-dd HH:mm:ss');
    var row=[id,JSON.stringify(clean),timestamp,String(ses.usuario||'')];
    if (fila>0) sh.getRange(fila,1,1,4).setValues([row]);
    else sh.appendRow(row);
    bitacora(ses.usuario,'antecedentesSave',id);
    return {status:'success',Id_pacientes:id,actualizado:timestamp};
  } finally { try { lock.releaseLock(); } catch(e) {} }
}

/* ------------------------- AGENDA DE CITAS ------------------------- */
var AGENDA_CONFIG_KEY_='NUTRICONSULTORIO_AGENDA_CONFIG_V1';
var AGENDA_CONFIG_KEY_LEGACY_='CONSULTORIOWEB_AGENDA_CONFIG_V1';
function normalizarConfigAgenda_(c) {
  c=c||{}; var inicio=String(c.inicio||'09:00'), fin=String(c.fin||'17:00'), duracion=Number(c.duracion||30);
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(inicio)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(fin)) throw new Error('Las horas de inicio y fin deben tener formato HH:mm.');
  function minutos(h){var a=h.split(':');return Number(a[0])*60+Number(a[1]);}
  if(minutos(fin)<=minutos(inicio)) throw new Error('La hora de fin debe ser posterior a la de inicio.');
  if([10,15,20,30,40,45,60,90,120].indexOf(duracion)<0) throw new Error('La duración de cita no es válida.');
  var dias=Array.isArray(c.dias)?c.dias.map(Number).filter(function(n){return n>=0&&n<=6&&Math.floor(n)===n;}):[1,2,3,4,5];
  dias= dias.filter(function(n,i,a){return a.indexOf(n)===i;}); if(!dias.length) throw new Error('Selecciona al menos un día laborable.');
  var off=Array.isArray(c.noLaborables)?c.noLaborables.map(String):[];
  off=off.filter(function(d){return /^\d{4}-\d{2}-\d{2}$/.test(d)&&!isNaN(new Date(d+'T12:00:00').getTime());}).filter(function(d,i,a){return a.indexOf(d)===i;});
  return {inicio:inicio,fin:fin,duracion:duracion,dias:dias,noLaborables:off};
}
function obtenerConfigAgenda_(){var props=PropertiesService.getScriptProperties(),raw=props.getProperty(AGENDA_CONFIG_KEY_);if(!raw){raw=props.getProperty(AGENDA_CONFIG_KEY_LEGACY_);if(raw)props.setProperty(AGENDA_CONFIG_KEY_,raw);}if(!raw)return normalizarConfigAgenda_({});try{return normalizarConfigAgenda_(JSON.parse(raw));}catch(e){return normalizarConfigAgenda_({});}}
function guardarConfigAgenda_(c){c=c||{};var cfg=normalizarConfigAgenda_(c);PropertiesService.getScriptProperties().setProperty(AGENDA_CONFIG_KEY_,JSON.stringify(cfg));return cfg;}
function normalizarFechaAgenda_(v){if(v instanceof Date)return Utilities.formatDate(v,Session.getScriptTimeZone(),'yyyy-MM-dd');var s=String(v||'').trim();if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)){var a=s.split('/');return a[2]+'-'+a[1].padStart(2,'0')+'-'+a[0].padStart(2,'0');}return s.slice(0,10);}
function normalizarHoraAgenda_(v){if(v instanceof Date)return Utilities.formatDate(v,Session.getScriptTimeZone(),'HH:mm');var s=String(v||'').trim();var m=s.match(/(?:1899-12-30[T ]|T)(\d{2}:\d{2})/);if(m)return m[1];m=s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);if(m)return m[1].padStart(2,'0')+':'+m[2];var n=Number(s);if(s&&isFinite(n)&&n>=0&&n<1){var total=Math.round(n*1440);return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');}return s.slice(0,5);}
function validarHorarioCita_(p){if(String(p.Estado||'Programada')==='Cancelada')return;var cfg=obtenerConfigAgenda_(), fecha=String(p.Fecha||''), hora=normalizarHoraAgenda_(p.Hora);if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha))throw new Error('La fecha de la cita no es válida.');if(cfg.noLaborables.indexOf(fecha)>=0)throw new Error('El día seleccionado está configurado como no laborable.');var a=fecha.split('-'), dia=new Date(Number(a[0]),Number(a[1])-1,Number(a[2])).getDay();if(cfg.dias.indexOf(dia)<0)throw new Error('El consultorio no atiende el día seleccionado.');if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora))throw new Error('Selecciona una hora válida.');function mins(h){var x=h.split(':');return Number(x[0])*60+Number(x[1]);}var m=mins(hora),ini=mins(cfg.inicio),fin=mins(cfg.fin);if(m<ini||m+cfg.duracion>fin||(m-ini)%cfg.duracion!==0)throw new Error('La hora no corresponde a los horarios configurados. Selecciona un horario disponible.');}

var MODULOS_ = {
  agenda: {hoja:'agenda', id:'Id_cita', keys:['Id_cita','Id_pacientes','Fecha','Hora','Motivo','Estado','Notas','ActualizadoPor']},
  mediciones: {hoja:'mediciones', id:'Id_medicion', keys:['Id_medicion','Id_pacientes','Fecha','Peso_kg','Talla_cm','Cintura_cm','Cadera_cm','Grasa_pct','Masa_muscular_kg','Notas','ActualizadoPor']},
  planes: {hoja:'planes_alimentarios', id:'Id_plan', keys:['Id_plan','Id_pacientes','FechaInicio','Objetivo','Kcal','Proteina_g','Carbohidratos_g','Grasas_g','Desayuno','Colacion1','Comida','Colacion2','Cena','Indicaciones','Estado','FechaRevision','ActualizadoPor']}
};
// En módulos clínicos se busca por el identificador propio del registro, nunca por Id_pacientes.
// Esto evita que editar/eliminar una medición o vacuna busque accidentalmente en la columna del paciente.
function asegurarColumnasModulo_(sh,cfg) {
  if (sh.getLastRow()===0) { sh.appendRow(cfg.keys); return; }
  var last=Math.max(1,sh.getLastColumn());
  var headers=sh.getRange(1,1,1,last).getValues()[0].map(function(x){return String(x||'').trim();});
  var missing=cfg.keys.filter(function(k){return headers.indexOf(k)<0;});
  if(missing.length) sh.getRange(1,last+1,1,missing.length).setValues([missing]);
}
function buscarFilaPorClave_(sh,clave,id) {
  if(!sh||sh.getLastRow()<2||sh.getLastColumn()<1)return -1;
  var headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(function(x){return String(x||'').trim();});
  var col=headers.indexOf(clave); if(col<0)return -1;
  var vals=sh.getRange(2,col+1,sh.getLastRow()-1,1).getValues(), target=String(id||'').trim();
  for(var i=0;i<vals.length;i++) if(String(vals[i][0]||'').trim()===target && target!=='') return i+2;
  return -1;
}
function siguienteIdModulo_(sh,cfg,prefijo) {
  if(sh.getLastRow()<2)return siguienteId([],prefijo);
  var col=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(function(x){return String(x||'').trim();}).indexOf(cfg.id);
  var ids=col<0?[]:sh.getRange(2,col+1,sh.getLastRow()-1,1).getValues().map(function(r){return r[0];});
  return siguienteId(ids,prefijo);
}
function filaModuloPorEncabezados_(sh,cfg,data,existingRow) {
  var headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(function(x){return String(x||'').trim();});
  var old=existingRow?sh.getRange(existingRow,1,1,headers.length).getValues()[0]:[];
  return headers.map(function(h,i){
    if(cfg.keys.indexOf(h)>=0) return limpiar(data[h]);
    return existingRow?old[i]:'';
  });
}
function guardarRegistroModulo_(p,ses) {
  if(String(p.modulo||'')!=='agenda') return guardarRegistroModuloInterno_(p,ses);
  var lock=LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    validarHorarioCita_(p);
    var cfg=MODULOS_.agenda, sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(cfg.hoja), id=String(p[cfg.id]||'').trim();
    if(String(p.Estado||'Programada')!=='Cancelada' && sh && sh.getLastRow()>1) {
      var rows=sh.getDataRange().getValues(), headers=rows[0].map(function(x){return String(x||'').trim();});
      var ix={id:headers.indexOf('Id_cita'),fecha:headers.indexOf('Fecha'),hora:headers.indexOf('Hora'),estado:headers.indexOf('Estado')};
      for(var i=1;i<rows.length;i++) {
        var rid=String(rows[i][ix.id]||'').trim(), fecha=normalizarFechaAgenda_(rows[i][ix.fecha]), hora=normalizarHoraAgenda_(rows[i][ix.hora]), estado=String(ix.estado>=0?rows[i][ix.estado]:'Programada');
        if(rid!==id && fecha===String(p.Fecha||'') && hora===normalizarHoraAgenda_(p.Hora) && estado!=='Cancelada') throw new Error('Ese horario ya está ocupado. Selecciona otra hora disponible.');
      }
    }
    return guardarRegistroModuloInterno_(p,ses);
  } finally { try { lock.releaseLock(); } catch(e) {} }
}
function guardarRegistroModuloInterno_(p,ses) {
  var tipo=String(p.modulo||''), cfg=MODULOS_[tipo];
  if(!cfg) throw new Error('Módulo no válido.');
  var ss=SpreadsheetApp.getActiveSpreadsheet(), sh=ss.getSheetByName(cfg.hoja);
  if(!sh) sh=ss.insertSheet(cfg.hoja);
  asegurarColumnasModulo_(sh,cfg);
  var id=String(p[cfg.id]||'').trim();
  // En una actualización, los campos omitidos por el formulario deben conservar
  // su valor actual. Los campos enviados explícitamente como cadena vacía sí se limpian.
  var existingRow = id ? buscarFilaPorClave_(sh,cfg.id,id) : -1;
  var oldValues = {};
  if(existingRow > 0) {
    var headersOld=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(function(x){return String(x||'').trim();});
    var valuesOld=sh.getRange(existingRow,1,1,sh.getLastColumn()).getValues()[0];
    headersOld.forEach(function(h,i){if(h)oldValues[h]=valuesOld[i];});
  }
  var data={}; cfg.keys.forEach(function(k){data[k]=Object.prototype.hasOwnProperty.call(p,k)?p[k]:(Object.prototype.hasOwnProperty.call(oldValues,k)?oldValues[k]:'');});
  var paciente=String(data.Id_pacientes||'').trim();
  if(!paciente || buscarFila(ss.getSheetByName('pacientes'),paciente)<0) throw new Error('Selecciona un paciente existente.');
  validarPacienteEnArea_(paciente, p.area || 'general', ses);
  data[cfg.id]=id||siguienteIdModulo_(sh,cfg,tipo==='agenda'?'CIT-':tipo==='mediciones'?'MED-':'PLA-');
  data.ActualizadoPor=ses.usuario;
  if(tipo==='agenda') {
    if(!data.Fecha || !data.Hora || !data.Motivo) throw new Error('La cita requiere fecha, hora y motivo.');
    if(['Programada','Confirmada','Atendida','Cancelada'].indexOf(String(data.Estado))<0) data.Estado='Programada';
  } else if(tipo==='mediciones') {
    if(!data.Fecha) throw new Error('La medición requiere fecha.');
    var rangos={Peso_kg:[1,400,'peso'],Talla_cm:[30,250,'talla'],Cintura_cm:[20,250,'cintura'],Cadera_cm:[20,250,'cadera'],Grasa_pct:[1,80,'% de grasa'],Masa_muscular_kg:[1,200,'masa muscular']};
    Object.keys(rangos).forEach(function(k){
      var raw=String(data[k]===undefined||data[k]===null?'':data[k]).trim().replace(',','.');
      if(raw===''){ if(k==='Peso_kg') throw new Error('La medición requiere el peso.'); data[k]=''; return; }
      var n=Number(raw), r=rangos[k];
      if(!isFinite(n)||n<r[0]||n>r[1]) throw new Error('Valor fuera de rango en '+r[2]+' ('+r[0]+' a '+r[1]+').');
      data[k]=n;
    });
  } else if(tipo==='planes') {
    if(!data.Objetivo) throw new Error('El plan alimentario requiere un objetivo.');
    var kc=Number(String(data.Kcal===undefined||data.Kcal===null?'':data.Kcal).replace(',','.'));
    if(!isFinite(kc)||kc<300||kc>10000) throw new Error('La energía del plan debe estar entre 300 y 10000 kcal.');
    data.Kcal=kc;
    ['Proteina_g','Carbohidratos_g','Grasas_g'].forEach(function(k){
      var raw=String(data[k]===undefined||data[k]===null?'':data[k]).trim().replace(',','.');
      if(raw===''){data[k]='';return;}
      var n=Number(raw); if(!isFinite(n)||n<0||n>1500) throw new Error('Valor fuera de rango en '+k.replace('_g','').toLowerCase()+' (0 a 1500 g).');
      data[k]=n;
    });
    if(data.FechaRevision && data.FechaInicio && data.FechaRevision<data.FechaInicio) throw new Error('La fecha de revisión no puede ser anterior al inicio.');
    if(['Activo','En revisión','En pausa','Concluido'].indexOf(String(data.Estado))<0) data.Estado='Activo';
  }
  var row=buscarFilaPorClave_(sh,cfg.id,data[cfg.id]);
  if(id) {
    if(row<0) throw new Error('No se encontró el registro para editar ('+cfg.id+': '+id+'). Actualiza los encabezados de la hoja y vuelve a cargar.');
    sh.getRange(row,1,1,sh.getLastColumn()).setValues([filaModuloPorEncabezados_(sh,cfg,data,row)]);
  } else {
    if(row>0) throw new Error('El identificador ya existe.');
    sh.appendRow(filaModuloPorEncabezados_(sh,cfg,data,null));
  }
  limpiarCache(); bitacora(ses.usuario,tipo+'Save',data[cfg.id]);
  return {status:'success',id:data[cfg.id],modulo:tipo};
}
/**
 * Devuelve las mediciones o planes alimentarios de un único paciente.
 * La lectura se realiza desde la hoja propia del módulo y filtra por Id_pacientes.
 * No depende de la caché general, que deliberadamente no incluye estos registros.
 */
function obtenerRegistrosPaciente_(modulo,idPaciente) {
  var tipo=String(modulo||'').trim();
  if(['mediciones','planes'].indexOf(tipo)<0) throw new Error('Módulo no válido.');
  var id=String(idPaciente||'').trim();
  if(!id) return [];
  var cfg=MODULOS_[tipo];
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName(cfg.hoja);
  if(!sh) {
    sh=ss.insertSheet(cfg.hoja);
    sh.getRange(1,1,1,cfg.keys.length).setValues([cfg.keys]);
    return [];
  }
  asegurarColumnasModulo_(sh,cfg);
  if(sh.getLastRow()<2) return [];
  var headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(function(x){return String(x||'').trim();});
  var patientCol=headers.indexOf('Id_pacientes');
  if(patientCol<0) throw new Error('La hoja '+cfg.hoja+' no contiene la columna Id_pacientes.');
  var rows=sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).getValues();
  var tz=Session.getScriptTimeZone(),out=[];
  rows.forEach(function(row){
    if(String(row[patientCol]||'').trim()!==id) return;
    var obj={};
    headers.forEach(function(h,i){
      if(!h) return;
      var value=row[i];
      if(value instanceof Date) {
        if(h==='Fecha' || h==='FechaInicio' || h==='FechaRevision') value=Utilities.formatDate(value,tz,'yyyy-MM-dd');
        else value=Utilities.formatDate(value,tz,'yyyy-MM-dd');
      }
      obj[h]=value;
    });
    out.push(obj);
  });
  out.sort(function(a,b){
    var da=String(a.Fecha||a.FechaInicio||''),db=String(b.Fecha||b.FechaInicio||'');
    return db.localeCompare(da);
  });
  return out;
}

function borrarRegistroModulo_(p,ses) {
  var tipo=String(p.modulo||''),cfg=MODULOS_[tipo]; if(!cfg) throw new Error('Módulo no válido.');
  if(ses.rol!=='admin' && ses.rol!=='medico') throw new Error('Tu rol no permite eliminar registros de estos módulos.');
  var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(cfg.hoja), id=String(p.id||'');
  if(!sh) throw new Error('No existe la hoja.'); var row=buscarFilaPorClave_(sh,cfg.id,id); if(row<0) throw new Error('No se encontró el registro ('+cfg.id+': '+id+').');
  var headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(function(x){return String(x||'').trim();}), vals=sh.getRange(row,1,1,sh.getLastColumn()).getValues()[0], ip=headers.indexOf('Id_pacientes');
  if(ip>=0) validarPacienteEnArea_(vals[ip],p.area||'general',ses);
  sh.deleteRow(row); limpiarCache(); bitacora(ses.usuario,tipo+'Delete',id); return {status:'success'};
}

function datosPorArea_(area,ses){
  area=String(area||'general').toLowerCase();
  if(area!=='general' || !usuarioPuedeArea_(ses,'general')) throw new Error('Tu cuenta no tiene acceso al área solicitada.');
  var ss=SpreadsheetApp.getActiveSpreadsheet(), patientSheet=ss.getSheetByName('pacientes');
  var hdrCache=CacheService.getScriptCache();
  if(patientSheet && patientSheet.getLastRow()>0 && !hdrCache.get('hdr_area_ok')){
    var headers=patientSheet.getRange(1,1,1,patientSheet.getLastColumn()).getValues()[0].map(function(x){return String(x||'').trim();});
    if(headers.indexOf('Area_Registro')<0) patientSheet.getRange(1,headers.length+1).setValue('Area_Registro');
    try { hdrCache.put('hdr_area_ok','1',21600); } catch(e) {}
  }
  var raw=JSON.parse(datosJson()), patientKeys=['Id_pacientes','Fecha','Nombre','Primer_apellido','Segundo_Apellido','edad','Sexo','Fecha_Nacimiento','Telefono','Email','Calle','N','Colonia','Ciudad','Area_Registro','Tipo_Expediente','Tutor_Nombre','Tutor_Parentesco','Tutor_Telefono','Tutor_Email','Contacto_Emergencia','Ocupacion','Consentimiento_Fecha','Motivo_Consulta','Objetivo_Nutricional','Patologias_Medicamentos','Antecedentes_Familiares','Alergias_Intolerancias','Habitos_Alimentarios','Actividad_Sueno'];
  var sessionKeys=['Id_consulta','Id_pacientes','Fecha','Modalidad','Tipo_consulta','Acompanante_Consulta','Sintomas','Exploracion_Fisica','Diagnostico','Plan_Clinico'];
  function pick(row,keys){var out={};keys.forEach(function(k){if(Object.prototype.hasOwnProperty.call(row,k))out[k]=row[k];});return out;}
  raw.pacientes=(raw.pacientes||[]).filter(esExpedienteDelArea_).map(function(p){
    p.Area_Registro='general';return pick(p,patientKeys);
  });
  var ids={};raw.pacientes.forEach(function(p){ids[String(p.Id_pacientes||'')]=true;});
  raw.consultas=(raw.consultas||[]).filter(function(c){return !!ids[String(c.Id_pacientes||'')];}).map(function(c){return pick(c,sessionKeys);});
  raw.agenda=(raw.agenda||[]).filter(function(x){return !!ids[String(x.Id_pacientes||'')];});
  raw.agenda=(raw.agenda||[]).map(function(x){return pick(x,['Id_cita','Id_pacientes','Fecha','Hora','Motivo','Estado','Notas','ActualizadoPor']);});
  raw.mediciones=[];raw.planes=[];
  return raw;
}
function validarPacienteEnArea_(id,area,ses){
  if(String(area||'general').toLowerCase()!=='general' || !usuarioPuedeArea_(ses,'general')) throw new Error('Tu cuenta no tiene acceso al área solicitada.');
  var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('pacientes'), fila=sh?buscarFila(sh,String(id||'')):-1;
  if(fila<0) throw new Error('El paciente no pertenece al área de trabajo autorizada.');
  var headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(function(x){return aliasEncabezado_('pacientes',String(x||'').trim());});
  var vals=sh.getRange(fila,1,1,sh.getLastColumn()).getValues()[0], rec={};
  headers.forEach(function(h,i){if(h)rec[h]=vals[i];});
  if(!esExpedienteDelArea_(rec)) throw new Error('El paciente no pertenece al área de trabajo autorizada.');
}
function esExpedienteDelArea_(p){
  var tipo=String(p.Tipo_Expediente||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  if(['adulto','nino','nina','adolescente'].indexOf(tipo)>=0)return true;
  return ['Motivo_Consulta','Objetivo_Nutricional','Patologias_Medicamentos','Antecedentes_Familiares','Alergias_Intolerancias','Habitos_Alimentarios','Actividad_Sueno'].some(function(k){return String(p[k]||'').trim()!=='';});
}
function validarConsultaEnArea_(idConsulta,area,ses){var ss=SpreadsheetApp.getActiveSpreadsheet(),sh=ss.getSheetByName('consultas'),row=sh?buscarFilaPorClave_(sh,'Id_consulta',String(idConsulta||'')):-1;if(row<0)throw new Error('No se encontró la consulta.');var data=leerHoja(sh),rec=data.filter(function(c){return String(c.Id_consulta||'')===String(idConsulta||'');})[0];if(!rec)throw new Error('No se encontró la consulta.');validarPacienteEnArea_(rec.Id_pacientes,area,ses);}
/**
 * Clasifica el expediente según la fecha de nacimiento cuando el tipo viene vacío
 * (menor de 12: Niño, 12 a 17: Adolescente, 18 o más: Adulto). Sin este valor, un
 * expediente sin información clínica quedaría fuera del filtro del área de trabajo.
 */
function normalizarYValidarPaciente_(p) {
  p.Nombre=String(p.Nombre||'').trim(); p.Primer_apellido=String(p.Primer_apellido||'').trim();
  if(!p.Nombre) throw new Error('El nombre del paciente es obligatorio.');
  if(!p.Primer_apellido) throw new Error('El primer apellido es obligatorio.');
  var email=String(p.Email||'').trim(), emailTutor=String(p.Tutor_Email||'').trim(), re=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if(email && !re.test(email)) throw new Error('El correo electrónico no es válido.');
  if(emailTutor && !re.test(emailTutor)) throw new Error('El correo del tutor no es válido.');
  var nac=String(p.Fecha_Nacimiento||'').trim().slice(0,10), edad=null;
  if(nac){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(nac) || isNaN(new Date(nac+'T12:00:00').getTime())) throw new Error('La fecha de nacimiento no es válida.');
    var hoy=new Date(), b=new Date(nac+'T12:00:00');
    if(b>hoy) throw new Error('La fecha de nacimiento no puede estar en el futuro.');
    edad=hoy.getFullYear()-b.getFullYear();
    if(hoy.getMonth()<b.getMonth()||(hoy.getMonth()===b.getMonth()&&hoy.getDate()<b.getDate())) edad--;
  }
  var tipo=String(p.Tipo_Expediente||'').trim(), validos=['Adulto','Niño','Adolescente'];
  if(tipo && validos.indexOf(tipo)<0){
    var t=tipo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    tipo=t==='nino'||t==='nina'?'Niño':t==='adolescente'?'Adolescente':t==='adulto'?'Adulto':'';
  }
  if(!tipo) tipo=edad===null?'Adulto':edad<12?'Niño':edad<18?'Adolescente':'Adulto';
  p.Tipo_Expediente=tipo;
}
function contarRegistrosDePaciente_(id) {
  var ss=SpreadsheetApp.getActiveSpreadsheet(), out={sesiones:0,citas:0,mediciones:0,planes:0};
  var mapa={sesiones:'consultas',citas:'agenda',mediciones:'mediciones',planes:'planes_alimentarios'};
  Object.keys(mapa).forEach(function(k){
    var sh=ss.getSheetByName(mapa[k]); if(!sh||sh.getLastRow()<2) return;
    var headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(function(x){return String(x||'').trim();});
    var col=headers.indexOf('Id_pacientes'); if(col<0) return;
    sh.getRange(2,col+1,sh.getLastRow()-1,1).getValues().forEach(function(r){if(String(r[0]||'').trim()===id)out[k]++;});
  });
  return out;
}
/** Un expediente con historial no se elimina: evita consultas, citas o mediciones huérfanas. */
function verificarPacienteSinRegistros_(id) {
  var c=contarRegistrosDePaciente_(String(id||'').trim()), partes=[];
  if(c.sesiones) partes.push(c.sesiones+' consulta(s)'); if(c.citas) partes.push(c.citas+' cita(s)');
  if(c.mediciones) partes.push(c.mediciones+' medición(es)'); if(c.planes) partes.push(c.planes+' plan(es) alimentario(s)');
  if(partes.length) throw new Error('No se puede eliminar el expediente porque tiene '+partes.join(', ')+'. Elimina primero esos registros o conserva el expediente para no perder el historial.');
}
function eliminarAntecedentesDePaciente_(id) {
  try { var sh=hojaAntecedentes_(false); if(!sh||sh.getLastRow()<2) return; var fila=buscarFila(sh,id); if(fila>0) sh.deleteRow(fila); } catch(e) {}
}
function validarPacienteNuevoEnArea_(p,area){var requested='general';var stored=String(p.Area_Registro||requested).toLowerCase();if(stored!==requested)throw new Error('El expediente debe guardarse en el área de trabajo seleccionada.');}


/* ------------------------- DATOS ------------------------- */
function datosJson() {
  var json = leerCache();
  if (!json) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var pacientes = leerHoja(ss.getSheetByName('pacientes'));
    json = JSON.stringify({pacientes:pacientes,consultas:leerHoja(ss.getSheetByName('consultas')),agenda:leerHoja(ss.getSheetByName('agenda')),siguienteIdPaciente:siguienteId(pacientes.map(function(p){return p.Id_pacientes;}),'PAC-')});
    guardarCache(json);
  }
  return json;
}
function leerParams(e) {
  var raw = e && e.postData && e.postData.contents;
  if (raw) { try { return JSON.parse(raw); } catch (x) {} }
  return (e && e.parameter) || {};
}
function salida(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function normalizarEncabezado_(valor) { return String(valor||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,''); }
function aliasEncabezado_(hoja, encabezado) {
  var n=normalizarEncabezado_(encabezado), aliases={
    pacientes:{idpaciente:'Id_pacientes',idexpediente:'Id_pacientes',primerapellido:'Primer_apellido',segundoapellido:'Segundo_Apellido',fechaalta:'Fecha',fechadealta:'Fecha',edadanos:'edad',edad:'edad',fechanacimiento:'Fecha_Nacimiento',fechadenacimiento:'Fecha_Nacimiento',nacimiento:'Fecha_Nacimiento',telefonotutor:'Tutor_Telefono',telefonodeltutor:'Tutor_Telefono',telefonoacudiente:'Tutor_Telefono',tutor:'Tutor_Nombre',nombredeltutor:'Tutor_Nombre',madrepadretutor:'Tutor_Nombre',parentesco:'Tutor_Parentesco',parentescodeltutor:'Tutor_Parentesco',correodeltutor:'Tutor_Email',lugardenacimiento:'Lugar_Nacimiento',gruposanguineo:'Tipo_Sangre',edadgestacional:'Edad_Gestacional_Semanas',edadgestacionalalsemanas:'Edad_Gestacional_Semanas',pesonacer:'Peso_Al_Nacer',pesoalnacer:'Peso_Al_Nacer',tallaalnacer:'Talla_Al_Nacer',longitudalnacer:'Talla_Al_Nacer',antecedentesperinatales:'Antecedentes_Perinatales'},
    consultas:{idconsulta:'Id_consulta',folio:'Id_consulta',pacienteid:'Id_pacientes',idpaciente:'Id_pacientes',fecha:'Fecha',modalidadclinica:'Modalidad',tipodeconsulta:'Tipo_consulta',acompanante:'Acompanante_Consulta',acompananteyparentesco:'Acompanante_Consulta',exploracionclinica:'Exploracion_Fisica',observacionesclinicas:'Exploracion_Fisica',motivotemas:'Sintomas',motivotemasabordados:'Sintomas',impresionclinica:'Diagnostico',diagnostico:'Diagnostico',plan:'Plan_Clinico',intervenciones:'Plan_Clinico'}
  };
  return (aliases[hoja]&&aliases[hoja][n]) || encabezado;
}
function asegurarColumnasEntidad_(sheet,cfg) {
  if (!sheet) throw new Error('No existe la hoja ' + cfg.hoja);
  if (sheet.getLastRow() === 0) { sheet.appendRow(cfg.claves); return; }
  var last=Math.max(1,sheet.getLastColumn()), raw=sheet.getRange(1,1,1,last).getValues()[0], headers=raw.map(function(x){return String(x||'').trim();});
  // Reutiliza encabezados equivalentes (p. ej. "Primer apellido") en vez de crear columnas duplicadas al final.
  var exact={}; headers.forEach(function(h){if(h)exact[h]=true;});
  var changed=false;
  for(var i=0;i<headers.length;i++){
    var canon=aliasEncabezado_(cfg.hoja,headers[i]);
    if(canon!==headers[i] && cfg.claves.indexOf(canon)>=0 && !exact[canon]){headers[i]=canon;exact[canon]=true;changed=true;}
  }
  if(changed) sheet.getRange(1,1,1,headers.length).setValues([headers]);
  var faltantes=cfg.claves.filter(function(k){return headers.indexOf(k)<0;});
  if(faltantes.length) sheet.getRange(1,headers.length+1,1,faltantes.length).setValues([faltantes]);
}
function armarFila(cfg,p,id) { return cfg.claves.map(function(k){return limpiar(k === cfg.id ? id : p[k]);}); }
function armarFilaPorEncabezados_(sheet,cfg,p,id,existingRow) {
  var headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(function(x){return String(x||'').trim();});
  var valores={};
  cfg.claves.forEach(function(k){
    if(k===cfg.id) valores[k]=id;
    else if(Object.prototype.hasOwnProperty.call(p,k)) valores[k]=p[k];
    else if(existingRow){
      var oldIndex=-1;
      for(var oi=0;oi<headers.length;oi++) if(aliasEncabezado_(cfg.hoja,headers[oi])===k){oldIndex=oi;break;}
      valores[k]=oldIndex>=0?existingRow[oldIndex]:'';
    } else valores[k]='';
  });
  return headers.map(function(h,i){
    var canon=aliasEncabezado_(cfg.hoja,h);
    if(Object.prototype.hasOwnProperty.call(valores,canon)) return limpiar(valores[canon]);
    if(Object.prototype.hasOwnProperty.call(p,h)) return limpiar(p[h]);
    return existingRow && i<existingRow.length ? existingRow[i] : '';
  });
}
function limpiar(v) {
  v = (v === undefined || v === null) ? '' : String(v);
  return (/^[=+\-@]/.test(v) && isNaN(v)) ? "'" + v : v;
}
function leerHoja(sheet) {
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var tz = Session.getScriptTimeZone(), headers = data[0], out = [], nombreHoja=String(sheet.getName()||'').toLowerCase();
  for (var i=1;i<data.length;i++) {
    // No descartes una fila solo porque la primera columna esté vacía: hojas heredadas pueden tener el ID en otra columna.
    if (!data[i].some(function(c){return c!=='' && c!==null;})) continue;
    var obj = {};
    for (var j=0;j<headers.length;j++) {
      var h=aliasEncabezado_(nombreHoja,String(headers[j]||'')), c=data[i][j];
      if (c instanceof Date) {
        // Sheets almacena las horas como objetos Date anclados a 1899-12-30.
        // Si se serializan como yyyy-MM-dd, la interfaz muestra esa fecha ficticia
        // y el input type=time no puede rellenarse. Serializar cada campo por tipo.
        if (h === 'Hora') obj[h] = Utilities.formatDate(c,tz,'HH:mm');
        else if (/^(Fecha|FechaSolicitud|FechaResultado)$/.test(h)) obj[h] = Utilities.formatDate(c,tz,'yyyy-MM-dd');
        else obj[h] = Utilities.formatDate(c,tz,'yyyy-MM-dd');
      } else obj[h] = c;
    }
    out.push(obj);
  }
  return out;
}
function indiceColumnaId_(sheet) {
  if(!sheet||sheet.getLastColumn()<1)return 0;
  var nombre=String(sheet.getName?sheet.getName():'').trim().toLowerCase();
  var headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(function(x){return String(x||'').trim();});
  // El identificador depende de la entidad. No usar una prioridad global: las hojas
  var porHoja={
    pacientes:'Id_pacientes', antecedentes:'Id_pacientes',
    consultas:'Id_consulta', agenda:'Id_cita'
  };
  var esperado=porHoja[nombre];
  if(esperado){
    var exacto=headers.indexOf(esperado);
    if(exacto>=0)return exacto;
    for(var a=0;a<headers.length;a++)if(aliasEncabezado_(nombre,headers[a])===esperado)return a;
  }
  // Para hojas no conocidas, preferir un ID propio de registro antes que el del paciente.
  var preferidos=['Id_consulta','Id_cita','Id_medicion','Id_plan','Id_pacientes'];
  for(var i=0;i<preferidos.length;i++){var ix=headers.indexOf(preferidos[i]);if(ix>=0)return ix;}
  for(var k=0;k<headers.length;k++){var canon=aliasEncabezado_(nombre,headers[k]);if(preferidos.indexOf(canon)>=0)return k;}
  for(var j=0;j<headers.length;j++)if(/^Id_/.test(headers[j]))return j;
  return 0;
}
function columnaIds(sheet) { var n=sheet.getLastRow(); if(n<2)return [];var col=indiceColumnaId_(sheet)+1;return sheet.getRange(2,col,n-1,1).getValues().map(function(r){return r[0];}); }
function buscarFila(sheet,id) { var n=sheet.getLastRow();if(n<2)return -1;var col=indiceColumnaId_(sheet)+1,vals=sheet.getRange(2,col,n-1,1).getValues(),buscado=String(id).trim();for(var i=0;i<vals.length;i++)if(String(vals[i][0]).trim()===buscado)return i+2;return -1; }
function siguienteId(ids,prefijo) { var max=0; (ids||[]).forEach(function(v){var m=String(v).match(/\d+/);if(m&&+m[0]>max)max=+m[0];});return prefijo+('0000'+(max+1)).slice(-4); }

/* ------------------------- CACHÉ ------------------------- */
function leerCache() {
  var c=CacheService.getScriptCache(), n=parseInt(c.get('d_n'),10); if(!n)return null;
  var keys=[],i;for(i=0;i<n;i++)keys.push('d_'+i);var parts=c.getAll(keys),s='';
  for(i=0;i<n;i++){if(parts['d_'+i]==null)return null;s+=parts['d_'+i];}return s;
}
function guardarCache(s) {
  try { var c=CacheService.getScriptCache(),o={},n=Math.ceil(s.length/CHUNK);for(var i=0;i<n;i++)o['d_'+i]=s.substr(i*CHUNK,CHUNK);o.d_n=String(n);c.putAll(o,CACHE_TTL); } catch(e) {}
}
function limpiarCache() { var c=CacheService.getScriptCache(),n=parseInt(c.get('d_n'),10)||0,keys=['d_n'];for(var i=0;i<n;i++)keys.push('d_'+i);c.removeAll(keys); }
function onEdit() { limpiarCache(); }

/* ------------------------- AUTENTICACIÓN ------------------------- */
function iniciarSesion(p) {
  var u=String(p.usuario||'').trim().toLowerCase(), c=CacheService.getScriptCache(), kf='f_'+u;
  if(!u||!p.clave)return {status:'error',message:'Escribe usuario y contraseña'};
  if((parseInt(c.get(kf),10)||0)>=5)return {status:'error',message:'Demasiados intentos. Espera 10 minutos.'};
  var hoja=hojaUsuarios_(false), d=hoja?hoja.getDataRange().getValues():[], ia=hoja?indiceUsuario_(hoja,'Areas'):-1, isu=hoja?indiceUsuario_(hoja,'Superusuario'):-1;
  for(var i=1;i<d.length;i++){
    if(String(d[i][0]).trim().toLowerCase()!==u)continue;
    if(String(d[i][4]).toUpperCase()!=='NO' && ROLES.indexOf(String(d[i][3]))>=0 && hash(String(d[i][1]),String(p.clave))===String(d[i][2])){
      c.remove(kf);var token=Utilities.getUuid()+Utilities.getUuid();
      var superusuario=String(isu>=0?d[i][isu]||'':'').toUpperCase()==='SI';
      var areas=['general'];
      var ses={usuario:String(d[i][0]),rol:String(d[i][3]),nombre:String(d[i][5]||d[i][0]),areas:areas,superusuario:superusuario};
      c.put('s_'+token,JSON.stringify(ses),SESION_TTL);bitacora(ses.usuario,'login','');
      return {status:'success',token:token,rol:ses.rol,usuario:ses.usuario,nombre:ses.nombre,areas:areas,superusuario:superusuario};
    }
    break;
  }
  c.put(kf,String((parseInt(c.get(kf),10)||0)+1),600);
  bitacora(u,'loginFallido','');
  return {status:'error',message:'Usuario o contraseña incorrectos'};
}
function validarSesion(token) {
  if(!token)return null;
  var c=CacheService.getScriptCache(),raw=c.get('s_'+token);if(!raw)return null;
  var ses=JSON.parse(raw);
  // Refresca áreas y privilegio de superusuario desde la hoja para evitar sesiones antiguas.
  // Para no leer la hoja de usuarios en cada petición, se reutiliza el último valor leído
  // durante 2 minutos; guardar o cambiar un usuario invalida esta copia al instante.
  var ref=null, refKey='uref_'+String(ses.usuario||'').trim().toLowerCase();
  try { var rc=c.get(refKey); if(rc)ref=JSON.parse(rc); } catch(e) { ref=null; }
  if(ref){ ses.areas=ref.areas; ses.superusuario=!!ref.superusuario; }
  else try {
    var h=hojaUsuarios_(false);
    if(h && h.getLastRow()>1){
      var d=h.getDataRange().getValues(), ia=indiceUsuario_(h,'Areas'), isu=indiceUsuario_(h,'Superusuario');
      for(var i=1;i<d.length;i++){
        if(String(d[i][0]||'').trim().toLowerCase()===String(ses.usuario||'').trim().toLowerCase()){
          ses.areas=normalizarAreas_(ia>=0?d[i][ia]:'general');
          ses.superusuario=String(isu>=0?d[i][isu]||'':'').trim().toUpperCase()==='SI';
          try { c.put(refKey,JSON.stringify({areas:ses.areas,superusuario:ses.superusuario}),120); } catch(e2) {}
          break;
        }
      }
    }
  } catch(e) {}
  c.put('s_'+token,JSON.stringify(ses),SESION_TTL);
  return ses;
}
function hash(sal,clave) { var b=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,sal+':'+clave,Utilities.Charset.UTF_8);return b.map(function(x){return ('0'+(x<0?x+256:x).toString(16)).slice(-2);}).join(''); }

/* ------------------------- ADMINISTRACIÓN SEGURA DE USUARIOS ------------------------- */
function hojaUsuarios_(crear) {
  var ss=SpreadsheetApp.getActiveSpreadsheet(), h=ss.getSheetByName('usuarios');
  if(!h && crear){h=ss.insertSheet('usuarios');h.appendRow(['Usuario','Sal','Hash','Rol','Activo','Nombre','Correo','Areas','Superusuario']);}
  if(h && h.getLastRow()===0)h.appendRow(['Usuario','Sal','Hash','Rol','Activo','Nombre','Correo','Areas','Superusuario']);
  if(h){asegurarColumnaUsuario_(h,'Correo');asegurarColumnaUsuario_(h,'Areas');asegurarColumnaUsuario_(h,'Superusuario');}
  return h;
}
/** Devuelve el número de columna (base 1) de "Correo", creándola si no existe. */
function columnaCorreo_(h){return asegurarColumnaUsuario_(h,'Correo');}
function asegurarColumnaUsuario_(h,nombre){var last=Math.max(h.getLastColumn(),1),headers=h.getRange(1,1,1,last).getValues()[0];for(var i=0;i<headers.length;i++)if(String(headers[i]||'').trim().toLowerCase()===nombre.toLowerCase())return i+1;h.getRange(1,last+1).setValue(nombre);return last+1;}
function indiceUsuario_(h,nombre){var headers=h.getRange(1,1,1,Math.max(1,h.getLastColumn())).getValues()[0];for(var i=0;i<headers.length;i++)if(String(headers[i]||'').trim().toLowerCase()===nombre.toLowerCase())return i;return -1;}
function normalizarAreas_(areas){return ['general'];}
function usuarioPuedeArea_(ses,area){if(!ses)return false;return String(area||'general').toLowerCase()==='general';}
function listarUsuariosPublicos() {
  var h=hojaUsuarios_(false);if(!h||h.getLastRow()<2)return [];
  var d=h.getDataRange().getValues(),out=[],ic=indiceUsuario_(h,'Correo'),ia=indiceUsuario_(h,'Areas'),isu=indiceUsuario_(h,'Superusuario');
  for(var i=1;i<d.length;i++) if(String(d[i][0]||'').trim()) out.push({usuario:String(d[i][0]),rol:String(d[i][3]||'lectura'),activo:String(d[i][4]).toUpperCase()!=='NO',nombre:String(d[i][5]||d[i][0]),correo:String(ic>=0?d[i][ic]||'':''),areas:['general'],superusuario:String(isu>=0?d[i][isu]||'':'').toUpperCase()==='SI'});
  return out;
}
function guardarUsuarioDesdePanel(p,ses) {
  try { CacheService.getScriptCache().remove('uref_'+String(p.usuario||'').trim().toLowerCase()); } catch(e) {}
  var usuario=String(p.usuario||'').trim().toLowerCase(), clave=String(p.clave||''), rol=String(p.rol||''), nombre=String(p.nombre||'').trim(), correo=String(p.correo||'').trim().toLowerCase(), activo=String(p.activo||'SI').toUpperCase()==='NO'?'NO':'SI';
  if(!usuario || !/^[a-z0-9._-]{3,40}$/.test(usuario))throw new Error('El usuario debe tener 3 a 40 caracteres: letras, números, punto, guion o guion bajo.');
  if(ROLES.indexOf(rol)<0)throw new Error('Rol inválido.');
  if(!nombre)throw new Error('Escribe el nombre visible.');
  if(!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))throw new Error('Escribe un correo válido para recuperación.');
  var h=hojaUsuarios_(true), d=h.getDataRange().getValues(), fila=-1, ia=indiceUsuario_(h,'Areas'), isu=indiceUsuario_(h,'Superusuario'), ic=indiceUsuario_(h,'Correo');
  for(var i=1;i<d.length;i++)if(String(d[i][0]).trim().toLowerCase()===usuario){fila=i+1;break;}
  if(fila<0 && clave.length<12)throw new Error('La contraseña debe tener al menos 12 caracteres.');
  if(fila>0 && clave && clave.length<12)throw new Error('La nueva contraseña debe tener al menos 12 caracteres.');
  var oldRole=fila>0?String(d[fila-1][3]):'', oldActive=fila>0?String(d[fila-1][4]).toUpperCase()!=='NO':false;
  if(fila>0 && oldRole==='admin' && oldActive && (rol!=='admin' || activo==='NO') && contarAdminsActivos_(h)<=1)throw new Error('No puedes desactivar o cambiar el rol del último administrador activo.');
  var areas, superusuario;
  if(ses.superusuario===true){areas=['general'];superusuario=String(p.superusuario||'NO').toUpperCase()==='SI';}
  else {areas=['general'];superusuario=fila>0&&isu>=0&&String(d[fila-1][isu]||'').toUpperCase()==='SI';}
  if(fila<0){var salt=Utilities.getUuid(), record=new Array(h.getLastColumn()).fill('');record[0]=usuario;record[1]=salt;record[2]=hash(salt,clave);record[3]=rol;record[4]=activo;record[5]=nombre;record[ic]=correo;record[ia]=areas.join(',');record[isu]=superusuario?'SI':'NO';h.appendRow(record);}
  else {
    var row=d[fila-1], saltExistente=String(row[1]||''), hashExistente=String(row[2]||'');
    if(clave){saltExistente=Utilities.getUuid();hashExistente=hash(saltExistente,clave);}
    h.getRange(fila,1,1,6).setNumberFormat('@').setValues([[usuario,saltExistente,hashExistente,rol,activo,nombre]]);h.getRange(fila,ic+1).setNumberFormat('@').setValue(correo);h.getRange(fila,ia+1).setValue(areas.join(','));h.getRange(fila,isu+1).setValue(superusuario?'SI':'NO');
  }
  bitacora(ses.usuario,fila<0?'userCreate':'userUpdate',usuario);
  return {status:'success',usuario:usuario};
}
function cambiarEstadoUsuario(p,ses) {
  try { CacheService.getScriptCache().remove('uref_'+String(p.usuario||'').trim().toLowerCase()); } catch(e) {}
  var usuario=String(p.usuario||'').trim().toLowerCase(), activo=String(p.activo||'').toUpperCase()==='SI'?'SI':'NO';
  if(!usuario)throw new Error('Falta el usuario.');
  if(usuario===String(ses.usuario).toLowerCase() && activo==='NO')throw new Error('No puedes desactivar tu propia cuenta mientras tienes sesión iniciada.');
  var h=hojaUsuarios_(false);if(!h)throw new Error('No existe la hoja usuarios.');
  var d=h.getDataRange().getValues(), fila=-1;
  for(var i=1;i<d.length;i++)if(String(d[i][0]).trim().toLowerCase()===usuario){fila=i+1;break;}
  if(fila<0)throw new Error('No se encontró el usuario.');
  var row=d[fila-1], rol=String(row[3]||''), actualmente=String(row[4]).toUpperCase()!=='NO';
  if(rol==='admin' && actualmente && activo==='NO' && contarAdminsActivos_(h)<=1)throw new Error('No puedes desactivar el último administrador activo.');
  h.getRange(fila,5).setNumberFormat('@').setValue(activo);bitacora(ses.usuario,activo==='SI'?'userActivate':'userDeactivate',usuario);
  return {status:'success',usuario:usuario,activo:activo};
}
function contarAdminsActivos_(h) { var d=h.getDataRange().getValues(),n=0;for(var i=1;i<d.length;i++)if(String(d[i][3])==='admin'&&String(d[i][4]).toUpperCase()!=='NO')n++;return n; }

// Ejecuta una sola vez desde el editor después de editar la contraseña temporal.
function crearUsuario(usuario,clave,rol,nombre,correo) {
  usuario=String(usuario||'').trim().toLowerCase();if(!usuario||String(clave).length<12)throw new Error('Usuario requerido y contraseña de mínimo 12 caracteres');
  if(ROLES.indexOf(rol)<0)throw new Error('Rol inválido: '+ROLES.join(', '));
  var h=hojaUsuarios_(true),cc=columnaCorreo_(h),d=h.getDataRange().getValues(),fila=-1;
  for(var i=1;i<d.length;i++)if(String(d[i][0]).trim().toLowerCase()===usuario){fila=i+1;break;}
  var sal=Utilities.getUuid(),record=[usuario,sal,hash(sal,String(clave)),rol,'SI',nombre||usuario];
  while(record.length<cc)record.push('');
  if(correo)record[cc-1]=String(correo).trim().toLowerCase();
  if(fila<0)h.appendRow(record);else {h.getRange(fila,1,1,6).setNumberFormat('@').setValues([record.slice(0,6)]);if(correo)h.getRange(fila,cc).setNumberFormat('@').setValue(String(correo).trim().toLowerCase());}
  bitacora('script','userSetup',usuario);
}
/** Ejecuta UNA vez al instalar: crea las hojas base con sus encabezados (no borra nada si ya existen). */
function prepararHojas() {
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  [ENT.Paciente, ENT.Consulta].forEach(function(cfg){
    var sh=ss.getSheetByName(cfg.hoja)||ss.insertSheet(cfg.hoja);
    asegurarColumnasEntidad_(sh,cfg);
  });
  Object.keys(MODULOS_).forEach(function(k){
    var cfg=MODULOS_[k], sh=ss.getSheetByName(cfg.hoja)||ss.insertSheet(cfg.hoja);
    asegurarColumnasModulo_(sh,cfg);
  });
  limpiarCache();
}
function configurarPrimerUsuario() { crearUsuario('admin','CAMBIA-ESTA-CLAVE','admin','Administrador'); }

/* ------------------------- PREFERENCIAS VISUALES POR USUARIO ------------------------- */
function hojaPreferencias_(crear) {
  var ss=SpreadsheetApp.getActiveSpreadsheet(), h=ss.getSheetByName('preferencias_usuario');
  var headers=['Usuario','Tema','TamanoLetra','TamanoFormulario','Actualizado','InactividadMinutos','Densidad','ColorPrincipal'];
  if(!h && crear) { h=ss.insertSheet('preferencias_usuario'); h.appendRow(headers); }
  if(h && h.getLastRow()===0) h.appendRow(headers);
  if(h) {
    var actual=h.getRange(1,1,1,Math.max(h.getLastColumn(),1)).getValues()[0].map(function(x){return String(x||'').trim();});
    headers.forEach(function(name){if(actual.indexOf(name)<0){var col=h.getLastColumn()+1;h.getRange(1,col).setValue(name);actual.push(name);}});
  }
  return h;
}
function normalizarPreferencias_(p) {
  p=p||{};
  var tema=String(p.tema||'light'), letra=String(p.tamanoLetra||'normal'), formulario=String(p.tamanoFormulario||'normal');
  var inactividad=(p.inactividadMinutos===0 || p.inactividadMinutos==='0') ? 0 : Number(p.inactividadMinutos===undefined || p.inactividadMinutos===null || p.inactividadMinutos==='' ? 60 : p.inactividadMinutos);
  var densidad=String(p.densidad||'normal'), color=String(p.colorPrincipal||'#0f766e');
  if(['light','white','dark','black','blue','violet','forest','rose','sand','contrast','indigo','coral','graphite','sky','midnight','jungle'].indexOf(tema)<0) tema='light';
  if(['normal','large','xlarge'].indexOf(letra)<0) letra='normal';
  if(['normal','large'].indexOf(formulario)<0) formulario='normal';
  if([0,15,30,45,60,90,120].indexOf(inactividad)<0) inactividad=60;
  if(['compact','normal','spacious'].indexOf(densidad)<0) densidad='normal';
  if(!/^#[0-9a-f]{6}$/i.test(color)) color='#0f766e';
  return {tema:tema,tamanoLetra:letra,tamanoFormulario:formulario,inactividadMinutos:inactividad,densidad:densidad,colorPrincipal:color};
}
function obtenerPreferencias_(usuario) {
  var defaults=normalizarPreferencias_({});
  var h=hojaPreferencias_(false); if(!h || h.getLastRow()<2) return defaults;
  var d=h.getDataRange().getValues(), headers=d[0].map(function(x){return String(x||'').trim();}), u=String(usuario||'').trim().toLowerCase();
  var ix={tema:headers.indexOf('Tema'),tamanoLetra:headers.indexOf('TamanoLetra'),tamanoFormulario:headers.indexOf('TamanoFormulario'),inactividadMinutos:headers.indexOf('InactividadMinutos'),densidad:headers.indexOf('Densidad'),colorPrincipal:headers.indexOf('ColorPrincipal')};
  for(var i=1;i<d.length;i++) if(String(d[i][0]||'').trim().toLowerCase()===u) return normalizarPreferencias_({tema:ix.tema>=0?d[i][ix.tema]:'light',tamanoLetra:ix.tamanoLetra>=0?d[i][ix.tamanoLetra]:'normal',tamanoFormulario:ix.tamanoFormulario>=0?d[i][ix.tamanoFormulario]:'normal',inactividadMinutos:ix.inactividadMinutos>=0?d[i][ix.inactividadMinutos]:60,densidad:ix.densidad>=0?d[i][ix.densidad]:'normal',colorPrincipal:ix.colorPrincipal>=0?d[i][ix.colorPrincipal]:'#0f766e'});
  return defaults;
}
function guardarPreferencias_(usuario,p) {
  var u=String(usuario||'').trim().toLowerCase(); if(!u) throw new Error('No se pudo identificar la cuenta.');
  var prefs=normalizarPreferencias_(p), lock=LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var h=hojaPreferencias_(true), d=h.getDataRange().getValues(), headers=d[0].map(function(x){return String(x||'').trim();}), iu=headers.indexOf('Usuario'), fila=-1;
    for(var i=1;i<d.length;i++) if(String(d[i][iu]||'').trim().toLowerCase()===u){fila=i+1;break;}
    var row=fila<0?new Array(h.getLastColumn()).fill(''):h.getRange(fila,1,1,h.getLastColumn()).getValues()[0];
    function put(name,value){var ix=headers.indexOf(name);if(ix>=0)row[ix]=value;}
    put('Usuario',u);put('Tema',prefs.tema);put('TamanoLetra',prefs.tamanoLetra);put('TamanoFormulario',prefs.tamanoFormulario);put('Actualizado',new Date());put('InactividadMinutos',prefs.inactividadMinutos);put('Densidad',prefs.densidad);put('ColorPrincipal',prefs.colorPrincipal);
    if(fila<0)h.appendRow(row);else h.getRange(fila,1,1,row.length).setValues([row]);
    return prefs;
  } finally { try { lock.releaseLock(); } catch(e) {} }
}
function hojaConfigCompartida_(crear){
  var ss=SpreadsheetApp.getActiveSpreadsheet(),h=ss.getSheetByName('configuracion_compartida');
  if(!h&&crear){h=ss.insertSheet('configuracion_compartida');h.appendRow(['Clave','Valor','ActualizadoPor','Actualizado']);}
  if(h&&h.getLastRow()===0)h.appendRow(['Clave','Valor','ActualizadoPor','Actualizado']);
  return h;
}
function obtenerMarcaCompartida_(){
  var out={appName:'NutriConsultorio',name:'CONSULTORIO DE NUTRICIÓN',loginImage:'',logo:''},h=hojaConfigCompartida_(false);if(!h||h.getLastRow()<2)return out;
  var d=h.getDataRange().getValues();for(var i=1;i<d.length;i++){var k=String(d[i][0]||'');if(k==='appName')out.appName=String(d[i][1]||out.appName);if(k==='name')out.name=String(d[i][1]||out.name);if(k==='loginImage'&&String(d[i][1]||'').length<=45000)out.loginImage=String(d[i][1]||'');if(k==='logo'&&String(d[i][1]||'').length<=45000)out.logo=String(d[i][1]||'');}return out;
}
function guardarMarcaCompartida_(brand,ses){
  var h=hojaConfigCompartida_(true),d=h.getDataRange().getValues(),vals={appName:String(brand.appName||'NutriConsultorio').trim().slice(0,80)||'NutriConsultorio',name:String(brand.name||'CONSULTORIO DE NUTRICIÓN').trim().slice(0,120)||'CONSULTORIO DE NUTRICIÓN'};
  if(typeof brand.loginImage==='string' && (brand.loginImage==='' || (brand.loginImage.indexOf('data:image/jpeg;base64,')===0 && brand.loginImage.length<=44000))) vals.loginImage=brand.loginImage;
  if(typeof brand.logo==='string' && (brand.logo==='' || (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/.test(brand.logo) && brand.logo.length<=44000))) vals.logo=brand.logo;
  var lock=LockService.getScriptLock();try{lock.waitLock(10000);Object.keys(vals).forEach(function(k){var row=-1;for(var i=1;i<d.length;i++)if(String(d[i][0]||'')===k){row=i+1;break;}var data=[k,vals[k],String(ses.usuario||''),new Date()];if(row<0)h.appendRow(data);else h.getRange(row,1,1,4).setValues([data]);});}finally{try{lock.releaseLock();}catch(e){}}
  return vals;
}

/* ------------------------- RECUPERACIÓN POR CORREO ------------------------- */
function respuestaGenericaReset_() {
  return {status:'success', message:'Si los datos corresponden a una cuenta activa con correo registrado, recibirás instrucciones.'};
}
function encontrarUsuarioPorIdentificador_(identificador, datos, colCorreo) {
  var ident=String(identificador||'').trim().toLowerCase();
  for(var i=1;i<datos.length;i++) {
    var u=String(datos[i][0]||'').trim().toLowerCase();
    var c=String(datos[i][colCorreo-1]||'').trim().toLowerCase();
    if(u===ident || (c && c===ident)) return {fila:i+1, usuario:u, correo:String(datos[i][colCorreo-1]||'').trim(), activo:String(datos[i][4]||'SI').toUpperCase()!=='NO'};
  }
  return null;
}
function solicitarCodigoRecuperacion_(p) {
  var identificador=String(p.identificador||'').trim().toLowerCase();
  if(!identificador) return {status:'error',message:'Escribe tu usuario o correo.'};
  var cache=CacheService.getScriptCache();
  var rateKey='reset_req_'+hash('cw-reset-rate',identificador);
  if(cache.get(rateKey)) return respuestaGenericaReset_();
  cache.put(rateKey,'1',60);
  var h=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('usuarios');
  if(!h || h.getLastRow()<2) return respuestaGenericaReset_();
  var cc=columnaCorreo_(h), d=h.getDataRange().getValues();
  var rec=encontrarUsuarioPorIdentificador_(identificador,d,cc);
  if(!rec || !rec.activo || !rec.correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rec.correo)) return respuestaGenericaReset_();
  // Código de seis dígitos generado a partir de un UUID de Apps Script.
  var uuid=Utilities.getUuid().replace(/-/g,'').slice(0,12);
  var code=String((parseInt(uuid,16)%900000)+100000);
  var resetKey='reset_'+hash('cw-reset-user',rec.usuario);
  cache.put(resetKey,JSON.stringify({codigoHash:hash(rec.usuario,code),intentos:0}),600);
  try {
    MailApp.sendEmail({to:rec.correo,subject:'Código de recuperación · NutriConsultorio',body:'Se solicitó restablecer la contraseña de tu cuenta de NutriConsultorio.\n\nTu código de verificación es: '+code+'\n\nEl código caduca en 10 minutos y solo puede utilizarse una vez. Si no solicitaste este cambio, ignora este mensaje.'});
    bitacora(rec.usuario,'passwordResetRequest','');
  } catch(err) {
    cache.remove(resetKey);
    return {status:'error',message:'No se pudo enviar el correo. Contacta al administrador del sistema.'};
  }
  return respuestaGenericaReset_();
}
function restablecerConCodigo_(p) {
  var identificador=String(p.identificador||'').trim().toLowerCase();
  var codigo=String(p.codigo||'').trim();
  var nuevaClave=String(p.nuevaClave||'');
  if(!identificador || !/^\d{6}$/.test(codigo)) return {status:'error',message:'Usuario/correo o código no válido.'};
  if(nuevaClave.length<12) return {status:'error',message:'La contraseña debe tener al menos 12 caracteres.'};
  var h=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('usuarios');
  if(!h || h.getLastRow()<2) return {status:'error',message:'No se pudo validar el código. Solicita uno nuevo.'};
  var cc=columnaCorreo_(h), d=h.getDataRange().getValues();
  var rec=encontrarUsuarioPorIdentificador_(identificador,d,cc);
  if(!rec || !rec.activo) return {status:'error',message:'Código vencido o no válido. Solicita uno nuevo.'};
  var cache=CacheService.getScriptCache(), resetKey='reset_'+hash('cw-reset-user',rec.usuario), raw=cache.get(resetKey);
  if(!raw) return {status:'error',message:'El código venció o no existe. Solicita uno nuevo.'};
  var data=JSON.parse(raw);
  if(data.intentos>=5) {cache.remove(resetKey);return {status:'error',message:'Se agotaron los intentos. Solicita un código nuevo.'};}
  if(data.codigoHash!==hash(rec.usuario,codigo)) {
    data.intentos++;
    cache.put(resetKey,JSON.stringify(data),600);
    return {status:'error',message:'Código incorrecto o vencido.'};
  }
  var lock=LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    // Releer fila dentro del bloqueo para evitar sobrescribir cambios concurrentes.
    var fresh=h.getRange(rec.fila,1,1,Math.max(h.getLastColumn(),cc)).getValues()[0];
    if(String(fresh[0]||'').trim().toLowerCase()!==rec.usuario || String(fresh[4]||'SI').toUpperCase()==='NO') {
      cache.remove(resetKey);return {status:'error',message:'No se pudo restablecer la cuenta.'};
    }
    var salt=Utilities.getUuid();
    h.getRange(rec.fila,2).setNumberFormat('@').setValue(salt);
    h.getRange(rec.fila,3).setNumberFormat('@').setValue(hash(salt,nuevaClave));
    cache.remove(resetKey);cache.remove('f_'+rec.usuario);
    bitacora(rec.usuario,'passwordReset','');
    return {status:'success',message:'Contraseña actualizada. Ya puedes iniciar sesión.'};
  } catch(err) {
    return {status:'error',message:'No se pudo actualizar la contraseña. Inténtalo nuevamente.'};
  } finally {try{lock.releaseLock();}catch(e){}}
}

/* ------------------------- BITÁCORA ------------------------- */
function bitacora(usuario,accion,id) {
  try { var ss=SpreadsheetApp.getActiveSpreadsheet(),h=ss.getSheetByName('bitacora')||ss.insertSheet('bitacora');if(h.getLastRow()===0)h.appendRow(['Fecha','Usuario','Acción','Registro']);h.appendRow([new Date(),usuario,accion,id]); } catch(e) {}
}


