require('fs').mkdirSync(__dirname+'/shots',{recursive:true});
const {chromium}=require('playwright');const {spawn,execSync}=require('child_process');
const ROOT=require('path').resolve(__dirname,'..'),PORT=8112,B='http://localhost:'+PORT;
let fails=0;const ok=(n,c,x='')=>{console.log((c?'OK   ':'FAIL ')+n+(c?'':'  -> '+x));if(!c)fails++;};
(async()=>{
 const srv=spawn('node',[__dirname+'/mock.js',ROOT,String(PORT)],{stdio:'ignore'});await new Promise(r=>setTimeout(r,800));
 const br=await chromium.launch();const pg=await br.newPage({viewport:{width:1280,height:900}});
 const errs=[];pg.on('pageerror',e=>errs.push(e.message));
 let promptVal='Plantilla 1800';pg.on('dialog',d=>d.type()==='prompt'?d.accept(promptVal):d.accept());
 await pg.goto(B+'/');await pg.fill('#lu','admin');await pg.fill('#lp','clave-segura-123');await pg.click('#lb');await pg.waitForSelector('#login',{state:'hidden'});await pg.waitForTimeout(600);
 // Mi día: alertas (PAC-0001 sin plan ni medición)
 await pg.goto(B+'/#/dashboard');await pg.waitForTimeout(1500);
 let al=await pg.textContent('#nutriAlerts').catch(()=>'');ok('Alertas en inicio',/sin plan|Sin plan|sin medición|Sin medición/i.test(al),al.slice(0,300));
 // Mediciones para PAC-0002 con plan meta
 await pg.goto(B+'/#/mediciones');await pg.waitForSelector('#medicionesForm');await pg.selectOption('#medicionesPatient','PAC-0002');
 for(const [f,p] of [['2026-09-01','90'],['2026-11-01','84']]){await pg.fill('#medicionesForm [name=Fecha]',f);await pg.fill('#medicionesForm [name=Peso_kg]',p);await pg.fill('#medicionesForm [name=Talla_cm]','175');await pg.click('#medicionesForm button[type=submit]');await pg.waitForSelector('#medicionesForm .save-status.ok');await pg.waitForTimeout(200);}
 // Plan 1
 await pg.goto(B+'/#/planes');await pg.waitForSelector('#planesForm');await pg.selectOption('#planesPatient','PAC-0002');
 await pg.fill('#planesForm [name=Objetivo]','Bajar 4 kg');await pg.fill('#planesForm [name=Kcal]','1800');await pg.fill('#planesForm [name=Meta_peso_kg]','80');await pg.fill('#planesForm [name=Desayuno]','Avena');
 await pg.fill('.eq-in[data-g="Verduras"][data-c="Comida"]','2');await pg.fill('.eq-in[data-g="Verduras"][data-c="Cena"]','1.5');await pg.fill('.eq-in[data-g="Lácteos"][data-c="Desayuno"]','0.25');
 const hid=await pg.inputValue('#planEq');ok('JSON equivalentes oculto',/"Verduras":\{"Comida":2,"Cena":1.5\}/.test(hid),hid);
 ok('Total al día',/3\.5|3½/.test(await pg.textContent('.eq-table tbody tr:first-child')),await pg.textContent('.eq-table tbody tr:first-child'));
 await pg.click('#planesForm button[type=submit]');await pg.waitForSelector('#planesForm .save-status.ok');await pg.waitForTimeout(400);
 ok('Plan 1 listado',/Bajar 4 kg/.test(await pg.textContent('#planesList')),(await pg.textContent('#planesList')).slice(0,200));
 ok('Lista muestra equivalentes',/Verduras 3(\.5|½)/.test(await pg.textContent('#planesList')),(await pg.textContent('#planesList')).slice(0,400));
 // Plantilla
 await pg.fill('#planesForm [name=Kcal]','1800');await pg.fill('#planesForm [name=Desayuno]','Avena');await pg.fill('.eq-in[data-g="Verduras"][data-c="Comida"]','2');
 await pg.click('#planTplSave');await pg.waitForSelector('#planTplSave ~ .save-status.ok, .plan-tools .save-status.ok',{timeout:4000}).catch(()=>{});await pg.waitForTimeout(500);
 const opts=await pg.$$eval('#planTpl option',o=>o.map(x=>x.textContent));ok('Plantilla en lista',opts.some(o=>/Plantilla 1800/.test(o)),opts.join('|'));
 // Copiar plan: limpiar form
 await pg.reload();await pg.waitForSelector('#planesForm');await pg.selectOption('#planesPatient','PAC-0002');await pg.waitForTimeout(800);
 await pg.click('#planCopy');await pg.waitForTimeout(300);
 ok('Copia objetivo',(await pg.inputValue('#planesForm [name=Objetivo]'))==='Bajar 4 kg');
 ok('Copia equivalentes',(await pg.inputValue('.eq-in[data-g="Verduras"][data-c="Comida"]'))==='2');
 ok('Copia sin Id',(await pg.inputValue('#planesId'))==='');
 // guardar nuevo -> ofrece concluir anterior
 await pg.fill('#planesForm [name=Objetivo]','Mantenimiento');await pg.click('#planesForm button[type=submit]');await pg.waitForSelector('#planesForm .save-status.ok');await pg.waitForTimeout(900);
 const lst=await pg.textContent('#planesList');ok('Anterior concluido',/Concluido/.test(lst)&&/Mantenimiento/.test(lst),lst.slice(0,500));
 // Aplicar plantilla
 await pg.reload();await pg.waitForSelector('#planesForm');await pg.waitForTimeout(800);
 await pg.selectOption('#planTpl',{index:1});await pg.click('#planTplApply');await pg.waitForTimeout(200);
 ok('Plantilla aplica kcal',(await pg.inputValue('#planesForm [name=Kcal]'))==='1800');
 ok('Plantilla aplica equivalentes',(await pg.inputValue('.eq-in[data-g="Verduras"][data-c="Comida"]'))==='2');
 // Eliminar plantilla
 await pg.click('#planTplDel');await pg.waitForTimeout(500);
 ok('Plantilla eliminada',(await pg.$$eval('#planTpl option',o=>o.length))===1);
 // Gráfica con meta
 await pg.goto(B+'/#/mediciones');await pg.waitForSelector('#medicionesForm');await pg.selectOption('#medicionesPatient','PAC-0002');await pg.waitForTimeout(900);
 const ch=await pg.innerHTML('#medChartCard');ok('Línea Meta en gráfica',/Meta/.test(ch),ch.slice(0,200));
 const hs=await pg.$$eval('#medChartCard h4',e=>e.map(x=>x.textContent));ok('Gráficas: peso, IMC, cintura(opcional) presentes',hs.some(h=>/^Peso/.test(h))&&hs.some(h=>/^IMC/.test(h)),hs.join('|'));
 // Menú semanal
 await pg.goto(B+'/#/planes');await pg.waitForSelector('#planesForm');await pg.selectOption('#planesPatient','PAC-0002');await pg.waitForTimeout(600);
 await pg.click('.wk-box summary');await pg.fill('.wk-in[data-d="Lunes"]','Avena con fruta; pollo con arroz');await pg.click('#wkCopyMon');
 ok('Copiar lunes a todos',(await pg.inputValue('.wk-in[data-d="Domingo"]'))==='Avena con fruta; pollo con arroz');
 ok('JSON oculto del menú',/"Sábado":"Avena/.test(await pg.inputValue('#planWk')),await pg.inputValue('#planWk'));
 await pg.fill('#planesForm [name=Objetivo]','Con menú semanal');await pg.fill('#planesForm [name=Kcal]','1700');
 await pg.click('#planesForm button[type=submit]');await pg.waitForSelector('#planesForm .save-status.ok');await pg.waitForTimeout(600);
 ok('Formulario de menú se limpia tras guardar',(await pg.inputValue('.wk-in[data-d="Lunes"]'))==='');
 {const ids=await pg.$$eval('#planesList [data-nutri-edit]',e=>e.map(x=>x.dataset.nutriEdit));const rec=await pg.evaluate(()=>db.planes.find(p=>p.Objetivo==='Con menú semanal').Id_plan);await pg.click('#planesList [data-nutri-edit="'+rec+'"]');}await pg.waitForTimeout(300);
 ok('Editar carga el menú semanal',/Avena/.test(await pg.inputValue('.wk-in[data-d="Miércoles"]')),await pg.inputValue('#planesForm [name=Objetivo]'));
 // Alimentos
 await pg.goto(B+'/#/alimentos');await pg.waitForSelector('#alQ');
 const n0=await pg.$$eval('.al-table tbody tr',e=>e.length);ok('Base de alimentos cargada (>100)',n0>100,String(n0));
 await pg.fill('#alQ','frijol');await pg.waitForTimeout(150);const n1=await pg.$$eval('.al-table tbody tr',e=>e.length);ok('Búsqueda por texto',n1>=2&&n1<10,String(n1));
 await pg.fill('#alQ','platano');await pg.waitForTimeout(150);ok('Búsqueda sin acentos',(await pg.textContent('.al-table tbody'))/**/.includes('Plátano'));
 await pg.fill('#alQ','');await pg.selectOption('#alG','Lácteos');await pg.waitForTimeout(150);ok('Filtro por grupo',(await pg.$$eval('.al-table tbody tr',e=>e.length))>=5);
 await pg.selectOption('#alG','');await pg.fill('#alQ','huevo');await pg.click('[data-al]');await pg.fill('#alGr','100');await pg.waitForTimeout(100);
 ok('Cálculo por cantidad (huevo 100 g = 143 kcal)',/143/.test(await pg.textContent('#alRes')),await pg.textContent('#alRes'));
 await pg.screenshot({path:__dirname+'/shots/n_alim.png'});
 await pg.click('#alClose');await pg.waitForTimeout(100);ok('Cancelar cierra la calculadora',(await pg.$$('.al-calc')).length===0);
 // Preferencias en expediente
 await pg.goto(B+'/#/expediente/PAC-0002/historia');await pg.waitForSelector('#antecedentesForm');await pg.fill('[name=preferencias_detalle]','No come pescado ni vísceras');await pg.click('#saveAntecedentes');await pg.waitForSelector('.save-status.ok');
 // Alertas inicio tras datos
 await pg.goto(B+'/#/dashboard');await pg.waitForTimeout(1500);al=await pg.textContent('#nutriAlerts');console.log('ALERTS:',al.slice(0,400));
 await pg.screenshot({path:__dirname+'/shots/n_dash.png'});
 // Consulta: resumen
 await pg.goto(B+'/#/consultas');await pg.waitForTimeout(800);
 await pg.selectOption('#sel','PAC-0002');await pg.waitForTimeout(300);await pg.click('#nb');await pg.waitForSelector('#consultaPacienteSearch');await pg.waitForTimeout(1500);await pg.waitForTimeout(200);
 const c=await pg.textContent('#consultaNutriCtx');ok('Resumen nutricional en consulta con preferencias',/IMC/.test(c)&&/No come pescado/.test(c),c.slice(0,300));console.log(c.slice(0,300));await pg.screenshot({path:__dirname+'/shots/n_cons.png'});
 ok('Sin errores JS',errs.length===0,errs.join('|'));
 srv.kill();await br.close();console.log(fails?'FALLOS '+fails:'TODO OK');process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
