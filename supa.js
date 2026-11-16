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
  ajustes:{pk:"clave",cols:"clave valor actualizado"}
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
function escuchar(t){
  sb.channel("rt_"+t).on("postgres_changes",{event:"*",schema:"public",table:t},p=>{
    const d=T[t];const m=CACHE[t]||(CACHE[t]=new Map());
    if(p.eventType==="DELETE"){const id=p.old&&p.old[d.pk];if(id!=null)m.delete(id)}else m.set(p.new[d.pk],p.new);
    emitirPronto(t)}).subscribe();
}
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

/* RPC que usa la página (pagos por confirmar) */
window.VEOUP_RPC=async(fn,args)=>{const{error}=await sb.rpc(fn,args);if(error)throw aErr(error)};

/* ---------- pantalla de entrada ---------- */
function pantalla(html){let el=document.getElementById("login");if(!el){el=document.createElement("div");el.id="login";document.body.append(el)}el.innerHTML=html;return el}
function formularioEntrada(msg){
  const el=pantalla('<div class="lg-box"><div class="lg-logo">VEO <b>UP</b> <span>CRM</span></div>'+
    '<form id="lg-f"><label for="lg-email">Tu email</label><input id="lg-email" type="email" required autocomplete="email" placeholder="nombre@correo.com">'+
    '<button type="submit">Enviarme el enlace para entrar</button></form><p id="lg-msg" role="status"></p></div>');
  const m=el.querySelector("#lg-msg");if(msg)m.textContent=msg;
  el.querySelector("#lg-f").addEventListener("submit",async e=>{e.preventDefault();const em=el.querySelector("#lg-email").value.trim().toLowerCase();
    const b=el.querySelector("button");b.disabled=true;m.textContent="Enviando…";
    const{error}=await sb.auth.signInWithOtp({email:em,options:{emailRedirectTo:CFG.redirect||location.origin,shouldCreateUser:true}});
    b.disabled=false;m.textContent=error?"No se pudo enviar: "+(error.message||"error")+". Prueba de nuevo en unos minutos.":"Listo: revisa tu correo ("+em+") y pulsa el enlace. Puedes cerrar esta pestaña.";});
}
async function entrar(ses){
  SES=ses;
  const{data,error}=await sb.from("equipo").select("nombre,email").eq("user_id",ses.user.id).maybeSingle();
  if(error||!data){pantalla('<div class="lg-box"><div class="lg-logo">VEO <b>UP</b> <span>CRM</span></div><p>Tu cuenta ('+(ses.user.email||"")+
    ') no tiene acceso a este CRM. Pide a Manu que la añada.</p><button id="lg-out">Salir</button></div>').querySelector("#lg-out").onclick=salir;return}
  EQ=data;
  try{if(!localStorage.getItem("veoupcrm:yo"))localStorage.setItem("veoupcrm:yo",JSON.stringify(data.nombre))}catch(e){}
  const el=document.getElementById("login");if(el)el.remove();
  const s=document.createElement("button");s.id="lg-salir";s.type="button";s.textContent="Salir ("+data.nombre+")";s.onclick=salir;document.body.append(s);
  listo();
}
async function salir(){await sb.auth.signOut();location.replace(location.origin+location.pathname)}
const arrancar=async()=>{
  const{data}=await sb.auth.getSession();
  if(data&&data.session){await entrar(data.session);return}
  const err=new URLSearchParams(location.hash.slice(1)).get("error_description");
  formularioEntrada(err?"El enlace no es válido o ha caducado: pide uno nuevo.":"");
  sb.auth.onAuthStateChange((ev,ses)=>{if(ses&&!SES)entrar(ses)});
};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",arrancar);else arrancar();
})();
