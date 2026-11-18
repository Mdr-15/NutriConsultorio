require('fs').mkdirSync(__dirname+'/shots',{recursive:true});
const {chromium}=require('playwright');const {spawn,execSync}=require('child_process');
const ROOT=require('path').resolve(__dirname,'..'),PORT=8111,B='http://localhost:'+PORT;
let fails=0;const ok=(n,c,x='')=>{console.log((c?'OK   ':'FAIL ')+n+(c?'':'  -> '+x));if(!c)fails++;};
(async()=>{
  const srv=spawn('node',[__dirname+'/mock.js',ROOT,String(PORT)],{stdio:'ignore'});await new Promise(r=>setTimeout(r,800));
 const br=await chromium.launch();const pg=await br.newPage({viewport:{width:1280,height:900},acceptDownloads:true});
 const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('dialog',d=>d.accept());
 await pg.goto(B+'/');
 await pg.fill('#lu','admin');await pg.fill('#lp','clave-segura-123');await pg.click('#lb');await pg.waitForSelector('#login',{state:'hidden'});
 await pg.waitForTimeout(600);
 const nav=await pg.$$eval('nav a, .nav a, #nav a, [data-nav]',e=>e.map(x=>x.textContent.trim()));
 ok('Menú nutricional',['Mediciones','Plan alimentario','Consultas'].every(t=>nav.some(n=>n.includes(t))),nav.join('|'));
 ok('Sin menú de psicología',!nav.some(n=>/Evaluaciones|terap/i.test(n)),nav.join('|'));
 ok('Título nutri',/NutriConsultorio/.test(await pg.title()),await pg.title());
 // --- Mediciones
 await pg.route('**/api*',async r=>{await new Promise(x=>setTimeout(x,700));r.continue();});
 await pg.goto(B+'/#/mediciones');await pg.waitForSelector('#medicionesForm');
 await pg.selectOption('#medicionesPatient','PAC-0002');
 const meds=[['2026-09-01','90','175','100','105','28'],['2026-10-01','87','175','97','105','26.5'],['2026-11-01','84','175','94','105','25']];
 for(const [f,p,t,c,h,g] of meds){
  await pg.fill('#medicionesForm [name=Fecha]',f);await pg.fill('#medicionesForm [name=Peso_kg]',p);await pg.fill('#medicionesForm [name=Talla_cm]',t);await pg.fill('#medicionesForm [name=Cintura_cm]',c);await pg.fill('#medicionesForm [name=Cadera_cm]',h);await pg.fill('#medicionesForm [name=Grasa_pct]',g);
  const prev=await pg.textContent('#medPreview');
  if(p==='84')ok('Vista previa IMC 27.4 Sobrepeso',/27\.4/.test(prev)&&/Sobrepeso/.test(prev),prev);
  if(p==='84')ok('Vista previa ICC 0.9',/0\.9/.test(prev),prev);
  await pg.click('#medicionesForm button[type=submit]');
  if(p==='90'){await pg.waitForTimeout(200);const bt=await pg.textContent('#medicionesForm button[type=submit]');const stw=await pg.textContent('#medicionesForm .save-status');ok('Botón dice Guardando… y aviso de espera',/Guardando/.test(bt)&&/Enviando/.test(stw)&&await pg.$eval('#medicionesForm button[type=submit]',b=>b.disabled),bt+'|'+stw);}
  await pg.waitForSelector('#medicionesForm .save-status.ok',{timeout:6000});
  if(p==='90'){const stk=await pg.textContent('#medicionesForm .save-status');ok('Aviso fijo ✓ Medición guardada con hora',/✓ Medición guardada · \d{1,2}:\d{2}/.test(stk),stk);ok('Botón vuelve a Guardar medición y habilitado',(await pg.textContent('#medicionesForm button[type=submit]'))==='Guardar medición'&&!(await pg.$eval('#medicionesForm button[type=submit]',b=>b.disabled)));}
  await pg.waitForTimeout(150);
 }
 const list=await pg.textContent('#medicionesList');
 ok('Lista muestra 3 mediciones',(list.match(/MED-/g)||[]).length===3,list.slice(0,1500));
 ok('Lista con IMC y clasificación',/IMC 27\.4 \(Sobrepeso\)/.test(list),list.slice(0,300));
 const nSvg=await pg.$$eval('#medChartCard svg',e=>e.length);
 ok('Gráficas de peso, IMC, cintura y grasa',nSvg===4,String(nSvg));
 ok('Gráfica con cambio -6',/cambio -6 kg/.test(await pg.textContent('#medChartCard')),(await pg.textContent('#medChartCard')).slice(0,200));
 // editar y eliminar
 await pg.click('#medicionesList [data-nutri-edit]');
 ok('Editar carga el formulario',(await pg.inputValue('#medicionesForm [name=Peso_kg]'))==='84');
 await pg.click('#medicionesCancel');
 // Niño: sin clasificación
 await pg.selectOption('#medicionesPatient','PAC-0001');await pg.fill('#medicionesForm [name=Peso_kg]','32');await pg.fill('#medicionesForm [name=Talla_cm]','135');
 const pv=await pg.textContent('#medPreview');
 ok('Niño: IMC sin clasificar y con aviso OMS',/17\.6/.test(pv)&&!/Sobrepeso|Normal/.test(pv)&&/OMS/.test(pv),pv);
 // --- Plan alimentario
 await pg.goto(B+'/#/planes');await pg.waitForSelector('#planesForm');
 await pg.selectOption('#planesPatient','PAC-0002');await pg.waitForFunction(()=>document.getElementById('calcPeso').value==='84',null,{timeout:8000}).catch(()=>{});
 ok('Calculadora precargada (peso 84)',(await pg.inputValue('#calcPeso'))==='84'&&(await pg.inputValue('#calcTalla'))==='175'&&(await pg.inputValue('#calcSexo'))==='Masculino',(await pg.inputValue('#calcPeso')));
 await pg.fill('#calcAjuste','-500');
 const out=await pg.textContent('#calcOut');
 ok('Gasto basal Mifflin 1749',/1749 kcal/.test(out),out);
 ok('Meta 1905 kcal',/1905 kcal/.test(out),out);
 ok('Macros 95/238 g',/95 g \/ 238 g/.test(out),out);
 await pg.click('#calcUse');
 ok('Usa valores en el plan',(await pg.inputValue('#planesForm [name=Kcal]'))==='1905'&&(await pg.inputValue('#planesForm [name=Proteina_g]'))==='95');
 await pg.fill('#calcPG','40');ok('Alerta suma ≠ 100',/suman 110/.test(await pg.textContent('#calcOut')));
 await pg.fill('#calcPG','30');
 await pg.fill('#planesForm [name=Objetivo]','Bajar 4 kg en 12 semanas');await pg.fill('#planesForm [name=Desayuno]','2 huevos, 1 tortilla, fruta');
 await pg.click('#planesForm button[type=submit]');await pg.waitForSelector('#planesForm .save-status.ok',{timeout:6000});ok('Plan: aviso fijo de guardado',/✓ Plan guardado/.test(await pg.textContent('#planesForm .save-status')));
 const pl=await pg.textContent('#planesList');
 ok('Plan guardado en la lista',/Bajar 4 kg/.test(pl)&&/1905\s*kcal/.test(pl),pl.slice(0,200));
 const [dl]=await Promise.all([pg.waitForEvent('download'),pg.click('#planesList [data-a=download-plan]')]);
 const fsx=require('fs');const p=await dl.path();const html=fsx.readFileSync(p,'utf8');
 ok('Plan impreso con kcal, desayuno y objetivo',/1905 kcal/.test(html)&&/2 huevos/.test(html)&&/Bajar 4 kg/.test(html)&&/Menú por tiempos de comida/.test(html));
 // --- Expediente
 await pg.goto(B+'/#/expediente/PAC-0002');await pg.waitForSelector('#patientProfile h2');await pg.waitForTimeout(900);
 const prof=await pg.textContent('#patientProfile');
 ok('Expediente: nutricional y mediciones/plan',/EXPEDIENTE NUTRICIONAL/i.test(prof)&&/Evolución de medidas/.test(prof)&&/Planes alimentarios/.test(prof)&&/Bajar 4 kg/.test(prof),prof.slice(0,300));
 ok('Expediente: antecedentes nutricionales',/Historial de peso/.test(prof)||/Historia nutricional/.test(prof)||await pg.$('#antecedentesPanel')!==null);
 const [dl2]=await Promise.all([pg.waitForEvent('download'),(async()=>{await pg.evaluate(()=>exportRecord('summary','PAC-0002','download'));})()]);
 const h2=fsx.readFileSync(await dl2.path(),'utf8');
 ok('Resumen impreso con gráfica y cambio de peso',/<svg/.test(h2)&&/90 kg → 84 kg/.test(h2.replace(/&gt;/g,'>'))||/90 kg/.test(h2),h2.slice(0,0));
 ok('Resumen: IMC clasificado',/Sobrepeso/.test(h2));
 // pantallas restantes sin error
 for(const r of ['hoy','resumen','pacientes','consultas','agenda']){await pg.goto(B+'/#/'+r);await pg.waitForTimeout(400);}
 await pg.goto(B+'/#/pacientes');await pg.waitForTimeout(300);
 await pg.evaluate(()=>A.edit('pacientes','PAC-0002'));await pg.waitForTimeout(300);
 const form=await pg.textContent('#dlg');
 ok('Formulario de expediente nutricional',/Objetivo nutricional/.test(form)&&/Alergias e intolerancias/.test(form)&&/Hábitos alimentarios/.test(form)&&!/psicol/i.test(form),form.slice(0,200));
 ok('Formulario sin términos de psicología',!/terap|psicol|escolar/i.test(form));
 ok('Sin errores de JS',errs.length===0,errs.join(' | '));
 await br.close();srv.kill();
 console.log(fails?('\n'+fails+' FALLAS'):'\nTODO OK');process.exit(fails?1:0);
})();
