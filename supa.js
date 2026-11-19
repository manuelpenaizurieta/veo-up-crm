/* VEO UP · CRM web · capa de datos sobre Supabase
   Imita la API de los artifacts (window.claude.use("db"|"user"|"downloads"|"permissions"|"mcp"))
   para reutilizar el CRM tal cual. Nombres: camelCase en la página ↔ snake_case en Postgres.
   Lo que no tenga columna propia va a «extra» (o «datos» en web_semanas). */
(function(){
"use strict";
const CFG=window.VEOUP_CFG||{};
window.VEOUP_SUPA=true;
const sb=window.supabase.createClient(CFG.url,CFG.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:"implicit"}});
window.VEOUP_SB=sb;

/* ---------- tablas: clave y columnas reales ---------- */
const T={
  negocios:{pk:"id",extra:"extra",cols:"id nombre contacto apellidos whatsapp email instagram web direccion cp localidad barrio sector origen campana origen_detalle etapa hitos responsable proxima_accion proxima_fecha fecha_entrada fecha_alta plan google_ads prueba prueba_interna forma_pago pagado_el pago_id content_day content_day_hora reunion reunion_hora entrega drive motivo_salida notas tally_id form_enviado plan_interes ads_interes que_vende diferencia promocion mostrar camara referencias comentarios objetivos fit onb confirmacion bienvenida reserva_id reserva_estado reserva_act aviso_formulario aviso_reserva aviso_pago extra creado actualizado"},
  actividades:{pk:"id",extra:"extra",cols:"id negocio_id tipo texto fecha autor autor_nombre clave extra"},
  tareas:{pk:"id",extra:"extra",cols:"id negocio_id texto responsable fecha hora estado hecha hecha_el auto clave autor autor_nombre creado actualizado extra"},
  piezas:{pk:"id",extra:"extra",cols:"id negocio_id mes tipo titulo estado orden creado actualizado extra"},
  eventos:{pk:"id",extra:"extra",cols:"id fecha hora tipo titulo negocio_id responsable autor autor_nombre creado extra"},
  web_semanas:{pk:"id",extra:"datos",cols:"id desde hasta datos creado actualizado"},
  correos:{pk:"id",extra:"extra",cols:"id negocio_id tipo para asunto cuerpo estado detalle enviado_en autor autor_nombre creado extra"},
  formularios:{pk:"submission_id",soloLectura:true,cols:"submission_id enviado_en gratis confirmacion bienvenida datos negocio_id unido procesado creado"},
  reservas:{pk:"event_id",soloLectura:true,cols:"event_id inicio fin nombre apellido email telefono negocio_txt tipo estado actualizado confirmacion_reserva negocio_id procesado"},
  pagos:{pk:"session_id",soloLectura:true,cols:"session_id fecha plan email nombre empresa nif base iva total suscripcion cliente_stripe ref_lead modo google_ads negocio_id estado via procesado"},
  ajustes:{pk:"clave",cols:"clave valor actualizado"},
  propuestas:{pk:"id",extra:"extra",cols:"id negocio_id hilo_id estado version base_id cambios respuesta refs promocion nota resultado error autor autor_nombre creado actualizado extra"},
  stripe_suscripciones:{pk:"sub_id",soloLectura:true,cols:"sub_id cliente_stripe email nombre plan google_ads estado base_mensual proximo_cobro cancela_al_final creada cancelada modo actualizado"},
  stripe_cobros:{pk:"cobro_id",soloLectura:true,cols:"cobro_id fecha cliente_stripe email sub_id motivo base iva total comision neto estado modo factura"}
};
for(const k in T)T[k].set=new Set(T[k].cols.split(" "));
/* nombres que no siguen la regla automática */
const A_SNAKE={negocios:{formAviso:"aviso_formulario",reservaAviso:"aviso_reserva",pagoAviso:"aviso_pago"}};
const A_CAMEL={};for(const t in A_SNAKE){A_CAMEL[t]={};for(const[c,s]of Object.entries(A_SNAKE[t]))A_CAMEL[t][s]=c}
const snake=(t,k)=>(A_SNAKE[t]&&A_SNAKE[t][k])||k.replace(/[A-Z]/g,m=>"_"+m.toLowerCase());
const camel=(t,k)=>(A_CAMEL[t]&&A_CAMEL[t][k])||k.replace(/_([a-z])/g,(_,c)=>c.toUpperCase());
/* columnas date/timestamp: la página guarda "" para vacío → null */
const FECHAS=new Set(["proxima_fecha","fecha_entrada","fecha_alta","pagado_el","content_day","reunion","entrega","fecha","hecha_el","desde","hasta","form_enviado","enviado_en","creado","actualizado"]);

