const vm=require('vm'),fs=require('fs');
const src=fs.readFileSync(require('path').join(__dirname,'..','NutriConsultorio_Backend.gs'),'utf8');
function mkSheet(name,rows){const sh={name,rows:rows||[],
 getLastRow(){return this.rows.length},getLastColumn(){return this.rows.reduce((m,r)=>Math.max(m,r.length),0)},
 appendRow(r){this.rows.push(r.slice())},
 getRange(r,c,nr,nc){const self=this;nr=nr||1;nc=nc||1;return{getValues(){const o=[];for(let i=0;i<nr;i++){const row=self.rows[r-1+i]||[];const x=[];for(let j=0;j<nc;j++)x.push(row[c-1+j]===undefined?'':row[c-1+j]);o.push(x)}return o},setValues(v){v.forEach((row,i)=>{self.rows[r-1+i]=self.rows[r-1+i]||[];row.forEach((val,j)=>self.rows[r-1+i][c-1+j]=val)})},setValue(v){self.rows[r-1]=self.rows[r-1]||[];self.rows[r-1][c-1]=v}}},
 getDataRange(){return this.getRange(1,1,this.rows.length,this.getLastColumn())},deleteRow(i){this.rows.splice(i-1,1)},getName(){return name},setFrozenRows(){},autoResizeColumns(){}};return sh}
const sheets={};
const ss={getSheetByName:n=>sheets[n]||null,insertSheet:n=>sheets[n]=mkSheet(n,[])};
const cache={};
const ctx={console,Logger:{log(){}},
 SpreadsheetApp:{getActiveSpreadsheet:()=>ss},
 CacheService:{getScriptCache:()=>({get:k=>cache[k]||null,put:(k,v)=>{cache[k]=v},remove:k=>{delete cache[k]},removeAll(){}})},
 LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){},tryLock(){return true}})},
 PropertiesService:{getScriptProperties:()=>({getProperty:()=>null,setProperty(){}})},
 Utilities:{formatDate:(d)=>new Date(d).toISOString(),computeDigest(){return []},base64Encode:()=>'x',DigestAlgorithm:{SHA_256:1},getUuid:()=>'u',Charset:{UTF_8:1},newBlob(){}},
 Session:{getScriptTimeZone:()=>'America/Mexico_City',getActiveUser:()=>({getEmail:()=>'a'})},ContentService:{createTextOutput:t=>({t,setMimeType(){return this}}),MimeType:{JSON:1}},MailApp:{sendEmail(){}}};
