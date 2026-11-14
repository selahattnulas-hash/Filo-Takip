// @ts-nocheck
// Filo Takip: canlı takip uyarılarını her dakika hesaplar, patron ve operasyoncu telefonlarına Web Push gönderir.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";
let VEH=[],EV={};
const tHM=iso=>new Date(iso).toLocaleTimeString("tr-TR",{timeZone:"Europe/Istanbul",hour:"2-digit",minute:"2-digit"});
const mOf=t=>{if(t==null||t==="")return null;const a=String(t).split(":");return a[0]*60+ +a[1]};
const fM=x=>{x=((Math.round(x)%1440)+1440)%1440;return String(Math.floor(x/60)).padStart(2,"0")+":"+String(x%60).padStart(2,"0")};
const isoM=iso=>mOf(tHM(iso));
const trv=(a,b)=>{if(!a||!b)return null;if(a.k&&b.k&&a.k==b.k)return 5;const km=roadKm(a,b);return Math.round(km<=15?km*1.4:21+(km-15)*0.7)+5};
const ptLoc=e=>e&&e.lat!=null?{k:"_",c:[e.lat,e.lng]}:null;
const trvB=(a,b)=>{const t=trv(a,b);return t==null?null:Math.round(t*1.1)+3};
const lateTh=j=>j.job_type=="varis"?15:5;
let DP=[],UETDS_ON=true,JW=[];
function lastPos(v,J,now){const ds=new Set(J.filter(x=>x.vehicle_id==v.id&&x.driver_id).map(x=>x.driver_id));if(v.default_driver_id)ds.add(v.default_driver_id);
  const L=DP.filter(x=>x.kind=="konum"&&ds.has(x.driver_id)&&x.lat!=null),p=L[L.length-1];if(!p)return null;const age=now-isoM(p.at);if(!(age>=0&&age<=20))return null;
  const q=L[L.length-2],pq=q&&isoM(p.at)-isoM(q.at)<=15?ptLoc(q):null;return{loc:ptLoc(p),at:isoM(p.at),age,prev:pq}}
function nearS(lp,S){const k=lp&&S?roadKm(lp.loc,S):null;return k!=null&&k<=2.5}
function movingTo(lp,S){if(!lp||!lp.prev||!S||lp.age>10)return false;const a=roadKm(lp.prev,S),b=roadKm(lp.loc,S);return a!=null&&b!=null&&b<a-1}
function brokenAt(v,J){let t=null;for(const j of J){if(j.vehicle_id!=v.id)continue;const so=DP.filter(x=>x.job_id==j.id&&x.kind=="sorun").pop();if(so&&(t==null||isoM(so.at)>t))t=isoM(so.at)}
  if(t==null)return null;for(const j of J){if(j.vehicle_id!=v.id)continue;if((EV[j.id]||[]).some(e=>isoM(e.at)>t))return null}return t}
function jStart(j){const st=(j.job_stops||[]).slice().sort((a,b)=>a.seq-b.seq);if(j.job_type=="varis")return locOf(j.from_city)||locOf("BJV");const f=st[0];return f?locOf(f.region||f.place)||locOf(j.from_city):locOf(j.from_city)}
function jP(j){if(j.job_type=="varis"&&(j.eta_landing||j.flight_time))return mOf(j.eta_landing||j.flight_time)+25;const st=(j.job_stops||[]).filter(s=>s.pickup_time).sort((a,b)=>a.pickup_time<b.pickup_time?-1:1);return mOf(j.pickup_time)??(st[0]?mOf(st[0].pickup_time):null)??mOf(j.flight_time)}
function chain(j,from,t0){
  const st=(j.job_stops||[]).slice().sort((a,b)=>a.seq-b.seq),out=[];let t=t0,cur=from;
  if(j.job_type=="varis"){const pts=st.length?st.map(s=>({n:s.place||s.region,l:locOf(s.region||s.place)})):[{n:j.to_city,l:locOf(j.to_city)}];
    if(cur==null)cur=jStart(j);for(const p of pts){const d=trv(cur,p.l);if(d==null)return out;t+=d;out.push({n:p.n,t,kind:"bırakış"});t+=4;cur=p.l}}
  else{const pts=st.length?st.map(s=>({n:s.place||s.region,l:locOf(s.region||s.place),lt:mOf(s.pickup_time)})):[{n:j.from_city,l:locOf(j.from_city),lt:jP(j)}];
    for(const p of pts){const d=cur?trv(cur,p.l):0;if(d==null)return out;t=Math.max(t+d,p.lt??0);out.push({n:p.n,t,kind:"alış",lt:p.lt,late:p.lt!=null&&t>p.lt+5?Math.round(t-p.lt):0});t+=5;cur=p.l}
    const e=locOf(j.to_city),d=trv(cur,e);if(d!=null)out.push({n:j.to_city,t:t+d,kind:"varış"})}
  return out}