function aFila(t,obj,previoExtra){
  const d=T[t],fila={},extra={...(previoExtra||{})};let hayExtra=false;
  for(const[k,v]of Object.entries(obj||{})){
    if(k==="id")continue;
    const s=snake(t,k);
    if(d.set.has(s)&&s!==d.extra){fila[s]=(v===""&&FECHAS.has(s))?null:v}
    else{extra[k]=v;hayExtra=true}
  }
  if(d.extra&&hayExtra)fila[d.extra]=extra;
  return fila;
}
function deFila(t,f){
  const d=T[t],o={id:f[d.pk]};
  for(const[s,v]of Object.entries(f)){if(s===d.pk||s===d.extra)continue;o[camel(t,s)]=v==null?"":v}
  if(d.extra&&f[d.extra]&&typeof f[d.extra]==="object")for(const[k,v]of Object.entries(f[d.extra]))if(!(k in o)||o[k]==="")o[k]=v;
  /* arrays y objetos vacíos con su tipo */
  if(t==="negocios"){for(const k of["objetivos","fit"])if(!Array.isArray(o[k]))o[k]=[];if(!o.hitos||typeof o.hitos!=="object")o.hitos={}}
  return o;
}

/* ---------- caché y suscripciones ---------- */
const CACHE={},SUBS={};
const emitir=t=>{const docs=[...(CACHE[t]||new Map()).values()].map(f=>({id:f[T[t].pk],data:()=>{const o=deFila(t,f);delete o.id;return o}}));
  for(const cb of SUBS[t]||[])try{cb({docs,metadata:{fromCache:false}})}catch(e){console.error(e)}};
const pendiente={};const emitirPronto=t=>{clearTimeout(pendiente[t]);pendiente[t]=setTimeout(()=>emitir(t),60)};
async function cargar(t){
  const d=T[t];const m=new Map();let desde=0;
  for(;;){const{data,error}=await sb.from(t).select("*").range(desde,desde+999);if(error)throw error;
    for(const f of data)m.set(f[d.pk],f);if(data.length<1000)break;desde+=1000}
  CACHE[t]=m;
}
/* Canales abiertos por tabla, para poder vigilarlos (ver revisarCanales) */
const CANALES={};
function escuchar(t){
  let suscrito=false;
  CANALES[t]=sb.channel("rt_"+t).on("postgres_changes",{event:"*",schema:"public",table:t},p=>{
    const d=T[t];const m=CACHE[t]||(CACHE[t]=new Map());
    if(p.eventType==="DELETE"){const id=p.old&&p.old[d.pk];if(id!=null)m.delete(id)}else m.set(p.new[d.pk],p.new);
    emitirPronto(t)}).subscribe(st=>{
      /* Al reconectar el canal, lo que llegó mientras estaba caído no se repite: se recarga */
      if(st==="SUBSCRIBED"){if(suscrito)ponerAlDiaPronto();suscrito=true}});
}
/* Puesta al día (Manu, 2026-11-18: un lead nuevo no salía en una pestaña que llevaba rato abierta hasta recargar).
   Realtime no reenvía lo que pasa mientras la pestaña duerme o se corta la red, así que se recargan las tablas abiertas
   al volver a la pestaña, al recuperar la red, al reconectar un canal y cada 2 min con la pestaña a la vista. */
