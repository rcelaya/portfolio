// ═══════════════════════════════════════════════════════════════
//  AUTENTICACION — Google Sign-In (Google Identity Services)
//  Reemplaza el login por contraseña. Configura estos dos valores:
//    1. CLIENT_ID: crea un "OAuth 2.0 Client ID" (tipo Web) en
//       https://console.cloud.google.com/apis/credentials y agrega
//       tu URL de GitHub Pages en "Authorized JavaScript origins".
//    2. ALLOWED_EMAILS: tu(s) correo(s) de Google permitidos.
//  Ver README.md → seccion "Autenticacion".
//
//  NOTA DE SEGURIDAD: esta validacion (email/exp) ocurre en el
//  navegador y es solo la PUERTA visual. La verificacion real del
//  token de Google debe hacerse en el Worker (proxy). Ver README.
// ═══════════════════════════════════════════════════════════════
const AUTH = {
  CLIENT_ID: '962184983103-paqoo5arm1f79jtkmlt8simhjq0cvb1s.apps.googleusercontent.com',
  ALLOWED_EMAILS: ['rcelaya@artogroup.com'],
};
const ID_TOKEN_KEY='plv2_idtoken';

function decodeJwt(token){
  try{
    const part=token.split('.')[1];
    const json=decodeURIComponent(atob(part.replace(/-/g,'+').replace(/_/g,'/'))
      .split('').map(c=>'%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join(''));
    return JSON.parse(json);
  }catch(e){ return null; }
}

function isValidClaims(c){
  if(!c) return false;
  const now=Math.floor(Date.now()/1000);
  if(c.exp && c.exp < now) return false;
  if(AUTH.CLIENT_ID && c.aud !== AUTH.CLIENT_ID) return false;
  if(!(c.iss==='accounts.google.com' || c.iss==='https://accounts.google.com')) return false;
  if(!c.email_verified) return false;
  if(AUTH.ALLOWED_EMAILS.length){
    const allow=AUTH.ALLOWED_EMAILS.map(e=>e.toLowerCase());
    if(!allow.includes(String(c.email||'').toLowerCase())) return false;
  }
  return true;
}

function grantAccess(){
  const ls=document.getElementById('loginScreen');
  if(ls) ls.style.display='none';
  startApp();
}

function handleCredential(resp){
  const claims=decodeJwt(resp.credential);
  if(!isValidClaims(claims)){
    const err=document.getElementById('loginErr');
    if(err) err.textContent = (claims && claims.email)
      ? 'Cuenta no autorizada: '+claims.email
      : 'No se pudo validar la sesion de Google';
    sessionStorage.removeItem(ID_TOKEN_KEY);
    return;
  }
  sessionStorage.setItem(ID_TOKEN_KEY, resp.credential);
  scheduleTokenRefresh();
  grantAccess();
}

// Renueva el token de Google de forma silenciosa ~5 min antes de que expire,
// para no tener que volver a iniciar sesion cada hora.
let _refreshTimer=null;
function scheduleTokenRefresh(){
  if(_refreshTimer) clearTimeout(_refreshTimer);
  const claims=decodeJwt(sessionStorage.getItem(ID_TOKEN_KEY));
  if(!claims || !claims.exp) return;
  const ms=(claims.exp*1000) - Date.now() - 5*60*1000; // 5 min antes de expirar
  _refreshTimer=setTimeout(()=>{
    try{ google.accounts.id.prompt(); }catch(e){} // One Tap reemite credencial sin UI si hay sesion activa
  }, Math.max(ms, 1000));
}

function logout(){
  if(_refreshTimer) clearTimeout(_refreshTimer);
  sessionStorage.removeItem(ID_TOKEN_KEY);
  try{ google.accounts.id.disableAutoSelect(); }catch(e){}
  location.reload();
}

let _gisInit=false;
function gisInitialize(){
  if(_gisInit) return true;
  if(!(window.google && google.accounts && google.accounts.id)) return false;
  google.accounts.id.initialize({ client_id: AUTH.CLIENT_ID, callback: handleCredential, auto_select: true });
  _gisInit=true;
  return true;
}

function showSignInButton(){
  const btn=document.getElementById('gsiButton');
  if(btn) google.accounts.id.renderButton(btn, {theme:'filled_black', size:'large', text:'signin_with', shape:'pill'});
  google.accounts.id.prompt();
}

// Espera a que cargue la libreria de Google (script async), inicializa GIS y ejecuta cb.
function waitForGis(cb){
  let tries=0;
  (function wait(){
    if(gisInitialize()){ if(cb) cb(); return; }
    if(tries++>100){ const h=document.getElementById('loginHint'); if(h) h.textContent='No se pudo cargar Google Sign-In. Revisa tu conexion.'; return; }
    setTimeout(wait,100);
  })();
}

function bootAuth(){
  const hint=document.getElementById('loginHint');
  if(!AUTH.CLIENT_ID || !AUTH.ALLOWED_EMAILS.length){
    if(hint) hint.innerHTML='⚠ Falta configurar el login. Edita <code>app.js</code> (AUTH.CLIENT_ID y AUTH.ALLOWED_EMAILS). Ver README.';
    return;
  }
  const saved=sessionStorage.getItem(ID_TOKEN_KEY);
  if(saved && isValidClaims(decodeJwt(saved))){
    // Sesion valida: entra de inmediato e inicializa GIS en segundo plano para renovar el token
    grantAccess();
    waitForGis(scheduleTokenRefresh);
    return;
  }
  sessionStorage.removeItem(ID_TOKEN_KEY);
  waitForGis(showSignInButton);
}

// ─── CONSTANTS ───
const ACTIVE_ACCOUNTS = ['MX','CA','CA2','CRYPTO','BITSO','AGF'];
const RETIRO_ACCOUNTS = ['RETIRO'];
// ETFs de la hoja que cotizan en CAD (Bolsa de Toronto). La hoja también puede indicarlo con una columna "moneda".
const CAD_PRICED_TICKERS = ['ZSP','XSP'];
// Reclasificaciones de categoría sobre lo que manda la hoja.
const CAT_OVERRIDES = {VNQ:'realestate'};

// ─── STATIC DATA ───
// Respaldo si la hoja no responde. Precios en USD salvo que se indique ccy (priceN/costN en esa moneda).
const STATIC_POSITIONS = [
  {ticker:'COIN',name:'Coinbase Global',units:10.99985,costUSD:205.85,priceUSD:206.00,cat:'crypto',acct:'MX'},
  {ticker:'GOOG',name:'Alphabet Inc',units:6.59483,costUSD:154.20,priceUSD:307.41,cat:'tech',acct:'MX'},
  {ticker:'SPYG',name:'SPDR S&P 500 Growth',units:13.90058,costUSD:98.40,priceUSD:101.98,cat:'index',acct:'MX'},
  {ticker:'VEA',name:'FTSE Dev Market',units:10.54299,costUSD:62.10,priceUSD:64.92,cat:'intl',acct:'MX'},
  {ticker:'META',name:'Meta Platforms',units:1.24038,costUSD:537.40,priceUSD:617.35,cat:'tech',acct:'MX'},
  {ticker:'BRK.B',name:'Berkshire Hathaway',units:0.97558,costUSD:461.00,priceUSD:485.25,cat:'defense',acct:'MX'},
  {ticker:'AMZN',name:'Amazon.com',units:2.63034,costUSD:193.40,priceUSD:210.70,cat:'tech',acct:'MX'},
  {ticker:'VGK',name:'Vanguard Europe ETF',units:1.71065,costUSD:79.52,priceUSD:83.16,cat:'intl',acct:'MX'},
  {ticker:'VTI',name:'US Total Market',units:1.28593,costUSD:287.60,priceUSD:328.21,cat:'index',acct:'MX'},
  {ticker:'BMNR',name:'Bitmine Immersion',units:20.43390,costUSD:41.20,priceUSD:21.97,cat:'crypto',acct:'MX'},
  {ticker:'NVDA',name:'NVIDIA Corp',units:0.00662,costUSD:145.02,priceUSD:183.38,cat:'tech',acct:'MX'},
  {ticker:'TSM',name:'Taiwan Semiconductor',units:0.01364,costUSD:176.10,priceUSD:343.11,cat:'tech',acct:'MX'},
  {ticker:'DIS',name:'Walt Disney Co',units:0.00657,costUSD:96.50,priceUSD:100.46,cat:'tech',acct:'MX'},
  {ticker:'SPYG',name:'SPDR S&P 500 Growth',units:75.2401,costUSD:84.30,priceUSD:101.98,cat:'index',acct:'CA'},
  {ticker:'VOO',name:'Vanguard S&P 500',units:8.2197,costUSD:395.20,priceUSD:612.88,cat:'index',acct:'CA'},
  {ticker:'ZSP',name:'BMO S&P 500 ETF',units:62.4804,ccy:'CAD',costN:72.71,priceN:100.32,cat:'index',acct:'CA'},
  {ticker:'XSP',name:'iShares S&P 500 CAD-hdg',units:57.6236,ccy:'CAD',costN:47.19,priceN:67.80,cat:'index',acct:'CA'},
  {ticker:'AAPL',name:'Apple Inc',units:10.2434,costUSD:164.10,priceUSD:251.03,cat:'tech',acct:'CA'},
  {ticker:'META',name:'Meta Platforms',units:3.2923,costUSD:456.20,priceUSD:617.35,cat:'tech',acct:'CA'},
  {ticker:'MSFT',name:'Microsoft Corp',units:4.2021,costUSD:351.80,priceUSD:394.26,cat:'tech',acct:'CA'},
  {ticker:'COIN',name:'Coinbase Global',units:1.7835,costUSD:75.40,priceUSD:206.00,cat:'crypto',acct:'CA'},
  {ticker:'AMZN',name:'Amazon.com',units:2.2173,costUSD:211.00,priceUSD:210.70,cat:'tech',acct:'CA'},
  {ticker:'ILMN',name:'Illumina Inc',units:0.5289,costUSD:248.60,priceUSD:121.40,cat:'bio',acct:'CA'},
  {ticker:'GRAL',name:'Grail Inc',units:0.0882,costUSD:50.75,priceUSD:138.20,cat:'bio',acct:'CA'},
  {ticker:'BTC',name:'Bitcoin',units:0.3914,costUSD:46015,priceUSD:69682,cat:'crypto',acct:'CRYPTO'},
  {ticker:'ETH',name:'Ethereum',units:5.40,costUSD:2367,priceUSD:2132,cat:'crypto',acct:'CRYPTO'},
  {ticker:'STETH',name:'Staked ETH (Lido)',units:3.22,costUSD:2631,priceUSD:2128,cat:'crypto',acct:'CRYPTO'},
  {ticker:'SOL',name:'Solana',units:6.26,costUSD:203.6,priceUSD:88.28,cat:'crypto',acct:'CRYPTO'},
  {ticker:'AAVE',name:'Aave',units:1.3,costUSD:285.1,priceUSD:111.67,cat:'crypto',acct:'CRYPTO'},
  {ticker:'HYPE',name:'Hyperliquid',units:3.4,costUSD:48.7,priceUSD:42.47,cat:'crypto',acct:'CRYPTO'},
  {ticker:'LINK',name:'Chainlink',units:11.58,costUSD:22.03,priceUSD:8.97,cat:'crypto',acct:'CRYPTO'},
  {ticker:'UNI',name:'Uniswap',units:20.12,costUSD:8.84,priceUSD:3.61,cat:'crypto',acct:'CRYPTO'},
  // Valores manuales (se capturan en Configurar), en su moneda
  {ticker:'RRSP-SC',name:'RRSP Scotiabank',units:1,ccy:'CAD',costN:22623,priceN:22623,cat:'retiro',acct:'RETIRO'},
  {ticker:'RRSP-WS',name:'RRSP Wealthsimple',units:1,ccy:'CAD',costN:26066,priceN:29499,cat:'retiro',acct:'RETIRO'},
  {ticker:'AFORE',name:'AFORE México',units:1,ccy:'MXN',costN:1385366,priceN:1385366,cat:'retiro',acct:'RETIRO'},
  {ticker:'AGF-CA',name:'TFSA Primerica · AGF Asset Builder Fund III',units:1,ccy:'CAD',costN:24700,priceN:31588,cat:'index',acct:'AGF'},
  {ticker:'CASH-MX',name:'Efectivo MXN 6.5% fijo',units:1,ccy:'MXN',costN:0,priceN:0,cat:'cash',acct:'MX'},
  {ticker:'CASH-CA',name:'Efectivo CAD',units:1,ccy:'CAD',costN:0,priceN:0,cat:'cash',acct:'CA'},
];
const normalizePos=p=>({...p,ccy:p.ccy||'USD',priceN:p.priceN??p.priceUSD,costN:p.costN??p.costUSD});

let positions = [];
let sheetUrl = localStorage.getItem('plv2_url_main')||'https://script.google.com/macros/s/AKfycbxbs-aX6hOhRfFl8CaFK6EmWDq6713u8pg8cCigpXUP49MLdf9rxHYDTYxpNKF3FNJz/exec?sheet=Portfolio';
let cryptoUrl = localStorage.getItem('plv2_url_crypto')||'https://script.google.com/macros/s/AKfycbxbs-aX6hOhRfFl8CaFK6EmWDq6713u8pg8cCigpXUP49MLdf9rxHYDTYxpNKF3FNJz/exec?sheet=Crypto';
let acctFilter = 'active';
let sortCol = 'valueUSD';
let sortDir = 1; // 1 = desc, -1 = asc
let radarChart=null, donutChart=null, corrProgressChart=null;

// ─── HELPERS ───
const fmt  = n=>'$'+(n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});
const fmt2 = n=>'$'+(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtPct = n=>(n>=0?'+':'')+n.toFixed(2)+'%';

// Active = everything except RETIRO
const activePos  = ()=>positions.filter(p=>ACTIVE_ACCOUNTS.includes(p.acct));
const retiroPos  = ()=>positions.filter(p=>RETIRO_ACCOUNTS.includes(p.acct));
const totalActive= ()=>activePos().reduce((s,p)=>s+p.valueUSD,0);
const totalRetiro= ()=>retiroPos().reduce((s,p)=>s+p.valueUSD,0);
const totalAll   = ()=>positions.reduce((s,p)=>s+p.valueUSD,0);

const catClass = c=>({index:'ci',tech:'ct',crypto:'cc',intl:'cl',defense:'cd',hedge:'ch',bio:'cb',retiro:'cd',cash:'cm',realestate:'cd',bonds:'cm'}[c]||'ci');
const catLabel = c=>({index:'Index',tech:'Tech',crypto:'Cripto',intl:'Internacional',defense:'Defensa',hedge:'Oro',bio:'Biotech',retiro:'Retiro',cash:'Efectivo',realestate:'Bienes raíces',bonds:'Renta fija (bonos)'}[c]||c);

// ─── TIPOS DE CAMBIO ───
// Valor = tipo de cambio del día. Costo = tipo de cambio histórico (el de Configurar), para que el P/L
// no brinque solo por la moneda. Las tasas se guardan como USD por 1 unidad de moneda.
const FX_KEY='plv2_fx', FX_MODE_KEY='plv2_fx_mode';
const FX_SANE={CAD:[0.5,1.2],MXN:[0.02,0.12]};
let FX={CAD:null,MXN:null}, fxChecked=false;
const fxMode=()=>localStorage.getItem(FX_MODE_KEY)==='fixed'?'fixed':'live';
function loadManual(){try{return JSON.parse(localStorage.getItem('plv2_manual')||'{}');}catch(e){return {};}}
function loadSavedFx(){try{return JSON.parse(localStorage.getItem(FX_KEY)||'{}');}catch(e){return {};}}
const saneFx=(ccy,r)=>typeof r==='number'&&isFinite(r)&&r>=FX_SANE[ccy][0]&&r<=FX_SANE[ccy][1];
function histRate(ccy){
  if(ccy==='USD')return 1;
  const m=loadManual();
  return ccy==='CAD'?1/(m.cad||1.3719):(m.mxn||0.0488);
}
function liveRate(ccy){
  if(ccy==='USD'||fxMode()==='fixed')return histRate(ccy);
  return FX[ccy]?.rate||histRate(ccy);
}
// Antes de la primera consulta se usa el último valor bueno guardado.
(function(){const s=loadSavedFx();['CAD','MXN'].forEach(c=>{if(s[c]&&saneFx(c,s[c].rate))FX[c]={...s[c],stale:false};});})();

// 1) La hoja (misma fuente que los precios): json.fx = {CADUSD, MXNUSD} o filas con ticker CADUSD / MXNUSD.
// 2) Respaldo: API pública de Frankfurter (BCE, una vez por día hábil). 3) Si falla todo: último valor bueno guardado.
const FX_SHEET_TICKERS={CADUSD:'CAD',MXNUSD:'MXN'};
const fxSheetKey=t=>String(t||'').toUpperCase().replace('CURRENCY:','');
async function updateFx(sheetJson){
  fxChecked=true;
  if(fxMode()==='fixed')return;
  const got={};
  Object.entries(FX_SHEET_TICKERS).forEach(([k,c])=>{
    const row=(sheetJson?.positions||[]).find(p=>fxSheetKey(p.ticker)===k);
    const r=parseFloat(sheetJson?.fx?.[k]??row?.precio);
    if(saneFx(c,r))got[c]={rate:r,source:'Google Finance (hoja)'};
  });
  if(!got.CAD||!got.MXN){
    try{
      const j=await (await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=CAD,MXN')).json();
      ['CAD','MXN'].forEach(c=>{const per=j?.rates?.[c], r=per>0?1/per:NaN; if(!got[c]&&saneFx(c,r))got[c]={rate:r,source:'Frankfurter (BCE, '+(j.date||'')+')'};});
    }catch(e){}
  }
  const saved=loadSavedFx(), now=new Date().toISOString();
  ['CAD','MXN'].forEach(c=>{
    if(got[c]){FX[c]={...got[c],at:now,stale:false}; saved[c]={rate:got[c].rate,at:now,source:got[c].source};}
    else if(saved[c]&&saneFx(c,saved[c].rate)) FX[c]={...saved[c],stale:true};
    else FX[c]=null;
  });
  localStorage.setItem(FX_KEY,JSON.stringify(saved));
}
const fmtFxDate=iso=>iso?new Date(iso).toLocaleString('es-MX',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
const usdPer=ccy=>1/liveRate(ccy);
function fxSummary(){
  const pair=`USD/CAD ${usdPer('CAD').toFixed(4)} · USD/MXN ${usdPer('MXN').toFixed(2)}`;
  if(fxMode()==='fixed') return {text:`${pair} · fijo (Configurar)`,stale:false};
  const stale=['CAD','MXN'].some(c=>!FX[c]||FX[c].stale);
  const ref=FX.CAD||FX.MXN;
  if(!ref) return {text:`${pair} · sin dato en vivo: fijo de Configurar`,stale:fxChecked};
  return {text:`${pair} · ${stale?'desactualizado':'en vivo'}${ref.at?' · '+fmtFxDate(ref.at):''}${ref.source?' · '+ref.source:''}`,stale};
}
function fxAlerts(){
  if(fxMode()==='fixed'||!fxChecked)return [];
  const out=[];
  ['CAD','MXN'].forEach(c=>{
    if(FX[c]?.stale) out.push({type:'warn',msg:`Tipo de cambio USD/${c} desactualizado: se usa el último valor bueno (${usdPer(c).toFixed(c==='CAD'?4:2)}) del ${fmtFxDate(FX[c].at)}`});
    else if(!FX[c]) out.push({type:'warn',msg:`Sin tipo de cambio USD/${c} en vivo: se usa el fijo de Configurar (${usdPer(c).toFixed(c==='CAD'?4:2)}).`});
  });
  return out;
}

// ─── VALUACIÓN ───
// P/L total = P/L por inversión (movimiento en moneda local, al TC histórico) + P/L por tipo de cambio.
// El efectivo no tiene un TC histórico real (no hay fecha de depósito): su costo se convierte al mismo TC
// que su valor, así su P/L solo refleja el rendimiento nominal (p. ej. el 6.5% en MXN) y no un efecto cambiario
// inventado. El tipo de cambio sí sigue moviendo su valor en USD.
const FX_NEUTRAL_CATS=['cash'];
function revalue(){
  positions.forEach(p=>{
    const live=liveRate(p.ccy), neutral=FX_NEUTRAL_CATS.includes(p.cat), hist=neutral?live:histRate(p.ccy);
    p.priceUSD=p.priceN*live;
    p.valueUSD=p.units*p.priceUSD;
    p.costUSD=p.costN*hist;
    p.costTotalUSD=p.units*p.costUSD;
    p.pnlFxUSD=p.units*p.priceN*(live-hist);
    p.pnlInvUSD=p.valueUSD-p.costTotalUSD-p.pnlFxUSD;
  });
}
function applyManual(d){
  const set=(t,val,cost)=>positions.filter(p=>p.ticker===t).forEach(p=>{p.units=1;p.priceN=val;p.costN=cost;});
  set('RRSP-SC',d.rrspSc||22623,d.rrspScCost||d.rrspSc||22623);
  set('RRSP-WS',d.rrspWs||29499,d.rrspWsCost||26066);
  set('AGF-CA',d.agf||31588,d.agfCost||24700);
  set('AFORE',d.afore||1385366,d.aforeCost||d.afore||1385366);
  set('CASH-MX',d.cashMx||0,d.cashMxCost||d.cashMx||0);
  set('CASH-CA',d.cashCa||0,d.cashCaCost||d.cashCa||0);
}
function resetPositions(){
  positions=STATIC_POSITIONS.map(normalizePos);
  applyManual(loadManual());
  revalue();
}

// ─── ESTRATEGIA (opción A) ───
// Fuente única de metas y reglas: la usan Estrategia, Asignación, Plan DCA y el prompt de IA.
const STRATEGY_DATE='13 nov 2026';
const STRATEGY_THESIS='Construir patrimonio a 15 años con un núcleo de acciones globales, reduciendo gradualmente la concentración en cripto sin vender en pérdida. BTC se mantiene como reserva de valor de largo plazo.';
const ASSET_CLASSES=[
  {key:'us',    label:'Acciones EE.UU.',          target:42, color:'#1a50a0', note:'Índices + acciones individuales de EE.UU.'},
  {key:'intl',  label:'Acciones internacionales', target:18, color:'#5a3fa0', note:'Desarrollados y emergentes fuera de EE.UU.'},
  {key:'crypto',label:'Cripto',                   target:25, color:'#b53a2f', note:'BTC como reserva de valor; incluye COIN y BMNR'},
  {key:'gold',  label:'Oro',                      target:5,  color:'#854f0b', note:'Cobertura ante caídas e inflación'},
  {key:'fixed', label:'Renta fija / Cash',        target:10, color:'#6a7080', note:'Colchón de liquidez; MXN rinde 6.5% fijo'},
];
// ─── MEZCLAS POR CLASE (look-through) ───
// Cualquier posición puede tener una mezcla opcional. Cada componente tiene un tipo que define a qué clase de la
// estrategia suma y qué correlación usa. Sin mezcla válida, la posición cuenta 100% en su clase única.
const COMPONENT_TYPES={
  us:    {label:'Acciones EE.UU.',          cls:'us',     bucket:'index'},
  intl:  {label:'Acciones internacionales', cls:'intl',   bucket:'intl'},
  crypto:{label:'Cripto',                   cls:'crypto', bucket:'crypto'},
  gold:  {label:'Oro',                      cls:'gold',   bucket:'hedge'},
  bonds: {label:'Renta fija (bonos)',       cls:'fixed',  bucket:'bonds'},
  cash:  {label:'Efectivo',                 cls:'fixed',  bucket:'cash'},
};
// Los perfiles oficiales suelen sumar entre 99% y 101% por redondeo; dentro de esa tolerancia se normaliza a 100%.
const MIX_TOLERANCE=1;
const MIX_KEY='plv2_mixes';
const DEFAULT_MIXES=[{ticker:'AGF-CA',date:'2026-10-31',source:'Perfil oficial AGF Asset Builder Fund III, serie DSC · MER 2.59%',parts:[
  {label:'Renta variable EE.UU.',pct:36.4,type:'us'},
  {label:'Renta fija canadiense',pct:34.6,type:'bonds'},
  {label:'Renta variable canadiense',pct:26.0,type:'intl'},
  {label:'Renta variable internacional',pct:1.6,type:'intl'},
  {label:'Efectivo',pct:2.3,type:'cash'},
]}];
function loadMixes(){try{const s=JSON.parse(localStorage.getItem(MIX_KEY)||'null');return Array.isArray(s)?s:DEFAULT_MIXES;}catch(e){return DEFAULT_MIXES;}}
const mixSum=m=>(m.parts||[]).reduce((s,x)=>s+(parseFloat(x.pct)||0),0);
const mixValid=m=>!!(m.parts?.length&&m.parts.every(x=>COMPONENT_TYPES[x.type]&&parseFloat(x.pct)>=0)&&Math.abs(mixSum(m)-100)<=MIX_TOLERANCE);
function mixFor(ticker){const m=loadMixes().find(x=>x.ticker===ticker);return m&&mixValid(m)?m:null;}
function mixAlerts(){
  const out=[];
  loadMixes().forEach(m=>{
    if(!mixValid(m)) out.push({type:'warn',msg:`La mezcla de ${m.ticker} suma ${mixSum(m).toFixed(1)}% (debe ser 100% ±${MIX_TOLERANCE}); no se usa y la posición cuenta en su clase única.`});
    else if(m.date&&(Date.now()-new Date(m.date))/864e5>100) out.push({type:'warn',msg:`La mezcla de ${m.ticker} es del ${m.date}. Actualízala con el perfil trimestral más reciente.`});
  });
  return out;
}
const dataAlerts=()=>[...fxAlerts(),...mixAlerts()];

// Vehículo preferido para acumular en cada clase, en orden. Se elige el primero que ya tengas.
// VEA va antes que VGK porque VGK (Europa) ya está contenido en VEA (desarrollados ex-EE.UU.).
const CLASS_BUY_PREF={us:['VTI','VOO','SPYG'],intl:['VEA','VXUS','VGK'],gold:['GLD'],fixed:['CASH-MX','CASH-CA']};
function buyVehicle(key){
  const ap=activePos();
  const held=[...new Set(ap.filter(p=>!mixFor(p.ticker)&&assetClass(p)===key&&p.valueUSD>0).map(p=>p.ticker))];
  const pref=CLASS_BUY_PREF[key]||[];
  const ticker=pref.find(t=>held.includes(t))||pref[0];
  const accts=[...new Set(ap.filter(p=>p.ticker===ticker&&p.valueUSD>0).map(p=>p.acct))];
  return {ticker,held:held.includes(ticker),accts,others:held.filter(t=>t!==ticker)};
}
const CLASS_OVERRIDES={TSM:'intl'};
// Techo de cripto por año: baja gradualmente hasta la meta de 25% sin forzar ventas en pérdida.
const CRYPTO_CEILING={2026:45,2027:40,2028:36,2029:32,2030:28};
const cryptoCeiling=()=>CRYPTO_CEILING[new Date().getFullYear()]??25;
const REBAL_BAND=3;
const DCA_WEEKLY=300;

function assetClass(p){
  if(CLASS_OVERRIDES[p.ticker])return CLASS_OVERRIDES[p.ticker];
  return ({crypto:'crypto',hedge:'gold',cash:'fixed',intl:'intl'}[p.cat])||'us';
}
// Escenario 'before' = cómo calculaba el dashboard antes del look-through: sin mezclas, categoría tal como
// la manda la hoja, TC fijo de Configurar y precios en CAD de la hoja tomados como USD.
function oldAssetClass(p){
  if(p.ticker==='TSM')return 'intl';
  return ({crypto:'crypto',hedge:'gold',cash:'fixed',intl:'intl'}[p.catSheet||p.cat])||'us';
}
function posValue(p,scn){
  if(scn!=='before')return p.valueUSD;
  return p.units*p.priceN*(p.live&&p.ccy!=='USD'?1:histRate(p.ccy));
}
function positionParts(p,scn){
  if(scn!=='before'){
    const m=mixFor(p.ticker);
    if(m){const s=mixSum(m);return m.parts.map(x=>({type:x.type,cls:COMPONENT_TYPES[x.type].cls,share:(parseFloat(x.pct)||0)/s}));}
  }
  return [{type:null,cls:scn==='before'?oldAssetClass(p):assetClass(p),share:1}];
}
function classBreakdown(scn){
  const by={}; let t=0;
  ASSET_CLASSES.forEach(c=>by[c.key]=0);
  activePos().forEach(p=>{const v=posValue(p,scn); t+=v; positionParts(p,scn).forEach(x=>{by[x.cls]+=v*x.share;});});
  return {t,by,pct:k=>t>0?by[k]/t*100:0};
}
// Reparte el DCA semanal entre las clases por debajo de su meta, proporcional al hueco en USD. Nunca a cripto.
function dcaPlan(scn){
  const {t,by}=classBreakdown(scn);
  const gaps=ASSET_CLASSES.filter(c=>c.key!=='crypto')
    .map(c=>({...c,gap:Math.max(0,c.target/100*t-by[c.key])})).filter(c=>c.gap>0);
  const sum=gaps.reduce((s,c)=>s+c.gap,0);
  if(!sum)return [];
  const plan=gaps.map(c=>({...c,amt:Math.round(DCA_WEEKLY*c.gap/sum/10)*10})).filter(c=>c.amt>0)
    .sort((a,b)=>b.amt-a.amt);
  if(plan.length)plan[0].amt+=DCA_WEEKLY-plan.reduce((s,c)=>s+c.amt,0);
  return plan;
}
// Venta de cripto (con ganancia) necesaria para volver al techo, reinvirtiendo en los huecos.
function cryptoExcessUSD(scn){
  const {t,by}=classBreakdown(scn);
  return Math.max(0,by.crypto-cryptoCeiling()/100*t);
}
// Estado de una clase contra su meta. Es la única fuente de color de estado en todo el dashboard:
// ok = en banda · warn = fuera de banda (lo corrige el DCA) · bad = cripto arriba del techo (requiere vender).
function targetStatus(key,scn){
  const c=ASSET_CLASSES.find(x=>x.key===key), a=classBreakdown(scn).pct(key);
  if(key==='crypto'&&a>cryptoCeiling()) return {level:'bad',label:'Arriba del techo',a};
  if(a>c.target+REBAL_BAND) return {level:'warn',label:key==='crypto'?'En transición':'Arriba',a};
  if(a<c.target-REBAL_BAND) return {level:'warn',label:'Debajo',a};
  return {level:'ok',label:'En meta',a};
}
const STATUS_LEGEND=`<div class="legend-status"><span class="s-ok">En meta (±${REBAL_BAND} pts)</span><span class="s-warn">Fuera de banda: lo corrige el DCA</span><span class="s-bad">Arriba del techo: vender con ganancia</span></div>`;
function strategyAlerts(scn){
  const ceil=cryptoCeiling(), out=[];
  ASSET_CLASSES.forEach(c=>{
    const s=targetStatus(c.key,scn), a=s.a.toFixed(1);
    if(s.level==='ok')return;
    let msg;
    if(c.key==='crypto') msg=s.level==='bad'
      ?`Cripto en ${a}% rebasa el techo de ${ceil}% para ${new Date().getFullYear()}. Vende ~${fmt(cryptoExcessUSD(scn))} de BTC (con ganancia) y reinviértelo en los huecos.`
      :`Cripto en ${a}% (techo ${ceil}%, meta ${c.target}%). No agregues más; se diluye con las aportaciones en ~${yearsToCryptoTarget(scn).toFixed(1)} años.`;
    else msg=s.a<c.target
      ?`${c.label} en ${a}% (meta ${c.target}%). El Plan DCA lo prioriza.`
      :`${c.label} en ${a}% (meta ${c.target}%). No compres más hasta que regrese a la banda de ±${REBAL_BAND} pts.`;
    out.push({type:s.level,msg});
  });
  return out;
}
// Años para llegar a la meta solo con aportaciones, si cripto se mantiene plano.
function yearsToCryptoTarget(scn){
  const {t,by}=classBreakdown(scn), tgt=ASSET_CLASSES.find(c=>c.key==='crypto').target/100;
  const need=by.crypto/tgt-t;
  return need>0?need/(DCA_WEEKLY*52):0;
}
const acctLabel = a=>({MX:'MX',CA:'CA',CA2:'CA2',CRYPTO:'Cripto',RETIRO:'Retiro',BITSO:'Bitso',AGF:'AGF'}[a]||a);
const acctClass = a=>({MX:'a-mx',CA:'a-ca',CA2:'a-ca',CRYPTO:'a-cr',RETIRO:'a-rr',BITSO:'a-cr',AGF:'a-rr'}[a]||'a-mx');

function setStatus(s,t){
  document.getElementById('statusDot').className='dot'+(s==='live'?' live':s==='err'?' err':'');
  document.getElementById('statusTxt').textContent=t;
}
function setUpdated(){document.getElementById('lastUpd').textContent='Actualizado '+new Date().toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});}

// ─── FETCH ───
// Moneda del precio que manda la hoja: columna "moneda" si existe; si no, la lista de ETFs canadienses.
function sheetCcy(lp){
  const m=String(lp.moneda||'').toUpperCase();
  if(['USD','CAD','MXN'].includes(m))return m;
  return CAD_PRICED_TICKERS.includes(lp.ticker)?'CAD':'USD';
}
async function fetchAll(){
  if(!sheetUrl){setStatus('','Sin URL');renderAll();return;}
  setStatus('','Cargando...');
  let json=null, ok=true;
  try{
    // Reinicia desde los estáticos en cada carga para no duplicar
    positions=STATIC_POSITIONS.map(normalizePos);
    applyManual(loadManual());

    const res=await fetch(sheetUrl+'&_='+Date.now());
    json=await res.json();
    if(json.ok&&Array.isArray(json.positions)){
      json.positions.filter(p=>p.ticker&&p.precio>0&&!FX_SHEET_TICKERS[fxSheetKey(p.ticker)]).forEach(lp=>{
        const catSheet = (lp.categoria==='metals'||lp.categoria==='hedge') ? 'hedge' : (lp.categoria||'index');
        const cat = CAT_OVERRIDES[lp.ticker]||catSheet;
        const units = parseFloat(lp.acciones)||1;
        const cost  = parseFloat(lp.costBase)||lp.precio;
        const ccy   = sheetCcy(lp);
        const idx=positions.findIndex(p=>p.ticker===lp.ticker&&p.acct===lp.cuenta);
        if(idx>=0){
          Object.assign(positions[idx],{priceN:lp.precio,costN:cost,units,ccy,cat,catSheet,live:true});
        } else {
          positions.push({ticker:lp.ticker,name:lp.nombre||lp.ticker,units,ccy,priceN:lp.precio,costN:cost,cat,catSheet,acct:lp.cuenta||'MX',live:true});
        }
      });
    }
    if(cryptoUrl){
      try{
        const res2=await fetch(cryptoUrl);
        const json2=await res2.json();
        if(json2.ok&&Array.isArray(json2.positions)){
          // Map CoinGecko IDs → dashboard tickers
          const CGID_TO_TICKER = {
            'bitcoin':'BTC','ethereum':'ETH','staked-ether':'STETH',
            'solana':'SOL','aave':'AAVE','hyperliquid':'HYPE',
            'chainlink':'LINK','arbitrum':'ARB','uniswap':'UNI',
            'matic-network':'MATIC','cardano':'ADA','polkadot':'DOT'
          };
          json2.positions.filter(p=>p.ticker&&p.precio>0).forEach(lp=>{
            const dashTicker = CGID_TO_TICKER[lp.ticker.toLowerCase()] || lp.ticker.toUpperCase();
            const units = parseFloat(lp.unidades)||1;
            const cost  = parseFloat(lp.costBase)||lp.precio;
            const idx=positions.findIndex(p=>p.ticker===dashTicker&&p.acct===lp.cuenta);
            if(idx>=0) Object.assign(positions[idx],{priceN:lp.precio,costN:cost,units,live:true});
          });
        }
      }catch(e){}
    }
  }catch(e){ok=false;}
  await updateFx(json);
  revalue();
  if(ok){
    setStatus('live','En vivo · Google Finance');
    setUpdated();
    saveSnapshot();
  } else setStatus('err','Error de conexión');
  renderAll();
}

// ─── RENDER ALL ───
function renderAll(){
  updateHeader();
  const active=document.querySelector('.view.active');
  if(!active)return;
  const id=active.id.replace('view-','');
  if(id==='overview')renderOverview();
  if(id==='strategy')renderStrategy();
  if(id==='positions')renderPositions();
  if(id==='allocation')renderAllocation();
  if(id==='correlation')renderCorrelation();
  if(id==='recs')renderRecs();
  if(id==='dca')renderDCA();
  if(id==='historial')renderHistorial();
  if(id==='retirement')renderRetirement();
}

function updateHeader(){
  const ta=totalActive(), tr=totalRetiro();
  document.getElementById('hdrTotal').textContent=fmt(ta);
  document.getElementById('hdrSub').textContent='Portafolio activo · retiro '+fmt(tr)+' aparte';
  const fx=fxSummary(), el=document.getElementById('fxInfo');
  el.textContent=fx.text; el.className='hdr-sub'+(fx.stale?' s-warn':'');
}

// ─── OVERVIEW ───
function renderOverview(){
  const ap=activePos(), t=totalActive();
  const byCat=catBuckets();
  const totalCost=ap.reduce((s,p)=>s+p.costTotalUSD,0);
  const pnlAmt=t-totalCost, pnlPct=totalCost>0?(pnlAmt/totalCost)*100:0;
  const cb=classBreakdown();
  const cryptoPct=cb.pct('crypto'), goldPct=cb.pct('gold'), ceil=cryptoCeiling();
  const wCorr=calcCorr(), wInv=calcCorrInvested();
  const pnlFx=ap.reduce((s,p)=>s+(p.pnlFxUSD||0),0), pnlInv=pnlAmt-pnlFx;
  const sgn=n=>(n>=0?'+':'-')+fmt(Math.abs(n));

  document.getElementById('overviewCards').innerHTML=`
    <div class="card"><div class="card-lbl">Portafolio activo</div><div class="card-val">${fmt(t)}</div><div class="card-sub">MX+CA+Cripto+Bitso+AGF</div></div>
    <div class="card"><div class="card-lbl">P/L total activo</div><div class="card-val ${pnlPct>=0?'up':'down'}">${fmtPct(pnlPct)}</div><div class="card-sub ${pnlPct>=0?'up':'down'}">${sgn(pnlAmt)}</div><div class="card-sub">inversión ${sgn(pnlInv)} · tipo de cambio ${sgn(pnlFx)}</div></div>
    <div class="card"><div class="card-lbl">Correlación interna</div><div class="card-val ${wCorr>=0.80?'down':''}">${wCorr.toFixed(2)}</div><div class="card-sub">sin efectivo ${wInv.toFixed(2)} · meta &lt; 0.65</div></div>
    <div class="card"><div class="card-lbl">Cripto</div><div class="card-val s-${targetStatus('crypto').level}">${cryptoPct.toFixed(1)}%</div><div class="card-sub">techo ${ceil}% · meta 25%</div></div>
    <div class="card"><div class="card-lbl">Oro</div><div class="card-val s-${targetStatus('gold').level}">${goldPct.toFixed(1)}%</div><div class="card-sub">meta 5%</div></div>`;

  const accts=['MX','CA','CRYPTO','BITSO','AGF'];
  const colors={'MX':'#1a50a0','CA':'#b53a2f','CRYPTO':'#8a5f0a','BITSO':'#c45c0a','AGF':'#0d7a5a'};
  document.getElementById('acctBreakdown').innerHTML=accts.map(a=>{
    const v=ap.filter(p=>p.acct===a).reduce((s,p)=>s+p.valueUSD,0);
    if(v===0)return '';
    const pct=(v/t*100);
    return `<div style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
        <span style="font-family:var(--mono);font-weight:500;">${acctLabel(a)}</span>
        <span style="font-family:var(--mono);color:var(--muted);">${fmt(v)} · ${pct.toFixed(1)}%</span>
      </div>
      <div style="height:6px;background:var(--surface2);border-radius:3px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:${colors[a]};border-radius:3px;opacity:.75;"></div>
      </div></div>`;
  }).join('');

  // Donut — por clase de activo
  const clsEntries=ASSET_CLASSES.filter(c=>cb.by[c.key]>0);
  if(donutChart)donutChart.destroy();
  donutChart=new Chart(document.getElementById('donutChart'),{type:'doughnut',data:{
    labels:clsEntries.map(c=>c.label),
    datasets:[{data:clsEntries.map(c=>Math.round(cb.by[c.key])),backgroundColor:clsEntries.map(c=>c.color),borderWidth:0,hoverOffset:4}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'65%',plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${fmt(ctx.parsed)} (${(ctx.parsed/t*100).toFixed(1)}%)`}}}}
  });

  // Retiro banner
  const rp=retiroPos();
  const retiroItems=[
    {ticker:'RRSP-SC',name:'RRSP Scotiabank'},
    {ticker:'RRSP-WS',name:'RRSP Wealthsimple'},
    {ticker:'AFORE',name:'AFORE México'},
  ];
  document.getElementById('retiroBanner').innerHTML=retiroItems.map(ri=>{
    const p=rp.find(x=>x.ticker===ri.ticker);
    if(!p)return '';
    const pnl=p.costTotalUSD>0?((p.valueUSD-p.costTotalUSD)/p.costTotalUSD)*100:null;
    return `<div class="retiro-item">
      <div class="retiro-name">${ri.name}</div>
      <div class="retiro-val">${fmt(p.valueUSD)}</div>
      ${pnl!==null?`<div class="retiro-pnl ${pnl>=0?'up':'down'}">${fmtPct(pnl)}</div>`:''}
    </div>`;
  }).join('');

  // Alerts — active only
  const alerts=[...dataAlerts(),...strategyAlerts()];
  if(wCorr>0.80)alerts.push({type:'warn',msg:`Correlación interna de ${wCorr.toFixed(2)} — muy alta. El Plan DCA prioriza las clases que la bajan.`});
  const plan=dcaPlan();
  document.getElementById('weekAction').innerHTML=`
    <div class="week-box">
      <div class="slbl" style="margin-bottom:6px;">Compras de esta semana · ${fmt(DCA_WEEKLY)}</div>
      ${plan.length?plan.map(c=>{const v=buyVehicle(c.key), accts=v.accts.length?v.accts:['MX'];
        return `<div class="week-row"><span><span class="tk">${v.ticker}</span> <span style="font-size:11px;color:var(--muted);">${c.label} · ${accts.join(', ')}</span></span><span class="mono up">${fmt(c.amt)}</span></div>`;}).join('')
        :'<div class="week-row">Todas las clases están en meta.</div>'}
      <button class="btn btn-sm" style="margin-top:10px;" onclick="sv('dca')">Ver plan DCA</button>
    </div>
    <div class="week-box">
      <div class="slbl" style="margin-bottom:10px;">Alertas de la estrategia</div>
      ${alerts.length?alerts.map(a=>`<div class="${a.type}">${a.msg}</div>`).join(''):'<div class="ok">Todo en meta. Solo sigue el DCA.</div>'}
    </div>`;
}

// ─── POSITIONS ───
function sortBy(col){
  if(sortCol===col) sortDir*=-1;
  else{sortCol=col;sortDir=1;}
  renderPositions();
}
function renderPositions(){
  const t=(acctFilter==='all'||acctFilter==='RETIRO')?totalAll():totalActive();
  let filtered;
  const isCombined=acctFilter==='combined';
  if(acctFilter==='active'||isCombined) filtered=activePos();
  else if(acctFilter==='all') filtered=positions;
  else filtered=positions.filter(p=>p.acct===acctFilter);

  if(isCombined){
    const byTicker={};
    filtered.forEach(p=>{
      if(!byTicker[p.ticker]) byTicker[p.ticker]={ticker:p.ticker,name:p.name,cat:p.cat,ccy:p.ccy,priceN:p.priceN,priceUSD:p.priceUSD,units:0,costTotalUSD:0,valueUSD:0,pnlFxUSD:0,accts:[]};
      const g=byTicker[p.ticker];
      g.units+=p.units; g.costTotalUSD+=p.costTotalUSD; g.valueUSD+=p.valueUSD; g.pnlFxUSD+=p.pnlFxUSD||0;
      if(!g.accts.includes(p.acct)) g.accts.push(p.acct);
      g.priceUSD=p.priceUSD;
    });
    filtered=Object.values(byTicker).map(g=>({...g,costUSD:g.units>0?g.costTotalUSD/g.units:0}));
  }

  const filteredTotal=filtered.reduce((s,p)=>s+p.valueUSD,0);
  const filteredCost=filtered.reduce((s,p)=>s+p.costTotalUSD,0);
  const filteredPnlAmt=filteredTotal-filteredCost;
  const filteredPnlPct=filteredCost>0?(filteredPnlAmt/filteredCost)*100:0;
  document.getElementById('posCount').textContent=filtered.length+(isCombined?' tickers combinados':' posiciones')+' · '+fmt(filteredTotal);

  // Update header indicators
  ['ticker','cat','acct','priceUSD','costUSD','units','valueUSD','pnlPct','weight'].forEach(c=>{
    const el=document.getElementById('sh-'+c);
    if(el) el.textContent=sortCol===c?(sortDir===1?' ↓':' ↑'):'';
  });

  const sorted=[...filtered].sort((a,b)=>{
    let av, bv;
    if(sortCol==='ticker') {av=a.ticker;bv=b.ticker;return sortDir*(av<bv?-1:av>bv?1:0);}
    if(sortCol==='cat')    {av=a.cat;bv=b.cat;return sortDir*(av<bv?-1:av>bv?1:0);}
    if(sortCol==='acct')   {av=a.acct;bv=b.acct;return sortDir*(av<bv?-1:av>bv?1:0);}
    if(sortCol==='costUSD'){
      av=a.units>0?a.costTotalUSD/a.units:0;
      bv=b.units>0?b.costTotalUSD/b.units:0;
    } else if(sortCol==='pnlPct'){
      av=a.costTotalUSD>0?((a.valueUSD-a.costTotalUSD)/a.costTotalUSD):0;
      bv=b.costTotalUSD>0?((b.valueUSD-b.costTotalUSD)/b.costTotalUSD):0;
    } else if(sortCol==='weight'){
      av=a.valueUSD/t; bv=b.valueUSD/t;
    } else {
      av=a[sortCol]||0; bv=b[sortCol]||0;
    }
    return sortDir*(bv-av);
  });

  document.getElementById('posTable').innerHTML=sorted.map(p=>{
    const pnl=p.costTotalUSD>0?((p.valueUSD-p.costTotalUSD)/p.costTotalUSD)*100:0;
    const pnlA=p.valueUSD-p.costTotalUSD;
    const acctCell=isCombined
      ? (p.accts||[p.acct]).map(a=>`<span class="abadge ${acctClass(a)}">${a}</span>`).join(' ')
      : `<span class="abadge ${acctClass(p.acct)}">${p.acct}</span>`;
    const costPerUnit=p.units>0?p.costTotalUSD/p.units:0;
    const mix=mixFor(p.ticker);
    const native=p.ccy&&p.ccy!=='USD'?`<br><span style="font-size:11px;color:var(--muted);">${p.ccy} ${(p.priceN||0).toLocaleString('en-US',{maximumFractionDigits:2})}</span>`:'';
    const fxLine=Math.abs(p.pnlFxUSD||0)>=1?`<br><span style="font-size:11px;color:var(--muted);">TC ${p.pnlFxUSD>=0?'+':'-'}${fmt(Math.abs(p.pnlFxUSD))}</span>`:'';
    return `<tr>
      <td><span class="tk">${p.ticker}</span><br><span style="font-size:11px;color:var(--muted);">${p.name}</span></td>
      <td><span class="cpill ${catClass(p.cat)}">${catLabel(p.cat)}</span>${mix?`<br><span class="cpill cm" title="Se reparte por clase según su mezcla (${escAttr(mix.date)})">mezcla</span>`:''}</td>
      <td style="white-space:nowrap;">${acctCell}</td>
      <td class="mono">${p.priceUSD<1?p.priceUSD.toFixed(4):fmt2(p.priceUSD)}${native}</td>
      <td class="mono">${p.priceUSD<1?costPerUnit.toFixed(4):fmt2(costPerUnit)}</td>
      <td class="mono">${p.units.toFixed(4)}</td>
      <td class="mono">${fmt(p.valueUSD)}</td>
      <td><span class="${pnl>=0?'pu':'pd'}">${fmtPct(pnl)}<br><span style="font-size:11px;">${pnlA>=0?'+':''}${fmt(pnlA)}</span></span>${fxLine}</td>
      <td class="pn">${(p.valueUSD/t*100).toFixed(1)}%</td>
    </tr>`;
  }).join('')+`
  <tr style="background:var(--surface2);border-top:2px solid var(--border-md);">
    <td colspan="2" style="font-family:var(--mono);font-size:12px;font-weight:500;padding:12px 16px;">Total</td>
    <td></td><td></td><td></td><td></td>
    <td style="font-family:var(--mono);font-size:13px;font-weight:500;padding:12px 16px;">${fmt(filteredTotal)}</td>
    <td style="padding:12px 16px;"><span class="${filteredPnlPct>=0?'pu':'pd'}">${fmtPct(filteredPnlPct)}<br><span style="font-size:11px;">${filteredPnlAmt>=0?'+':''}${fmt(filteredPnlAmt)}</span></span></td>
    <td style="font-family:var(--mono);font-size:12px;padding:12px 16px;color:var(--muted);">${t>0?(filteredTotal/t*100).toFixed(1):'0.0'}%</td>
  </tr>`;
}

function filterAcct(a,btn){
  acctFilter=a;
  document.querySelectorAll('.at').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderPositions();
}

// ─── ALLOCATION (active only) ───
function renderAllocation(){
  const ap=activePos(), t=totalActive();
  const cb=classBreakdown(), ceil=cryptoCeiling();
  document.getElementById('allocCards').innerHTML=ASSET_CLASSES.map(c=>{
    const st=targetStatus(c.key);
    return `<div class="card"><div class="card-lbl">${c.label}</div><div class="card-val s-${st.level}">${st.a.toFixed(1)}%</div><div class="card-sub">meta ${c.target}%${c.key==='crypto'?' · techo '+ceil+'%':''}</div></div>`;
  }).join('');
  const bar=(label,sub,a,usd,color,target,extra,level)=>{
    const diff=target==null?null:a-target, st=level?'s-'+level:'';
    return `<div class="ar">
      <div class="al">${label}<span class="as">${sub}</span></div>
      <div class="bt"><div class="bf" style="width:${Math.min(a,100)}%;background:${color};opacity:.8;"></div>${target!=null?`<div class="btg" style="left:${target}%;"></div>`:''}${extra||''}</div>
      <div class="ap ${st}">${a.toFixed(1)}%</div>
      <div class="au">${fmt(usd)}</div>
      <div class="ad mono ${st}" style="font-size:12px;">${diff==null?'':(diff>0?'+':'')+diff.toFixed(1)+'%'}</div>
    </div>`;
  };
  const byCat=catBuckets();
  document.getElementById('allocBars').innerHTML=STATUS_LEGEND+
    ASSET_CLASSES.map(c=>bar(c.label,c.note,cb.pct(c.key),cb.by[c.key],c.color,c.target,
      c.key==='crypto'?`<div class="btg" style="left:${ceil}%;background:var(--red);" title="Techo ${ceil}%"></div>`:'',targetStatus(c.key).level)).join('')+
    mixNote()+
    `<div class="slbl" style="margin:18px 0 10px;">Detalle por categoría — informativo, sin meta, con look-through de mezclas</div>`+
    Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([k,v])=>bar(catLabel(k),'',v/t*100,v,'#9a9a90',null)).join('');
  document.getElementById('allocAlerts').innerHTML=[...dataAlerts(),...strategyAlerts()].map(a=>`<div class="${a.type}">${a.msg}</div>`).join('');
  renderCompare();
  const tks={};
  ap.filter(p=>!['CRYPTO','BITSO'].includes(p.acct)).forEach(p=>{if(!tks[p.ticker])tks[p.ticker]={};tks[p.ticker][p.acct]=(tks[p.ticker][p.acct]||0)+p.valueUSD;});
  const overlaps=Object.entries(tks).filter(([,v])=>Object.keys(v).length>1);
  document.getElementById('overlapTbl').innerHTML=overlaps.map(([tk,v])=>{
    const tot=Object.values(v).reduce((s,x)=>s+x,0);
    const action='Mismo activo en varias cuentas: concentra compras nuevas en una sola';
    return `<tr><td><span class="tk">${tk}</span></td><td class="mono">${v.MX?fmt(v.MX):'—'}</td><td class="mono">${v.CA?fmt(v.CA):'—'}</td><td class="mono">—</td><td class="mono">${fmt(tot)}</td><td style="font-size:11px;color:var(--amber);">${action}</td></tr>`;
  }).join('');
}

// Antes = cálculo previo (AGF-CA 100% EE.UU., categoría de la hoja, TC fijo, ZSP/XSP sin convertir de CAD).
// Después = look-through de mezclas + TC del día. Se calcula con los datos cargados en este momento.
function mixNote(){
  const held=new Set(activePos().map(p=>p.ticker));
  const used=loadMixes().filter(m=>held.has(m.ticker)&&mixValid(m));
  if(!used.length)return '';
  return `<div style="font-size:11px;color:var(--muted);font-family:var(--mono);margin-top:6px;line-height:1.6;">Look-through: `+used.map(m=>{
    const by={}, sum=mixSum(m); m.parts.forEach(x=>{const c=COMPONENT_TYPES[x.type].cls;by[c]=(by[c]||0)+x.pct/sum*100;});
    return `${m.ticker} (mezcla del ${m.date}) = `+ASSET_CLASSES.filter(c=>by[c.key]).map(c=>`${c.label} ${by[c.key].toFixed(1)}%`).join(', ');
  }).join(' · ')+`</div>`;
}
function renderCompare(){
  const B='before', cbB=classBreakdown(B), cbA=classBreakdown();
  const sd=n=>(n>=0?'+':'')+n.toFixed(1)+' pts';
  const gap=n=>n>0.5?'falta '+fmt(n):n<-0.5?'sobra '+fmt(-n):'—';
  const planTxt=pl=>pl.length?pl.map(c=>`${buyVehicle(c.key).ticker} ${fmt(c.amt)}`).join(' · '):'Sin huecos';
  const alertList=al=>al.length?'<ul style="margin:6px 0 0 18px;font-size:12px;line-height:1.6;">'+al.map(x=>`<li class="s-${x.type==='bad'?'bad':'warn'}">${x.msg}</li>`).join('')+'</ul>':'<div class="s-ok" style="font-size:12px;">Sin alertas</div>';
  const cell='style="padding:8px 10px;"';
  document.getElementById('compareBody').innerHTML=`
    <div style="font-size:12px;color:var(--muted);line-height:1.6;margin-bottom:12px;">
      <strong>Antes:</strong> AGF-CA contaba 100% como Acciones EE.UU., VNQ como internacional, tipo de cambio fijo de Configurar y ZSP/XSP de la hoja sin convertir de CAD.
      <strong>Después:</strong> mezclas por clase y tipo de cambio del día (${fxSummary().text}).
    </div>
    <div class="tbl-wrap" style="margin-bottom:14px;"><table>
      <thead><tr><th>Clase</th><th>Meta</th><th>Antes</th><th>Después</th><th>Dif. antes</th><th>Dif. después</th><th>Hueco antes</th><th>Hueco después</th></tr></thead>
      <tbody>${ASSET_CLASSES.map(c=>{const b=cbB.pct(c.key),a=cbA.pct(c.key);return `<tr>
        <td ${cell}>${c.label}</td><td class="mono" ${cell}>${c.target}%</td>
        <td class="mono" ${cell}>${b.toFixed(1)}%</td><td class="mono s-${targetStatus(c.key).level}" ${cell}>${a.toFixed(1)}%</td>
        <td class="mono" ${cell}>${sd(b-c.target)}</td><td class="mono" ${cell}>${sd(a-c.target)}</td>
        <td class="mono" ${cell}>${gap(c.target/100*cbB.t-cbB.by[c.key])}</td><td class="mono" ${cell}>${gap(c.target/100*cbA.t-cbA.by[c.key])}</td></tr>`;}).join('')}
        <tr style="background:var(--surface2);"><td ${cell}><strong>Total activo</strong></td><td ${cell}></td><td class="mono" ${cell}>${fmt(cbB.t)}</td><td class="mono" ${cell}>${fmt(cbA.t)}</td><td colspan="4" ${cell}></td></tr>
      </tbody></table></div>
    <div class="week" style="margin-bottom:0;">
      <div class="week-box">
        <div class="slbl" style="margin-bottom:8px;">Plan DCA de la semana</div>
        <div style="font-size:12px;line-height:1.8;"><span style="color:var(--muted);">Antes:</span> ${planTxt(dcaPlan(B))}<br><span style="color:var(--muted);">Después:</span> ${planTxt(dcaPlan())}</div>
        <div class="slbl" style="margin:14px 0 8px;">Correlación interna estimada</div>
        <div style="font-size:12px;line-height:1.8;" class="mono">Antes: ${calcCorr(B).toFixed(2)} · sin efectivo ${calcCorrInvested(B).toFixed(2)}<br>Después: ${calcCorr().toFixed(2)} · sin efectivo ${calcCorrInvested().toFixed(2)}</div>
      </div>
      <div class="week-box">
        <div class="slbl">Alertas antes</div>${alertList(strategyAlerts(B))}
        <div class="slbl" style="margin-top:12px;">Alertas después</div>${alertList(strategyAlerts())}
      </div>
    </div>`;
}

// ─── CORRELATION (active only) ───
// Correlación supuesta de cada grupo contra el S&P 500. Renta fija (bonos) y efectivo son las más bajas.
const CAT_CORR={index:0.98,tech:0.87,crypto:0.52,intl:0.82,defense:0.68,hedge:0.05,bio:0.55,cash:0.01,realestate:0.75,bonds:0.15};
// Valor por categoría con look-through: la categoría de la posición o, si tiene mezcla, la de cada componente
// (p. ej. AGF reparte su parte canadiense a Internacional y sus bonos a Renta fija). Lo usan todas las vistas por categoría.
function catBuckets(scn,excludeCash){
  const by={};
  activePos().forEach(p=>{
    const v=posValue(p,scn);
    positionParts(p,scn).forEach(x=>{
      const b=x.type?COMPONENT_TYPES[x.type].bucket:(scn==='before'?(p.catSheet||p.cat):p.cat);
      if(excludeCash&&b==='cash')return;
      by[b]=(by[b]||0)+v*x.share;
    });
  });
  return by;
}
function calcCorr(scn,excludeCash){
  const by=catBuckets(scn,excludeCash), t=Object.values(by).reduce((s,v)=>s+v,0);
  return t>0?Object.entries(by).reduce((s,[k,v])=>s+v/t*(CAT_CORR[k]??0.7),0):0;
}
// Sin efectivo: el cash (corr ~0.01) baja el promedio y hace ver la cartera menos correlacionada de lo que está.
const calcCorrInvested=scn=>calcCorr(scn,true);
function renderCorrelation(){
  const ap=activePos(), t=totalActive();
  const byCat=catBuckets();
  const cb=classBreakdown(), wc=calcCorr(), wi=calcCorrInvested(), hp=cb.pct('gold'), cp=cb.pct('crypto');
  const corrCol=v=>v>=0.80?'var(--red)':v>=0.65?'var(--amber)':'var(--green)';
  const corrTxt=v=>v>=0.80?'Muy alta':v>=0.65?'Alta':'Moderada';
  document.getElementById('corrCards').innerHTML=`
    <div class="card"><div class="card-lbl">Correlación interna</div><div class="card-val" style="color:${corrCol(wc)}">${wc.toFixed(2)}</div><div class="card-sub">${corrTxt(wc)} · incluye efectivo · meta &lt; 0.65</div></div>
    <div class="card"><div class="card-lbl">Correlación de lo invertido</div><div class="card-val" style="color:${corrCol(wi)}">${wi.toFixed(2)}</div><div class="card-sub">${corrTxt(wi)} · sin efectivo</div></div>
    <div class="card"><div class="card-lbl">Oro (corr &lt;0.3)</div><div class="card-val" style="color:${hp>=5-REBAL_BAND?'var(--green)':'var(--red)'}">${hp.toFixed(1)}%</div><div class="card-sub">GLD · meta 5%</div></div>
    <div class="card"><div class="card-lbl">Crypto</div><div class="card-val" style="color:${cp<=8?'var(--green)':cp<=12?'var(--amber)':'var(--red)'}">${cp.toFixed(1)}%</div><div class="card-sub">Corr 0.52→0.75 en crisis</div></div>`;
  const cur=[
    Math.round(10+(1-(byCat.tech||0)/t)*40),
    Math.round(8+hp*1.5+((byCat.intl||0)/t)*20),
    Math.round(10+hp*2+((byCat.defense||0)/t)*30),
    Math.round(30+Math.max(0,10-cp)*2),
    Math.round(15+((byCat.intl||0)/t)*60),
    Math.round(8+hp*1.8+((byCat.defense||0)/t)*25),
  ];
  if(radarChart)radarChart.destroy();
  radarChart=new Chart(document.getElementById('radarChart'),{type:'radar',data:{
    labels:['Tech crash','Caída general','Inflación','Crypto crash','USD débil','Tasas+recesión'],
    datasets:[
      {label:'Actual',data:cur,borderColor:'#b53a2f',backgroundColor:'rgba(181,58,47,.07)',pointBackgroundColor:'#b53a2f',borderWidth:1.5,pointRadius:3},
      {label:'Objetivo',data:[30,45,58,62,50,40],borderColor:'#1a6b3a',backgroundColor:'rgba(26,107,58,.07)',pointBackgroundColor:'#1a6b3a',borderWidth:1.5,pointRadius:3}
    ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
    scales:{r:{min:0,max:100,ticks:{display:false},pointLabels:{font:{size:11},color:'#78776e'},grid:{color:'rgba(0,0,0,.05)'},angleLines:{color:'rgba(0,0,0,.05)'}}}}
  });
  // Con look-through: AGF-CA suma su parte de bonos y efectivo a esos grupos, no a "Index".
  const buckets=catBuckets(), bt=Object.values(buckets).reduce((s,v)=>s+v,0);
  const corrColor=c=>c>=0.8?'#b53a2f':c>=0.5?'#8a5f0a':'#1a6b3a';
  const risks=Object.entries(buckets).map(([k,v])=>({l:catLabel(k),c:CAT_CORR[k]??0.7,col:corrColor(CAT_CORR[k]??0.7),w:bt>0?v/bt*100:0}))
    .sort((a,b)=>b.c-a.c);
  document.getElementById('corrDetail').innerHTML=risks.map(r=>`
    <div class="ar">
      <div class="al">${r.l}<span class="as">Corr vs S&P: ${r.c.toFixed(2)} · ${r.w.toFixed(1)}% cartera activa</span></div>
      <div class="bt"><div class="bf" style="width:${r.c*100}%;background:${r.col};opacity:.6;"></div></div>
      <div class="ap">${r.c.toFixed(2)}</div>
    </div>`).join('');
  const gldNow=(byCat.hedge||0)/t*100;
  const progL=['Ahora',...[2,4,5,8,10].map(g=>'GLD '+g+'%')];
  const progD=[wc,...[2,4,5,8,10].map(g=>Math.max(0.35,wc-(g-gldNow)*0.009))];
  if(corrProgressChart)corrProgressChart.destroy();
  corrProgressChart=new Chart(document.getElementById('corrProgress'),{type:'line',data:{
    labels:progL,
    datasets:[{label:'Correlación',data:progD.map(v=>parseFloat(v.toFixed(3))),borderColor:'#1a50a0',backgroundColor:'rgba(26,80,160,.06)',tension:0.4,fill:true,pointRadius:4,pointBackgroundColor:'#1a50a0'}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>'Correlación: '+ctx.parsed.y.toFixed(2)}}},
    scales:{y:{min:0.3,max:1,ticks:{color:'#78776e',callback:v=>v.toFixed(2)},grid:{color:'rgba(0,0,0,.04)'}},x:{ticks:{color:'#78776e'},grid:{display:false}}}}
  });
}

// ─── RECOMMENDATIONS (AI-powered) ───
function renderRecs(){
  const cb=classBreakdown();
  document.getElementById('recsContext').textContent=
    `Portafolio activo: ${fmt(cb.t)} · `+ASSET_CLASSES.map(c=>`${c.label} ${cb.pct(c.key).toFixed(1)}%`).join(' · ');
}

async function callProxy(messages, useSearch){
  const body={model:'claude-sonnet-4-6',max_tokens:1500,messages};
  if(useSearch) body.tools=[{type:'web_search_20250305',name:'web_search'}];
  const idToken=sessionStorage.getItem('plv2_idtoken');
  const headers={'Content-Type':'application/json'};
  if(idToken) headers['Authorization']='Bearer '+idToken;
  const res=await fetch('https://portfolio-proxy.rcelaya.workers.dev',{
    method:'POST',headers,body:JSON.stringify(body)
  });
  if(res.status===401||res.status===403){
    let detail='';
    try{const e=await res.json(); detail=e.reason?(' ['+e.reason+(e.checks?' '+JSON.stringify(e.checks):'')+(e.email?' '+e.email:'')+']'):(' '+(e.error||''));}catch(_){}
    throw new Error('Acceso denegado'+detail+'. Cierra sesion (Salir) y vuelve a entrar con Google.');
  }
  if(!res.ok) throw new Error('Error del servidor: '+res.status);
  return await res.json();
}

async function generateRecs(){
  const btn=document.getElementById('recsBtn');
  const loading=document.getElementById('recsLoading');
  const output=document.getElementById('recsOutput');
  const empty=document.getElementById('recsEmpty');
  const bar=document.getElementById('recsProgressBar');
  const loadTxt=document.getElementById('recsLoadingTxt');

  btn.disabled=true; btn.textContent='Generando...';
  loading.style.display='block'; output.style.display='none'; empty.style.display='none';
  bar.style.width='10%'; loadTxt.textContent='Consultando mercado actual...';

  const ap=activePos();
  const wc=calcCorr();
  const cb=classBreakdown(), ceil=cryptoCeiling();

  try{
    const DEFAULT_CTX = 'S&P500 P/E ~26 niveles elevados. Fed tasas 3.5-3.75% un recorte proyectado 2026. Oro $4490/oz cerca maximos. BTC recupero $70k crypto constructivo.';
    const MARKET_CTX = (localStorage.getItem('plv2_market_ctx') || DEFAULT_CTX).replace(/"/g,"'").substring(0,200);

    bar.style.width='40%'; loadTxt.textContent='Analizando portafolio...';

    const topPos=[...ap].sort((a,b)=>b.valueUSD-a.valueUSD).slice(0,15).map(p=>{
      const pnl=p.costTotalUSD>0?((p.valueUSD-p.costTotalUSD)/p.costTotalUSD)*100:0;
      return `${p.ticker}(${p.acct},${mixFor(p.ticker)?'fondo mixto':assetClass(p)}) ${fmt(p.valueUSD)} PL${pnl>=0?'+':''}${pnl.toFixed(0)}%`;
    }).join(' | ');
    const actual=ASSET_CLASSES.map(c=>`${c.label} ${cb.pct(c.key).toFixed(1)}% (meta ${c.target}%)`).join(' | ');
    const plan=dcaPlan().map(c=>`${c.label} $${c.amt} en ${buyVehicle(c.key).ticker}`).join(', ')||'sin huecos';

    bar.style.width='65%'; loadTxt.textContent='Generando recomendaciones...';

    const s2=await callProxy([{role:'user',content:`Asesor de inversiones. Respeta la estrategia del inversionista; no la cambies.

ESTRATEGIA: horizonte 15 anos. Metas: Acciones EE.UU. 42%, Internacional 18%, Cripto 25%, Oro 5%, Renta fija/cash 10%. Cripto se reduce gradualmente: techo ${ceil}% este ano bajando hasta 25%. Reglas: (1) cero dinero nuevo a cripto hasta llegar a 25%; (2) solo se vende cripto si rebasa el techo, vendiendo BTC con ganancia; (3) altcoins fuera de la tesis, no agregar; (4) DCA $${DCA_WEEKLY}/sem a las clases con hueco; banda de rebalanceo +-${REBAL_BAND} pts. Cash MXN rinde 6.5% fijo.

ACTUAL: ${actual}
Plan DCA calculado: ${plan}
Top posiciones: ${topPos}
Correlacion interna estimada: ${wc.toFixed(2)} (sin efectivo: ${calcCorrInvested().toFixed(2)})
Nota: la asignacion ya reparte los fondos mixtos por clase (look-through), p. ej. AGF-CA es un fondo balanceado con bonos canadienses; no lo trates como indice de EE.UU.
Mercado: ${MARKET_CTX}

Tarea: "buy" = una entrada por cada linea del plan DCA, usando esos mismos tickers (ya estan en el portafolio; nunca cripto ni ETFs nuevos que dupliquen exposicion); dca_weekly debe sumar ${DCA_WEEKLY}. "reduce" = hasta 3 posiciones que no encajan con la estrategia o son redundantes, explicando si conviene vender ya o solo dejar de comprar.

Responde SOLO con JSON sin texto extra ni markdown:
{"market_context":"resumen breve","buy":[{"ticker":"VXUS","name":"nombre","action":"Comprar","rationale":"especifico al portafolio y la estrategia","corr_sp500":0.8,"dca_weekly":150,"account":"MX"}],"reduce":[{"ticker":"XXX","reason":"especifico"}]}`}], false);

    bar.style.width='90%'; loadTxt.textContent='Procesando...';

    if(!s2.content) {
      const errType = s2.type || 'unknown';
      const errMsg = s2.message || s2.error?.message || '';
      if(errType==='rate_limit_error' || errMsg.includes('rate limit')){
        throw new Error('Limite de velocidad de API alcanzado. Espera 60 segundos e intenta de nuevo.');
      }
      throw new Error('Respuesta invalida del modelo: ' + errType + ' ' + errMsg.substring(0,100));
    }

    const raw=s2.content.filter(b=>b.type==='text').map(b=>b.text).join('');
    const s=raw.indexOf('{'), e=raw.lastIndexOf('}');
    if(s===-1||e===-1) throw new Error('El modelo no devolvio JSON valido');
    const parsed=JSON.parse(raw.slice(s,e+1));
    bar.style.width='100%';

    const ab=a=>{const al=(a||'').toLowerCase();return al.includes('comprar')||al.includes('urgente')||al.includes('aumentar')?'rb-buy':al.includes('mantener')?'rb-hold':'rb-watch';};

    document.getElementById('recsBuyGrid').innerHTML=(parsed.buy||[]).map(r=>`
      <div class="rec-card">
        <div class="rec-header"><span class="rec-ticker">${r.ticker||''}</span><span class="rec-badge ${ab(r.action)}">${r.action||''}</span></div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">${r.name||''}</div>
        <div style="font-size:12px;color:var(--text);line-height:1.6;margin-bottom:8px;">${r.rationale||''}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">
          ${r.dca_weekly?`<span style="font-size:11px;font-family:var(--mono);color:var(--green);">$${r.dca_weekly}/sem · ${r.account||''}</span>`:`<span style="font-size:11px;font-family:var(--mono);color:var(--muted);">${r.account||''}</span>`}
          <div class="rec-corr" style="margin:0;"><span class="rc-lbl">Corr:</span>
            <div class="rc-bar"><div class="rc-fill" style="width:${(r.corr_sp500||0)*100}%;background:${(r.corr_sp500||0)<0.3?'#0d7a5a':(r.corr_sp500||0)<0.7?'#8a5f0a':'#b53a2f'};opacity:.7;"></div></div>
            <span class="rc-val">${(r.corr_sp500||0).toFixed(2)}</span></div>
        </div>
      </div>`).join('');

    // DCA summary — only items with dca_weekly defined
    const dcaItems=(parsed.buy||[]).filter(r=>r.dca_weekly>0);
    const dcaTotal=dcaItems.reduce((s,r)=>s+(r.dca_weekly||0),0);
    document.getElementById('recsDCASummary').innerHTML=dcaItems.map(r=>`
      <div style="background:var(--surface);border-radius:8px;padding:10px 12px;border:1px solid var(--border);">
        <div style="font-family:var(--mono);font-size:12px;font-weight:500;color:var(--text);">${r.ticker}</div>
        <div style="font-size:18px;font-weight:700;color:var(--green);margin:2px 0;">$${r.dca_weekly}</div>
        <div style="font-size:10px;font-family:var(--mono);color:var(--muted);">${r.account||'MX'} · /semana</div>
      </div>`).join('');
    document.getElementById('recsDCATotal').textContent=
      `Total sugerido: $${dcaTotal}/sem de $300 disponibles · Restante: $${Math.max(0,300-dcaTotal)}/sem`;

    document.getElementById('recsReduceList').innerHTML=(parsed.reduce||[]).map(r=>`
      <div style="display:flex;gap:12px;padding:12px 16px;background:var(--surface);border:1px solid var(--border);border-radius:10px;margin-bottom:8px;">
        <div style="width:160px;flex-shrink:0;font-family:var(--mono);font-size:12px;font-weight:500;color:var(--red);">${r.ticker||''}</div>
        <div style="font-size:12px;color:var(--muted);line-height:1.6;">${r.reason||''}</div>
      </div>`).join('');

    document.getElementById('recsMarketContext').textContent=parsed.market_context||MARKET_CTX;
    document.getElementById('recsTimestamp').textContent='Generado el '+new Date().toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'})+' · contexto de mercado en tiempo real';
    loading.style.display='none'; output.style.display='block';

  }catch(err){
    loading.style.display='none'; empty.style.display='block';
    empty.textContent='Error: '+err.message+'. Intenta de nuevo.';
    empty.style.color='var(--red)';
  }
  btn.disabled=false; btn.textContent='✦ Actualizar recomendaciones';
}


// ─── DCA ───
function renderDCA(){
  const cb=classBreakdown(), plan=dcaPlan(), yrs=yearsToCryptoTarget();
  document.getElementById('dcaCards').innerHTML=`
    <div class="card"><div class="card-lbl">Aportación semanal</div><div class="card-val up">${fmt(DCA_WEEKLY)}</div><div class="card-sub">USD · nunca a cripto</div></div>
    <div class="card"><div class="card-lbl">Aportación anual</div><div class="card-val">${fmt(DCA_WEEKLY*52)}</div><div class="card-sub">52 semanas</div></div>
    <div class="card"><div class="card-lbl">Cripto hoy</div><div class="card-val s-${targetStatus('crypto').level}">${cb.pct('crypto').toFixed(1)}%</div><div class="card-sub">techo ${cryptoCeiling()}% · meta 25%</div></div>
    <div class="card"><div class="card-lbl">Años a cripto 25%</div><div class="card-val">${yrs>0?yrs.toFixed(1):'—'}</div><div class="card-sub">solo con aportaciones, cripto plano</div></div>`;
  document.getElementById('dcaPhases').innerHTML=`<div class="info" style="grid-column:1/-1;margin:0;">El reparto se recalcula con tus posiciones actuales: el dinero va a las clases por debajo de su meta, en proporción al hueco en USD. Cripto no recibe aportaciones hasta llegar a 25%.</div>`;
  document.getElementById('weeklyTbl').innerHTML=plan.length?plan.map(c=>{
    const v=buyVehicle(c.key), accts=v.accts.length?v.accts:['MX'];
    const origin=v.held?'Ya la tienes: acumular más':'Nueva posición';
    const others=v.others.length?` · también tienes ${v.others.join(', ')} (no agregar)`:'';
    return `<tr>
    <td><span class="tk">${v.ticker}</span><br><span style="font-size:11px;color:var(--muted);">${c.label}</span></td>
    <td><span class="mono up">${fmt(c.amt)}</span></td>
    <td style="font-size:12px;color:var(--muted);">${cb.pct(c.key).toFixed(1)}% → meta ${c.target}% · faltan ${fmt(c.gap)}<br>${origin}${others}</td>
    <td>${accts.map(a=>`<span class="abadge ${acctClass(a)}">${a}</span>`).join(' ')}</td>
  </tr>`;}).join(''):`<tr><td colspan="4" style="color:var(--muted);font-size:12px;">Todas las clases están en su meta.</td></tr>`;
}

// ─── ESTRATEGIA (vista) ───
const STRATEGY_RULES=[
  ['Dinero nuevo',`Los ${fmt(DCA_WEEKLY)}/semana se reparten entre las clases por debajo de su meta (ver Plan DCA). Cripto no recibe aportaciones hasta llegar a 25%.`],
  ['Acumular en lo que ya tienes','Cada clase se compra con el ETF amplio que ya tienes (VEA para internacional, VTI para EE.UU., GLD para oro). No se abren posiciones nuevas que dupliquen exposición: VGK ya está contenido en VEA.'],
  ['Techo de cripto','Si cripto rebasa el techo del año, se vende BTC con ganancia hasta volver al techo y se reinvierte en los huecos. Nunca se vende cripto en pérdida para rebalancear.'],
  ['Altcoins','SOL, AAVE, LINK, ARB, UNI y HYPE quedan fuera de la tesis: no se agregan. Evaluar con el contador venderlas para aprovechar la pérdida fiscal.'],
  ['ETH / stETH','Pendiente decidir si forman parte de la tesis de reserva de valor. Mientras tanto, no se agregan.'],
  ['Bandas de rebalanceo',`Una clase está en meta si está a ±${REBAL_BAND} pts. Debajo de la banda, el DCA la prioriza; arriba, se deja de comprar.`],
  ['Oro','5% como cobertura ante caídas e inflación, no como apuesta.'],
  ['Renta fija / Cash','10% (máximo 15%). El cash MXN rinde 6.5% fijo. Si pasa de 15%, se despliega hacia los huecos.'],
  ['Revisión','Revisar esta página cada trimestre o cuando cambie algo importante (ingresos, horizonte, objetivos).'],
];
function renderStrategy(){
  const cb=classBreakdown(), ceil=cryptoCeiling(), yr=new Date().getFullYear();
  const years=Object.keys(CRYPTO_CEILING).map(Number).sort();
  document.getElementById('strategyDetail').innerHTML=`
    <div class="info" style="margin-bottom:16px;">Estrategia vigente · adoptada el ${STRATEGY_DATE}. ${STRATEGY_THESIS}</div>
    ${STATUS_LEGEND}
    <div class="tbl-wrap">
      <div class="tbl-bar"><span>Asignación objetivo</span><span>${fmt(cb.t)} activo</span></div>
      <table>
        <thead><tr><th>Clase de activo</th><th>Meta</th><th>Actual</th><th>Estado</th><th>Qué incluye</th></tr></thead>
        <tbody>${ASSET_CLASSES.map(c=>{const st=targetStatus(c.key);return `<tr>
          <td><span class="tk">${c.label}</span></td>
          <td class="mono">${c.target}%${c.key==='crypto'?`<br><span style="font-size:11px;color:var(--muted);">techo ${ceil}%</span>`:''}</td>
          <td class="mono">${cb.pct(c.key).toFixed(1)}%</td>
          <td><span class="mono s-${st.level}" style="font-size:12px;">${st.label}</span></td>
          <td style="font-size:12px;color:var(--muted);">${c.note}</td></tr>`;}).join('')}</tbody>
      </table>
    </div>
    <div class="alloc-sec">
      <div class="slbl" style="margin-bottom:12px;">Reglas</div>
      ${STRATEGY_RULES.map(([t,d],i)=>`<div style="display:flex;gap:12px;padding:9px 0;border-bottom:1px solid var(--border);font-size:13px;line-height:1.6;">
        <span style="font-family:var(--mono);color:var(--muted);min-width:18px;">${i+1}</span>
        <div><strong>${t}.</strong> ${d}</div></div>`).join('')}
    </div>
    <div class="tbl-wrap">
      <div class="tbl-bar"><span>Transición de cripto</span><span>~${yearsToCryptoTarget().toFixed(1)} años a 25% solo con aportaciones</span></div>
      <table>
        <thead><tr><th>Año</th><th>Techo de cripto</th></tr></thead>
        <tbody>${years.map(y=>`<tr${y===yr?' style="background:var(--surface2);"':''}><td class="mono">${y}${y===yr?' · actual':''}</td><td class="mono">${CRYPTO_CEILING[y]}%</td></tr>`).join('')}
          <tr><td class="mono">${years[years.length-1]+1}+</td><td class="mono">25%</td></tr></tbody>
      </table>
    </div>
    <div style="font-size:11px;font-family:var(--mono);color:var(--muted);">Las metas y reglas viven en app.js (ASSET_CLASSES, CRYPTO_CEILING, STRATEGY_RULES), así que cada cambio queda registrado en git.</div>`;
}

// ─── RETIREMENT ───
function renderRetirement(){
  const rp=retiroPos();
  const totalR=rp.reduce((s,p)=>s+p.valueUSD,0);
  const totalCostR=rp.reduce((s,p)=>s+p.costTotalUSD,0);
  const pnlR=totalCostR>0?((totalR-totalCostR)/totalCostR)*100:null;

  // Dynamic — built from actual positions, not hardcoded
  const items=[
    {ticker:'RRSP-SC',name:'RRSP Scotiabank'},
    {ticker:'RRSP-WS',name:'RRSP Wealthsimple'},
    {ticker:'AFORE',name:'AFORE México'},
  ];

  function retiroNote(p){
    if(!p||p.costTotalUSD<=0) return 'Agrega costo base en Configurar para calcular rendimiento';
    const cagr = p.ticker==='RRSP-WS' ? 3.5 : p.ticker==='AFORE' ? null : null;
    const pnl=((p.valueUSD-p.costTotalUSD)/p.costTotalUSD)*100;
    const fx=p.pnlFxUSD||0;
    const base = `Costo base: ${fmt(p.costTotalUSD)} · P/L total: ${pnl>=0?'+':''}${pnl.toFixed(1)}% · por tipo de cambio: ${fx>=0?'+':'-'}${fmt(Math.abs(fx))}`;
    if(cagr) return base+` · CAGR estimado ~${cagr}%`;
    return base;
  }

  document.getElementById('retirementDetail').innerHTML=`
    <div class="cards cards-3" style="margin-bottom:20px;">
      <div class="card"><div class="card-lbl">Total retiro (USD)</div><div class="card-val">${fmt(totalR)}</div><div class="card-sub">No incluido en portafolio activo</div></div>
      <div class="card"><div class="card-lbl">Total consolidado</div><div class="card-val">${fmt(totalActive()+totalR)}</div><div class="card-sub">Activo + retiro</div></div>
      ${pnlR!==null?`<div class="card"><div class="card-lbl">P/L retiro</div><div class="card-val ${pnlR>=0?'up':'down'}">${fmtPct(pnlR)}</div><div class="card-sub">${pnlR>=0?'+':''}${fmt(totalR-totalCostR)}</div></div>`:'<div class="card"><div class="card-lbl">P/L retiro</div><div class="card-val">—</div><div class="card-sub">Agrega costos base en Configurar</div></div>'}
    </div>
    <div class="tbl-wrap">
      <div class="tbl-bar"><span>Cuentas de retiro</span></div>
      <table>
        <thead><tr><th>Cuenta</th><th>Valor USD</th><th>Costo base USD</th><th>P/L</th><th>Nota</th></tr></thead>
        <tbody>${items.map(it=>{
          const p=rp.find(x=>x.ticker===it.ticker);
          if(!p)return '';
          const pnl=p.costTotalUSD>0?((p.valueUSD-p.costTotalUSD)/p.costTotalUSD)*100:null;
          const pnlA=p.valueUSD-p.costTotalUSD;
          return `<tr>
            <td><span class="tk">${it.name}</span></td>
            <td class="mono">${fmt(p.valueUSD)}</td>
            <td class="mono" style="color:var(--muted);">${p.costTotalUSD>0?fmt(p.costTotalUSD):'—'}</td>
            <td>${pnl!==null?`<span class="${pnl>=0?'pu':'pd'}">${fmtPct(pnl)}<br><span style="font-size:11px;">${pnlA>=0?'+':''}${fmt(pnlA)}</span></span>`:'<span class="pn">—</span>'}</td>
            <td style="font-size:11px;color:var(--muted);">${retiroNote(p)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
}

// ─── SETUP ───
function saveUrl(type){
  const id=type==='main'?'urlMain':'urlCrypto';
  const stId=type==='main'?'st-main':'st-crypto';
  const key=type==='main'?'plv2_url_main':'plv2_url_crypto';
  const val=document.getElementById(id).value.trim();
  if(!val||!val.includes('script.google.com')){document.getElementById(stId).textContent='URL inválida';document.getElementById(stId).style.color='var(--red)';return;}
  if(type==='main')sheetUrl=val;else cryptoUrl=val;
  localStorage.setItem(key,val);
  document.getElementById(stId).textContent='Guardado ✓';
  document.getElementById(stId).style.color='var(--green)';
}
function saveManual(){
  const afore=parseFloat(document.getElementById('val-afore').value)||1385366;
  const aforeCost=parseFloat(document.getElementById('val-afore-cost').value)||1385366;
  const rrspSc=parseFloat(document.getElementById('val-rrsp-sc').value)||22623;
  const rrspScCost=parseFloat(document.getElementById('val-rrsp-sc-cost').value)||22623;
  const rrspWs=parseFloat(document.getElementById('val-rrsp-ws').value)||29499;
  const rrspWsCost=parseFloat(document.getElementById('val-rrsp-ws-cost').value)||26066;
  const agf=parseFloat(document.getElementById('val-agf').value)||31588;
  const agfCost=parseFloat(document.getElementById('val-agf-cost').value)||24700;
  const cad=parseFloat(document.getElementById('val-cadrate').value)||1.3719;
  const mxn=parseFloat(document.getElementById('val-mxnrate').value)||0.0488;
  const cashMx=parseFloat(document.getElementById('val-cash-mx').value)||0;
  const cashMxCost=parseFloat(document.getElementById('val-cash-mx-cost').value)||cashMx;
  const cashCa=parseFloat(document.getElementById('val-cash-ca').value)||0;
  const cashCaCost=parseFloat(document.getElementById('val-cash-ca-cost').value)||cashCa;
  localStorage.setItem('plv2_manual',JSON.stringify({afore,aforeCost,rrspSc,rrspScCost,rrspWs,rrspWsCost,agf,agfCost,cad,mxn,cashMx,cashMxCost,cashCa,cashCaCost}));
  applyManual(loadManual());
  revalue();
  document.getElementById('st-manual').textContent='Guardado ✓';
  document.getElementById('st-manual').style.color='var(--green)';
  renderAll();
}
// ─── DARK MODE ───
function toggleDark(){
  document.body.classList.toggle('dark');
  const isDark=document.body.classList.contains('dark');
  localStorage.setItem('plv2_dark',isDark?'1':'0');
  document.getElementById('darkBtn').textContent=isDark?'☀️':'🌙';
}
if(localStorage.getItem('plv2_dark')==='1'){
  document.body.classList.add('dark');
  // btn not ready yet, will be set on init
}

// ─── CSV EXPORT ───
function exportCSV(){
  const ap=activePos();
  const t=totalAll();
  const rows=[['Ticker','Nombre','Cuenta','Categoria','Precio USD','Unidades','Valor USD','Costo Base USD','P/L %','P/L USD','Peso %']];
  [...ap].sort((a,b)=>b.valueUSD-a.valueUSD).forEach(p=>{
    const pnl=p.costTotalUSD>0?((p.valueUSD-p.costTotalUSD)/p.costTotalUSD)*100:0;
    const pnlA=p.valueUSD-p.costTotalUSD;
    rows.push([p.ticker,p.name,p.acct,p.cat,p.priceUSD.toFixed(4),p.units.toFixed(4),(p.valueUSD).toFixed(2),(p.costTotalUSD).toFixed(2),pnl.toFixed(2),pnlA.toFixed(2),(p.valueUSD/t*100).toFixed(2)]);
  });
  const csv=rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='portfolio_'+new Date().toISOString().slice(0,10)+'.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ─── EXPORT MARKDOWN (para pasar a otros agentes) ───
// Sin datos sensibles: no incluye nombre, correo, URLs de las hojas, tokens ni el endpoint del proxy.
const MANUAL_TICKERS=['RRSP-SC','RRSP-WS','AFORE','AGF-CA','CASH-MX','CASH-CA'];
const priceSource=p=>MANUAL_TICKERS.includes(p.ticker)?'manual':p.live?'en vivo':'estático';
function buildPortfolioMarkdown(){
  const ap=activePos(), rp=retiroPos(), cb=classBreakdown(), t=cb.t, ceil=cryptoCeiling();
  const esc=v=>String(v??'').replace(/\|/g,'\\|').replace(/\n/g,' ');
  const usd=n=>(n<0?'-':'')+'$'+Math.abs(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const px=n=>n<1?'$'+n.toFixed(4):usd(n);
  const pct=n=>(n||0).toFixed(2)+'%';
  const plPct=p=>p.costTotalUSD>0?(p.valueUSD-p.costTotalUSD)/p.costTotalUSD*100:0;
  const table=(head,rows)=>['| '+head.join(' | ')+' |','|'+head.map(()=>' --- ').join('|')+'|',
    ...rows.map(r=>'| '+r.map(esc).join(' | ')+' |')].join('\n');
  let manual={}; try{manual=JSON.parse(localStorage.getItem('plv2_manual')||'{}');}catch(e){}
  const {kept:hist,dropped:histDropped}=loadHistory();
  const totalCost=ap.reduce((s,p)=>s+p.costTotalUSD,0), pnl=t-totalCost;
  const pnlFx=ap.reduce((s,p)=>s+(p.pnlFxUSD||0),0);
  const clsLabel=p=>mixFor(p.ticker)?'Mezcla (ver sección 6)':ASSET_CLASSES.find(c=>c.key===assetClass(p)).label;
  const corrB=catBuckets(), corrT=Object.values(corrB).reduce((s,v)=>s+v,0);
  const byAcct={}, byCat=catBuckets(), byTicker={};
  ap.forEach(p=>{
    const a=byAcct[p.acct]||(byAcct[p.acct]={v:0,c:0}); a.v+=p.valueUSD; a.c+=p.costTotalUSD;
    const g=byTicker[p.ticker]||(byTicker[p.ticker]={ticker:p.ticker,accts:[],units:0,costTotalUSD:0,valueUSD:0,priceUSD:p.priceUSD});
    g.accts.push(p.acct); g.units+=p.units; g.costTotalUSD+=p.costTotalUSD; g.valueUSD+=p.valueUSD;
  });
  const status=document.getElementById('statusTxt')?.textContent||'';
  const upd=document.getElementById('lastUpd')?.textContent||'';
  const out=[];
  out.push(`# Portafolio de inversión — resumen para análisis`,
    ``,
    `- Generado: ${new Date().toLocaleString('es-MX',{dateStyle:'long',timeStyle:'short'})}`,
    `- Moneda base: USD · Tipo de cambio para valor: ${fxSummary().text}`,
    `- Tipo de cambio histórico para costos (Configurar): USD/CAD ${(manual.cad||1.3719)} · USD/MXN ${(1/(manual.mxn||0.0488)).toFixed(2)}`,
    `- Estado de los datos: ${status}${upd?' · '+upd:''}`,
    ``,
    `> Para el agente: este archivo describe el portafolio y la estrategia de un inversionista individual. El "portafolio activo" excluye las cuentas de retiro, que se listan aparte. Respeta la estrategia y sus reglas; si propones cambiarlas, dilo explícitamente y explica por qué. Revisa la sección "Limitaciones de los datos" antes de sacar conclusiones.`,
    ``,
    `## 1. Resumen`,
    ``,
    table(['Métrica','Valor'],[
      ['Portafolio activo',usd(t)],
      ['Costo base activo',usd(totalCost)],
      ['P/L activo',`${usd(pnl)} (${pct(totalCost>0?pnl/totalCost*100:0)})`],
      ['P/L por inversión / por tipo de cambio',`${usd(pnl-pnlFx)} / ${usd(pnlFx)}`],
      ['Cuentas de retiro (aparte)',usd(totalRetiro())],
      ['Total consolidado',usd(t+totalRetiro())],
      ['Posiciones activas',String(ap.length)],
      ['Correlación interna estimada',`${calcCorr().toFixed(2)} (meta < 0.65)`],
      ['Correlación de lo invertido (sin efectivo)',calcCorrInvested().toFixed(2)],
    ]),
    ``,
    `## 2. Estrategia vigente`,
    ``,
    `Adoptada el ${STRATEGY_DATE}. ${STRATEGY_THESIS}`,
    ``,
    `### Asignación objetivo por clase de activo`,
    ``,
    table(['Clase','Meta','Actual','Diferencia','Valor USD','Estado','Qué incluye'],
      ASSET_CLASSES.map(c=>{const st=targetStatus(c.key);return [c.label,c.target+'%'+(c.key==='crypto'?` (techo ${ceil}% este año)`:''),pct(st.a),(st.a-c.target>=0?'+':'')+(st.a-c.target).toFixed(2)+' pts',usd(cb.by[c.key]),st.label,c.note];})),
    ``,
    `La asignación usa look-through: las posiciones con mezcla (sección 6) se reparten entre clases según lo que traen por dentro.`,
    ``,
    `Banda de rebalanceo: ±${REBAL_BAND} pts. Aportación (DCA): ${usd(DCA_WEEKLY)}/semana (${usd(DCA_WEEKLY*52)}/año).`,
    ``,
    `### Transición de cripto (techo por año)`,
    ``,
    table(['Año','Techo'],[...Object.keys(CRYPTO_CEILING).sort().map(y=>[y+(Number(y)===new Date().getFullYear()?' (actual)':''),CRYPTO_CEILING[y]+'%']),
      [(Math.max(...Object.keys(CRYPTO_CEILING).map(Number))+1)+'+','25%']]),
    ``,
    `Con cripto plano, llegar a 25% solo con aportaciones tomaría ~${yearsToCryptoTarget().toFixed(1)} años.`,
    ``,
    `### Reglas`,
    ``,
    ...STRATEGY_RULES.map(([r,d],i)=>`${i+1}. **${r}.** ${d}`),
    ``,
    `## 3. Alertas actuales`,
    ``,
    ...(()=>{const a=[...dataAlerts(),...strategyAlerts()];return a.length?a.map(x=>`- **${x.type==='bad'?'Acción requerida':'Atención'}:** ${x.msg}`):['- Todo en meta.'];})(),
    ``,
    `## 4. Plan DCA de esta semana`,
    ``,
    (()=>{const plan=dcaPlan();return plan.length?table(['Clase','Ticker','Monto/semana','Cuenta','Hueco USD','Nota'],
      plan.map(c=>{const v=buyVehicle(c.key);return [c.label,v.ticker,usd(c.amt),(v.accts.length?v.accts:['MX']).map(acctLabel).join(', '),usd(c.gap),
        (v.held?'Ya la tiene: acumular':'Nueva posición')+(v.others.length?` · no agregar a ${v.others.join(', ')}`:'')];})):'Todas las clases están en meta.';})(),
    ``,
    `## 5. Posiciones activas`,
    ``,
    `"Fuente": en vivo = precio de la hoja de Google en la última actualización; estático = valor de respaldo en el código; manual = capturado por el usuario. Precio en USD al tipo de cambio del día; "Precio nativo" en la moneda original. "P/L TC" es la parte del P/L que viene del tipo de cambio.`,
    ``,
    table(['Ticker','Nombre','Cuenta','Categoría','Clase','Moneda','Unidades','Precio nativo','Precio USD','Costo/unidad USD','Costo total','Valor','P/L %','P/L USD','P/L inversión','P/L TC','Peso','Fuente'],
      [...ap].sort((a,b)=>b.valueUSD-a.valueUSD).map(p=>[p.ticker,p.name,acctLabel(p.acct),catLabel(p.cat),
        clsLabel(p),p.ccy,p.units.toFixed(4),(p.priceN||0).toLocaleString('en-US',{maximumFractionDigits:4}),px(p.priceUSD),px(p.units>0?p.costTotalUSD/p.units:0),
        usd(p.costTotalUSD),usd(p.valueUSD),pct(plPct(p)),usd(p.valueUSD-p.costTotalUSD),usd(p.pnlInvUSD),usd(p.pnlFxUSD),pct(t>0?p.valueUSD/t*100:0),priceSource(p)])),
    ``,
    `## 6. Mezclas por clase (look-through)`,
    ``,
    ...(()=>{const ms=loadMixes();if(!ms.length)return ['Ninguna.'];return ms.flatMap(m=>{
      const p=ap.find(x=>x.ticker===m.ticker), v=p?ap.filter(x=>x.ticker===m.ticker).reduce((s,x)=>s+x.valueUSD,0):0, sum=mixSum(m);
      return [`**${m.ticker}** · mezcla del ${m.date||'s/f'} · ${m.source||'sin fuente'} · suma ${sum.toFixed(1)}%${mixValid(m)?' (se normaliza a 100%)':' — NO SE USA: no suma 100%'}`,``,
        table(['Componente','%','Clase de la estrategia','Valor USD'],m.parts.map(x=>[x.label,(+x.pct).toFixed(1)+'%',COMPONENT_TYPES[x.type]?.label||x.type,usd(sum?v*x.pct/sum:0)])),``];});})(),
    ``,
    `## 7. Tickers en más de una cuenta (combinado)`,
    ``,
    (()=>{const multi=Object.values(byTicker).filter(g=>g.accts.length>1);return multi.length?table(['Ticker','Cuentas','Unidades','Costo promedio ponderado','Precio','Valor','P/L %'],
      multi.sort((a,b)=>b.valueUSD-a.valueUSD).map(g=>[g.ticker,g.accts.map(acctLabel).join(', '),g.units.toFixed(4),px(g.units>0?g.costTotalUSD/g.units:0),px(g.priceUSD),usd(g.valueUSD),pct(plPct(g))])):'Ninguno.';})(),
    ``,
    `## 8. Por cuenta`,
    ``,
    table(['Cuenta','Valor','Peso','Costo','P/L %'],Object.entries(byAcct).sort((a,b)=>b[1].v-a[1].v)
      .map(([k,a])=>[acctLabel(k),usd(a.v),pct(t>0?a.v/t*100:0),usd(a.c),pct(a.c>0?(a.v-a.c)/a.c*100:0)])),
    ``,
    `## 9. Por categoría (sector/estilo, informativo, con look-through de mezclas)`,
    ``,
    table(['Categoría','Valor','Peso'],Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[catLabel(k),usd(v),pct(t>0?v/t*100:0)])),
    ``,
    `## 10. Correlación (estimada)`,
    ``,
    `Correlación interna estimada: ${calcCorr().toFixed(2)} (meta < 0.65). Correlación de lo invertido, sin efectivo: ${calcCorrInvested().toFixed(2)}. Es un promedio ponderado de correlaciones fijas por grupo contra el S&P 500, con look-through (la renta fija de una mezcla usa la correlación de bonos, no la de "Index"); no se calcula con rendimientos históricos.`,
    ``,
    table(['Grupo','Correlación vs S&P 500 (supuesta)','Peso en portafolio'],Object.entries(corrB).sort((a,b)=>b[1]-a[1])
      .map(([k,v])=>[catLabel(k),(CAT_CORR[k]??0.7).toFixed(2),pct(corrT>0?v/corrT*100:0)])),
    ``,
    `## 11. Cuentas de retiro (fuera del portafolio activo)`,
    ``,
    rp.length?table(['Cuenta','Moneda','Valor USD','Aportaciones / costo USD','P/L %','P/L TC'],rp.map(p=>[p.name,p.ccy,usd(p.valueUSD),usd(p.costTotalUSD),pct(plPct(p)),usd(p.pnlFxUSD)])):'Sin datos.',
    ``,
    `## 12. Contexto de mercado (capturado por el usuario)`,
    ``,
    localStorage.getItem('plv2_market_ctx')||'No capturado.',
    ``,
    `## 13. Historial del portafolio activo`,
    ``,
    hist.length?[
      `Registros: ${hist.length}${histDropped?` (${histDropped} ignorados por saltos de más de ${HIST_JUMP*100}% el mismo día)`:''} · del ${hist[0].date.slice(0,10)} al ${hist[hist.length-1].date.slice(0,10)} · máximo ${usd(Math.max(...hist.map(h=>h.active)))} · mínimo ${usd(Math.min(...hist.map(h=>h.active)))}`,
      ``,
      table(['Fecha','Activo','Retiro','Total','P/L activo'],hist.slice(-10).map(h=>[h.date.slice(0,10),usd(h.active),usd(h.retiro),usd(h.total),pct(h.pnlPct)])),
    ].join('\n'):'Sin historial guardado.',
    ``,
    `## 14. Limitaciones de los datos`,
    ``,
    `- Las posiciones con fuente "estático" usan un precio de respaldo que puede estar desactualizado.`,
    `- Tipos de cambio: el VALOR de lo que está en CAD y MXN (ZSP, XSP, AGF-CA, cash, RRSP, AFORE) se convierte con el tipo de cambio del día (hoja con GOOGLEFINANCE o, de respaldo, Frankfurter/BCE; si fallan, el último valor bueno). El COSTO usa el tipo de cambio histórico de Configurar, porque no hay fecha por compra; por eso el P/L se separa en "por inversión" y "por tipo de cambio". Excepción: el efectivo (CASH-MX, CASH-CA) convierte su costo al TC del día, así su P/L es solo el rendimiento nominal.`,
    `- ZSP y XSP se tratan como cotizados en CAD en la hoja (o según la columna "moneda", si existe).`,
    ...loadMixes().filter(mixValid).map(m=>`- La mezcla de ${m.ticker} viene de: ${m.source||'sin fuente'}, con fecha ${m.date||'s/f'}. Se actualiza a mano cada trimestre.`),
    `- TSM se clasifica como internacional; VNQ (REITs de EE.UU.) como bienes raíces dentro de Acciones EE.UU.`,
    `- COIN y BMNR son acciones, pero cuentan como exposición cripto.`,
    `- Las correlaciones son estimaciones fijas por categoría, no calculadas.`,
    `- El P/L es simple contra costo; no es TIR ni considera la fecha de cada aportación.`,
    `- No se descompone la exposición dentro de los ETFs (p. ej. AAPL dentro de VOO).`,
    ``,
    `No incluye (privacidad): nombre, correo, URLs de las fuentes de datos, credenciales ni endpoints.`,
    ``);
  return out.join('\n');
}
function exportMarkdown(){
  const blob=new Blob([buildPortfolioMarkdown()],{type:'text/markdown;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='portafolio_'+new Date().toISOString().slice(0,10)+'.md';
  a.click();
  URL.revokeObjectURL(url);
}

// ─── HISTORY ───
let histChart=null;
function saveSnapshot(){
  const ta=totalActive(), tr=totalRetiro();
  const totalCost=activePos().reduce((s,p)=>s+p.costTotalUSD,0);
  const pnlPct=totalCost>0?((ta-totalCost)/totalCost)*100:0;
  const snap={date:new Date().toISOString(),active:Math.round(ta),retiro:Math.round(tr),total:Math.round(ta+tr),pnlPct:parseFloat(pnlPct.toFixed(2))};
  let hist=[];
  try{hist=JSON.parse(localStorage.getItem('plv2_hist')||'[]');}catch(e){}
  // Only save if value changed more than $50 or it's been 6+ hours
  const last=hist[hist.length-1];
  const sixH=6*60*60*1000;
  if(!last||Math.abs(snap.active-last.active)>50||(Date.now()-new Date(last.date).getTime())>sixH){
    hist.push(snap);
    if(hist.length>180)hist=hist.slice(-180); // keep last 180 snapshots
    localStorage.setItem('plv2_hist',JSON.stringify(hist));
  }
}
// Ignora registros que saltan más de 5% contra el registro anterior del mismo día (fallas de precio).
// No borra nada: solo se excluyen al mostrar y exportar.
const HIST_JUMP=0.05;
function cleanHistory(hist){
  const kept=[]; let dropped=0;
  const day=h=>new Date(h.date).toLocaleDateString('en-CA');
  hist.forEach(h=>{
    const prev=kept[kept.length-1];
    if(prev&&day(prev)===day(h)&&prev.active>0&&Math.abs(h.active-prev.active)/prev.active>HIST_JUMP){dropped++;return;}
    kept.push(h);
  });
  return {kept,dropped};
}
function loadHistory(){try{return cleanHistory(JSON.parse(localStorage.getItem('plv2_hist')||'[]'));}catch(e){return {kept:[],dropped:0};}}
function clearHistory(){
  if(!confirm('¿Borrar todo el historial?'))return;
  localStorage.removeItem('plv2_hist');
  renderHistorial();
}
function renderHistorial(){
  const {kept:hist,dropped}=loadHistory();

  if(hist.length===0){
    document.getElementById('histCards').innerHTML='<div class="card" style="grid-column:1/-1;"><div class="card-lbl">Sin historial</div><div class="card-val" style="font-size:14px;font-weight:400;color:var(--muted);">El historial se guarda automáticamente cada vez que haces ↻ Actualizar. Regresa en unos días para ver la evolución.</div></div>';
    document.getElementById('histTable').innerHTML='';
    if(histChart)histChart.destroy();
    return;
  }

  const first=hist[0], last=hist[hist.length-1];
  const change=last.active-first.active;
  const changePct=first.active>0?(change/first.active)*100:0;
  const maxVal=Math.max(...hist.map(h=>h.active));
  const minVal=Math.min(...hist.map(h=>h.active));

  document.getElementById('histCards').innerHTML=`
    <div class="card"><div class="card-lbl">Valor actual activo</div><div class="card-val">${fmt(last.active)}</div><div class="card-sub">Último registro</div></div>
    <div class="card"><div class="card-lbl">Cambio total registrado</div><div class="card-val ${change>=0?'up':'down'}">${change>=0?'+':''}${fmt(change)}</div><div class="card-sub ${change>=0?'up':'down'}">${changePct>=0?'+':''}${changePct.toFixed(1)}% desde primer registro</div></div>
    <div class="card"><div class="card-lbl">Máximo registrado</div><div class="card-val">${fmt(maxVal)}</div><div class="card-sub">Mínimo: ${fmt(minVal)}${dropped?` · ${dropped} registro${dropped>1?'s':''} ignorado${dropped>1?'s':''} por saltos de más de ${HIST_JUMP*100}% el mismo día`:''}</div></div>`;

  const labels=hist.map(h=>{
    const d=new Date(h.date);
    return d.toLocaleDateString('es-MX',{month:'short',day:'numeric'});
  });

  if(histChart)histChart.destroy();
  histChart=new Chart(document.getElementById('histChart'),{
    type:'line',
    data:{labels,datasets:[
      {label:'Portafolio activo',data:hist.map(h=>h.active),borderColor:'#1a50a0',backgroundColor:'rgba(26,80,160,0.06)',tension:0.3,fill:true,pointRadius:hist.length>30?0:3,pointBackgroundColor:'#1a50a0',borderWidth:2},
      {label:'Total consolidado',data:hist.map(h=>h.total),borderColor:'#1a6b3a',backgroundColor:'transparent',tension:0.3,fill:false,pointRadius:0,borderWidth:1.5,borderDash:[4,3]},
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'var(--muted)',font:{size:11}}},tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`}}},
      scales:{
        y:{ticks:{color:'#78776e',callback:v=>'$'+Math.round(v/1000)+'K'},grid:{color:'rgba(0,0,0,.04)'}},
        x:{ticks:{color:'#78776e',maxTicksLimit:12},grid:{display:false}}
      }
    }
  });

  const rows=[...hist].reverse().slice(0,60);
  document.getElementById('histTable').innerHTML=rows.map(h=>`<tr>
    <td class="mono">${new Date(h.date).toLocaleDateString('es-MX',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</td>
    <td class="mono">${fmt(h.active)}</td>
    <td class="mono" style="color:var(--muted);">${fmt(h.retiro)}</td>
    <td class="mono">${fmt(h.total)}</td>
    <td><span class="${h.pnlPct>=0?'pu':'pd'}">${h.pnlPct>=0?'+':''}${h.pnlPct.toFixed(2)}%</span></td>
  </tr>`).join('');
}

function saveMarketCtx(){
  const val=document.getElementById('val-market-ctx').value.trim();
  if(!val)return;
  localStorage.setItem('plv2_market_ctx',val);
  document.getElementById('st-mktctx').textContent='Guardado ✓';
  document.getElementById('st-mktctx').style.color='var(--green)';
}

function gotoSetup(){sv('setup');}

// ─── CONFIGURAR: tipos de cambio ───
function toggleFxFixed(fixed){
  localStorage.setItem(FX_MODE_KEY,fixed?'fixed':'live');
  if(!fixed&&!FX.CAD&&!FX.MXN) updateFx(null).then(()=>{revalue();renderFxStatus();renderAll();});
  revalue(); renderFxStatus(); renderAll();
}
function renderFxStatus(){
  document.getElementById('fxFixed').checked=fxMode()==='fixed';
  document.getElementById('fxStatus').textContent='En uso: '+fxSummary().text;
}

// ─── CONFIGURAR: editor de mezclas ───
let mixDraft=[];
const escAttr=v=>String(v??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
function renderMixEditor(){
  const typeOpts=sel=>Object.entries(COMPONENT_TYPES).map(([k,t])=>`<option value="${k}"${k===sel?' selected':''}>${t.label}</option>`).join('');
  const inp='class="url-input" style="padding:6px 8px;font-size:12px;width:100%;display:block;margin-top:3px;"';
  document.getElementById('mixEditor').innerHTML=mixDraft.length?mixDraft.map((m,mi)=>`
    <div class="alloc-sec" style="margin-bottom:10px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <label style="font-size:11px;font-family:var(--mono);color:var(--muted);">Ticker<input ${inp} value="${escAttr(m.ticker)}" oninput="mixEdit(${mi},null,'ticker',this.value)"></label>
        <label style="font-size:11px;font-family:var(--mono);color:var(--muted);">Fecha de la mezcla<input ${inp} type="date" value="${escAttr(m.date)}" oninput="mixEdit(${mi},null,'date',this.value)"></label>
        <label style="grid-column:1/-1;font-size:11px;font-family:var(--mono);color:var(--muted);">Fuente<input ${inp} value="${escAttr(m.source)}" oninput="mixEdit(${mi},null,'source',this.value)"></label>
      </div>
      ${m.parts.map((x,pi)=>`<div style="display:grid;grid-template-columns:minmax(0,2fr) 80px minmax(0,1.5fr) auto;gap:6px;margin-bottom:6px;">
        <input ${inp} placeholder="Componente" value="${escAttr(x.label)}" oninput="mixEdit(${mi},${pi},'label',this.value)">
        <input ${inp} type="number" step="0.1" placeholder="%" value="${escAttr(x.pct)}" oninput="mixEdit(${mi},${pi},'pct',this.value)">
        <select ${inp} onchange="mixEdit(${mi},${pi},'type',this.value)">${typeOpts(x.type)}</select>
        <button class="btn btn-sm" onclick="mixRemovePart(${mi},${pi})" title="Quitar componente">×</button>
      </div>`).join('')}
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px;">
        <span id="mixSum-${mi}" class="mono"></span>
        <span style="display:flex;gap:6px;"><button class="btn btn-sm" onclick="mixAddPart(${mi})">+ Componente</button><button class="btn btn-sm" onclick="mixRemove(${mi})">Quitar mezcla</button></span>
      </div>
    </div>`).join(''):'<div style="font-size:12px;color:var(--muted);">Sin mezclas: cada posición cuenta en su clase única.</div>';
  mixDraft.forEach((_,mi)=>renderMixSum(mi));
}
function renderMixSum(mi){
  const m=mixDraft[mi], sum=mixSum(m), ok=mixValid(m), el=document.getElementById('mixSum-'+mi);
  if(!el)return;
  const by={}; m.parts.forEach(x=>{const c=COMPONENT_TYPES[x.type]?.cls; if(c)by[c]=(by[c]||0)+(parseFloat(x.pct)||0);});
  const split=ASSET_CLASSES.filter(c=>by[c.key]).map(c=>`${c.label} ${(by[c.key]/(sum||1)*100).toFixed(1)}%`).join(' · ');
  el.className='mono '+(ok?'s-ok':'s-bad'); el.style.fontSize='12px';
  el.textContent=`Suma ${sum.toFixed(1)}%${ok?'':' · no suma 100%, no se usará'}${ok&&split?' → '+split:''}`;
}
function mixEdit(mi,pi,field,val){
  const target=pi==null?mixDraft[mi]:mixDraft[mi].parts[pi];
  target[field]=field==='pct'?val:(field==='ticker'?val.trim().toUpperCase():val);
  renderMixSum(mi);
}
function mixAdd(){mixDraft.push({ticker:'',date:new Date().toISOString().slice(0,10),source:'',parts:[{label:'',pct:'',type:'us'}]});renderMixEditor();}
function mixAddPart(mi){mixDraft[mi].parts.push({label:'',pct:'',type:'us'});renderMixEditor();}
function mixRemovePart(mi,pi){mixDraft[mi].parts.splice(pi,1);renderMixEditor();}
function mixRemove(mi){mixDraft.splice(mi,1);renderMixEditor();}
function saveMixes(){
  const clean=mixDraft.filter(m=>m.ticker).map(m=>({...m,parts:m.parts.filter(x=>x.label||x.pct!=='').map(x=>({...x,pct:parseFloat(x.pct)||0}))}));
  localStorage.setItem(MIX_KEY,JSON.stringify(clean));
  mixDraft=JSON.parse(JSON.stringify(clean));
  const bad=clean.filter(m=>!mixValid(m)).map(m=>m.ticker);
  const st=document.getElementById('st-mix');
  st.textContent=bad.length?`Guardado. No se usarán (no suman 100%): ${bad.join(', ')}`:'Guardado ✓';
  st.style.color=bad.length?'var(--amber)':'var(--green)';
  renderMixEditor(); renderAll();
}
function resetMixes(){
  if(!confirm('¿Restaurar la mezcla oficial de AGF (31 oct 2026)? Se reemplazan las mezclas guardadas.'))return;
  localStorage.removeItem(MIX_KEY);
  mixDraft=JSON.parse(JSON.stringify(loadMixes()));
  document.getElementById('st-mix').textContent='Restaurada ✓';
  renderMixEditor(); renderAll();
}

// ─── NAV ───
// ─── NAVEGACIÓN (dos niveles) ───
const NAV=[
  {group:'Portafolio',views:[['overview','Resumen'],['positions','Posiciones'],['allocation','Asignación'],['correlation','Correlación']]},
  {group:'Plan',views:[['strategy','Estrategia'],['dca','Plan DCA'],['recs','Recomendaciones']]},
  {group:'Cuentas',views:[['retirement','Retiro'],['historial','Historial']]},
];
function renderNav(view){
  const g=NAV.find(x=>x.views.some(([v])=>v===view));
  document.getElementById('navMain').innerHTML=NAV.map(x=>`<button class="nb${x===g?' active':''}" onclick="sv('${x.views[0][0]}')">${x.group}</button>`).join('');
  document.getElementById('navSub').innerHTML=g?g.views.map(([v,l])=>`<button class="sb${v===view?' active':''}" onclick="sv('${v}')">${l}</button>`).join(''):'';
}
function sv(view){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+view).classList.add('active');
  renderNav(view);
  if(view==='overview')renderOverview();
  if(view==='strategy')renderStrategy();
  if(view==='positions')renderPositions();
  if(view==='allocation')renderAllocation();
  if(view==='correlation')renderCorrelation();
  if(view==='recs')renderRecs();
  if(view==='dca')renderDCA();
  if(view==='historial')renderHistorial();
  if(view==='retirement')renderRetirement();
  if(view==='setup'){
    const s=localStorage.getItem('plv2_manual');
    if(s){try{const d=JSON.parse(s);
      if(d.afore)document.getElementById('val-afore').value=d.afore;
      if(d.afore)document.getElementById('val-afore').value=d.afore;
      if(d.aforeCost)document.getElementById('val-afore-cost').value=d.aforeCost;
      if(d.rrspSc)document.getElementById('val-rrsp-sc').value=d.rrspSc;
      if(d.rrspScCost)document.getElementById('val-rrsp-sc-cost').value=d.rrspScCost;
      if(d.rrspWs)document.getElementById('val-rrsp-ws').value=d.rrspWs;
      if(d.rrspWsCost)document.getElementById('val-rrsp-ws-cost').value=d.rrspWsCost;
      if(d.agf)document.getElementById('val-agf').value=d.agf;
      if(d.agfCost)document.getElementById('val-agf-cost').value=d.agfCost;
      if(d.cad)document.getElementById('val-cadrate').value=d.cad;
      if(d.mxn)document.getElementById('val-mxnrate').value=d.mxn;
      if(d.cashMx)document.getElementById('val-cash-mx').value=d.cashMx;
      if(d.cashMxCost)document.getElementById('val-cash-mx-cost').value=d.cashMxCost;
      if(d.cashCa)document.getElementById('val-cash-ca').value=d.cashCa;
      if(d.cashCaCost)document.getElementById('val-cash-ca-cost').value=d.cashCaCost;
    }catch(e){}}
    if(sheetUrl)document.getElementById('urlMain').value=sheetUrl;
    if(cryptoUrl)document.getElementById('urlCrypto').value=cryptoUrl;
    const mctx=localStorage.getItem('plv2_market_ctx');
    if(mctx)document.getElementById('val-market-ctx').value=mctx;
    renderFxStatus();
    mixDraft=JSON.parse(JSON.stringify(loadMixes()));
    renderMixEditor();
  }
}

// ─── CARGA INICIAL ───
resetPositions();

// ─── INIT (se ejecuta solo despues de autenticar) ───
let _appStarted=false;
function startApp(){
  if(_appStarted)return; _appStarted=true;
  updateHeader();
  renderOverview();
  if(localStorage.getItem('plv2_dark')==='1'){
    document.body.classList.add('dark');
    document.getElementById('darkBtn').textContent='☀️';
  }
  if(sheetUrl)fetchAll();else setStatus('','Configura Google Sheets en la pestaña Configurar');
  setInterval(()=>{const h=new Date().getHours();if(h>=8&&h<17&&sheetUrl)fetchAll();},5*60*1000);
}

renderNav('overview');
bootAuth();