function jEnd(j){const P=jP(j);if(P==null)return null;const ev=EV[j.id]||[],a=ev.find(e=>e.kind=="aldi"),c=a?chain(j,jStart(j),Math.max(isoM(a.at),P)):chain(j,jStart(j),P),sp=jobSpan(j);return c.length?c[c.length-1].t:sp?sp[1]:P+60}
function vehState(v,now,J){
  const mine=J.filter(x=>x.vehicle_id==v.id&&jP(x)!=null).sort((a,b)=>jP(a)-jP(b));let loc=locOf(v.home_city),free=now,busy=null,src=v.home_city?"şehir":"bilinmiyor";
  for(const x of mine){const ev=EV[x.id]||[],done=x.status=="tamamlandi"||ev.some(e=>e.kind=="birakti"),P=jP(x),end=jEnd(x),R=jobRoute(x);
    const lastPt=ev.filter(e=>e.lat!=null).pop();
    if(done||(end!=null&&now>end+15&&!ev.some(e=>e.kind=="aldi"&&isoM(e.at)>end))){if(P<=now){loc=R.e||ptLoc(lastPt)||loc;src="son iş"}continue}
    if(ev.some(e=>e.kind=="aldi")||P<=now){busy=x;free=Math.max(now,end??now);loc=R.e||loc;src="işte";break}
    if(ev.some(e=>e.kind=="cikti")){busy=x;free=Math.max(now,end??now);loc=R.e||loc;src="işe gidiyor";break}
    break}
  if(!busy){const lp=lastPos(v,J,now);if(lp&&lp.age<=10){loc=lp.loc;src="konum"}}
  return{loc,free,busy,src}}
function nextJob(v,afterMin,J,skip){return J.filter(x=>x.vehicle_id==v.id&&x.id!=skip&&x.status!="tamamlandi"&&jP(x)!=null&&jP(x)>=afterMin&&!(EV[x.id]||[]).some(e=>e.kind=="birakti")).sort((a,b)=>jP(a)-jP(b))[0]||null}
function canCover(w,j,now,J,exclude){
  if(w.capacity&&j.pax&&w.capacity<j.pax)return null;if(brokenAt(w,J)!=null)return null;const s=vehState(w,now,J);if(s.busy&&s.busy.id==j.id)return null;const P=jP(j),d=trvB(s.loc,jStart(j));if(d==null||P==null)return null;
  const arr=Math.max(s.free,now)+d;if(arr>P+(j.job_type=="varis"?10:0))return null;const dur=(jEnd(j)??P+60)-P,fin=Math.max(arr,P)+dur,nx=nextJob(w,now,J,j.id),need=nx?trv(jobRoute(j).e,jStart(nx)):0;
  return{w,arr:Math.round(arr),fin,nx:nx&&fin+(need||0)>jP(nx)-5?nx:null}}
function rescue(j,now,J){
  const out=[];for(const w of VEH){if(w.id==j.vehicle_id)continue;const c=canCover(w,j,now,J);if(!c)continue;
    if(!c.nx){out.push({w,arr:c.arr,txt:`${w.plate} saat ~${fM(c.arr)} gibi alışta olur`});continue}
    for(const u of VEH){if(u.id==w.id||u.id==j.vehicle_id)continue;const c2=canCover(u,c.nx,now,J.map(x=>x.id==j.id?Object.assign({},x,{vehicle_id:w.id}):x));if(c2&&!c2.nx){out.push({w,arr:c.arr,u,k:c.nx,txt:`${w.plate} bu işe (~${fM(c.arr)}), onun saat ${h5(c.nx.pickup_time)} işini ${u.plate} alır (~${fM(c2.arr)})`});break}}}
  return out.sort((a,b)=>(a.u?1:0)-(b.u?1:0)||a.arr-b.arr).slice(0,3)}
