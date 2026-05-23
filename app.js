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
  CLIENT_ID: '',                 // <-- PEGA AQUI tu Google OAuth Client ID (xxx.apps.googleusercontent.com)
  ALLOWED_EMAILS: [],            // <-- PEGA AQUI tu(s) correo(s) Google, ej: ['tucorreo@gmail.com']
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
  grantAccess();
}

function logout(){
  sessionStorage.removeItem(ID_TOKEN_KEY);
  try{ google.accounts.id.disableAutoSelect(); }catch(e){}
  location.reload();
}

function initAuth(){
  if(!(window.google && google.accounts && google.accounts.id)) return false;
  google.accounts.id.initialize({ client_id: AUTH.CLIENT_ID, callback: handleCredential, auto_select: true });
  const btn=document.getElementById('gsiButton');
  if(btn) google.accounts.id.renderButton(btn, {theme:'filled_black', size:'large', text:'signin_with', shape:'pill'});
  google.accounts.id.prompt();
  return true;
}

function bootAuth(){
  // Restaura sesion valida sin volver a pedir login (token vive ~1h)
  const saved=sessionStorage.getItem(ID_TOKEN_KEY);
  if(saved && isValidClaims(decodeJwt(saved))){ grantAccess(); return; }
  sessionStorage.removeItem(ID_TOKEN_KEY);

  const hint=document.getElementById('loginHint');
  if(!AUTH.CLIENT_ID || !AUTH.ALLOWED_EMAILS.length){
    if(hint) hint.innerHTML='⚠ Falta configurar el login. Edita <code>app.js</code> (AUTH.CLIENT_ID y AUTH.ALLOWED_EMAILS). Ver README.';
    return;
  }
  // Espera a que cargue la libreria de Google (script async)
  let tries=0;
  (function wait(){
    if(initAuth()) return;
    if(tries++>100){ if(hint) hint.textContent='No se pudo cargar Google Sign-In. Revisa tu conexion.'; return; }
    setTimeout(wait,100);
  })();
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

const catClass = c=>({index:'ci',tech:'ct',crypto:'cc',intl:'cl',defense:'cd',hedge:'ch',bio:'cb',retiro:'cd',metals:'ch'}[c]||'ci');
const catLabel = c=>({index:'Index',tech:'Tech',crypto:'Crypto',intl:'Internacional',defense:'Defensa',hedge:'Hedge',bio:'Biotech',retiro:'Retiro',metals:'Metales'}[c]||c);
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
  const cryptoPct=(byCat.crypto||0)/t*100;
  const hedgePct=(byCat.hedge||0)/t*100;
  const wCorr=calcCorr();

  document.getElementById('overviewCards').innerHTML=`
    <div class="card"><div class="card-lbl">Portafolio activo</div><div class="card-val">${fmt(t)}</div><div class="card-sub">MX+CA+Cripto+Bitso</div></div>
    <div class="card"><div class="card-lbl">P/L total activo</div><div class="card-val ${pnlPct>=0?'up':'down'}">${fmtPct(pnlPct)}</div><div class="card-sub ${pnlPct>=0?'up':'down'}">${pnlAmt>=0?'+':''}${fmt(pnlAmt)}</div></div>
    <div class="card"><div class="card-lbl">Correlación interna</div><div class="card-val ${wCorr>=0.80?'down':''}">${wCorr.toFixed(2)}</div><div class="card-sub">meta &lt; 0.65</div></div>
    <div class="card"><div class="card-lbl">Crypto activo</div><div class="card-val ${cryptoPct>10?'down':''}">${cryptoPct.toFixed(1)}%</div><div class="card-sub">target ≤ 8%</div></div>
    <div class="card"><div class="card-lbl">Hedge (GLD)</div><div class="card-val ${hedgePct<5?'down':''}">${hedgePct.toFixed(1)}%</div><div class="card-sub">target 10–15%</div></div>`;

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

  // Donut — active only
  const catColors={'index':'#1a50a0','tech':'#1a6b3a','crypto':'#b53a2f','intl':'#5a3fa0','defense':'#8a5f0a','hedge':'#854f0b','bio':'#0d7a5a','metals':'#c45c0a'};
  const catEntries=Object.entries(byCat).filter(([,v])=>v>0);
  if(donutChart)donutChart.destroy();
  donutChart=new Chart(document.getElementById('donutChart'),{type:'doughnut',data:{
    labels:catEntries.map(([k])=>catLabel(k)),
    datasets:[{data:catEntries.map(([,v])=>Math.round(v)),backgroundColor:catEntries.map(([k])=>catColors[k]||'#888'),borderWidth:0,hoverOffset:4}]},
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
  const alerts=[];
  if(cryptoPct>10)alerts.push({type:'warn',msg:`Crypto en ${cryptoPct.toFixed(1)}% del portafolio activo. Considera consolidar altcoins pequeños (ARB, UNI) en BTC o ETH.`});
  if(hedgePct<3)alerts.push({type:'warn',msg:`Sin GLD — el gap más crítico. Sin correlación negativa, una caída del 30% arrastraría el 85%+ del portafolio activo simultáneamente.`});
  if(wCorr>0.80)alerts.push({type:'warn',msg:`Correlación interna de ${wCorr.toFixed(2)} — muy alta. Los primeros $300 semanales deberían ir a GLD para bajar este número.`});
  document.getElementById('alertsSection').innerHTML=alerts.map(a=>`<div class="${a.type}" style="font-size:12px;">${a.msg}</div>`).join('');
}

// ─── POSITIONS ───
function sortBy(col){
  if(sortCol===col) sortDir*=-1;
  else{sortCol=col;sortDir=1;}
  renderPositions();
}
function renderPositions(){
  const t=totalAll();
  let filtered;
  if(acctFilter==='active') filtered=activePos();
  else if(acctFilter==='all') filtered=positions;
  else filtered=positions.filter(p=>p.acct===acctFilter);

  const filteredTotal=filtered.reduce((s,p)=>s+p.valueUSD,0);
  const filteredCost=filtered.reduce((s,p)=>s+p.costTotalUSD,0);
  const filteredPnlAmt=filteredTotal-filteredCost;
  const filteredPnlPct=filteredCost>0?(filteredPnlAmt/filteredCost)*100:0;
  document.getElementById('posCount').textContent=filtered.length+' posiciones · '+fmt(filteredTotal);

  // Update header indicators
  ['ticker','cat','acct','priceUSD','units','valueUSD','pnlPct','weight'].forEach(c=>{
    const el=document.getElementById('sh-'+c);
    if(el) el.textContent=sortCol===c?(sortDir===1?' ↓':' ↑'):'';
  });

  const sorted=[...filtered].sort((a,b)=>{
    let av, bv;
    if(sortCol==='ticker') {av=a.ticker;bv=b.ticker;return sortDir*(av<bv?-1:av>bv?1:0);}
    if(sortCol==='cat')    {av=a.cat;bv=b.cat;return sortDir*(av<bv?-1:av>bv?1:0);}
    if(sortCol==='acct')   {av=a.acct;bv=b.acct;return sortDir*(av<bv?-1:av>bv?1:0);}
    if(sortCol==='pnlPct'){
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
    return `<tr>
      <td><span class="tk">${p.ticker}</span><br><span style="font-size:11px;color:var(--muted);">${p.name}</span></td>
      <td><span class="cpill ${catClass(p.cat)}">${catLabel(p.cat)}</span></td>
      <td><span class="abadge ${acctClass(p.acct)}">${p.acct}</span></td>
      <td class="mono">${p.priceUSD<1?p.priceUSD.toFixed(4):fmt2(p.priceUSD)}</td>
      <td class="mono">${p.units.toFixed(4)}</td>
      <td class="mono">${fmt(p.valueUSD)}</td>
      <td><span class="${pnl>=0?'pu':'pd'}">${fmtPct(pnl)}<br><span style="font-size:11px;">${pnlA>=0?'+':''}${fmt(pnlA)}</span></span></td>
      <td class="pn">${(p.valueUSD/t*100).toFixed(1)}%</td>
    </tr>`;
  }).join('')+`
  <tr style="background:var(--surface2);border-top:2px solid var(--border-md);">
    <td colspan="2" style="font-family:var(--mono);font-size:12px;font-weight:500;padding:12px 16px;">Total</td>
    <td></td><td></td><td></td>
    <td style="font-family:var(--mono);font-size:13px;font-weight:500;padding:12px 16px;">${fmt(filteredTotal)}</td>
    <td style="padding:12px 16px;"><span class="${filteredPnlPct>=0?'pu':'pd'}">${fmtPct(filteredPnlPct)}<br><span style="font-size:11px;">${filteredPnlAmt>=0?'+':''}${fmt(filteredPnlAmt)}</span></span></td>
    <td style="font-family:var(--mono);font-size:12px;padding:12px 16px;color:var(--muted);">100%</td>
  </tr>`;
}

function filterAcct(a,btn){
  acctFilter=a;
  document.querySelectorAll('.at').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderPositions();
}

// ─── ALLOCATION (active only) ───
const TARGETS=[
  {cat:'index',label:'S&P 500 + Index',sub:'SPYG·VOO·ZSP·XSP·VTI',target:30,color:'#1a50a0'},
  {cat:'tech',label:'Tech individual',sub:'AAPL·META·MSFT·GOOG…',target:18,color:'#1a6b3a'},
  {cat:'crypto',label:'Crypto',sub:'BTC·ETH·COIN·alts',target:8,color:'#b53a2f'},
  {cat:'intl',label:'Internacional',sub:'VEA·VGK',target:10,color:'#5a3fa0'},
  {cat:'defense',label:'Defensa / valor',sub:'BRK.B',target:4,color:'#8a5f0a'},
  {cat:'hedge',label:'Hedge — GLD',sub:'GLD · oro',target:12,color:'#854f0b'},
  {cat:'bio',label:'Biotecnología',sub:'ILMN·GRAL',target:2,color:'#0d7a5a'},
  {cat:'metals',label:'Metales',sub:'ICOP·GLD-Bitso',target:3,color:'#c45c0a'},
];
function renderAllocation(){
  const ap=activePos(), t=totalActive();
  const byCat={};
  ap.forEach(p=>{byCat[p.cat]=(byCat[p.cat]||0)+p.valueUSD;});
  const cp=(byCat.crypto||0)/t*100, ip=(byCat.index||0)/t*100, hp=(byCat.hedge||0)/t*100;
  document.getElementById('allocCards').innerHTML=`
    <div class="card"><div class="card-lbl">Crypto</div><div class="card-val ${cp>10?'down':''}">${cp.toFixed(1)}%</div><div class="card-sub">target ≤ 8%</div></div>
    <div class="card"><div class="card-lbl">S&P 500 / Index</div><div class="card-val">${ip.toFixed(1)}%</div><div class="card-sub">target 30–40%</div></div>
    <div class="card"><div class="card-lbl">GLD / Hedge</div><div class="card-val ${hp<5?'down':''}">${hp.toFixed(1)}%</div><div class="card-sub">target 10–15%</div></div>`;
  document.getElementById('allocBars').innerHTML=TARGETS.map(tg=>{
    const actual=(byCat[tg.cat]||0)/t*100, diff=actual-tg.target;
    if(tg.target===0&&actual<0.5)return '';
    return `<div class="ar">
      <div class="al">${tg.label}<span class="as">${tg.sub}</span></div>
      <div class="bt"><div class="bf" style="width:${Math.min(actual,100)}%;background:${tg.color};opacity:.8;"></div>${tg.target>0?`<div class="btg" style="left:${tg.target}%;"></div>`:''}</div>
      <div class="ap" style="color:${diff>5?'var(--red)':diff<-5?'var(--blue)':'var(--text)'}">${actual.toFixed(1)}%</div>
      <div class="au">${fmt(byCat[tg.cat]||0)}</div>
      ${tg.target>0?`<div class="ad ${diff>5?'pd':diff<-5?'pu':'pn'}">${diff>0?'+':''}${diff.toFixed(1)}%</div>`:'<div class="ad"></div>'}
    </div>`;
  }).join('');
  const alerts=[];
  if(cp>10)alerts.push({t:'warn',m:`Crypto en ${cp.toFixed(1)}% del portafolio activo.`});
  if(hp<3)alerts.push({t:'warn',m:`GLD en ${hp.toFixed(1)}%. Sin este activo no tienes cobertura real ante caídas.`});
  document.getElementById('allocAlerts').innerHTML=alerts.map(a=>`<div class="${a.t}">${a.m}</div>`).join('');
  const tks={};
  ap.filter(p=>!['CRYPTO','BITSO'].includes(p.acct)).forEach(p=>{if(!tks[p.ticker])tks[p.ticker]={};tks[p.ticker][p.acct]=(tks[p.ticker][p.acct]||0)+p.valueUSD;});
  const overlaps=Object.entries(tks).filter(([,v])=>Object.keys(v).length>1);
  document.getElementById('overlapTbl').innerHTML=overlaps.map(([tk,v])=>{
    const tot=Object.values(v).reduce((s,x)=>s+x,0);
    const action=tk==='COIN'?'Reducir en MX primero':tk==='AMZN'||tk==='META'?'No agregar más en MX':'Revisar';
    return `<tr><td><span class="tk">${tk}</span></td><td class="mono">${v.MX?fmt(v.MX):'—'}</td><td class="mono">${v.CA?fmt(v.CA):'—'}</td><td class="mono">—</td><td class="mono">${fmt(tot)}</td><td style="font-size:11px;color:var(--amber);">${action}</td></tr>`;
  }).join('');
}

// ─── CORRELATION (active only) ───
const CAT_CORR={index:0.98,tech:0.87,crypto:0.52,intl:0.82,defense:0.68,hedge:0.05,bio:0.55,metals:0.15};
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
    <div class="card"><div class="card-lbl">Hedge real (&lt;0.3)</div><div class="card-val" style="color:${hp>=10?'var(--green)':hp>=5?'var(--amber)':'var(--red)'}">${hp.toFixed(1)}%</div><div class="card-sub">GLD + metales · target 12%</div></div>
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
    {l:'Metales (ICOP/GLD)',c:0.15,col:'#c45c0a',w:((byCat.metals||0)+(byCat.hedge||0))/t*100},
  ];
  document.getElementById('corrDetail').innerHTML=risks.map(r=>`
    <div class="ar">
      <div class="al">${r.l}<span class="as">Corr vs S&P: ${r.c.toFixed(2)} · ${r.w.toFixed(1)}% cartera activa</span></div>
      <div class="bt"><div class="bf" style="width:${r.c*100}%;background:${r.col};opacity:.6;"></div></div>
      <div class="ap">${r.c.toFixed(2)}</div>
    </div>`).join('');
  const gldNow=((byCat.hedge||0)+(byCat.metals||0))/t*100;
  const progL=['Ahora',...[4,8,12,16,20].map(g=>'GLD '+g+'%')];
  const progD=[wc,...[4,8,12,16,20].map(g=>Math.max(0.35,wc-(g-gldNow)*0.009))];
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
  const t=totalActive(); const byCat={};
  activePos().forEach(p=>{byCat[p.cat]=(byCat[p.cat]||0)+p.valueUSD;});
  const wc=calcCorr(), hp=(byCat.hedge||0)/t*100, cp=(byCat.crypto||0)/t*100;
  document.getElementById('recsContext').textContent=
    `Portafolio activo: ${fmt(t)} · correlacion ${wc.toFixed(2)} · GLD ${hp.toFixed(1)}% · crypto ${cp.toFixed(1)}%`;
}

async function callProxy(messages, useSearch){
  const body={model:'claude-sonnet-4-20250514',max_tokens:1500,messages};
  if(useSearch) body.tools=[{type:'web_search_20250305',name:'web_search'}];
  const idToken=sessionStorage.getItem('plv2_idtoken');
  const headers={'Content-Type':'application/json'};
  if(idToken) headers['Authorization']='Bearer '+idToken;
  const res=await fetch('https://portfolio-proxy.rcelaya.workers.dev',{
    method:'POST',headers,body:JSON.stringify(body)
  });
  if(res.status===401||res.status===403) throw new Error('Sesion no autorizada o expirada. Vuelve a iniciar sesion con Google.');
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

  const ap=activePos(), t=totalActive();
  const byCat={};
  ap.forEach(p=>{byCat[p.cat]=(byCat[p.cat]||0)+p.valueUSD;});
  const wc=calcCorr();
  const topPos=[...ap].sort((a,b)=>b.valueUSD-a.valueUSD).slice(0,18).map(p=>{
    const pnl=p.costTotalUSD>0?((p.valueUSD-p.costTotalUSD)/p.costTotalUSD)*100:0;
    return `${p.ticker}(${p.acct}) ${fmt(p.valueUSD)} ${(p.valueUSD/t*100).toFixed(1)}% PL${pnl>=0?'+':''}${pnl.toFixed(1)}%`;
  }).join(' | ');
  const catBk=Object.entries(byCat).map(([k,v])=>`${k}:${(v/t*100).toFixed(1)}%`).join(' ');

  try{
    const DEFAULT_CTX = 'S&P500 P/E ~26 niveles elevados. Fed tasas 3.5-3.75% un recorte proyectado 2026. Oro $4490/oz cerca maximos. BTC recupero $70k crypto constructivo.';
    const MARKET_CTX = (localStorage.getItem('plv2_market_ctx') || DEFAULT_CTX).replace(/"/g,"'").substring(0,200);

    bar.style.width='40%'; loadTxt.textContent='Analizando portafolio...';

    const topPos5=[...ap].sort((a,b)=>b.valueUSD-a.valueUSD).slice(0,8).map(p=>{
      const pnl=p.costTotalUSD>0?((p.valueUSD-p.costTotalUSD)/p.costTotalUSD)*100:0;
      return `${p.ticker}(${p.acct}) ${fmt(p.valueUSD)} PL${pnl>=0?'+':''}${pnl.toFixed(0)}%`;
    }).join(' | ');

    const hedgePct=((byCat.hedge||0)/t*100).toFixed(1);
    const intlPct=((byCat.intl||0)/t*100).toFixed(1);

    bar.style.width='65%'; loadTxt.textContent='Generando recomendaciones...';

    const s2=await callProxy([{role:'user',content:`Asesor de inversiones. Portafolio activo: ${topPos5} | Categorias: ${catBk} | Correlacion interna: ${wc.toFixed(2)} (meta<0.65) | GLD/hedge actual: ${hedgePct}% (meta 12%) | Internacional: ${intlPct}% (meta 10%) | DCA disponible $300/sem cuenta MX | Horizonte 15yr | Mercado: ${MARKET_CTX}

IMPORTANTE: hedge en ${hedgePct}% - si es menor a 10% GLD DEBE estar en buy con prioridad urgente. DCA debe alinearse con los gaps reales del portafolio.

Responde SOLO con JSON sin texto extra ni markdown:
{"market_context":"resumen breve","buy":[{"ticker":"GLD","name":"SPDR Gold Shares","action":"Comprar urgente","rationale":"especifico al portafolio","corr_sp500":0.05,"dca_weekly":150,"account":"MX"}],"reduce":[{"ticker":"ARB","reason":"especifico"}]}

4 recomendaciones buy y 3 reduce reales. Solo JSON.`}], false);

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

    document.getElementById('recsMarketContext').textContent=parsed.market_context||marketCtx;
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
let weekNum=parseInt(localStorage.getItem('plv2_week')||'1');
const PHASES=[
  {n:1,w:'1–8',label:'Base anti-correlación',color:'#1a50a0',
   desc:'$300 completos a GLD. Ya tienes GLD en Bitso — considera incrementarlo ahí también. GLD tiene correlación 0.05 con el S&P, es el mayor impacto por dólar.',
   split:[{t:'GLD',a:300,r:'Hedge · corr 0.05',ct:'MX o Bitso'}]},
  {n:2,w:'9–20',label:'Diversificación geográfica',color:'#5a3fa0',
   desc:'GLD llega al 5–7%. Ahora suma VEA. La combinación baja correlación de ~0.82 a ~0.73.',
   split:[{t:'GLD',a:150,r:'Continuar hasta 12%',ct:'MX'},{t:'VEA',a:100,r:'Internacional',ct:'MX'},{t:'VTI',a:50,r:'Core',ct:'MX'}]},
  {n:3,w:'21–40',label:'Upside selectivo',color:'#1a6b3a',
   desc:'GLD en ~10%. Introduce NVDA/TSM como upside diferenciado. No agregues META ni AMZN en MX — ya los tienes en CA.',
   split:[{t:'GLD',a:100,r:'Hasta 12%',ct:'MX'},{t:'VEA',a:60,r:'Internacional',ct:'MX'},{t:'NVDA',a:80,r:'Upside IA',ct:'MX'},{t:'GOOG',a:60,r:'Tech menor corr interna',ct:'MX'}]},
  {n:4,w:'40+',label:'Modo crucero',color:'#0d7a5a',
   desc:'GLD en 12–15%. Split permanente. En RRSPs migra gradualmente a VEQT. Revisa crypto cada 6 meses.',
   split:[{t:'GLD',a:75,r:'Mantener ratio',ct:'MX'},{t:'VTI',a:75,r:'Core',ct:'MX'},{t:'VEA',a:60,r:'Internacional',ct:'MX'},{t:'NVDA/TSM',a:50,r:'Upside',ct:'MX'},{t:'VEQT',a:null,r:'Migrar RRSPs gradual',ct:'RRSP CA'}]},
];
function getPhase(){if(weekNum<=8)return 0;if(weekNum<=20)return 1;if(weekNum<=40)return 2;return 3;}
function renderDCA(){
  const ph=getPhase();
  document.getElementById('dcaCards').innerHTML=`
    <div class="card"><div class="card-lbl">Aportación semanal</div><div class="card-val up">$300</div><div class="card-sub">USD · MX</div></div>
    <div class="card"><div class="card-lbl">Aportación anual</div><div class="card-val">$15,600</div><div class="card-sub">52 sem × $300</div></div>
    <div class="card"><div class="card-lbl">Fase actual</div><div class="card-val">${ph+1}</div><div class="card-sub">Semanas ${PHASES[ph].w}</div></div>
    <div class="card"><div class="card-lbl">Semana</div><div class="card-val">${weekNum}</div><div class="card-sub"><button class="btn btn-sm" onclick="advWeek()">+ Semana</button></div></div>`;
  document.getElementById('dcaPhases').innerHTML=PHASES.map((p,i)=>`
    <div style="background:var(--surface);border:1px solid ${i===ph?p.color:'var(--border)'};border-radius:10px;padding:15px 17px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <span style="font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:.08em;padding:3px 8px;border-radius:4px;background:${p.color}20;color:${p.color};">Fase ${p.n} · Sem ${p.w}</span>
        ${i===ph?`<span style="font-size:9px;font-family:var(--mono);color:${p.color};text-transform:uppercase;">Activa</span>`:''}
      </div>
      <div style="font-size:13px;font-weight:600;margin-bottom:5px;">${p.label}</div>
      <div style="font-size:12px;color:var(--muted);line-height:1.6;margin-bottom:10px;">${p.desc}</div>
      <div style="border-top:1px solid var(--border);padding-top:10px;">
        ${p.split.map(s=>`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px;">
          <span style="font-family:var(--mono);font-weight:500;">${s.t}</span>
          <span style="font-family:var(--mono);color:var(--green);">${s.a?'$'+s.a+'/sem':'Migrar gradual'}</span>
        </div>`).join('')}
      </div>
    </div>`).join('');
  document.getElementById('weeklyTbl').innerHTML=PHASES[ph].split.map(s=>`<tr>
    <td><span class="tk">${s.t}</span></td>
    <td><span class="mono up">${s.a?'$'+s.a:'Gradual'}</span></td>
    <td style="font-size:12px;color:var(--muted);">${s.r}</td>
    <td><span class="abadge ${acctClass(s.ct||'MX')}">${s.ct||'MX'}</span></td>
  </tr>`).join('');
}
function advWeek(){weekNum++;localStorage.setItem('plv2_week',weekNum);renderDCA();}

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
  const cu=1/cad;
  positions.forEach((p,i)=>{
    if(p.ticker==='RRSP-SC'){positions[i].priceUSD=rrspSc*cu;positions[i].valueUSD=rrspSc*cu;positions[i].costTotalUSD=rrspScCost*cu;}
    if(p.ticker==='RRSP-WS'){positions[i].priceUSD=rrspWs*cu;positions[i].valueUSD=rrspWs*cu;positions[i].costTotalUSD=rrspWsCost*cu;}
    if(p.ticker==='AGF-CA'){positions[i].priceUSD=agf*cu;positions[i].valueUSD=agf*cu;positions[i].costTotalUSD=agfCost*cu;}
    if(p.ticker==='AFORE'){positions[i].priceUSD=afore*mxn;positions[i].valueUSD=afore*mxn;positions[i].costTotalUSD=aforeCost*mxn;}
  });
  localStorage.setItem('plv2_manual',JSON.stringify({afore,aforeCost,rrspSc,rrspScCost,rrspWs,rrspWsCost,agf,agfCost,cad,mxn}));
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

function gotoSetup(){sv('setup',null);document.querySelectorAll('.nb').forEach(b=>{if(b.getAttribute('onclick')&&b.getAttribute('onclick').includes("'setup'"))b.classList.add('active');});}

// ─── NAV ───
function sv(view,btn){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nb').forEach(b=>b.classList.remove('active'));
  document.getElementById('view-'+view).classList.add('active');
  if(btn)btn.classList.add('active');
  if(view==='overview')renderOverview();
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

bootAuth();
