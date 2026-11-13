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
const CAD_USD = 0.7289;
const MXN_USD = 0.0488;

// ─── STATIC DATA ───
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
  {ticker:'ZSP',name:'BMO S&P 500 ETF',units:62.4804,costUSD:53.00,priceUSD:73.12,cat:'index',acct:'CA'},
  {ticker:'XSP',name:'iShares S&P 500 CAD-hdg',units:57.6236,costUSD:34.40,priceUSD:49.42,cat:'index',acct:'CA'},
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
  {ticker:'ARB',name:'Arbitrum',units:918.35,costUSD:0.467,priceUSD:0.10,cat:'crypto',acct:'CRYPTO'},
  {ticker:'UNI',name:'Uniswap',units:20.12,costUSD:8.84,priceUSD:3.61,cat:'crypto',acct:'CRYPTO'},
  // RETIRO — RRSP y AFORE separados
  {ticker:'RRSP-SC',name:'RRSP Scotiabank',units:1,costUSD:22623*CAD_USD,priceUSD:22623*CAD_USD,cat:'retiro',acct:'RETIRO'},
  {ticker:'RRSP-WS',name:'RRSP Wealthsimple',units:1,costUSD:26066*CAD_USD,priceUSD:29499*CAD_USD,cat:'retiro',acct:'RETIRO'},
  {ticker:'AFORE',name:'AFORE México',units:1,costUSD:1385366*MXN_USD,priceUSD:1385366*MXN_USD,cat:'retiro',acct:'RETIRO'},
  // AGF — portafolio activo (cuenta de inversión gestionada)
  {ticker:'AGF-CA',name:'AGF Canadá',units:1,costUSD:24700*CAD_USD,priceUSD:31588*CAD_USD,cat:'index',acct:'AGF'},
  // Cash — se actualiza desde Configurar
  {ticker:'CASH-MX',name:'Efectivo MXN 6.5% fijo',units:1,costUSD:0,priceUSD:0,cat:'cash',acct:'MX'},
  {ticker:'CASH-CA',name:'Efectivo CAD',units:1,costUSD:0,priceUSD:0,cat:'cash',acct:'CA'},
];

let positions = STATIC_POSITIONS.map(p=>({...p,valueUSD:p.units*p.priceUSD,costTotalUSD:p.units*p.costUSD}));
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

const catClass = c=>({index:'ci',tech:'ct',crypto:'cc',intl:'cl',defense:'cd',hedge:'ch',bio:'cb',retiro:'cd',cash:'cm'}[c]||'ci');
const catLabel = c=>({index:'Index',tech:'Tech',crypto:'Cripto',intl:'Internacional',defense:'Defensa',hedge:'Oro',bio:'Biotech',retiro:'Retiro',cash:'Efectivo'}[c]||c);