let ultRecarga=Date.now(),recargando=false,tRecarga=null;
async function ponerAlDia(){
  if(recargando||!SES)return;recargando=true;
  try{for(const t of Object.keys(SUBS)){if(!T[t]||!SUBS[t].length)continue;await cargar(t);emitir(t)}ultRecarga=Date.now()}
  catch(e){console.warn("CRM: no se pudo poner al día",e)}
  finally{recargando=false}
}
const ponerAlDiaPronto=()=>{clearTimeout(tRecarga);tRecarga=setTimeout(ponerAlDia,1500)};
const siHaceRato=()=>{if(Date.now()-ultRecarga>15000)ponerAlDiaPronto()};
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")siHaceRato()});
window.addEventListener("focus",siHaceRato);
window.addEventListener("online",ponerAlDiaPronto);
/* Vigilante del tiempo real (Manu, 2026-11-19: «no se me actualiza el CRM en tiempo real»).
   Se vio con el CRM abierto un rato: los 13 canales en «errored» y sin volver a unirse (suele pasar al caducar el token
   de la sesión, que se renueva cada hora, o tras un corte de red o suspensión). El socket seguía conectado y un canal
   nuevo entraba sin problema. Ahora: cada 30 s (y al volver a la pestaña o a la red) se rehacen los canales rotos con el
   token actual y se pone al día lo perdido. Además, cada renovación de sesión pasa el token nuevo al tiempo real. */
sb.auth.onAuthStateChange((ev,ses)=>{if(ses&&ses.access_token){try{sb.realtime.setAuth(ses.access_token)}catch(e){}}});
const rtRoto=c=>!c||c.state==="errored"||c.state==="closed";
async function revisarCanales(){
  if(!SES)return;const rotos=Object.keys(CANALES).filter(t=>rtRoto(CANALES[t]));if(!rotos.length)return;
  try{const{data}=await sb.auth.getSession();if(data&&data.session)sb.realtime.setAuth(data.session.access_token)}catch(e){}
  for(const t of rotos){try{sb.removeChannel(CANALES[t])}catch(e){}delete CANALES[t];escuchar(t)}
  console.info("CRM: canales de tiempo real rehechos:",rotos.join(", "));
  ponerAlDiaPronto();
}
setInterval(revisarCanales,30000);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")revisarCanales()});
window.addEventListener("online",()=>setTimeout(revisarCanales,2000));
/* Para el indicador del CRM: true si todos los canales están unidos */
window.VEOUP_RT_OK=()=>{const cs=Object.values(CANALES);return cs.length>0&&cs.every(c=>c.state==="joined")};
setInterval(()=>{if(document.visibilityState==="visible"&&Date.now()-ultRecarga>110000)ponerAlDia()},30000);
const local=(t,f)=>{(CACHE[t]||(CACHE[t]=new Map())).set(f[T[t].pk],f);emitirPronto(t)};