function watchCalc(J,now){
  const A=[],snz=k=>{try{return Number(localStorage.getItem("ft_snz_"+k)||0)>Date.now()}catch(e){return false}};
  for(const j of J){if(j.status=="tamamlandi")continue;const ev=EV[j.id]||[],has=k=>ev.filter(e=>e.kind==k).pop(),c=has("cikti"),a=has("aldi"),b=has("birakti");if(b)continue;
    const P=jP(j);if(P==null)continue;const S=jStart(j),end=jEnd(j);
    if(!j.vehicle_id){if(now>=P-120&&now<(end??P+60))A.push({j,k:"aracsiz",lvl:now>=P-60?2:1,t:`Araç atanmamış. Alış ${fM(P)}${now>P?" (saati geçti)":""}`,late:true});continue}
    const v=VEH.find(x=>x.id==j.vehicle_id);if(!v)continue;const others=J.filter(x=>x.id!=j.id);
    const ns=JW.find(w=>w.job_id==j.id&&w.kind=="noshow");if(ns){if(j.uetds_status=="noshow"||now-isoM(ns.started_at)<30)A.push({j,k:"noshow",lvl:2,t:`Kaptan yolcunun gelmediğini bildirdi (saat ${tHM(ns.started_at)}). Acentayı ara${UETDS_ON?"; U-ETDS'ye 30 dk içinde gelmeyen yolcuyu bildir":""}.`});continue}
    const wo=JW.find(w=>w.job_id==j.id&&w.kind=="bekleme"&&!w.ended_at);if(wo&&now-isoM(wo.started_at)>=20)A.push({j,k:"bekleme",lvl:1,t:`Kaptan ${now-isoM(wo.started_at)} dk'dır yolcuyu bekliyor (saat ${tHM(wo.started_at)}'ten beri)`});
    if(UETDS_ON&&j.uetds_status!="bildirildi"&&j.uetds_status!="noshow"&&now>=P-90&&now<P+10)A.push({j,k:"uetds",lvl:(now>=P-60||j.uetds_status=="guncelle")?2:1,t:j.uetds_status=="guncelle"?`U-ETDS: işte değişiklik oldu (kişi, araç, şoför ya da saat); bildirimi güncelle`:`U-ETDS bildirimi işaretlenmedi: sefer ${fM(P)}, en geç saat ${fM(P-60)} bildirilmeli`});
    const jp=DP.filter(x=>x.job_id==j.id&&x.kind!="konum"),dl0=jp.filter(x=>x.kind=="gecikme").pop(),dm=dl0?Number(dl0.minutes)||0:0,dl=dl0&&!a&&now<=Math.max(P,isoM(dl0.at))+dm+15?dl0:null,so=jp.filter(x=>x.kind=="sorun").pop();
    if(dl)A.push({j,k:"gecikme",lvl:dm>=15?2:1,t:`Kaptan ${dm} dk gecikeceğini bildirdi (saat ${tHM(dl.at)}); alış ~${fM(P+dm)}`,late:dm>=15});
    const bk=brokenAt(v,J);
    if(so&&bk!=null&&isoM(so.at)==bk)A.push({j,k:"sorun",lvl:2,t:`Kaptan sorun bildirdi (saat ${tHM(so.at)}): ${so.note||"açıklama yok"}`,late:true});
    else if(bk!=null&&!c&&!a&&P>bk){A.push({j,k:"ariza",lvl:2,t:`${v.plate} için saat ${fM(bk)}'de sorun bildirildi; bu iş de etkilenebilir (alış ${fM(P)}). Başka araç ayarla ya da kaptanı ara.`,late:true});continue}
    const pj=J.filter(x=>x.driver_id&&x.driver_id==j.driver_id&&x.id!=j.id&&jP(x)!=null&&jP(x)<now-60),pn=pj.filter(x=>(EV[x.id]||[]).length).length,lowT=pj.length>=2&&pn/pj.length<0.3,lowTx=lowT?" Bu kaptan bugün düğmeleri kullanmıyor; ara.":"";
    if(!c&&!a&&!so){const st=vehState(v,now,others),busy=st.busy,lp=busy?null:lastPos(v,J,now),mv=movingTo(lp,S),T=trvB(lp?lp.loc:st.loc,S)??30,arr=Math.max(st.free,now)+T,lim=P+lateTh(j)+(dl?dm:0);
      if(busy&&arr>lim)A.push({j,k:"zincir",lvl:2,t:`Önceki iş uzuyor: ${v.plate} buraya saat ~${fM(arr)} gibi varır (alış ${fM(P)}, ${Math.round(arr-P)} dk geç)`,late:true});
      else if(!busy&&mv){const ar2=lp.at+T;if(ar2>lim&&!nearS(lp,S))A.push({j,k:"gec",lvl:2,t:`Geç kalacak: kaptan yolda görünüyor (konum ${fM(lp.at)}), alışa saat ~${fM(ar2)} gibi varır (${Math.round(ar2-P)} dk geç)`,late:true})}
      else if(!busy&&now>=P-T-10&&now<P+20){const late=now+T>(dl?P+dm+5:P+10);if(!dl||late)A.push({j,k:"cikmadi",lvl:late&&!lowT?2:1,t:late?`Kaptan yola çıktım demedi${dl?" (bildirdiği gecikmeyi de aşıyor)":""}; şimdi çıksa alışa saat ~${fM(now+T)} gibi varır (alış ${fM(P)}). Ara ve sor.${lowTx}`:`Kaptanın yola çıkma zamanı: alış ${fM(P)}, yol ~${T} dk, en geç saat ${fM(P-T)} gibi çıkmalı`,late:late&&!lowT})}}
    if(c&&!a){const lp=lastPos(v,J,now),fresh=lp&&lp.age<=10&&lp.at>isoM(c.at),from=fresh?lp.loc:ptLoc(c)||vehState(v,isoM(c.at),others).loc,T=trvB(from,S)??30,arr=(fresh?lp.at:isoM(c.at))+T;
      if(arr>P+lateTh(j)+(dl?dm:0)&&!(fresh&&nearS(lp,S)))A.push({j,k:"gec",lvl:2,t:`Geç kalacak: yola saat ${tHM(c.at)} çıktı${fresh?`, son konuma (${fM(lp.at)}) göre`:""} alışa saat ~${fM(arr)} gibi varır (${Math.round(arr-P)} dk geç)`,late:true});
      else if(now>P+(j.job_type=="varis"?35:25)&&now<P+120)A.push({j,k:"almadi",lvl:1,t:`Alış saati ${fM(P)} geçti, "aldım" işareti yok`})}
    if(!c&&!a&&!dl&&!so&&!movingTo(lastPos(v,J,now),S)&&now>=P+20&&now<(end??P+60)+30)A.push({j,k:"isaretyok",lvl:lowT?1:2,t:`Alış saati ${fM(P)} geçti, kaptandan hiç işaret yok. Ara ve sor.${lowTx}`});
    if(a&&end!=null&&now>end+20&&now<end+180)A.push({j,k:"birakmadi",lvl:1,t:`Tahmini bitiş ${fM(end)} geçti, "bıraktım" işareti yok`});
    if(j.job_type=="depar"&&j.flight_time&&(a||c)){const ch=a?chain(j,jStart(j),Math.max(isoM(a.at),P)):chain(j,ptLoc(c)||S,isoM(c.at)),l=ch[ch.length-1],F=mOf(j.flight_time);if(l&&F!=null&&l.t>F-75)A.push({j,k:"ucus",lvl:2,t:`Uçuş riski: havalimanına saat ~${fM(l.t)} gibi varır, uçuş ${fM(F)}`})}}
  const U=A.filter(x=>x.k=="uetds"&&x.lvl==2);if(U.length>1){const f=U.slice().sort((p,q)=>jP(p.j)-jP(q.j))[0];for(let i=A.length-1;i>=0;i--)if(A[i].k=="uetds"&&A[i].lvl==2&&A[i]!==f)A.splice(i,1);
    f.t=`U-ETDS: ${U.length} iş bildirim bekliyor (ilki ${fM(jP(f.j))}). İşler sekmesinden işaretle.`;f.n=U.length}
  A.forEach(x=>{if(x.late)x.res=rescue(x.j,now,J)});
  return A.filter(x=>!snz(x.j.id+x.k)).sort((p,q)=>q.lvl-p.lvl||jP(p.j)-jP(q.j))}