// ─── ESTRATEGIA (opción A) ───
// Fuente única de metas y reglas: la usan Estrategia, Asignación, Plan DCA y el prompt de IA.
const STRATEGY_DATE='13 nov 2026';
const ASSET_CLASSES=[
  {key:'us',    label:'Acciones EE.UU.',          target:42, color:'#1a50a0', note:'Índices + acciones individuales de EE.UU.'},
  {key:'intl',  label:'Acciones internacionales', target:18, color:'#5a3fa0', note:'Desarrollados y emergentes fuera de EE.UU.'},
  {key:'crypto',label:'Cripto',                   target:25, color:'#b53a2f', note:'BTC como reserva de valor; incluye COIN y BMNR'},
  {key:'gold',  label:'Oro',                      target:5,  color:'#854f0b', note:'Cobertura ante caídas e inflación'},
  {key:'fixed', label:'Renta fija / Cash',        target:10, color:'#6a7080', note:'Colchón de liquidez; MXN rinde 6.5% fijo'},
];
// Vehículo preferido para acumular en cada clase, en orden. Se elige el primero que ya tengas.
// VEA va antes que VGK porque VGK (Europa) ya está contenido en VEA (desarrollados ex-EE.UU.).
const CLASS_BUY_PREF={us:['VTI','VOO','SPYG'],intl:['VEA','VXUS','VGK'],gold:['GLD'],fixed:['CASH-MX','CASH-CA']};
function buyVehicle(key){
  const ap=activePos();
  const held=[...new Set(ap.filter(p=>assetClass(p)===key&&p.valueUSD>0).map(p=>p.ticker))];
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
function classBreakdown(){
  const t=totalActive(), by={};
  ASSET_CLASSES.forEach(c=>by[c.key]=0);
  activePos().forEach(p=>{by[assetClass(p)]+=p.valueUSD;});
  return {t,by,pct:k=>t>0?by[k]/t*100:0};
}
// Reparte el DCA semanal entre las clases por debajo de su meta, proporcional al hueco en USD. Nunca a cripto.
function dcaPlan(){
  const {t,by}=classBreakdown();
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
function cryptoExcessUSD(){
  const {t,by}=classBreakdown();
  return Math.max(0,by.crypto-cryptoCeiling()/100*t);
}
// Estado de una clase contra su meta. Es la única fuente de color de estado en todo el dashboard:
// ok = en banda · warn = fuera de banda (lo corrige el DCA) · bad = cripto arriba del techo (requiere vender).
function targetStatus(key){
  const c=ASSET_CLASSES.find(x=>x.key===key), a=classBreakdown().pct(key);
  if(key==='crypto'&&a>cryptoCeiling()) return {level:'bad',label:'Arriba del techo',a};
  if(a>c.target+REBAL_BAND) return {level:'warn',label:key==='crypto'?'En transición':'Arriba',a};
  if(a<c.target-REBAL_BAND) return {level:'warn',label:'Debajo',a};
  return {level:'ok',label:'En meta',a};
}
const STATUS_LEGEND=`<div class="legend-status"><span class="s-ok">En meta (±${REBAL_BAND} pts)</span><span class="s-warn">Fuera de banda: lo corrige el DCA</span><span class="s-bad">Arriba del techo: vender con ganancia</span></div>`;
function strategyAlerts(){
  const ceil=cryptoCeiling(), out=[];
  ASSET_CLASSES.forEach(c=>{
    const s=targetStatus(c.key), a=s.a.toFixed(1);
    if(s.level==='ok')return;
    let msg;
    if(c.key==='crypto') msg=s.level==='bad'
      ?`Cripto en ${a}% rebasa el techo de ${ceil}% para ${new Date().getFullYear()}. Vende ~${fmt(cryptoExcessUSD())} de BTC (con ganancia) y reinviértelo en los huecos.`
      :`Cripto en ${a}% (techo ${ceil}%, meta ${c.target}%). No agregues más; se diluye con las aportaciones en ~${yearsToCryptoTarget().toFixed(1)} años.`;
    else msg=s.a<c.target
      ?`${c.label} en ${a}% (meta ${c.target}%). El Plan DCA lo prioriza.`
      :`${c.label} en ${a}% (meta ${c.target}%). No compres más hasta que regrese a la banda de ±${REBAL_BAND} pts.`;
    out.push({type:s.level,msg});
  });
  return out;
}
// Años para llegar a la meta solo con aportaciones, si cripto se mantiene plano.
function yearsToCryptoTarget(){
  const {t,by}=classBreakdown(), tgt=ASSET_CLASSES.find(c=>c.key==='crypto').target/100;
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
async function fetchAll(){
  if(!sheetUrl){setStatus('','Sin URL');renderAll();return;}
  setStatus('','Cargando...');
  try{
    // Reset to static positions before every fetch to avoid duplicates
    positions = STATIC_POSITIONS.map(p=>({...p,valueUSD:p.units*p.priceUSD,costTotalUSD:p.units*p.costUSD}));
    // Re-apply saved manual values after reset
    const savedM2=localStorage.getItem('plv2_manual');
    if(savedM2){try{
      const d=JSON.parse(savedM2);
      const cu=1/(d.cad||1.3719);
      positions.forEach((p,i)=>{
        if(p.ticker==='RRSP-SC'){positions[i].priceUSD=(d.rrspSc||22623)*cu;positions[i].valueUSD=positions[i].priceUSD;positions[i].costTotalUSD=(d.rrspScCost||d.rrspSc||22623)*cu;}
        if(p.ticker==='RRSP-WS'){positions[i].priceUSD=(d.rrspWs||29499)*cu;positions[i].valueUSD=positions[i].priceUSD;positions[i].costTotalUSD=(d.rrspWsCost||26066)*cu;}
        if(p.ticker==='AGF-CA'){positions[i].priceUSD=(d.agf||31588)*cu;positions[i].valueUSD=positions[i].priceUSD;positions[i].costTotalUSD=(d.agfCost||24700)*cu;}
        if(p.ticker==='AFORE'){positions[i].priceUSD=(d.afore||1385366)*(d.mxn||0.0488);positions[i].valueUSD=positions[i].priceUSD;positions[i].costTotalUSD=(d.aforeCost||d.afore||1385366)*(d.mxn||0.0488);}
        if(p.ticker==='CASH-MX'){const v=(d.cashMx||0)*(d.mxn||0.0488);positions[i].priceUSD=v;positions[i].valueUSD=v;positions[i].costTotalUSD=(d.cashMxCost||d.cashMx||0)*(d.mxn||0.0488);}
        if(p.ticker==='CASH-CA'){const v=(d.cashCa||0)*cu;positions[i].priceUSD=v;positions[i].valueUSD=v;positions[i].costTotalUSD=(d.cashCaCost||d.cashCa||0)*cu;}
      });
    }catch(e){}}

    const res=await fetch(sheetUrl+'&_='+Date.now());
    const json=await res.json();
    if(json.ok&&Array.isArray(json.positions)){
      json.positions.filter(p=>p.ticker&&p.precio>0).forEach(lp=>{
        const cat = (lp.categoria==='metals'||lp.categoria==='hedge') ? 'hedge' : (lp.categoria||'index');
        const units = parseFloat(lp.acciones)||1;
        const cost  = parseFloat(lp.costBase)||lp.precio;
        const idx=positions.findIndex(p=>p.ticker===lp.ticker&&p.acct===lp.cuenta);
        if(idx>=0){
          positions[idx].priceUSD   = lp.precio;
          positions[idx].units      = units;
          positions[idx].costTotalUSD = units * cost;
          positions[idx].valueUSD   = units * lp.precio;
          positions[idx].cat        = cat;
        } else {
          positions.push({ticker:lp.ticker,name:lp.nombre||lp.ticker,units,costUSD:cost,priceUSD:lp.precio,cat,acct:lp.cuenta||'MX',valueUSD:units*lp.precio,costTotalUSD:units*cost});
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
          if(idx>=0){
            positions[idx].priceUSD    = lp.precio;
            positions[idx].units       = units;
            positions[idx].costTotalUSD = units * cost;
            positions[idx].valueUSD    = units * lp.precio;
          }
        });
        }
      }catch(e){}
    }
    // Normalize categories after fetch — applies to all positions
    positions.forEach((p,i)=>{
      if(p.cat==='metals') positions[i].cat='hedge';
    });
    setStatus('live','En vivo · Google Finance');
    setUpdated();
    saveSnapshot();
  }catch(e){setStatus('err','Error de conexión');}
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
}

// ─── OVERVIEW ───
function renderOverview(){
  const ap=activePos(), t=totalActive();
  const byCat={};
  ap.forEach(p=>{byCat[p.cat]=(byCat[p.cat]||0)+p.valueUSD;});
  const totalCost=ap.reduce((s,p)=>s+p.costTotalUSD,0);
  const pnlAmt=t-totalCost, pnlPct=totalCost>0?(pnlAmt/totalCost)*100:0;
  const cb=classBreakdown();
  const cryptoPct=cb.pct('crypto'), goldPct=cb.pct('gold'), ceil=cryptoCeiling();
  const wCorr=calcCorr();

  document.getElementById('overviewCards').innerHTML=`
    <div class="card"><div class="card-lbl">Portafolio activo</div><div class="card-val">${fmt(t)}</div><div class="card-sub">MX+CA+Cripto+Bitso+AGF</div></div>
    <div class="card"><div class="card-lbl">P/L total activo</div><div class="card-val ${pnlPct>=0?'up':'down'}">${fmtPct(pnlPct)}</div><div class="card-sub ${pnlPct>=0?'up':'down'}">${pnlAmt>=0?'+':''}${fmt(pnlAmt)}</div></div>
    <div class="card"><div class="card-lbl">Correlación interna</div><div class="card-val ${wCorr>=0.80?'down':''}">${wCorr.toFixed(2)}</div><div class="card-sub">meta &lt; 0.65</div></div>
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
  const alerts=strategyAlerts();
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
      if(!byTicker[p.ticker]) byTicker[p.ticker]={ticker:p.ticker,name:p.name,cat:p.cat,priceUSD:p.priceUSD,units:0,costTotalUSD:0,valueUSD:0,accts:[]};
      const g=byTicker[p.ticker];
      g.units+=p.units; g.costTotalUSD+=p.costTotalUSD; g.valueUSD+=p.valueUSD;
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
    return `<tr>
      <td><span class="tk">${p.ticker}</span><br><span style="font-size:11px;color:var(--muted);">${p.name}</span></td>
      <td><span class="cpill ${catClass(p.cat)}">${catLabel(p.cat)}</span></td>
      <td style="white-space:nowrap;">${acctCell}</td>
      <td class="mono">${p.priceUSD<1?p.priceUSD.toFixed(4):fmt2(p.priceUSD)}</td>
      <td class="mono">${p.priceUSD<1?costPerUnit.toFixed(4):fmt2(costPerUnit)}</td>
      <td class="mono">${p.units.toFixed(4)}</td>
      <td class="mono">${fmt(p.valueUSD)}</td>
      <td><span class="${pnl>=0?'pu':'pd'}">${fmtPct(pnl)}<br><span style="font-size:11px;">${pnlA>=0?'+':''}${fmt(pnlA)}</span></span></td>
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
  const byCat={};
  ap.forEach(p=>{byCat[p.cat]=(byCat[p.cat]||0)+p.valueUSD;});
  document.getElementById('allocBars').innerHTML=STATUS_LEGEND+
    ASSET_CLASSES.map(c=>bar(c.label,c.note,cb.pct(c.key),cb.by[c.key],c.color,c.target,
      c.key==='crypto'?`<div class="btg" style="left:${ceil}%;background:var(--red);" title="Techo ${ceil}%"></div>`:'',targetStatus(c.key).level)).join('')+
    `<div class="slbl" style="margin:18px 0 10px;">Detalle por categoría — informativo, sin meta</div>`+
    Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([k,v])=>bar(catLabel(k),'',v/t*100,v,'#9a9a90',null)).join('');
  document.getElementById('allocAlerts').innerHTML=strategyAlerts().map(a=>`<div class="${a.type}">${a.msg}</div>`).join('');
  const tks={};
  ap.filter(p=>!['CRYPTO','BITSO'].includes(p.acct)).forEach(p=>{if(!tks[p.ticker])tks[p.ticker]={};tks[p.ticker][p.acct]=(tks[p.ticker][p.acct]||0)+p.valueUSD;});
  const overlaps=Object.entries(tks).filter(([,v])=>Object.keys(v).length>1);
  document.getElementById('overlapTbl').innerHTML=overlaps.map(([tk,v])=>{
    const tot=Object.values(v).reduce((s,x)=>s+x,0);
    const action='Mismo activo en varias cuentas: concentra compras nuevas en una sola';
    return `<tr><td><span class="tk">${tk}</span></td><td class="mono">${v.MX?fmt(v.MX):'—'}</td><td class="mono">${v.CA?fmt(v.CA):'—'}</td><td class="mono">—</td><td class="mono">${fmt(tot)}</td><td style="font-size:11px;color:var(--amber);">${action}</td></tr>`;
  }).join('');
}

// ─── CORRELATION (active only) ───
const CAT_CORR={index:0.98,tech:0.87,crypto:0.52,intl:0.82,defense:0.68,hedge:0.05,bio:0.55,cash:0.01};
function calcCorr(){
  const ap=activePos(), t=totalActive();
  const byCat={};
  ap.forEach(p=>{byCat[p.cat]=(byCat[p.cat]||0)+p.valueUSD;});
  let w=0;
  Object.keys(byCat).forEach(k=>{w+=(byCat[k]/t)*(CAT_CORR[k]||0.7);});
  return w;
}
function renderCorrelation(){
  const ap=activePos(), t=totalActive();
  const byCat={};
  ap.forEach(p=>{byCat[p.cat]=(byCat[p.cat]||0)+p.valueUSD;});
  const wc=calcCorr(), hp=(byCat.hedge||0)/t*100, cp=(byCat.crypto||0)/t*100;
  const cc=wc>=0.80?'var(--red)':wc>=0.65?'var(--amber)':'var(--green)';
  document.getElementById('corrCards').innerHTML=`
    <div class="card"><div class="card-lbl">Correlación interna</div><div class="card-val" style="color:${cc}">${wc.toFixed(2)}</div><div class="card-sub">${wc>=0.80?'Muy alta':wc>=0.65?'Alta':'Moderada'} · meta &lt; 0.65</div></div>
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
  const risks=[
    {l:'S&P 500 / Index',c:0.98,col:'#1a50a0',w:(byCat.index||0)/t*100},
    {l:'Tech individual',c:0.87,col:'#1a6b3a',w:(byCat.tech||0)/t*100},
    {l:'Internacional',c:0.82,col:'#5a3fa0',w:(byCat.intl||0)/t*100},
    {l:'Defensa',c:0.68,col:'#8a5f0a',w:(byCat.defense||0)/t*100},
    {l:'Crypto',c:0.52,col:'#b53a2f',w:(byCat.crypto||0)/t*100},
    {l:'Oro (GLD)',c:0.05,col:'#854f0b',w:(byCat.hedge||0)/t*100},
  ];
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
      return `${p.ticker}(${p.acct},${assetClass(p)}) ${fmt(p.valueUSD)} PL${pnl>=0?'+':''}${pnl.toFixed(0)}%`;
    }).join(' | ');
    const actual=ASSET_CLASSES.map(c=>`${c.label} ${cb.pct(c.key).toFixed(1)}% (meta ${c.target}%)`).join(' | ');
    const plan=dcaPlan().map(c=>`${c.label} $${c.amt} en ${buyVehicle(c.key).ticker}`).join(', ')||'sin huecos';

    bar.style.width='65%'; loadTxt.textContent='Generando recomendaciones...';

    const s2=await callProxy([{role:'user',content:`Asesor de inversiones. Respeta la estrategia del inversionista; no la cambies.

ESTRATEGIA: horizonte 15 anos. Metas: Acciones EE.UU. 42%, Internacional 18%, Cripto 25%, Oro 5%, Renta fija/cash 10%. Cripto se reduce gradualmente: techo ${ceil}% este ano bajando hasta 25%. Reglas: (1) cero dinero nuevo a cripto hasta llegar a 25%; (2) solo se vende cripto si rebasa el techo, vendiendo BTC con ganancia; (3) altcoins fuera de la tesis, no agregar; (4) DCA $${DCA_WEEKLY}/sem a las clases con hueco; banda de rebalanceo +-${REBAL_BAND} pts. Cash MXN rinde 6.5% fijo.

ACTUAL: ${actual}
Plan DCA calculado: ${plan}
Top posiciones: ${topPos}
Correlacion interna estimada: ${wc.toFixed(2)}
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
    <div class="info" style="margin-bottom:16px;">Estrategia vigente · adoptada el ${STRATEGY_DATE}. Construir patrimonio a 15 años con un núcleo de acciones globales, reduciendo gradualmente la concentración en cripto sin vender en pérdida. BTC se mantiene como reserva de valor de largo plazo.</div>
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
    const base = `Costo base: ${fmt(p.costTotalUSD)} · P/L total: ${pnl>=0?'+':''}${pnl.toFixed(1)}%`;
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
  const cu=1/cad;
  positions.forEach((p,i)=>{
    if(p.ticker==='RRSP-SC'){positions[i].priceUSD=rrspSc*cu;positions[i].valueUSD=rrspSc*cu;positions[i].costTotalUSD=rrspScCost*cu;}
    if(p.ticker==='RRSP-WS'){positions[i].priceUSD=rrspWs*cu;positions[i].valueUSD=rrspWs*cu;positions[i].costTotalUSD=rrspWsCost*cu;}
    if(p.ticker==='AGF-CA'){positions[i].priceUSD=agf*cu;positions[i].valueUSD=agf*cu;positions[i].costTotalUSD=agfCost*cu;}
    if(p.ticker==='AFORE'){positions[i].priceUSD=afore*mxn;positions[i].valueUSD=afore*mxn;positions[i].costTotalUSD=aforeCost*mxn;}
    if(p.ticker==='CASH-MX'){const v=cashMx*mxn;positions[i].priceUSD=v;positions[i].valueUSD=v;positions[i].costTotalUSD=cashMxCost*mxn;}
    if(p.ticker==='CASH-CA'){const v=cashCa*cu;positions[i].priceUSD=v;positions[i].valueUSD=v;positions[i].costTotalUSD=cashCaCost*cu;}
  });
  localStorage.setItem('plv2_manual',JSON.stringify({afore,aforeCost,rrspSc,rrspScCost,rrspWs,rrspWsCost,agf,agfCost,cad,mxn,cashMx,cashMxCost,cashCa,cashCaCost}));
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
function clearHistory(){
  if(!confirm('¿Borrar todo el historial?'))return;
  localStorage.removeItem('plv2_hist');
  renderHistorial();
}
function renderHistorial(){
  let hist=[];
  try{hist=JSON.parse(localStorage.getItem('plv2_hist')||'[]');}catch(e){}

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
    <div class="card"><div class="card-lbl">Máximo registrado</div><div class="card-val">${fmt(maxVal)}</div><div class="card-sub">Mínimo: ${fmt(minVal)}</div></div>`;

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
  }
}

// ─── LOAD SAVED MANUAL ───
const savedM=localStorage.getItem('plv2_manual');
if(savedM){try{
  const d=JSON.parse(savedM);
  const cu=1/(d.cad||1.3719);
  positions.forEach((p,i)=>{
    if(p.ticker==='RRSP-SC'){positions[i].priceUSD=(d.rrspSc||22623)*cu;positions[i].valueUSD=positions[i].priceUSD;positions[i].costTotalUSD=(d.rrspScCost||d.rrspSc||22623)*cu;}
    if(p.ticker==='RRSP-WS'){positions[i].priceUSD=(d.rrspWs||29499)*cu;positions[i].valueUSD=positions[i].priceUSD;positions[i].costTotalUSD=(d.rrspWsCost||26066)*cu;}
    if(p.ticker==='AGF-CA'){positions[i].priceUSD=(d.agf||31588)*cu;positions[i].valueUSD=positions[i].priceUSD;positions[i].costTotalUSD=(d.agfCost||24700)*cu;}
    if(p.ticker==='AFORE'){positions[i].priceUSD=(d.afore||1385366)*(d.mxn||0.0488);positions[i].valueUSD=positions[i].priceUSD;positions[i].costTotalUSD=(d.aforeCost||d.afore||1385366)*(d.mxn||0.0488);}
    if(p.ticker==='CASH-MX'){const v=(d.cashMx||0)*(d.mxn||0.0488);positions[i].priceUSD=v;positions[i].valueUSD=v;positions[i].costTotalUSD=(d.cashMxCost||d.cashMx||0)*(d.mxn||0.0488);}
    if(p.ticker==='CASH-CA'){const v=(d.cashCa||0)*cu;positions[i].priceUSD=v;positions[i].valueUSD=v;positions[i].costTotalUSD=(d.cashCaCost||d.cashCa||0)*cu;}
  });
}catch(e){}}

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