/* ---------- API tipo artifact ---------- */
const nuevoId=t=>(t==="negocios"?"n_":t==="correos"?"c":"")+((crypto.randomUUID&&crypto.randomUUID())||String(Math.random()).slice(2)).replace(/-/g,"").slice(0,20);
const vacio={then:r=>r(),catch:()=>vacio};
function docRef(t,id){
  const d=T[t];
  if(!d)return{id,set:async()=>{},update:async()=>{},delete:async()=>{},get:async()=>({exists:false,data:()=>({})})};
  const previo=()=>(CACHE[t]&&CACHE[t].get(id))||null;
  return{id,
    async get(){const f=previo();return{exists:!!f,data:()=>f?deFila(t,f):{}}},
    async set(obj){const fila={[d.pk]:id,...aFila(t,obj)};
      const{data,error}=await sb.from(t).upsert(fila,{onConflict:d.pk}).select();if(error)throw aErr(error);if(data&&data[0])local(t,data[0])},
    async update(obj){const p=previo();const fila=aFila(t,obj,p&&d.extra?p[d.extra]:null);if(!Object.keys(fila).length)return;
      const{data,error}=await sb.from(t).update(fila).eq(d.pk,id).select();if(error)throw aErr(error);if(data&&data[0])local(t,data[0])},
    async delete(){const{error}=await sb.from(t).delete().eq(d.pk,id);if(error)throw aErr(error);if(CACHE[t]){CACHE[t].delete(id);emitirPronto(t)}}
  };
}
const aErr=e=>({code:e.code||"error",message:e.message||String(e)});
const db={
  doc(path){const[t,id]=String(path).split("/");return docRef(t,id)},
  collection(t){return{
    doc(id){return docRef(t,id||nuevoId(t))},
    async add(obj){const id=nuevoId(t);await docRef(t,id).set(obj);return{id}},
    onSnapshot(cb,err){
      if(!T[t]){setTimeout(()=>cb({docs:[],metadata:{fromCache:false}}),0);return()=>{}}
      (SUBS[t]||(SUBS[t]=[])).push(cb);
      if(!CACHE[t]){CACHE[t]=new Map();cargar(t).then(()=>{emitir(t);escuchar(t)}).catch(e=>err&&err(aErr(e)))}
      else setTimeout(()=>emitir(t),0);
      return()=>{SUBS[t]=SUBS[t].filter(x=>x!==cb)};
    }}}
};

/* ---------- sesión y equipo ---------- */
let SES=null,EQ=null;
const user={id:async()=>SES&&SES.user.id,can:async n=>n==="data.write"?!!EQ:null,isOwner:()=>false,canEdit:()=>!!EQ,
  me:async()=>({id:SES&&SES.user.id,name:EQ&&EQ.nombre||""}),profiles:async()=>({})};
const downloads={save:async({filename,data})=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([data],{type:"text/csv;charset=utf-8"}));a.download=filename;document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}};
const permissions={state:async()=>"granted",request:async()=>"granted",manage:async()=>{}};
let listo,promesaListo=new Promise(r=>listo=r);
window.claude={use:async n=>{await promesaListo;return n==="db"?db:n==="user"?user:n==="downloads"?downloads:n==="permissions"?permissions:null}};

/* Tras borrar una ficha por RPC: se quita ya de la caché (Realtime lo confirmará después) */
window.VEOUP_QUITAR=neg=>{
  if(CACHE.negocios&&CACHE.negocios.delete(neg))emitirPronto("negocios");
  for(const t of["actividades","tareas","piezas","correos","pagos","reservas","formularios","eventos","propuestas"]){const m=CACHE[t];if(!m)continue;let c=false;
    for(const[k,f]of m)if(f.negocio_id===neg){m.delete(k);c=true}if(c)emitirPronto(t)}
};
/* RPC que usa la página (pagos por confirmar) */
window.VEOUP_RPC=async(fn,args)=>{const{error}=await sb.rpc(fn,args);if(error)throw aErr(error)};

