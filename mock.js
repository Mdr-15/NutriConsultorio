// Servidor de prueba: sirve el proyecto y simula el backend de Apps Script en memoria.
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=process.argv[2],PORT=Number(process.argv[3]||8099);
const _d=new Date(),today=_d.getFullYear()+'-'+String(_d.getMonth()+1).padStart(2,'0')+'-'+String(_d.getDate()).padStart(2,'0');
const db={pacientes:[
 {Id_pacientes:'PAC-0001',Fecha:today,Nombre:'Lucía',Primer_apellido:'Hernández',Segundo_Apellido:'Soto',Fecha_Nacimiento:'2016-04-12',edad:10,Sexo:'Femenino',Tipo_Expediente:'Niño',Tutor_Nombre:'Marta Soto',Tutor_Parentesco:'Madre',Tutor_Telefono:'5551234567',Ciudad:'CDMX',Motivo_Consulta:'Selectividad alimentaria'},
 {Id_pacientes:'PAC-0002',Fecha:today,Nombre:'Carlos',Primer_apellido:'Ruiz',Segundo_Apellido:'',Fecha_Nacimiento:'1988-09-30',edad:38,Sexo:'Masculino',Tipo_Expediente:'Adulto',Telefono:'5559876543',Email:'c@x.mx',Ciudad:'CDMX',Motivo_Consulta:'Control de peso'},
 {Id_pacientes:'PAC-0003',Fecha:today,Nombre:'Mateo',Primer_apellido:'Gil',Fecha_Nacimiento:'2011-01-10',edad:15,Tipo_Expediente:'Adolescente',Tutor_Nombre:'Ana Gil',Tutor_Telefono:'5550001111'}],
 consultas:[{Id_consulta:'CON-0001',Id_pacientes:'PAC-0001',Fecha:today,Modalidad:'Presencial',Tipo_consulta:'Primera vez',Sintomas:'Rechaza verduras',Diagnostico:'Hipótesis: alimentación selectiva',Plan_Clinico:'Educación nutricional'}],
 agenda:[{Id_cita:'CIT-0001',Id_pacientes:'PAC-0002',Fecha:today,Hora:'10:00',Motivo:'Seguimiento',Estado:'Programada'}],
 mediciones:[],planes:[],plantillas:[],antecedentes:{},
 users:[{usuario:'admin',rol:'admin',activo:true,nombre:'Administradora',correo:'a@x.mx',areas:['general']},{usuario:'nutri1',rol:'medico',activo:true,nombre:'Nut. Rivera',correo:'p@x.mx',areas:['general']}]};