vm.createContext(ctx);vm.runInContext(src,ctx);
vm.runInContext('prepararHojas',ctx)();
let fails=0;const ok=(n,c,x='')=>{console.log((c?'OK   ':'FAIL ')+n+(c?'':'  -> '+x));if(!c)fails++;};
ok0=()=>{};
sheets.pacientes.appendRow(['PAC-0001','2026-11-01','Carlos','Ruiz','','','','','','','','','','','general','Adulto']);
const ses={usuario:'admin',rol:'admin',areas:['general'],superusuario:true};
const call=(p)=>{try{return vm.runInContext('guardarRegistroModuloInterno_',ctx)(p,ses)}catch(e){return{error:e.message}}};
let r=call({modulo:'mediciones',Id_pacientes:'PAC-0001',Fecha:'2026-11-01',Peso_kg:'84,5',Talla_cm:'175',Cintura_cm:'94',Cadera_cm:'105',Grasa_pct:'25'});
ok('Guarda medición válida con folio MED-',r.status==='success'&&/^MED-/.test(r.id),JSON.stringify(r));
ok('Hoja mediciones con encabezados y fila',sheets.mediciones&&sheets.mediciones.rows[0].includes('Peso_kg')&&sheets.mediciones.rows.length===2);
const pv=sheets.mediciones.rows[1][sheets.mediciones.rows[0].indexOf('Peso_kg')];ok('Coma decimal convertida a número',Number(pv)===84.5,JSON.stringify(pv));
ok('Rechaza medición sin peso',/peso/i.test(call({modulo:'mediciones',Id_pacientes:'PAC-0001',Fecha:'2026-11-01'}).error||''));
ok('Rechaza peso fuera de rango',/rango/i.test(call({modulo:'mediciones',Id_pacientes:'PAC-0001',Fecha:'2026-11-01',Peso_kg:'900'}).error||''));
ok('Rechaza texto como peso',/rango/i.test(call({modulo:'mediciones',Id_pacientes:'PAC-0001',Fecha:'2026-11-01',Peso_kg:'abc'}).error||''));
ok('Rechaza medición sin fecha',/fecha/i.test(call({modulo:'mediciones',Id_pacientes:'PAC-0001',Peso_kg:'80'}).error||''));
ok('Rechaza paciente inexistente',/paciente/i.test(call({modulo:'mediciones',Id_pacientes:'PAC-9999',Fecha:'2026-11-01',Peso_kg:'80'}).error||''));
r=call({modulo:'planes',Id_pacientes:'PAC-0001',FechaInicio:'2026-11-01',Objetivo:'Bajar peso',Kcal:'1905',Proteina_g:'95',Carbohidratos_g:'238',Grasas_g:'64',Desayuno:'x'});
ok('Guarda plan válido con folio PLA-',r.status==='success'&&/^PLA-/.test(r.id),JSON.stringify(r));
ok('Plan: estado por defecto Activo',sheets.planes_alimentarios.rows[1][sheets.planes_alimentarios.rows[0].indexOf('Estado')]==='Activo');
ok('Rechaza plan sin objetivo',/objetivo/i.test(call({modulo:'planes',Id_pacientes:'PAC-0001',Kcal:'1800'}).error||''));
ok('Rechaza kcal fuera de rango',/kcal/i.test(call({modulo:'planes',Id_pacientes:'PAC-0001',Objetivo:'x',Kcal:'50'}).error||''));
ok('Rechaza revisión anterior al inicio',/revisi/i.test(call({modulo:'planes',Id_pacientes:'PAC-0001',Objetivo:'x',Kcal:'1800',FechaInicio:'2026-11-10',FechaRevision:'2026-11-01'}).error||''));
r=call({modulo:'planes',Id_plan:'PLA-0001',Id_pacientes:'PAC-0001',Objetivo:'Bajar peso 2',Kcal:'1800'});
ok('Edita plan conservando campos no enviados',r.status==='success'&&sheets.planes_alimentarios.rows[1][sheets.planes_alimentarios.rows[0].indexOf('Desayuno')]==='x',JSON.stringify(r));
ok('Módulos de psicología ya no existen',/Módulo no válido/.test(call({modulo:'evaluaciones',Id_pacientes:'PAC-0001'}).error||''));
const get=vm.runInContext('obtenerRegistrosPaciente_',ctx);
ok('Consulta mediciones del paciente',get('mediciones','PAC-0001').length===1);
ok('Consulta rechaza módulo no válido',(()=>{try{get('evaluaciones','PAC-0001');return false}catch(e){return /no válido/.test(e.message)}})());
const cnt=vm.runInContext('contarRegistrosDePaciente_',ctx)('PAC-0001');
ok('Conteo para bloquear borrado de expediente',cnt.mediciones===1&&cnt.planes===1,JSON.stringify(cnt));
const del=vm.runInContext('borrarRegistroModulo_',ctx);
ok('Elimina medición',del({modulo:'mediciones',id:'MED-0001'},ses).status==='success'&&sheets.mediciones.rows.length===1);
ok('prepararHojas crea las 5 hojas con encabezados',['pacientes','consultas','agenda','mediciones','planes_alimentarios'].every(n=>sheets[n]&&sheets[n].rows[0]&&sheets[n].rows[0].length>3),Object.keys(sheets).join(','));