const RD0={GUVERCINLIK:20,TORBA:30,BODRUM:40,GUMBET:40,BARDAKCI:40,BITEZ:45,ORTAKENT:50,GUNDOGAN:55,YALIKAVAK:60,TURGUTREIS:60,AKBUK:60,DIDIM:80,ALTINKUM:80};
let RD=Object.assign({},RD0),RDO={};
const rk=s=>String(s||"").trim().toUpperCase();
const TLN={varis:"Arrival",depar:"Depar",transfer:"Ara Transfer"},h5=t=>t?String(t).slice(0,5):"";
function jobSpan(j){if(!j.pickup_time)return null;const mn=t=>{const a=String(t).split(":");return a[0]*60+ +a[1]},s=mn(j.pickup_time),e=estEnd(j);let en=e&&e.t?mn(e.t):s+90;if(en<s)en+=1440;return[s,en]}
const GEO={BODRUM:[37.035,27.43],GUMBET:[37.033,27.405],BARDAKCI:[37.032,27.415],BITEZ:[37.035,27.38],ORTAKENT:[37.04,27.35],YAHSI:[37.027,27.345],TURGUTREIS:[37.003,27.258],AKYARLAR:[36.973,27.3],GUMUSLUK:[37.054,27.234],KADIKALESI:[37.022,27.25],YALIKAVAK:[37.105,27.293],GUNDOGAN:[37.13,27.36],TURKBUKU:[37.122,27.375],GOLTURKBUKU:[37.122,27.375],TORBA:[37.085,27.45],KONACIK:[37.05,27.42],YALICIFTLIK:[37.012,27.476],GUVERCINLIK:[37.25,27.58],MILAS:[37.315,27.783],AKBUK:[37.398,27.433],DIDIM:[37.375,27.268],ALTINKUM:[37.35,27.26],MARMARIS:[36.855,28.272],ICMELER:[36.805,28.232],DALAMAN:[36.765,28.8],SARIGERME:[36.712,28.705],DALYAN:[36.835,28.643],GOCEK:[36.753,28.94],FETHIYE:[36.622,29.116],OLUDENIZ:[36.55,29.115],HISARONU:[36.573,29.14],BJV:[37.2506,27.6643],DLM:[36.7131,28.7925],KAPLANKAYA:[37.385,27.43],KUSADASI:[37.858,27.261],ADB:[38.292,27.157]};
const gnorm=s=>String(s||"").toLocaleUpperCase("tr").replace(/[ÇĞİÖŞÜ]/g,c=>({Ç:"C",Ğ:"G",İ:"I",Ö:"O",Ş:"S",Ü:"U"})[c]).replace(/[^A-Z]+/g," ").trim();
function locOf(name){
  const n=" "+gnorm(name)+" ";if(n.trim()=="")return null;
  if(/ (DLM|DALAMAN (AIRPORT|HAVALIMANI|HAVAALANI)) /.test(n))return{k:"DLM",c:GEO.DLM};
  if(/ (ADB|IZMIR (AIRPORT|HAVALIMANI|HAVAALANI)|ADNAN MENDERES) /.test(n))return{k:"ADB",c:GEO.ADB};
  if(/ (BJV|AIRPORT|HAVALIMANI|HAVAALANI|MILAS BODRUM) /.test(n))return{k:"BJV",c:GEO.BJV};
  const k=Object.keys(GEO).filter(k=>n.includes(" "+k+" ")).sort((a,b)=>b.length-a.length)[0];return k?{k,c:GEO[k]}:null;
}
function roadKm(a,b){if(!a||!b)return null;if(a.k==b.k)return 2;const r=x=>x*Math.PI/180,[p,q]=a.c,[u,w]=b.c,s=Math.sin(r(u-p)/2)**2+Math.cos(r(p))*Math.cos(r(u))*Math.sin(r(w-q)/2)**2;return Math.round(12742*Math.asin(Math.sqrt(s))*1.35)}
function jobRoute(j){
  const st=(j.job_stops||[]).slice().sort((a,b)=>a.seq-b.seq).map(s=>s.region||s.place),dep=j.job_type=="depar",arr=j.job_type=="varis";
  const names=dep?(st.length?st:[j.from_city]).concat([j.to_city]):arr?[j.from_city].concat(st.length?st:[j.to_city]):[j.from_city,j.to_city];
  const pts=names.map(x=>({n:x,l:locOf(x)})),miss=pts.filter(x=>!x.l).map(x=>gnorm(x.n)||"?");let km=0;
  for(let i=1;i<pts.length;i++){if(pts[i].l&&pts[i-1].l&&pts[i].l.k!=pts[i-1].l.k)km+=roadKm(pts[i-1].l,pts[i].l)}
  return{s:pts[0].l,e:pts[pts.length-1].l,km,miss};
}
function estEnd(j){
  if(j.end_time)return{t:j.end_time.slice(0,5),m:true};
  const st=j.job_stops||[];if(!st.length)return null;
  const mn=t=>{const a=t.split(":");return a[0]*60+ +a[1]},f=x=>{x=((x%1440)+1440)%1440;return String(Math.floor(x/60)).padStart(2,"0")+":"+String(x%60).padStart(2,"0")};
  if(j.job_type=="depar"){const w=st.filter(s=>s.pickup_time).sort((a,b)=>a.pickup_time<b.pickup_time?-1:1),l=w[w.length-1];if(!l)return null;const d=RD[rk(l.region)];return d?{t:f(mn(l.pickup_time)+5+d)}:{miss:rk(l.region)||"bölge"}}
  if(j.job_type=="varis"&&j.flight_time){const bad=st.find(s=>!RD[rk(s.region)]);if(bad)return{miss:rk(bad.region)||"bölge"};return{t:f(mn(j.flight_time)+40+Math.max(...st.map(s=>RD[rk(s.region)]))+(new Set(st.map(s=>s.place)).size-1)*7)}}
  return null;
}
const SB=createClient(Deno.env.get("SUPABASE_URL"),Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false}});
const b64u=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
let KEYS=null;
async function keys(){if(KEYS)return KEYS;const r=await SB.from("app_secrets").select("name,value").in("name",["vapid_public","vapid_private"]);const m={};(r.data||[]).forEach(x=>m[x.name]=x.value);
  if(!m.vapid_public||!m.vapid_private){const kp=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);const raw=await crypto.subtle.exportKey("raw",kp.publicKey),jw=await crypto.subtle.exportKey("jwk",kp.privateKey);
    m.vapid_public=b64u(raw);m.vapid_private=jw.d;await SB.from("app_secrets").upsert([{name:"vapid_public",value:m.vapid_public},{name:"vapid_private",value:m.vapid_private}],{onConflict:"name",ignoreDuplicates:true});
    const again=await SB.from("app_secrets").select("name,value").in("name",["vapid_public","vapid_private"]);(again.data||[]).forEach(x=>m[x.name]=x.value)}
  webpush.setVapidDetails("mailto:selahattnulas@gmail.com",m.vapid_public,m.vapid_private);KEYS=m;return m}