const log=[];
function api(b){
 const a=b.action;
 if(a==='login'){ if(b.usuario==='admin'&&b.clave==='clave-segura-123')return{status:'success',token:'T',rol:'admin',usuario:'admin',nombre:'Administradora',areas:['general']}; if(b.usuario==='lector'&&b.clave==='clave-segura-123')return{status:'success',token:'T2',rol:'lectura',usuario:'lector',nombre:'Lector',areas:['general']}; return{status:'error',message:'Usuario o contraseña incorrectos'};}
 if(a==='loginBrandGet')return{status:'success',brand:{appName:'NutriConsultorio',name:'CONSULTORIO',loginImage:''}};
 if(!b.token)return{status:'auth'};
 log.push(a);
 if(a==='preferencesGet')return{status:'success',preferences:{tema:'light',tamanoLetra:'normal',tamanoFormulario:'normal',inactividadMinutos:60},brand:{appName:'NutriConsultorio',name:'CONSULTORIO',loginImage:''}};
 if(a==='getData')return{status:'success',data:{pacientes:db.pacientes,consultas:db.consultas,agenda:db.agenda,mediciones:[],planes:[],plantillas:[]}};
 if(a==='agendaConfigGet')return{status:'success',config:{inicio:'09:00',fin:'17:00',duracion:30,dias:[0,1,2,3,4,5,6],noLaborables:[]}};
 if(a==='createPaciente'){const id='PAC-'+String(db.pacientes.length+1).padStart(4,'0');db.pacientes.push({...b,Id_pacientes:id});return{status:'success',id};}
 if(a==='updatePaciente'){const i=db.pacientes.findIndex(p=>p.Id_pacientes===b.Id_pacientes);db.pacientes[i]={...db.pacientes[i],...b};return{status:'success',id:b.Id_pacientes};}
 if(a==='deletePaciente'){const n=db.consultas.filter(c=>c.Id_pacientes===b.id).length;if(n)return{status:'error',message:'No se puede eliminar el expediente porque tiene '+n+' sesión(es).'};db.pacientes=db.pacientes.filter(p=>p.Id_pacientes!==b.id);return{status:'success'};}
 if(a==='createConsulta'){const id='CON-'+String(db.consultas.length+1).padStart(4,'0');db.consultas.push({...b,Id_consulta:id});return{status:'success',id};}
 if(a==='updateConsulta'){const i=db.consultas.findIndex(p=>p.Id_consulta===b.Id_consulta);db.consultas[i]={...db.consultas[i],...b};return{status:'success',id:b.Id_consulta};}
 if(a==='deleteConsulta'){db.consultas=db.consultas.filter(p=>p.Id_consulta!==b.Id_consulta);return{status:'success'};}
 if(a==='antecedentesGet')return{status:'success',record:db.antecedentes[b.Id_pacientes]||null};
 if(a==='antecedentesSave'){db.antecedentes[b.Id_pacientes]={datos:JSON.parse(b.datos),actualizado:'ahora',por:'admin'};return{status:'success'};}
 if(a==='nutriRecordsGet')return{status:'success',records:(b.modulo==='plantillas'||b.todos==='1')?db[b.modulo].slice():db[b.modulo].filter(r=>r.Id_pacientes===b.Id_pacientes)};
 if(a==='recordSave'){const m=b.modulo;if(m==='agenda'){const id=b.Id_cita||'CIT-'+String(db.agenda.length+1).padStart(4,'0');db.agenda=db.agenda.filter(x=>x.Id_cita!==id);db.agenda.push({...b,Id_cita:id});return{status:'success',id};}
  const k=m==='mediciones'?'Id_medicion':m==='plantillas'?'Id_plantilla':'Id_plan',pre=m==='mediciones'?'MED-':m==='plantillas'?'PLT-':'PLA-';
  if(m==='mediciones'&&!b.Peso_kg)return{status:'error',message:'La medición requiere el peso.'};
  const id=b[k]||pre+String(db[m].length+1).padStart(4,'0');const i=db[m].findIndex(x=>x[k]===id);const rec={...(i>=0?db[m][i]:{}),...b,[k]:id};delete rec.token;delete rec.action;delete rec.modulo;delete rec.area;if(i>=0)db[m][i]=rec;else db[m].push(rec);return{status:'success',id,modulo:m};}
 if(a==='recordDelete'){const m=b.modulo;if(m==='mediciones'||m==='planes'||m==='plantillas'){const k=m==='mediciones'?'Id_medicion':m==='plantillas'?'Id_plantilla':'Id_plan';db[m]=db[m].filter(x=>x[k]!==b.id);}return{status:'success'};}
 if(a==='userList')return{status:'success',users:db.users,currentSuperusuario:false,currentAreas:['general']};
 if(a==='userSave'){const i=db.users.findIndex(u=>u.usuario===b.usuario);const u={usuario:b.usuario,rol:b.rol,activo:b.activo!=='NO',nombre:b.nombre,correo:b.correo,areas:['general']};if(i>=0)db.users[i]=u;else db.users.push(u);return{status:'success',usuario:b.usuario};}
 if(a==='userStatus'){const u=db.users.find(x=>x.usuario===b.usuario);u.activo=b.activo==='SI';return{status:'success'};}
 if(a==='logout')return{status:'success'};
 if(a==='resetRequest')return{status:'success',message:'Si los datos corresponden a una cuenta activa con correo registrado, recibirás instrucciones.'};
 return{status:'error',message:'Acción no reconocida '+a};
}
const types={'.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript'};
http.createServer((req,res)=>{
 if(req.url==='/__log'){res.end(JSON.stringify(log));return;}
 if(req.method==='POST'&&req.url.startsWith('/api')){let d='';req.on('data',c=>d+=c);req.on('end',()=>{let out;try{out=api(JSON.parse(d));}catch(e){out={status:'error',message:String(e)};}res.setHeader('Content-Type','application/json');res.end(JSON.stringify(out));});return;}
 if(req.url.startsWith('/config.js')){res.setHeader('Content-Type','text/javascript');res.end("window.NUTRI_CONFIG={API_URL:'/api',LOGIN:{paleta:'salvia'}};");return;}
 let f=req.url.split('?')[0];if(f==='/')f='/index.html';const full=path.join(ROOT,f);
 if(!full.startsWith(ROOT)||!fs.existsSync(full)){res.statusCode=404;res.end('nf');return;}
 res.setHeader('Content-Type',types[path.extname(full)]||'application/octet-stream');res.end(fs.readFileSync(full));
}).listen(PORT,()=>console.log('mock on',PORT));