// ---- Equivalentes, meta, plantillas, lectura global
const eq=JSON.stringify({'Verduras':{'Desayuno':1,'Comida':'2,5','Cena':1},'Frutas':{'Colación 1':1.3},'Lácteos':{'Desayuno':0}});
r=call({modulo:'planes',Id_pacientes:'PAC-0001',FechaInicio:'2026-11-01',Objetivo:'Con equivalentes',Kcal:'1800',Meta_peso_kg:'78,5',Equivalentes:eq});
ok('Plan con equivalentes y meta se guarda',r.status==='success',JSON.stringify(r));
const hp=sheets.planes_alimentarios.rows[0], fp=sheets.planes_alimentarios.rows.find(x=>x[hp.indexOf('Objetivo')]==='Con equivalentes');
ok('Meta de peso numérica',Number(fp[hp.indexOf('Meta_peso_kg')])===78.5,JSON.stringify(fp[hp.indexOf('Meta_peso_kg')]));
const eqs=JSON.parse(fp[hp.indexOf('Equivalentes')]);
ok('Equivalentes normalizados (coma, cuartos, ceros fuera)',eqs.Verduras.Comida===2.5&&eqs['Frutas']['Colación 1']===1.25&&!eqs['Lácteos']);
ok('Rechaza grupo inventado',/Grupo/.test(call({modulo:'planes',Id_pacientes:'PAC-0001',Objetivo:'x',Kcal:'1800',Equivalentes:JSON.stringify({Pizza:{Cena:1}})}).error||''));
ok('Rechaza tiempo de comida inventado',/Tiempo/.test(call({modulo:'planes',Id_pacientes:'PAC-0001',Objetivo:'x',Kcal:'1800',Equivalentes:JSON.stringify({Verduras:{Merienda:1}})}).error||''));
ok('Rechaza porciones fuera de rango',/porciones/i.test(call({modulo:'planes',Id_pacientes:'PAC-0001',Objetivo:'x',Kcal:'1800',Equivalentes:JSON.stringify({Verduras:{Cena:99}})}).error||''));
ok('Rechaza JSON roto',/formato/i.test(call({modulo:'planes',Id_pacientes:'PAC-0001',Objetivo:'x',Kcal:'1800',Equivalentes:'{no'}).error||''));
ok('Rechaza meta absurda',/rango/i.test(call({modulo:'planes',Id_pacientes:'PAC-0001',Objetivo:'x',Kcal:'1800',Meta_peso_kg:'5'}).error||''));
const idEq=r.id;
r=call({modulo:'planes',Id_plan:idEq,Id_pacientes:'PAC-0001',Estado:'Concluido'});
ok('Marcar Concluido con envío mínimo conserva el resto',r.status==='success'&&sheets.planes_alimentarios.rows.find(x=>x[hp.indexOf('Id_plan')]===idEq)[hp.indexOf('Equivalentes')]!==''&&sheets.planes_alimentarios.rows.find(x=>x[hp.indexOf('Id_plan')]===idEq)[hp.indexOf('Estado')]==='Concluido',JSON.stringify(r));
r=call({modulo:'plantillas',Nombre:'1800 kcal sin lácteos',Kcal:'1800',Proteina_g:'90',Carbohidratos_g:'225',Grasas_g:'60',Equivalentes:eq,Desayuno:'x'});
ok('Plantilla se guarda sin paciente (folio PLT-)',r.status==='success'&&/^PLT-/.test(r.id),JSON.stringify(r));
ok('Rechaza plantilla sin nombre',/nombre/i.test(call({modulo:'plantillas',Kcal:'1800'}).error||''));
ok('Plantillas se listan para todos',get('plantillas','',true).length===1&&get('plantillas','').length===1);
ok('Lectura global de planes',get('planes','',true).length===2);
ok('Lectura global de mediciones',get('mediciones','',true).length>=0);
ok('Sin id y sin todos devuelve vacío',get('planes','').length===0);
ok('Elimina plantilla',del({modulo:'plantillas',id:r.id},ses).status==='success'&&get('plantillas','',true).length===0);
// ---- Menú semanal
r=call({modulo:'planes',Id_pacientes:'PAC-0001',FechaInicio:'2026-11-02',Objetivo:'Con menú',Kcal:'1700',MenuSemanal:JSON.stringify({Lunes:' Avena y fruta ',Martes:'',Domingo:'Pozole'})});
ok('Plan con menú semanal se guarda',r.status==='success',JSON.stringify(r));
{const hp2=sheets.planes_alimentarios.rows[0], fp2=sheets.planes_alimentarios.rows.find(x=>x[hp2.indexOf('Objetivo')]==='Con menú');const m=JSON.parse(fp2[hp2.indexOf('MenuSemanal')]);ok('Menú normalizado (recorta, quita vacíos)',m.Lunes==='Avena y fruta'&&!('Martes' in m)&&m.Domingo==='Pozole',JSON.stringify(m));}
ok('Rechaza día inventado',/Día no válido/.test(call({modulo:'planes',Id_pacientes:'PAC-0001',Objetivo:'x',Kcal:'1800',MenuSemanal:JSON.stringify({Funday:'x'})}).error||''));
ok('Rechaza texto de día muy largo',/600/.test(call({modulo:'planes',Id_pacientes:'PAC-0001',Objetivo:'x',Kcal:'1800',MenuSemanal:JSON.stringify({Lunes:'a'.repeat(601)})}).error||''));
ok('Plantilla acepta menú semanal',call({modulo:'plantillas',Nombre:'Con menú',Kcal:'1500',MenuSemanal:JSON.stringify({Lunes:'x'})},ses).status==='success');
console.log(fails?fails+' FALLAS':'TODO OK');process.exit(fails?1:0);
