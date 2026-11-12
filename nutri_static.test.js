const fs=require('fs');
const html=fs.readFileSync(__dirname+'/index.html','utf8'), be=fs.readFileSync(__dirname+'/NutriConsultorio_Backend.gs','utf8'), cfg=fs.readFileSync(__dirname+'/config.js','utf8');
const checks=[
 ['Menú nutricional',/\['mediciones','ruler','Mediciones'\]/.test(html)&&/\['planes','target','Plan alimentario'\]/.test(html)],
 ['Sin módulos de psicología en el frontend',!/psychLoad|SCALES|evaluaciones|PHQ-9|Antecedentes_Psicologicos/.test(html)],
 ['Sin módulos de psicología en el backend',!/evaluaciones_psicologicas|planes_terapeuticos|Id_evaluacion|psychRecordsGet/.test(be)],
 ['Backend: hojas mediciones y planes_alimentarios',/hoja:'mediciones'/.test(be)&&/hoja:'planes_alimentarios'/.test(be)],
 ['Backend y frontend usan la misma acción',/nutriRecordsGet/.test(be)&&/nutriRecordsGet/.test(html)],
 ['Fórmula Mifflin-St Jeor',/10 \* p \+ 6\.25 \* t - 5 \* e/.test(html)&&/base \+ 5/.test(html)&&/base - 161/.test(html)],
 ['IMC solo se clasifica en adultos',/menor \? '' : ' \(' \+ imcBand/.test(html)],
 ['Config propia sin URL de otro proyecto',/NUTRI_CONFIG/.test(cfg)&&/API_URL: ''/.test(cfg)],
 ['Campos de paciente nutricionales',['Objetivo_Nutricional','Alergias_Intolerancias','Habitos_Alimentarios','Patologias_Medicamentos','Actividad_Sueno','Consentimiento_Fecha'].every(k=>html.includes(k)&&be.includes(k))],
 ['Existe documentación y proxy opcional',fs.existsSync(__dirname+'/LEEME.md')&&fs.existsSync(__dirname+'/functions/api.js')],
];
let bad=0;for(const [n,ok] of checks){console.log((ok?'OK':'FAIL')+' - '+n);if(!ok)bad++;}process.exit(bad?1:0);