/* ---------- pantalla de entrada ---------- */
/* Pantalla de entrada: panel de marca (escritorio) + tarjeta. Mensajes neutros: no revela qué emails tienen acceso. */
const esc=t=>String(t||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function pantalla(tarjeta){
  let el=document.getElementById("login");
  if(!el){el=document.createElement("div");el.id="login";document.body.append(el);document.body.classList.add("lg-on")}
  el.innerHTML='<aside class="lg-marca" aria-hidden="true"><img class="lg-logo-o" src="media/logo-oscuro.png" alt="" width="240" height="49">'+
    '<div class="lg-claim"><p class="lg-k">Haz que te vean.</p><p class="lg-k lg-k2">Haz que te elijan.</p>'+
    '<p class="lg-sub">El CRM del equipo de VEO UP: leads, pagos, Content Days y contenido en un solo sitio.</p></div>'+
    '<p class="lg-pie">Pequeños gigantes · Valencia</p></aside>'+
    '<main class="lg-panel"><div class="lg-card"><img class="lg-logo-c" src="media/logo-claro.png" alt="VEO UP" width="168" height="34">'+tarjeta+'</div>'+
    '<p class="lg-legal">Acceso solo para el equipo de VEO UP.</p></main>';
  return el;
}
const MSG={
  enviando:"Enviando…",
  limite:"Has pedido varios enlaces seguidos. Espera un minuto y vuelve a intentarlo.",
  red:"No hay conexión. Revisa tu internet y vuelve a intentarlo.",
  servidor:"No hemos podido enviar el enlace ahora mismo. Inténtalo de nuevo en unos minutos.",
  formato:"Escribe un email válido, por ejemplo nombre@correo.com.",
  caducado:"Ese enlace ha caducado o ya se usó. Pide uno nuevo."
};
async function pedirEnlace(email){
  let error=null;
  try{({error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:CFG.redirect||location.origin,shouldCreateUser:false}}))}
  catch(e){return"red"}
  if(!error)return null;
  const t=(error.message||"")+" "+(error.code||"")+" "+(error.status||"");
  if(/signup|not allowed|user not found|otp_disabled|422/i.test(t))return null;   /* email sin acceso: respuesta neutra */
  if(/rate|too many|429|seconds/i.test(t))return"limite";
  if(/fetch|network/i.test(t))return"red";
  return"servidor";
}
function formularioEntrada(aviso,emailPrevio){
  const el=pantalla('<h1 class="lg-h">Entra en tu CRM</h1><p class="lg-p">Te enviamos un enlace a tu email. Sin contraseñas.</p>'+
    '<form id="lg-f" novalidate><label class="lg-l" for="lg-email">Email</label>'+
    '<input id="lg-email" class="lg-in" type="email" name="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" required placeholder="nombre@correo.com" value="'+esc(emailPrevio)+'" aria-describedby="lg-msg">'+
    '<button class="lg-btn" type="submit"><span class="lg-btn-t">Enviarme el enlace</span><span class="lg-spin" aria-hidden="true"></span></button>'+
    '<p id="lg-msg" class="lg-msg'+(aviso?" err":"")+'" role="alert" aria-live="polite">'+esc(aviso?MSG[aviso]||aviso:"")+'</p></form>');
  const f=el.querySelector("#lg-f"),inp=el.querySelector("#lg-email"),btn=el.querySelector(".lg-btn"),m=el.querySelector("#lg-msg");
  setTimeout(()=>inp.focus(),50);
  f.addEventListener("submit",async e=>{e.preventDefault();
    const em=inp.value.trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)){m.className="lg-msg err";m.textContent=MSG.formato;inp.setAttribute("aria-invalid","true");inp.focus();return}
    inp.removeAttribute("aria-invalid");btn.disabled=true;btn.classList.add("cargando");m.className="lg-msg";m.textContent=MSG.enviando;
    const fallo=await pedirEnlace(em);
    btn.disabled=false;btn.classList.remove("cargando");
    if(fallo){m.className="lg-msg err";m.textContent=MSG[fallo];return}
    pantallaEnviado(em);
  });
}
function pantallaEnviado(email){
  const el=pantalla('<div class="lg-ok" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></div>'+
    '<h1 class="lg-h">Revisa tu correo</h1><p class="lg-p">Si <b>'+esc(email)+'</b> tiene acceso, te llegará un enlace en un minuto. Ábrelo en este dispositivo.</p>'+
    '<button class="lg-btn" type="button" id="lg-re" disabled>Reenviar en 60 s</button>'+
    '<button class="lg-link" type="button" id="lg-otro">Usar otro email</button>'+
    '<p id="lg-msg" class="lg-msg" role="status" aria-live="polite">¿No lo ves? Mira en spam o promociones.</p>');
  const re=el.querySelector("#lg-re"),m=el.querySelector("#lg-msg");let t=60,iv=null;
  const tic=()=>{t--;if(t<=0){clearInterval(iv);re.disabled=false;re.textContent="Reenviar el enlace"}else re.textContent="Reenviar en "+t+" s"};
  iv=setInterval(tic,1000);
  re.addEventListener("click",async()=>{re.disabled=true;re.textContent=MSG.enviando;const fallo=await pedirEnlace(email);
    if(fallo){m.className="lg-msg err";m.textContent=MSG[fallo];re.disabled=false;re.textContent="Reenviar el enlace";return}
    m.className="lg-msg";m.textContent="Enviado de nuevo.";t=60;re.textContent="Reenviar en 60 s";iv=setInterval(tic,1000)});
  el.querySelector("#lg-otro").addEventListener("click",()=>{clearInterval(iv);formularioEntrada("",email)});
  setTimeout(()=>el.querySelector("#lg-otro").focus(),50);
}
function pantallaCargando(){pantalla('<div class="lg-cargando" role="status"><span class="lg-spin"></span> Comprobando tu sesión…</div>')}
async function entrar(ses){
  SES=ses;
  const{data,error}=await sb.from("equipo").select("nombre,email").eq("user_id",ses.user.id).maybeSingle();
  if(error||!data){
    const el=pantalla('<div class="lg-ok lg-no" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg></div>'+
      '<h1 class="lg-h">Este email no tiene acceso</h1><p class="lg-p"><b>'+esc(ses.user.email)+'</b> no está dado de alta en el CRM de VEO UP. Si crees que es un error, escribe a Manu.</p>'+
      '<button class="lg-btn lg-sec" type="button" id="lg-out">Salir y usar otro email</button>');
    el.querySelector("#lg-out").onclick=salir;return}
  EQ=data;
  try{if(!localStorage.getItem("veoupcrm:yo"))localStorage.setItem("veoupcrm:yo",JSON.stringify(data.nombre))}catch(e){}
  const el=document.getElementById("login");if(el)el.remove();document.body.classList.remove("lg-on");
  const s=document.createElement("button");s.id="lg-salir";s.type="button";s.textContent="Salir ("+data.nombre+")";s.onclick=salir;document.body.append(s);
  recuperarVista();
  listo();
}
async function salir(){await sb.auth.signOut();location.replace(location.origin+location.pathname)}
/* La vista (#salud, #hoy…) se conserva: solo se limpian del enlace los datos del inicio de sesión.
   Si hay que iniciar sesión, se recuerda la vista y se recupera al volver del enlace mágico. */
const esVista=()=>/^#[a-z]+$/.test(location.hash);
const VISTA_K="veoupcrm:vista_tras_entrar";
const limpiarHash=()=>{if(location.hash&&!esVista())history.replaceState(null,"",location.pathname+location.search)};
function recuperarVista(){
  let v=null;try{v=localStorage.getItem(VISTA_K);localStorage.removeItem(VISTA_K)}catch(e){}
  if(!esVista()&&v&&/^#[a-z]+$/.test(v)){history.replaceState(null,"",location.pathname+location.search+v);window.dispatchEvent(new HashChangeEvent("hashchange"))}
}
const arrancar=async()=>{
  pantallaCargando();
  if(esVista())try{localStorage.setItem(VISTA_K,location.hash)}catch(e){}
  const hash=new URLSearchParams(location.hash.slice(1));
  const{data}=await sb.auth.getSession();
  if(data&&data.session){limpiarHash();await entrar(data.session);return}
  const err=hash.get("error_description")||hash.get("error");
  limpiarHash();
  formularioEntrada(err?"caducado":"");
  sb.auth.onAuthStateChange((ev,ses)=>{if(ses&&!SES)entrar(ses)});
};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",arrancar);else arrancar();
})();