const CORS={"access-control-allow-origin":"*","access-control-allow-headers":"content-type"};
const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{...CORS,"content-type":"application/json"}});
const istDate=()=>new Date().toLocaleDateString("en-CA",{timeZone:"Europe/Istanbul"});
const istMin=()=>mOf(new Date().toLocaleTimeString("en-GB",{timeZone:"Europe/Istanbul",hour:"2-digit",minute:"2-digit"}));
const REPEAT_MS=5*60e3,MAX_SENDS=8;
async function push(subs,payload){let ok=0;
  for(const s of subs){try{await webpush.sendNotification({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},JSON.stringify({...payload,s:s.id}),{TTL:600,urgency:"high"});ok++;await SB.from("push_subs").update({last_ok:new Date().toISOString()}).eq("id",s.id)}
    catch(e){const c=e&&e.statusCode;if(c==404||c==410)await SB.from("push_subs").delete().eq("id",s.id)}}
  return ok}
async function runCompany(co,subs,day,now){
  const [jr,vr,rr,er,ar,pr,cr,wr]=await Promise.all([
    SB.from("jobs").select("id,job_date,pickup_time,end_time,job_type,from_city,to_city,pax,status,vehicle_id,driver_id,run_code,flight_no,flight_time,eta_landing,uetds_status,job_stops(seq,place,region,pickup_time,pax)").eq("company_id",co).eq("job_date",day).limit(1000),
    SB.from("vehicles").select("id,plate,capacity,home_city,default_driver_id").eq("company_id",co),
    SB.from("region_durations").select("region,minutes").eq("company_id",co),
    SB.from("job_events").select("job_id,kind,lat,lng,at").eq("company_id",co).gte("at",new Date(Date.now()-2*864e5).toISOString()).order("at"),
    SB.from("watch_alerts").select("*").eq("company_id",co).eq("alert_date",day),
    SB.from("driver_pings").select("driver_id,job_id,kind,minutes,note,lat,lng,at").eq("company_id",co).gte("at",new Date(Date.now()-864e5).toISOString()).order("at"),
    SB.from("companies").select("uetds_alerts").eq("id",co).maybeSingle(),
    SB.from("job_waits").select("job_id,kind,started_at,ended_at").eq("company_id",co).gte("started_at",new Date(Date.now()-864e5).toISOString())]);
  if(jr.error||vr.error||ar.error)return{co,error:(jr.error||vr.error||ar.error).message};
  VEH=vr.data||[];for(const k in RD)delete RD[k];Object.assign(RD,RD0);(rr.data||[]).forEach(x=>RD[x.region]=x.minutes);
  EV={};(er.data||[]).forEach(e=>(EV[e.job_id]=EV[e.job_id]||[]).push(e));DP=pr&&!pr.error?pr.data||[]:[];UETDS_ON=!(cr&&cr.data&&cr.data.uetds_alerts===false);JW=wr&&!wr.error?wr.data||[]:[];
  const A=watchCalc(jr.data||[],now).filter(x=>x.lvl==2),ex={},seen=new Set();(ar.data||[]).forEach(x=>ex[x.job_id+"|"+x.kind]=x);let sent=0;
  for(const x of A){const key=x.j.id+"|"+x.k;seen.add(key);let e=ex[key];const v=VEH.find(y=>y.id==x.j.vehicle_id);
    const title=`${fM(jP(x.j))} ${TLN[x.j.job_type]||"İş"}${x.j.run_code?" · iş "+x.j.run_code:""}${v?" · "+v.plate:""}`,body=x.t+((x.res||[])[0]?"\nÖneri: "+x.res[0].txt:"");
    if(!e){const r=await SB.from("watch_alerts").insert({company_id:co,job_id:x.j.id,kind:x.k,alert_date:day,title,body,active:true,sends:0}).select("*").single();if(r.error)continue;e=r.data}
    else if(!e.active||e.body!=body)await SB.from("watch_alerts").update({active:true,title,body}).eq("id",e.id);
    const due=!e.acked_at&&(!e.snooze_until||new Date(e.snooze_until)<new Date())&&(!e.last_sent||Date.now()-new Date(e.last_sent).getTime()>=REPEAT_MS-15e3)&&(e.sends||0)<MAX_SENDS;
    if(due){const n=await push(subs,{title,body:(e.sends?"Tekrar: ":"")+body,tag:e.id,id:e.id,t:e.ack_token});await SB.from("watch_alerts").update({last_sent:new Date().toISOString(),sends:(e.sends||0)+1}).eq("id",e.id);sent+=n}}
  for(const k in ex)if(ex[k].active&&!seen.has(k))await SB.from("watch_alerts").update({active:false}).eq("id",ex[k].id);
  return{co,alerts:A.length,sent}}
async function ack(u){
  const id=u.searchParams.get("ack"),t=u.searchParams.get("t"),sid=u.searchParams.get("s"),sn=Number(u.searchParams.get("snooze")||0);
  const a=await SB.from("watch_alerts").select("id,ack_token,company_id").eq("id",id).maybeSingle();if(!a.data||a.data.ack_token!==t)return json({error:"geçersiz"},403);
  const s=sid?await SB.from("push_subs").select("email,user_id,company_id").eq("id",sid).maybeSingle():{data:null},nm=s.data&&s.data.company_id==a.data.company_id?s.data.email:null;
  const up=sn>0?{snooze_until:new Date(Date.now()+Math.min(sn,120)*6e4).toISOString(),acked_name:nm,acked_by:s.data&&s.data.user_id}:{acked_at:new Date().toISOString(),acked_name:nm,acked_by:s.data&&s.data.user_id};
  await SB.from("watch_alerts").update(up).eq("id",id);return json({ok:true})}
async function digest(co,subs,day,now){
  const kind=now>=480&&now<495?"sabah":now>=1320&&now<1335?"aksam":null;if(!kind)return null;
  const ex=await SB.from("digests").select("day").eq("company_id",co).eq("kind",kind).eq("day",day).maybeSingle();if(ex.data)return null;
  const c=await SB.from("companies").select("digest_on").eq("id",co).maybeSingle();if(c.data&&c.data.digest_on===false)return null;
  const own=(await SB.from("company_members").select("user_id").eq("company_id",co).eq("role","owner")).data||[],ids=new Set(own.map(x=>x.user_id)),os=subs.filter(s=>ids.has(s.user_id));if(!os.length)return null;
  const add=(d,n)=>new Date(new Date(d+"T12:00:00Z").getTime()+n*864e5).toISOString().slice(0,10),sym={TRY:"₺",EUR:"€",USD:"$",GBP:"£"},fmt=o=>Object.keys(o).map(k=>Math.round(o[k]).toLocaleString("tr-TR")+" "+(sym[k]||k)).join(" + ")||"0";
  let title,body;
  if(kind=="sabah"){const y=add(day,-1),[t,yy]=await Promise.all([SB.from("jobs").select("job_type,vehicle_id,amount,agency_id").eq("company_id",co).eq("job_date",day),SB.from("jobs").select("status,amount,currency").eq("company_id",co).eq("job_date",y)]);
    const T=t.data||[],Y=yy.data||[],rev={};Y.filter(j=>j.status=="tamamlandi").forEach(j=>{if(Number(j.amount))rev[j.currency||"TRY"]=(rev[j.currency||"TRY"]||0)+Number(j.amount)});
    title="Günaydın · bugün "+T.length+" iş";
    body=`Arrival ${T.filter(j=>j.job_type=="varis").length}, Depar ${T.filter(j=>j.job_type=="depar").length}, Ara Transfer ${T.filter(j=>j.job_type=="transfer").length}. Araç atanmamış ${T.filter(j=>!j.vehicle_id).length}, fiyatsız ${T.filter(j=>!Number(j.amount)&&j.agency_id).length}.\nDün: ${Y.filter(j=>j.status=="tamamlandi").length}/${Y.length} iş tamamlandı, gelir ${fmt(rev)}.`}
  else{const tm=add(day,1),[t,n]=await Promise.all([SB.from("jobs").select("status,amount,agency_id,uetds_status,vehicle_id").eq("company_id",co).eq("job_date",day),SB.from("jobs").select("vehicle_id").eq("company_id",co).eq("job_date",tm)]);
    const T=t.data||[],N=n.data||[];title="Gün sonu";
    body=`Bugün ${T.length} iş: tamamlanmayan ${T.filter(j=>j.status!="tamamlandi").length}, fiyatsız ${T.filter(j=>!Number(j.amount)&&j.agency_id).length}${UETDS_ON?", U-ETDS işaretsiz "+T.filter(j=>j.vehicle_id&&j.uetds_status!="bildirildi").length:""}.\nYarın ${N.length} iş, araç atanmamış ${N.filter(j=>!j.vehicle_id).length}.`}
  const ins=await SB.from("digests").insert({company_id:co,kind,day,body,sent:0});if(ins.error)return null;
  const sent=await push(os,{title,body,tag:"digest-"+kind+"-"+day});await SB.from("digests").update({sent}).eq("company_id",co).eq("kind",kind).eq("day",day);return{kind,sent}}
Deno.serve(async req=>{
  if(req.method=="OPTIONS")return new Response(null,{headers:CORS});
  const u=new URL(req.url);if(u.searchParams.get("vapid"))return json({key:(await keys()).vapid_public});if(u.searchParams.get("ack"))return ack(u);
  const cs=await SB.from("app_secrets").select("value").eq("name","cron").maybeSingle();if(!cs.data||req.headers.get("x-cron-secret")!==cs.data.value)return json({error:"forbidden"},403);await keys();
  const subs=(await SB.from("push_subs").select("id,company_id,endpoint,p256dh,auth,user_id")).data||[],by={};subs.forEach(s=>(by[s.company_id]=by[s.company_id]||[]).push(s));
  const day=istDate(),now=istMin(),out=[];for(const co in by){try{out.push(await runCompany(co,by[co],day,now));const dg=await digest(co,by[co],day,now);if(dg)out.push(dg)}catch(e){out.push({co,error:String(e)})}}
  return json({day,now,out})});
