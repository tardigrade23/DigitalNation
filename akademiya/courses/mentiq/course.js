/* Məntiq kursu: dərslərin interaktiv hissələri.
   LMS.registerCourse(id, init): init(api) dərslər DOM-a yerləşəndən sonra çağırılır.
   api.done(i) i-ci dərsi (0-dan) tamamlanmış qeyd edir; api.get/set kursa aid əlavə vəziyyəti saxlayır;
   api.quizzes(QUIZ) .quiz[data-quiz] bloklarını qurur; api.onUnmount(fn) kursdan çıxanda çağırılır. */
LMS.registerCourse('mentiq', function (api) {
// ===================== Formula parser =====================
function normalize(s){
  return s.replace(/<->|<=>/g,'↔').replace(/->|=>/g,'→').replace(/[!~]/g,'¬')
          .replace(/&&?|\^/g,'∧').replace(/\|\|?/g,'∨');
}
function tokenize(s){
  s=normalize(s); const t=[];
  for(const ch of s){
    if(/\s/.test(ch)) continue;
    if('¬∧∨→↔()'.includes(ch)) t.push(ch);
    else if(/[a-zA-Z]/.test(ch)) t.push({v:ch.toLowerCase()});
    else if(ch==='1'||ch==='0') t.push({c:ch==='1'});
    else throw new Error('Tanınmayan simvol: “'+ch+'”');
  }
  return t;
}
function parse(src){
  const t=tokenize(src); let i=0;
  const peek=()=>t[i], eat=x=>{ if(t[i]!==x) throw new Error('“'+x+'” gözlənilirdi'); i++; };
  function iff(){ let l=imp(); while(peek()==='↔'){i++; l={op:'↔',a:l,b:imp()};} return l; }
  function imp(){ const l=or(); if(peek()==='→'){i++; return {op:'→',a:l,b:imp()};} return l; }
  function or(){ let l=and(); while(peek()==='∨'){i++; l={op:'∨',a:l,b:and()};} return l; }
  function and(){ let l=not(); while(peek()==='∧'){i++; l={op:'∧',a:l,b:not()};} return l; }
  function not(){ if(peek()==='¬'){i++; return {op:'¬',a:not()};} return prim(); }
  function prim(){
    const x=peek();
    if(x==='('){i++; const e=iff(); eat(')'); return e;}
    if(x&&x.v){i++; return {v:x.v};}
    if(x&&x.c!==undefined){i++; return {c:x.c};}
    throw new Error(x===undefined?'Formul yarımçıq qalıb':'Gözlənilməz simvol: “'+x+'”');
  }
  if(!t.length) throw new Error('Formul boşdur');
  const e=iff(); if(i<t.length) throw new Error('Artıq simvol: “'+(t[i].v||t[i])+'”');
  return e;
}
function ev(n,env){
  if(n.v) return env[n.v]; if(n.c!==undefined) return n.c;
  const a=ev(n.a,env);
  switch(n.op){
    case '¬': return !a;
    case '∧': return a&&ev(n.b,env);
    case '∨': return a||ev(n.b,env);
    case '→': return !a||ev(n.b,env);
    case '↔': return a===ev(n.b,env);
  }
}
const prec={'↔':1,'→':2,'∨':3,'∧':4,'¬':5};
function str(n,parent){
  if(n.v) return n.v; if(n.c!==undefined) return n.c?'1':'0';
  let s = n.op==='¬' ? '¬'+str(n.a,5) : str(n.a,prec[n.op]+(n.op==='→'?0.5:0))+' '+n.op+' '+str(n.b,prec[n.op]);
  return (parent!==undefined && prec[n.op]<parent) || (parent!==undefined && n.op!=='¬' && prec[n.op]===parent && n.op==='→') ? '('+s+')' : s;
}
function vars(n,set=new Set()){ if(n.v) set.add(n.v); if(n.a) vars(n.a,set); if(n.b) vars(n.b,set); return set; }
function subs(n,out=[]){ if(n.a) subs(n.a,out); if(n.b) subs(n.b,out); if(n.op && !out.some(o=>str(o)===str(n))) out.push(n); return out; }
function rows(vs){ const r=[]; const k=vs.length; for(let m=0;m<(1<<k);m++){ const env={}; vs.forEach((v,j)=>env[v]=!((m>>(k-1-j))&1)); r.push(env);} return r; }
const DY=b=>`<span class="${b?'T':'F'}">${b?'D':'Y'}</span>`;
const esc=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// ===================== Symbol keyboards =====================
document.querySelectorAll('.keys').forEach(k=>{
  const target=document.getElementById(k.dataset.target);
  ['¬','∧','∨','→','↔','(',')','p','q','r','⌫'].forEach(sym=>{
    const b=document.createElement('button'); b.type='button'; b.textContent=sym;
    b.onclick=()=>{
      const s=target.selectionStart??target.value.length, e=target.selectionEnd??s;
      if(sym==='⌫'){ if(s===e&&s>0){target.value=target.value.slice(0,s-1)+target.value.slice(e); target.setSelectionRange(s-1,s-1);} else {target.value=target.value.slice(0,s)+target.value.slice(e); target.setSelectionRange(s,s);} }
      else { const ins=['∧','∨','→','↔'].includes(sym)?' '+sym+' ':sym; target.value=target.value.slice(0,s)+ins+target.value.slice(e); target.setSelectionRange(s+ins.length,s+ins.length); }
      target.focus();
    };
    k.appendChild(b);
  });
});

const QUIZ={
  props:[
    {q:'“Yer Günəş ətrafında fırlanır.”',o:['Mülahizədir','Mülahizə deyil'],a:0,e:'Nəqli cümlədir və doğrudur.'},
    {q:'“Dərsini oxu!”',o:['Mülahizədir','Mülahizə deyil'],a:1,e:'Əmr cümləsi doğru və ya yalan ola bilməz.'},
    {q:'“7 cüt ədəddir.”',o:['Mülahizədir','Mülahizə deyil'],a:0,e:'Yalan da olsa mülahizədir. Mülahizənin doğru olması vacib deyil, qiymətinin olması vacibdir.'},
    {q:'“Sən haralısan?”',o:['Mülahizədir','Mülahizə deyil'],a:1,e:'Sual cümləsidir.'},
    {q:'“x + 1 = 5”',o:['Mülahizədir','Mülahizə deyil'],a:1,e:'x məlum olmadığı üçün qiyməti yoxdur. Bu, predikatdır.'},
    {q:'“Bu cümlə yalandır.”',o:['Mülahizədir','Mülahizə deyil'],a:1,e:'Bu, “Yalançı paradoksu”dur. Doğru desək yalan olur, yalan desək doğru olur. Ona görə klassik məntiqdə mülahizə sayılmır.'},
  ],
  conn:[
    {q:'p = D, q = Y olduqda p → q nədir?',o:['D','Y'],a:1,e:'İmplikasiya yalnız D → Y halında yalandır.'},
    {q:'p = Y, q = Y olduqda p → q nədir?',o:['D','Y'],a:0,e:'Yalan əsasdan hər şey alınır, yəni implikasiya doğrudur.'},
    {q:'p = D, q = Y olduqda p ∨ q nədir?',o:['D','Y'],a:0,e:'Ən azı biri doğrudur.'},
    {q:'p = D, q = Y olduqda ¬p ↔ q nədir?',o:['D','Y'],a:0,e:'¬p = Y, q = Y. İkisi eynidir, deməli D.'},
    {q:'“Yağış yağmır və hava soyuqdur” (p = yağış yağır, q = hava soyuqdur)',o:['¬p ∧ q','¬(p ∧ q)','p ∨ ¬q','¬p → q'],a:0,e:'“yağmır” = ¬p, “və” = ∧.'},
    {q:'“Əgər çalışsan, uğur qazanarsan” (p = çalışırsan, q = uğur)',o:['q → p','p → q','p ∧ q','p ↔ q'],a:1,e:'“Əgər p, onda q” = p → q.'},
  ],
  laws:[
    {q:'¬(p ∨ q) nəyə ekvivalentdir?',o:['¬p ∨ ¬q','¬p ∧ ¬q','p ∧ q','¬p → q'],a:1,e:'De Morqan: ∨-un inkarı inkarların ∧-sidir.'},
    {q:'p → q nəyə ekvivalentdir?',o:['q → p','¬p → ¬q','¬q → ¬p','p ∧ ¬q'],a:2,e:'Kontrapozisiya. Diqqət: q → p (tərs) və ¬p → ¬q (əks) ekvivalent DEYİL!'},
    {q:'p ∨ ¬p formulu nədir?',o:['Tavtologiya','Ziddiyyət','Mümkün, amma tavtologiya deyil'],a:0,e:'Üçüncünün istisnası qanunu: həmişə doğrudur.'},
    {q:'(p → q) ∧ p ∧ ¬q formulu nədir?',o:['Tavtologiya','Ziddiyyət','Mümkün, amma tavtologiya deyil'],a:1,e:'p və ¬q doğrudursa, p → q yalandır. Heç vaxt doğru ola bilməz. Generatorda yoxla!'},
    {q:'“Doğru deyil ki, həm ac, həm də yorğunam” nə deməkdir?',o:['Nə acam, nə yorğun','Ya ac deyiləm, ya da yorğun deyiləm','Acam, amma yorğun deyiləm'],a:1,e:'¬(a ∧ y) ≡ ¬a ∨ ¬y.'},
  ],
  args:[
    {q:'Əgər Əli imtahanı keçibsə, sevinir. Əli imtahanı keçib. ⇒ Əli sevinir.',o:['Düzgün','Yanlış'],a:0,e:'Modus ponens.'},
    {q:'Əgər Əli imtahanı keçibsə, sevinir. Əli sevinir. ⇒ Əli imtahanı keçib.',o:['Düzgün','Yanlış'],a:1,e:'Nəticənin təsdiqi səhvi. Başqa səbəbdən də sevinə bilər.'},
    {q:'Əgər telefon şarjdadırsa, işıq yanır. İşıq yanmır. ⇒ Telefon şarjda deyil.',o:['Düzgün','Yanlış'],a:0,e:'Modus tollens.'},
    {q:'Əgər qar yağırsa, məktəb bağlanır. Qar yağmır. ⇒ Məktəb bağlanmır.',o:['Düzgün','Yanlış'],a:1,e:'Əsasın inkarı səhvi. Məktəb başqa səbəbdən bağlana bilər.'},
    {q:'Ya çay içəcəyəm, ya qəhvə. Çay içmədim. ⇒ Qəhvə içdim.',o:['Düzgün','Yanlış'],a:0,e:'Dizyunktiv sillogizm.'},
    {q:'Oxusam, bilərəm. Bilsəm, keçərəm. ⇒ Oxusam, keçərəm.',o:['Düzgün','Yanlış'],a:0,e:'Hipotetik sillogizm (zəncir qaydası).'},
  ],
  quant:[
    {q:'“Bütün tələbələr çalışqandır” fikrinin inkarı:',o:['Heç bir tələbə çalışqan deyil','Bəzi tələbələr çalışqan deyil','Bütün tələbələr tənbəldir'],a:1,e:'¬∀x P(x) ≡ ∃x ¬P(x).'},
    {q:'“Heç kim mükəmməl deyil” fikrinin inkarı:',o:['Hamı mükəmməldir','Kimsə mükəmməldir','Kimsə mükəmməl deyil'],a:1,e:'¬∀x ¬M(x) ≡ ∃x M(x).'},
    {q:'“Bəzi quşlar uça bilmir”:',o:['∀x (Quş(x) → ¬Uçur(x))','∃x (Quş(x) ∧ ¬Uçur(x))','∃x (Quş(x) → ¬Uçur(x))'],a:1,e:'∃ ilə ∧ işlənir. ∃x (Quş(x) → …) quş olmayan istənilən obyektlə də doğru olardı.'},
    {q:'Natural ədədlərdə ∀x ∃y (y > x) doğrudurmu?',o:['Doğru','Yalan'],a:0,e:'Hər ədəddən böyük ədəd var (məsələn, x+1).'},
    {q:'Natural ədədlərdə ∃y ∀x (y > x) doğrudurmu?',o:['Doğru','Yalan'],a:1,e:'Bütün ədədlərdən böyük ədəd yoxdur. Kvantorların sırası mənanı dəyişir!'},
  ],
  syl:[
    {q:'Bütün itlər məməlidir. Bütün məməlilər heyvandır. ⇒ Bütün itlər heyvandır.',o:['Düzgün','Yanlış'],a:0,e:'Barbara forması (AAA).'},
    {q:'Bütün pişiklər heyvandır. Bütün itlər heyvandır. ⇒ Bütün pişiklər itdir.',o:['Düzgün','Yanlış'],a:1,e:'Orta termin (“heyvan”) heç bir əsasda tam həcmdə işlənməyib.'},
    {q:'Heç bir balıq məməli deyil. Bütün köpəkbalıqları balıqdır. ⇒ Heç bir köpəkbalığı məməli deyil.',o:['Düzgün','Yanlış'],a:0,e:'Celarent forması (EAE).'},
    {q:'Bəzi tələbələr idmançıdır. Bəzi idmançılar musiqiçidir. ⇒ Bəzi tələbələr musiqiçidir.',o:['Düzgün','Yanlış'],a:1,e:'İki “bəzi” əsasdan nəticə çıxmır.'},
    {q:'Heç bir sürünən quş deyil. Heç bir quş balıq deyil. ⇒ Heç bir sürünən balıq deyil.',o:['Düzgün','Yanlış'],a:1,e:'İki inkar əsasdan nəticə çıxmır (nəticə bu halda doğru olsa da, arqument düzgün deyil).'},
  ],
  lens:[
    {q:'“Termometr 39°C göstərir.”',o:['Fakt','İnterpretasiya'],a:0,e:'Yoxlana bilən müşahidədir.'},
    {q:'“Müdir mənə qəsdən mesaj yazmadı.”',o:['Fakt','İnterpretasiya'],a:1,e:'Fakt yalnız “mesaj yazmadı” hissəsidir. “Qəsdən” sözü niyyət haqqında fərziyyədir.'},
    {q:'“Bu şirkətin səhmləri bu il 30% düşüb.”',o:['Fakt','İnterpretasiya'],a:0,e:'Rəqəmi yoxlamaq olar.'},
    {q:'“Səhmlər düşüb, çünki şirkət batır.”',o:['Fakt','İnterpretasiya'],a:1,e:'Səbəb haqqında izahdır. Bazarın ümumi düşüşü kimi başqa izahlar da ola bilər.'},
    {q:'“Dostum zəngimə cavab vermədi, deməli məndən incikdir.” Burada əsas problem nədir?',o:['Məntiqi səhv: modus ponens pozulub','Linza problemi: bir interpretasiya fakt kimi qəbul edilib','Heç bir problem yoxdur'],a:1,e:'Nəticə “incikdir” interpretasiyasından çıxır. Amma alternativlər də var: məşğuldur, telefonu yanında deyil…'},
    {q:'Şəhərin nəqliyyat problemini həll etmək üçün hansı “linza” daha uyğundur?',o:['Bir sürücünün bir günlük təcrübəsi','Bütün şəhər üzrə illik axın məlumatları','Tanışların fikirləri'],a:1,e:'Miqyas məsələyə uyğun olmalıdır. Sistem səviyyəsindəki problem sistem səviyyəsində məlumat tələb edir.'},
  ],
  chaos:[
    {q:'Deterministik sistem həmişə uzunmüddətli perspektivdə proqnozlaşdırıla bilirmi?',o:['Bəli, qaydalar məlumdursa','Xeyr, başlanğıc şərtlərə həssas ola bilər'],a:1,e:'Logistik xəritə tam deterministikdir, amma r = 3.9 olanda bir neçə onluq addımdan sonra proqnoz mümkün olmur.'},
    {q:'“Kəpənək effekti” nə deməkdir?',o:['Kəpənəklər havaya təsir edir','Kiçik başlanğıc fərqi zamanla böyük fərqə çevrilə bilər','Hər şey təsadüfidir'],a:1,e:'Başlanğıc şərtlərə həssaslıq. Xaos təsadüf deyil.'},
    {q:'Mürəkkəb layihədə plan pozuldu. Xaos nəzəriyyəsi baxımından ən yaxşı reaksiya hansıdır?',o:['Özünü günahlandırmaq','Daha uzun və daha dəqiq plan yazmaq','Qısa dövrlərlə planlamaq və tez-tez korreksiya etmək'],a:2,e:'Proqnoz üfüqü qısadırsa, plan da qısa və çevik olmalıdır.'},
    {q:'“İnflyasiyanın yeganə səbəbi X-dir.” Bu tip iddiaya necə yanaşmalı?',o:['Ehtiyatla: mürəkkəb sistemdə tək səbəbli izah adətən həddən artıq sadədir','Dərhal qəbul etmək'],a:0,e:'İqtisadiyyat çoxlu əks-əlaqə halqası olan qeyri-xətti sistemdir.'},
  ],
  sci:[
    {q:'“Bu dərman 2 həftə ərzində təzyiqi ən azı 10 vahid aşağı salır.”',o:['Təkzib oluna bilər','Təkzib oluna bilməz'],a:0,e:'Dəqiq, ölçülə bilən proqnozdur. Yoxlayıb səhv olduğunu göstərmək mümkündür.'},
    {q:'“Kainatda hər şey görünməz və ölçülməz bir enerji ilə idarə olunur.”',o:['Təkzib oluna bilər','Təkzib oluna bilməz'],a:1,e:'Heç bir müşahidə bu fikri təkzib edə bilməz. Deməli, o, heç nəyi proqnozlaşdırmır.'},
    {q:'“Əgər işə düşsə, bu, mənim haqlı olduğumu göstərir. İşə düşməsə, demək ki, hələ vaxtı çatmayıb.”',o:['Təkzib oluna bilər','Təkzib oluna bilməz'],a:1,e:'Hər nəticə “təsdiq” sayılır. Bu, özünüaldatmanın tipik formasıdır.'},
    {q:'Hipotezi yoxlamağın ən güclü yolu hansıdır?',o:['Onu təsdiqləyən nümunələr toplamaq','Onu təkzib edə biləcək nümunə axtarmaq'],a:1,e:'Min təsdiq nümunəsi “bütün” iddiasını isbat etmir, bir əks-nümunə isə təkzib edir.'},
    {q:'Vason tapşırığında 7 kartını niyə çevirmək lazımdır?',o:['Çünki tək ədəddir və arxasında sait çıxsa, qayda pozulur','Lazım deyil'],a:0,e:'Bu, modus tollensdir: p → q və ¬q. Arxasında p (sait) olmamalıdır.'},
  ],
  inv:[
    {q:'Karyera qurmaq istəyirsən. İnversiya ilə ilk sual hansıdır?',o:['Ən uğurlu insanlar nə edir?','Karyeraları məhv edən tipik səhvlər hansılardır?','Hansı kitabı oxuyum?'],a:1,e:'Uğursuzluğa aparan yolları bilmək və onlardan qaçmaq çox vaxt uğurun resepti axtarmaqdan daha etibarlıdır.'},
    {q:'Premortem nədir?',o:['Layihə bitəndən sonra səhvləri təhlil etmək','Başlamazdan əvvəl layihənin uğursuz olduğunu təsəvvür edib səbəblərini tapmaq'],a:1,e:'“Ölümdən əvvəl” təhlil. Risklər hələ qarşısını almaq mümkün olanda görünür.'},
    {q:'“Premeditatio malorum” praktikasının məqsədi nədir?',o:['Daim narahat olmaq','Pis ssenarilərə əvvəlcədən hazırlaşıb sakit qalmaq'],a:1,e:'Stoiklər üçün bu, qorxunu idarə etmək üçün məşq idi.'},
    {q:'Hipotezin təkzib olunması nədir?',o:['Şəxsi uğursuzluq','Dəyərli məlumat: hansı yolun işləmədiyini artıq bilirsən'],a:1,e:'İnversiyalı düşüncədə hər təkzib axtarış sahəsini daraldır.'},
    {q:'“İkiqat halqa” qaydasında ikinci halqa nədir?',o:['Fikri bir də tərsinə çevirmək','Güzgüdən reallığa, faktlara qayıtmaq'],a:1,e:'Faktlarla yoxlanmayan sxem gözəl illüziyaya çevrilir.'},
  ],
  enth:[
    {q:'“O, əlaçı olub, deməli yaxşı menecer olacaq.” Gizli əsas:',o:['Bütün əlaçılar yaxşı menecer olur','Bəzi menecerlər əlaçı olub','O, menecer olmaq istəyir'],a:0,e:'Açıq yazanda şübhəli görünür: oxumaq və idarə etmək fərqli bacarıqlardır.'},
    {q:'“Bu məhsul təbiidir, deməli zərərsizdir.” Gizli əsas:',o:['Bütün zərərsiz şeylər təbiidir','Bütün təbii şeylər zərərsizdir','Bəzi təbii şeylər zərərlidir'],a:1,e:'Bu, yalandır: göbələk zəhəri də təbiidir.'},
    {q:'“Hamı bu telefonu alır, sən niyə almırsan?” Gizli əsas:',o:['Hamının etdiyi doğrudur','Telefon bahalıdır','Sən hamı kimi deyilsən'],a:0,e:'“Çoxluğa müraciət” (argumentum ad populum) səhvi.'},
    {q:'“Mütəxəssislər səhv edə bilər, deməli mənim fikrim də onlarınkı qədər doğrudur.” Bu arqumentin problemi nədir?',o:['Heç bir problem yoxdur','“Səhv edə bilər” cümləsindən “eyni dərəcədə etibarlıdır” nəticəsi çıxmır'],a:1,e:'Gizli əsas belədir: “Səhv edə bilən hər kəs eyni dərəcədə etibarlıdır.” Bu yanlışdır, çünki ehtimallar fərqlidir (17-ci dərs).'},
    {q:'Hansı İSBATDIR, hansı İNANDIRMA?  “Bu körpü 40 ton yükə hesablanıb, sınaqda 60 tonu daşıyıb.”',o:['İsbata yaxındır (faktlara və yoxlamaya əsaslanır)','Saf inandırmadır'],a:0,e:'Ölçülə bilən iddia və müstəqil sınaq var.'},
  ],
  decomp:[
    {q:'Sistemin nəticəsini nə müəyyən edir?',o:['Ən güclü mərhələsi','Mərhələlərin orta gücü','Ən zəif mərhələsi (darboğaz)'],a:2,e:'Zəncir ən zəif halqasından qırılır.'},
    {q:'Darboğaz olmayan mərhələni iki dəfə gücləndirsən, nə olar?',o:['Nəticə ikiqat artar','Nəticə dəyişməz, sadəcə qarşısında növbə yığılar'],a:1,e:'Simulyatorda özün yoxla.'},
    {q:'Darboğazı yaxşılaşdırdın. Növbəti addım nədir?',o:['İş bitdi','Darboğazın başqa yerə keçib-keçmədiyini yoxlamaq'],a:1,e:'Darboğaz həmişə sistemdə hardasa olur. Yaxşılaşdırma dövri prosesdir.'},
    {q:'Dekompozisiya edərkən niyə tapşırıqlara deyil, sistemlərə bölmək daha yaxşıdır?',o:['Sistemlərin əlaqələri və əks-əlaqəsi görünür, şərtlər dəyişəndə də struktur qalır','Çünki tapşırıqlar azdır'],a:0,e:'Siyahı şərtlər dəyişəndə dağılır, sistemin strukturu isə qalır.'},
  ],
  godel:[
    {q:'Kənd bərbəri yalnız və yalnız özünü qırxmayanları qırxır. Bərbər özünü qırxırmı?',o:['Bəli','Xeyr','Hər iki cavab ziddiyyətə gətirir'],a:2,e:'Rasselin paradoksunun populyar formasıdır. Qırxırsa, qırxmamalıdır, qırxmırsa, qırxmalıdır. Özünə istinad problemdir.'},
    {q:'Gödelin birinci teoremi nəyi iddia edir?',o:['Riyaziyyat ziddiyyətlidir','Hesabı ifadə edən ziddiyyətsiz formal sistemdə isbat oluna bilməyən doğru mülahizələr var','Heç nə bilmək mümkün deyil'],a:1,e:'Bu, natamamlıq haqqındadır. Teorem nə “hər şey nisbidir” deyir, nə də “riyaziyyat səhvdir”.'},
    {q:'Tarski teoreminə görə dilin doğruluğunu müəyyən etmək üçün nə lazımdır?',o:['Metadil, yəni daha yüksək səviyyəli dil','Daha çox söz'],a:0,e:'Obyekt-dil haqqında metadildə danışırıq.'},
    {q:'İki şöbənin reqlamentləri bir-biri ilə ziddiyyət təşkil edir. “Meta-səviyyəyə qalxmaq” nə deməkdir?',o:['Reqlamentlərdən birini təsadüfən seçmək','Hər iki reqlamentin hansı məqsədə xidmət etdiyini soruşub o məqsəd əsasında qərar vermək','Mübahisəni sona qədər davam etdirmək'],a:1,e:'Ziddiyyət sistem daxilində həll olunmursa, xarici meyar lazımdır.'},
    {q:'“Gödel isbat edib ki, həqiqət nisbidir və hər fikir eyni dərəcədə doğrudur.” Bu iddia:',o:['Doğrudur','Teoremin yanlış şərhidir'],a:1,e:'Teorem formal sistemlərin sərhədləri haqqındadır və “hər şey nisbidir” demir. Bu, tipik manipulyasiya nümunəsidir.'},
  ],
  sys:[
    {q:'Bank əmanətində faiz üzərinə faiz hesablanır. Bu, hansı halqadır?',o:['Gücləndirici (R)','Balanslaşdırıcı (B)'],a:0,e:'Böyüdükcə daha sürətlə böyüyür.'},
    {q:'Bədən istiləşəndə tərləyir və soyuyur. Bu, hansı halqadır?',o:['Gücləndirici (R)','Balanslaşdırıcı (B)'],a:1,e:'Sistem hədəf temperaturuna qayıdır.'},
    {q:'Duş simulyatorunda niyə temperatur rəqs edir?',o:['Kran xarabdır','Gecikmə: hələ reaksiya görmədən kranı yenidən çeviririk'],a:1,e:'Gecikmə və güclü reaksiya balanslaşdırıcı halqanı rəqsə çevirir. Dərmanı səbir və kiçik addımlardır.'},
    {q:'Tıxacı azaltmaq üçün yeni yollar çəkildi, bir neçə ildən sonra isə tıxac yenə əvvəlki kimi oldu. Bunun səbəbi nədir?',o:['Təsadüf','Gizli halqa: yol rahatlaşdıqca daha çox insan maşınla getməyə başladı (induksiya olunmuş tələb)'],a:1,e:'Kobra effektinə oxşar haldır: sistem müdaxiləyə “cavab verir”.'},
    {q:'Aysberq modelində ən böyük təsir hansı qatda edilə bilər?',o:['Hadisələr','Zehni modellər və strukturlar'],a:1,e:'Hadisələrə reaksiya simptomu müalicə edir, struktur dəyişikliyi isə səbəbi aradan qaldırır.'},
  ],
  prob:[
    {q:'Xəstəlik 1000 nəfərdən 1-ində var. Test 100% həssasdır, yalançı müsbət 5%-dir. Nəticə müsbətdir. Xəstə olma ehtimalı təxminən neçədir?',o:['95%','50%','2%'],a:2,e:'1000 nəfərdən 1 xəstə və təxminən 50 yalançı müsbət çıxır. Deməli 1 / 51 ≈ 2%.'},
    {q:'Dost yaxşı düşünülmüş mərc etdi, amma uduzdu. Bu, nə deməkdir?',o:['Qərar pis idi','Nəticə pisdir, amma qərarın keyfiyyəti ayrıca qiymətləndirilir'],a:1,e:'Nəticəyə görə qərarı qiymətləndirmək tələsinə düşmə.'},
    {q:'“Mən böhranın olacağını bilirdim!” (hadisədən sonra). Bu, hansı effektdir?',o:['Retrospektiv determinizm (“mən bunu bilirdim” effekti)','Bayes yenilənməsi'],a:0,e:'Hadisədən sonra o, əvvəlcədən göründüyündən daha qaçılmaz görünür.'},
    {q:'Oyun: 50% ehtimalla 100 ₼ udursan, 50% ehtimalla 40 ₼ uduzursan. Gözlənilən qiymət nədir?',o:['+30 ₼','+60 ₼','−40 ₼'],a:0,e:'0.5·100 − 0.5·40 = 30. Müsbətdir, amma riskə dözə bilib-bilməyəcəyini də nəzərə al.'},
    {q:'Yeni məlumat sənin fikrinin əksini göstərir. Ehtimal məntiqinə görə nə etməlisən?',o:['Fikrimi qorumaq','Ehtimalları məlumatın gücünə uyğun yeniləmək'],a:1,e:'Bayes yanaşması: nə inadkarlıq, nə də ifrat reaksiya. Fikri proporsional yeniləmək.'},
  ],
  fuzzy:[
    {q:'a = 0.7. ¬a nədir?',o:['0','0.3','0.7'],a:1,e:'1 − 0.7 = 0.3.'},
    {q:'a = 0.9, b = 0.3. min-norma ilə a ∧ b nədir?',o:['0.3','0.27','0.6'],a:0,e:'min(0.9, 0.3) = 0.3. Ən zəif halqa qərarı müəyyən edir.'},
    {q:'Eyni a = 0.9, b = 0.3 üçün hasil-norma ilə a ∧ b nədir?',o:['0.3','0.27','1.2'],a:1,e:'0.9 · 0.3 = 0.27. Norma dəyişəndə qərar da dəyişə bilər.'},
    {q:'“Bu həftə sizi gözlənilməz bir xəbər gözləyir.” Bu, hansı effektə nümunədir?',o:['Forer effekti','Kəpənək effekti'],a:0,e:'Kifayət qədər qeyri-müəyyəndir ki, hər kəs özünə aid edə bilsin.'},
    {q:'Qeyri-səlis məntiq klassik məntiqi ləğv edirmi?',o:['Bəli','Xeyr, onu ümumiləşdirir: 0 və 1 qiymətlərində klassik məntiq alınır'],a:1,e:'min və max 0/1 qiymətlərində ∧ və ∨ ilə eyni nəticəni verir.'},
  ],
  noise:[
    {q:'Ölkədə şokolad istehlakı ilə Nobel mükafatlarının sayı arasında korrelyasiya var. Nə demək olar?',o:['Şokolad insanı ağıllı edir','Ola bilər ki, hər ikisinə gizli amil, məsələn, rifah təsir edir'],a:1,e:'Korrelyasiya səbəbiyyət deyil.'},
    {q:'Siqnalizasiya hər dəfə pişikdən çalır, amma bir oğru gəlsə də çalmır. Hansı səhvlər var?',o:['Yalnız I növ','Həm I növ (yalançı həyəcan), həm də II növ (buraxılmış təhlükə)'],a:1,e:'Pişikə görə həyəcan I növ, buraxılmış oğru II növ səhvdir.'},
    {q:'Xəbərlərdə hər gün “dollar 0.3% bahalaşdı” deyilir. Bu, adətən nədir?',o:['Siqnal','Küy, çünki trendə baxmaq lazımdır'],a:1,e:'Gündəlik tərəddüdlər küydür. Qərar trend və limitlər üzərində qurulmalıdır.'},
    {q:'Pul atanda ardıcıl 6 dəfə “yazı” gəldi. Növbəti atışda “tura” gəlmə ehtimalı:',o:['Artıq daha çoxdur','Hələ də 50%-dir'],a:1,e:'“Oyunçu səhvi”: pul əvvəlki atışları xatırlamır. 100 atışda 6-7 uzunluqlu seriya normaldır.'},
    {q:'Sıfır hipotezi nədir?',o:['“Effekt var” fərziyyəsi','Güclü sübut olmayana qədər “effekt yoxdur” fərziyyəsi'],a:1,e:'Bu, saxta əlaqələrə qarşı müdafiədir.'},
  ],
  ai:[
    {q:'Süni intellekt inamla bir statistik rəqəm dedi. Necə yanaşmalı?',o:['Fakt kimi qəbul etmək','Hipotez kimi qəbul edib mənbədən yoxlamaq'],a:1,e:'İnandırıcı mətn doğru mətn demək deyil.'},
    {q:'Hansını süni intellektə həvalə etmək daha məqsədəuyğundur?',o:['Həyat məqsədlərini seçmək','Planına 10 əks-arqument tapmaq','Qərarın məsuliyyətini daşımaq'],a:1,e:'Bu, “sparrinq-partnyor” formatıdır. Dəyər və məsuliyyət sənin üzərində qalır.'},
    {q:'Meta-çərçivəyə nə daxildir?',o:['Kontekst, məqsəd, uğur meyarları, məhdudiyyətlər','Yalnız sual'],a:0,e:'Yaxşı qoyulmuş tapşırıq yarı həll olunmuş məsələdir.'},
    {q:'“Mənim arqumentimin ən zəif yeri haradadır?” sualı hansı formatdır?',o:['İcraçı','Sparrinq-partnyor'],a:1,e:'Süni intellekt burada düşüncəni əvəz etmir, onu gücləndirir.'},
  ],
  evo:[
    {q:'Təkamül alqoritminin üç əsas mexanizmi:',o:['Plan, nəzarət, hesabat','Variasiya, seçmə, irsiyyət'],a:1,e:'Kiçik təcrübələr, ölçmə və işləyəni saxlamaq.'},
    {q:'Fitnes-funksiya nədir?',o:['İdman proqramı','Hər variantın məqsədə nə qədər yaxın olduğunu ölçən meyar'],a:1,e:'Simulyatorda bu, düzgün yerdə olan hərflərin sayıdır.'},
    {q:'Simulyatorda mutasiya sürəti 30% olanda nə baş verir?',o:['Ən sürətli nəticə','Yaxşı hissələr də dağılır, irəliləyiş yavaşıyır'],a:1,e:'Həddən artıq dəyişiklik qazanılanı məhv edir.'},
    {q:'Mühit sürətlə dəyişir. Hansı strategiya daha davamlıdır?',o:['5 illik sərt plan','İstiqamət + qısa təcrübələr + tez-tez korreksiya (naviqator prinsipi)'],a:1,e:'Plan reallıqdan geri qalanda adaptivlik qalib gəlir.'},
  ],
  meta:[
    {q:'“Bu kvadrat tənliyin köklərini tap.”',o:['Well-defined','Ill-defined'],a:0,e:'Şərtlər tamdır, cavab yeganədir.'},
    {q:'“Başqa ölkəyə köçməliyəmmi?”',o:['Well-defined','Ill-defined'],a:1,e:'Natamam məlumat, dəyişən şərtlər və çoxlu meyar var. Ehtimallar, qeyri-səlis meyarlar, premortem və kiçik təcrübələr lazımdır.'},
    {q:'Startapın satışları düşür, səbəbi bəlli deyil. İlk addım nədir?',o:['Bir səbəb seçib bütün resursu ona yönəltmək','Sistemi sahələrə bölüb darboğaz haqqında hipotezlər qurmaq və onları ən ucuz yolla yoxlamaq'],a:1,e:'Dekompozisiya, sonra elmi metod və ehtimal ilə sıralama.'},
    {q:'İki ekspert eyni məlumata əsasən əks nəticələrə gəlir. Hansı alət daha əvvəl lazımdır?',o:['Linza analizi: hər biri hansı model və miqyasla baxır?','Səs çoxluğu'],a:0,e:'Fərq çox vaxt məntiqdə deyil, əsaslarda və linzadadır.'},
    {q:'“Bu müqavilə maddəsi düzgün tətbiq olunubmu?”',o:['Daha çox well-defined: qaydalar məlumdur, klassik məntiq işləyir','Tam ill-defined'],a:0,e:'Amma maddələr ziddiyyətə gəlsə, meta-səviyyəyə, yəni müqavilənin məqsədinə qalxmaq lazımdır.'},
  ],
  final:[
    {q:'Hansı mülahizədir?',o:['Pəncərəni aç!','Ay Yerin peykidir.','Necəsən?'],a:1,e:'Yalnız nəqli cümlə mülahizədir.'},
    {q:'p = Y, q = D olduqda p ∧ q nədir?',o:['D','Y'],a:1,e:'∧ üçün hər ikisi doğru olmalıdır.'},
    {q:'3 dəyişənli formulun doğruluq cədvəlində neçə sətir var?',o:['3','6','8','9'],a:2,e:'2³ = 8.'},
    {q:'p → q formulunun tərsi (q → p) ona ekvivalentdirmi?',o:['Bəli','Xeyr'],a:1,e:'p = Y, q = D halında p → q doğru, q → p isə yalandır.'},
    {q:'¬(p → q) ≡ ?',o:['¬p → ¬q','p ∧ ¬q','¬p ∨ q'],a:1,e:'İmplikasiya yalnız “p doğru, q yalan” halında yalandır.'},
    {q:'p → q, ¬q ⊢ ?',o:['p','¬p','q'],a:1,e:'Modus tollens.'},
    {q:'“Bütün qızılgüllərin tikanı var” fikrinin inkarı:',o:['Heç bir qızılgülün tikanı yoxdur','Bəzi qızılgüllərin tikanı yoxdur','Bəzi qızılgüllərin tikanı var'],a:1,e:'¬∀ ≡ ∃¬.'},
    {q:'(p ∧ q) → p formulu nədir?',o:['Tavtologiya','Ziddiyyət','Nə o, nə bu'],a:0,e:'p ∧ q doğrudursa, p mütləq doğrudur.'},
    {q:'A deyir: “Mən yalançıyam.” Cəngavərlər adasında bu mümkündürmü?',o:['Bəli, A yalançıdır','Bəli, A cəngavərdir','Xeyr, bunu heç kim deyə bilməz'],a:2,e:'Cəngavər bunu desə yalan danışmış olar, yalançı desə doğru danışmış olar. İkisi də mümkün deyil.'},
    {q:'Bəzi S P-dir. Bütün P M-dir. ⇒ Bəzi S M-dir.',o:['Düzgün','Yanlış'],a:0,e:'Orta termin P ikinci əsasda tam həcmdə işlənib. Bu, düzgün formadır (Darii).'},
    {q:'“Rəqib kimi danışır, deməli bizə düşməndir” cümləsində ilk növbədə nəyi yoxlamaq lazımdır?',o:['Gizli əsası: “Fərqli danışan hər kəs düşməndir”','Doğruluq cədvəlini'],a:0,e:'Entimem. Gizli əsas açılanda arqumentin zəif yeri görünür.'},
    {q:'Hansı fikir elmi mənada təkzib oluna bilər?',o:['“Hər şeyin bir səbəbi var, sadəcə onu bilmirik”','“Bu gübrə məhsuldarlığı ən azı 10% artırır”'],a:1,e:'Ölçülə bilən proqnoz verir.'},
    {q:'Sistemin nəticəsini artırmaq üçün resurs hara yönəldilməlidir?',o:['Ən güclü mərhələyə','Darboğaza'],a:1,e:'Məhdudiyyətlər nəzəriyyəsi.'},
    {q:'Test 99% həssasdır, amma xəstəlik çox nadirdir. Müsbət nəticə:',o:['Demək olar ki, dəqiq xəstəlik deməkdir','Baza tezliyinə görə xəstə olmama ehtimalı yüksək ola bilər'],a:1,e:'Bayes: ilkin ehtimal nəzərə alınmalıdır.'},
    {q:'Qeyri-səlis məntiqdə a = 0.6, b = 0.5 olanda max-konorma ilə a ∨ b nədir?',o:['0.5','0.6','1.1'],a:1,e:'max(0.6, 0.5) = 0.6.'},
    {q:'Logistik xəritədə (r = 3.9) iki çox yaxın başlanğıc nöqtə nə edir?',o:['Həmişə yaxın qalır','Bir müddət sonra tamam ayrılır'],a:1,e:'Başlanğıc şərtlərə həssaslıq, yəni xaos.'},
    {q:'Gecikməli sistemdə (duş) ən yaxşı strategiya:',o:['Hər an güclü reaksiya vermək','Kiçik addımlar atıb nəticəni gözləmək'],a:1,e:'Güclü reaksiya gecikmə ilə birləşəndə rəqs yaradır.'},
    {q:'“Köçməliyəmmi?” sualı:',o:['Well-defined məsələdir','Ill-defined məsələdir'],a:1,e:'Bunun üçün ehtimal, qeyri-səlis meyarlar və kiçik təcrübələr lazımdır.'},
  ],
};
api.quizzes(QUIZ);

// ===================== Connective lab =====================
let P=true,Q=true;
function lab(){
  const pb=document.getElementById('pT'), qb=document.getElementById('qT');
  pb.textContent=P?'D':'Y'; pb.className='toggle '+(P?'on':'off');
  qb.textContent=Q?'D':'Y'; qb.className='toggle '+(Q?'on':'off');
  const f=[['¬p',!P],['¬q',!Q],['p ∧ q',P&&Q],['p ∨ q',P||Q],['p → q',!P||Q],['q → p',!Q||P],['p ↔ q',P===Q]];
  document.getElementById('labTable').innerHTML='<tr>'+f.map(x=>`<th>${x[0]}</th>`).join('')+'</tr><tr>'+f.map(x=>`<td>${DY(x[1])}</td>`).join('')+'</tr>';
}
document.getElementById('pT').onclick=()=>{P=!P;lab();};
document.getElementById('qT').onclick=()=>{Q=!Q;lab();};
lab();

// ===================== Truth table generator =====================
function classify(vals){ return vals.every(x=>x)?['Tavtologiya: həmişə doğrudur','ok']:vals.every(x=>!x)?['Ziddiyyət: həmişə yalandır','bad']:['Mümkün: bəzi hallarda doğru, bəzilərində yalandır','info']; }
function ttHTML(ast){
  const vs=[...vars(ast)].sort(), sb=subs(ast), rs=rows(vs);
  let h='<div class="scroll"><table class="tt"><tr>'+vs.map(v=>`<th>${v}</th>`).join('')+sb.map((s,i)=>`<th>${esc(str(s))}</th>`).join('')+'</tr>';
  const vals=[];
  rs.forEach(env=>{ const r=ev(ast,env); vals.push(r);
    h+='<tr>'+vs.map(v=>`<td>${DY(env[v])}</td>`).join('')+sb.map((s,i)=>`<td class="${i===sb.length-1?'res':''}">${DY(ev(s,env))}</td>`).join('')+'</tr>'; });
  h+='</table></div>'; const c=classify(vals);
  return h+`<div class="msg ${c[1]}">${c[0]}</div>`;
}
function gen(){
  const out=document.getElementById('genOut');
  try{ const a=parse(document.getElementById('genIn').value); out.innerHTML=ttHTML(a); }
  catch(e){ out.innerHTML=`<div class="msg bad">Xəta: ${esc(e.message)}</div>`; }
}
document.getElementById('genBtn').onclick=gen;
document.getElementById('genIn').onkeydown=e=>{if(e.key==='Enter')gen();};
gen();

// ===================== Fill-in exercise =====================
const FILL=['p → q','¬p ∨ q','p ∧ ¬q','(p ∨ q) ∧ ¬p','p ↔ ¬q','¬(p ∧ q)','q → ¬p','(p → q) ∧ (q → p)','p ∨ q → r','(p ∧ q) ∨ ¬r'];
let fillIdx=-1, fillUser=[], fillAst, fillRows, fillOk=0, fillTry=0;
function fillNew(){
  let n; do{ n=Math.floor(Math.random()*FILL.length);}while(n===fillIdx && FILL.length>1); fillIdx=n;
  fillAst=parse(FILL[n]); const vs=[...vars(fillAst)].sort(); fillRows=rows(vs); fillUser=fillRows.map(()=>null);
  document.getElementById('fillF').innerHTML=`<span class="sym">${esc(FILL[n])}</span>`;
  document.getElementById('fillMsg').innerHTML='';
  const tb=document.getElementById('fillTable');
  tb.innerHTML='<table class="tt"><tr>'+vs.map(v=>`<th>${v}</th>`).join('')+`<th>${esc(FILL[n])}</th></tr>`+
    fillRows.map((env,i)=>'<tr>'+vs.map(v=>`<td>${DY(env[v])}</td>`).join('')+`<td class="res cell-btn" data-i="${i}">?</td></tr>`).join('')+'</table>';
  tb.querySelectorAll('.cell-btn').forEach(td=>td.onclick=()=>{
    const i=+td.dataset.i; fillUser[i]= fillUser[i]===null?true:!fillUser[i];
    td.innerHTML=DY(fillUser[i]); td.style.outline='';
  });
}
document.getElementById('fillNext').onclick=fillNew;
document.getElementById('fillCheck').onclick=()=>{
  const m=document.getElementById('fillMsg');
  if(fillUser.some(x=>x===null)){ m.innerHTML='<div class="msg info">Bütün xanaları doldur.</div>'; return; }
  let wrong=0; document.querySelectorAll('#fillTable .cell-btn').forEach((td,i)=>{
    const ok=fillUser[i]===ev(fillAst,fillRows[i]); if(!ok){wrong++; td.style.outline='2px solid var(--bad)';} else td.style.outline='2px solid var(--ok)';
  });
  fillTry++; if(!wrong) fillOk++;
  m.innerHTML=wrong?`<div class="msg bad">${wrong} xana səhvdir (qırmızı). Düzəlt və yenidən yoxla.</div>`:'<div class="msg ok">Əla! Hamısı düzdür. 🎉</div>';
  document.getElementById('fillScore').textContent=`Uğurlu cəhdlər: ${fillOk} / ${fillTry}`+(fillOk>=3?' · Dərs tamamlandı ✓':' · 3 düzgün cədvəl doldursan, dərs tamamlanır');
  if(fillOk>=3) api.done(2);
};
fillNew();

// ===================== Equivalence checker =====================
document.getElementById('eqBtn').onclick=()=>{
  const out=document.getElementById('eqOut');
  try{
    const A=parse(document.getElementById('eqA').value), B=parse(document.getElementById('eqB').value);
    const vs=[...new Set([...vars(A),...vars(B)])].sort(), rs=rows(vs); let diff=null;
    let h='<div class="scroll"><table class="tt"><tr>'+vs.map(v=>`<th>${v}</th>`).join('')+`<th>${esc(str(A))}</th><th>${esc(str(B))}</th></tr>`;
    rs.forEach(env=>{ const a=ev(A,env), b=ev(B,env); if(a!==b&&!diff) diff=env;
      h+=`<tr${a!==b?' style="background:var(--bad-soft)"':''}>`+vs.map(v=>`<td>${DY(env[v])}</td>`).join('')+`<td>${DY(a)}</td><td>${DY(b)}</td></tr>`; });
    h+='</table></div>';
    h+= diff?`<div class="msg bad">Ekvivalent deyil. Məsələn: ${vs.map(v=>v+' = '+(diff[v]?'D':'Y')).join(', ')} halında qiymətləri fərqlidir.</div>`
            :'<div class="msg ok">Ekvivalentdir ≡: bütün hallarda qiymətlər eynidir.</div>';
    out.innerHTML=h;
  }catch(e){ out.innerHTML=`<div class="msg bad">Xəta: ${esc(e.message)}</div>`; }
};
document.getElementById('eqBtn').click();

// ===================== Argument checker =====================
document.getElementById('argBtn').onclick=()=>{
  const out=document.getElementById('argOut');
  try{
    const ps=document.getElementById('argP').value.split('\n').map(s=>s.trim()).filter(Boolean).map(parse);
    const c=parse(document.getElementById('argC').value);
    const vs=[...new Set([...ps.flatMap(p=>[...vars(p)]),...vars(c)])].sort();
    const cex=rows(vs).find(env=>ps.every(p=>ev(p,env))&&!ev(c,env));
    out.innerHTML = cex
      ? `<div class="msg bad">❌ Arqument yanlışdır. Əks-nümunə: ${vs.map(v=>v+' = '+(cex[v]?'D':'Y')).join(', ')}. Bu halda bütün əsaslar doğrudur, nəticə isə yalandır.</div>`
      : `<div class="msg ok">✅ Arqument düzgündür: əsaslar doğru olan bütün hallarda nəticə də doğrudur.</div>`;
  }catch(e){ out.innerHTML=`<div class="msg bad">Xəta: ${esc(e.message)}</div>`; }
};
document.getElementById('argBtn').click();

// ===================== Knights & Knaves =====================
const KK=[
  {people:['A','B'],text:'<b>A</b> deyir: “B yalançıdır.”<br><b>B</b> deyir: “İkimiz də cəngavərik.”',
   rules:[(w)=>!w.B,(w)=>w.A&&w.B], hint:'B cəngavər olsaydı, A da cəngavər olardı. Onda A-nın sözü yalan çıxardı.'},
  {people:['A','B'],text:'<b>A</b> deyir: “İkimiz də yalançıyıq.”<br><b>B</b> heç nə demir.',
   rules:[(w)=>!w.A&&!w.B,null], hint:'Cəngavər “mən yalançıyam” deyə bilməz.'},
  {people:['A','B'],text:'<b>A</b> deyir: “Ən azı birimiz yalançıdır.”<br><b>B</b> heç nə demir.',
   rules:[(w)=>!w.A||!w.B,null], hint:'A yalançı olsaydı, onun sözü doğru çıxardı.'},
  {people:['A','B'],text:'<b>A</b> deyir: “B ilə mən eyni tipdəyik.”<br><b>B</b> deyir: “A ilə mən fərqli tipdəyik.”',
   rules:[(w)=>w.A===w.B,(w)=>w.A!==w.B], hint:'İki sözdən yalnız biri doğru ola bilər.'},
  {people:['A','B','C'],text:'<b>A</b> deyir: “B yalançıdır.”<br><b>B</b> deyir: “C yalançıdır.”<br><b>C</b> deyir: “A da, B də yalançıdır.”',
   rules:[(w)=>!w.B,(w)=>!w.C,(w)=>!w.A&&!w.B], hint:'Əvvəlcə C-nin cəngavər olduğunu fərz et və ziddiyyətə gəl.'},
];
function solveKK(p){
  const sols=[];
  for(let m=0;m<(1<<p.people.length);m++){
    const w={}; p.people.forEach((n,i)=>w[n]=!!((m>>i)&1));
    if(p.rules.every((r,i)=>r===null||r(w)===w[p.people[i]])) sols.push(w);
  }
  return sols;
}
let kkI=0, kkSolved=Object.assign({}, api.get('kk')||{});
function renderKK(){
  const p=KK[kkI], el=document.getElementById('kk'), sol=solveKK(p);
  const pick={};
  el.innerHTML=`<h3>🧩 Tapmaca ${kkI+1} / ${KK.length} ${kkSolved[kkI]?'✓':''}</h3><p>${p.text}</p><div id="kkPeople"></div>
    <div class="row" style="margin-top:10px"><button class="btn" id="kkCheck">Yoxla</button><button class="btn ghost" id="kkHint">İpucu</button>
    <button class="btn ghost" id="kkPrev" ${kkI===0?'disabled':''}>←</button><button class="btn ghost" id="kkNext" ${kkI===KK.length-1?'disabled':''}>→</button></div><div id="kkMsg"></div>`;
  const pp=el.querySelector('#kkPeople');
  p.people.forEach(n=>{
    const d=document.createElement('div'); d.className='person';
    d.innerHTML=`<b>${n}</b>`;
    [['Cəngavər 🛡️',true],['Yalançı 🎭',false]].forEach(([lbl,val])=>{
      const b=document.createElement('button'); b.className='toggle'; b.textContent=lbl;
      b.onclick=()=>{ pick[n]=val; d.querySelectorAll('.toggle').forEach(x=>x.className='toggle'); b.className='toggle '+(val?'on':'off'); };
      d.appendChild(b);
    });
    pp.appendChild(d);
  });
  const msg=el.querySelector('#kkMsg');
  el.querySelector('#kkHint').onclick=()=>msg.innerHTML=`<div class="msg info">💡 ${p.hint}</div>`;
  el.querySelector('#kkPrev').onclick=()=>{kkI--;renderKK();};
  el.querySelector('#kkNext').onclick=()=>{kkI++;renderKK();};
  el.querySelector('#kkCheck').onclick=()=>{
    if(p.people.some(n=>pick[n]===undefined)){ msg.innerHTML='<div class="msg info">Hər kəs üçün seçim et.</div>'; return; }
    const ok=sol.length===1 && p.people.every(n=>sol[0][n]===pick[n]);
    if(ok){
      kkSolved[kkI]=true; api.set('kk', Object.assign({}, kkSolved));
      msg.innerHTML='<div class="msg ok">✅ Düzgün! Bu yeganə ziddiyyətsiz həlldir.</div>';
      if(Object.keys(kkSolved).length>=KK.length) api.done(7);
      else msg.innerHTML+=`<div class="score">Həll edilib: ${Object.keys(kkSolved).length} / ${KK.length}</div>`;
    } else {
      const bad=p.people.find((n,i)=>p.rules[i]&&p.rules[i](pick)!==pick[n]);
      msg.innerHTML=`<div class="msg bad">❌ Ziddiyyət var: ${bad?`${bad} ${pick[bad]?'cəngavərdirsə, sözü doğru olmalıdır, amma yalan çıxır.':'yalançıdırsa, sözü yalan olmalıdır, amma doğru çıxır.'}`:'yenidən düşün.'}</div>`;
    }
  };
}
renderKK();

// ===================== Chart helper =====================
function chart(el,series,ymin,ymax){
  const W=600,H=220,n=series[0].data.length;
  const Y=y=>H-6-(Math.max(ymin,Math.min(ymax,y))-ymin)/(ymax-ymin)*(H-12);
  let g='';
  for(let k=0;k<=4;k++){ const y=6+k*(H-12)/4; g+=`<line x1="0" x2="${W}" y1="${y}" y2="${y}" style="stroke:var(--line)" stroke-width="1" vector-effect="non-scaling-stroke"/>`; }
  const lines=series.map(s=>`<polyline fill="none" style="stroke:${s.color}" stroke-width="2" ${s.dash?'stroke-dasharray="6 5"':''} vector-effect="non-scaling-stroke" points="${s.data.map((y,i)=>`${(i/(n-1)*W).toFixed(1)},${Y(y).toFixed(1)}`).join(' ')}"/>`).join('');
  el.innerHTML=`<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${g}${lines}</svg>`;
}

// ===================== Logistic map =====================
function logistic(){
  const r=+lgRin.value, x0=+lgXin.value; lgR.textContent=r.toFixed(2); lgX.textContent=x0.toFixed(3);
  const a=[x0],b=[x0+1e-6]; for(let i=0;i<60;i++){ a.push(r*a[i]*(1-a[i])); b.push(r*b[i]*(1-b[i])); }
  chart(lgChart,[{data:a,color:'var(--accent)'},{data:b,color:'var(--warn)'}],0,1);
  const k=a.findIndex((v,i)=>Math.abs(v-b[i])>0.1);
  lgMsg.innerHTML = k<0 ? '<div class="msg ok">60 addım ərzində trayektoriyalar ayrılmadı: sistem bu rejimdə proqnozlaşdırıla bilir.</div>'
    : `<div class="msg bad">${k}-cü addımda trayektoriyalar arasındakı fərq 0.1-dən böyük oldu. Başlanğıcdakı fərq isə 0.000001 idi. Proqnoz üfüqü ≈ ${k} addımdır.</div>`;
}
const lgRin=document.getElementById('lgRin'), lgXin=document.getElementById('lgXin'), lgR=document.getElementById('lgR'), lgX=document.getElementById('lgX'), lgChart=document.getElementById('lgChart'), lgMsg=document.getElementById('lgMsg');
lgRin.oninput=logistic; lgXin.oninput=logistic; logistic();

// ===================== 2-4-6 =====================
(()=>{
  const inp=document.getElementById('w246in'), log=document.getElementById('w246log'), msg=document.getElementById('w246msg'), gs=document.getElementById('w246guess');
  const tests=[];
  const rule=a=>a[0]<a[1]&&a[1]<a[2];
  function test(){
    const a=inp.value.trim().split(/[\s,;]+/).map(Number);
    if(a.length!==3||a.some(isNaN)){ msg.innerHTML='<div class="msg info">Üç ədəd yaz, məsələn: 1 2 3</div>'; return; }
    msg.innerHTML=''; tests.push([a,rule(a)]);
    log.innerHTML=tests.map(([x,ok])=>`${x.join(', ')} → ${ok?'<span class="T">uyğundur ✓</span>':'<span class="F">uyğun deyil ✗</span>'}`).join('<br>');
    inp.value=''; inp.focus();
  }
  document.getElementById('w246btn').onclick=test; inp.onkeydown=e=>{if(e.key==='Enter')test();};
  const opts=['Hər ədəd əvvəlkindən 2 vahid böyükdür','Cüt ədədlərdir','İstənilən artan ardıcıllıq','Üçüncü ədəd ilk ikisinin cəmidir'];
  opts.forEach((o,i)=>{ const b=document.createElement('button'); b.textContent=o; b.onclick=()=>{
    const neg=tests.filter(t=>!t[1]).length;
    if(i===2){ msg.innerHTML=`<div class="msg ok">✅ Düzdür! Qayda belədir: “ədədlər artan sıradadır”. Sən ${tests.length} test etdin və onlardan ${neg} dənəsi “uyğun deyil” cavabı aldı. ${neg?'Əla, hipotezini təkzib etməyə çalışdın.':'Diqqət: qaydanı pozacağını gözlədiyin üçlüklər (məsələn, 6 4 2) yoxlamaq ən informativ testdir.'}</div>`; }
    else msg.innerHTML=`<div class="msg bad">❌ Yox. İnsanların çoxu belə səhv edir: öz hipotezlərini <b>təsdiqləyən</b> üçlükləri yoxlayırlar (8 10 12, 20 22 24…). Hipotezinin <b>səhv</b> çıxa biləcəyi üçlüyü yoxla. Məsələn, ${i===0?'1 2 3':i===1?'1 3 5':'1 2 10'}.</div>`;
  }; gs.appendChild(b); });
})();

// ===================== Wason cards =====================
(()=>{
  const box=document.getElementById('wcards'), sel=new Set(); const cards=['A','K','4','7'];
  cards.forEach(c=>{ const b=document.createElement('button'); b.className='card-btn'; b.textContent=c;
    b.onclick=()=>{ sel.has(c)?sel.delete(c):sel.add(c); b.classList.toggle('sel'); }; box.appendChild(b); });
  document.getElementById('wcCheck').onclick=()=>{
    const ok=sel.size===2&&sel.has('A')&&sel.has('7'), m=document.getElementById('wcMsg');
    m.innerHTML = ok ? '<div class="msg ok">✅ Düzdür: <b>A</b> və <b>7</b>. A kartını çevirmək modus ponens yoxlamasıdır: arxasında cüt ədəd olmalıdır. 7 kartını çevirmək isə modus tollens yoxlamasıdır: arxasında sait olmamalıdır. 4 kartını çevirmək mənasızdır. Qayda “cüt ədədin arxasında sait var” demir (nəticənin təsdiqi səhvi).</div>'
      : `<div class="msg bad">❌ Hələ yox. ${sel.has('4')?'4 kartının arxasında nə olsa da qayda pozulmur. Bu, “nəticənin təsdiqi” tələsidir. ':''}${!sel.has('7')?'Hansı kartın arxasında sait çıxsa, qayda pozular? ':''}${sel.has('K')?'K kartı samitdir, qayda samitlər haqqında heç nə demir. ':''}Bu tapşırıqda insanların yalnız təxminən 10%-i düzgün cavab verir.</div>`;
  };
})();

// ===================== Inversion =====================
document.getElementById('invBtn').onclick=()=>{
  const goal=document.getElementById('invGoal').value.trim()||'məqsədim';
  const items=document.getElementById('invList').value.split('\n').map(s=>s.trim()).filter(Boolean);
  const o=document.getElementById('invOut');
  if(!items.length){ o.innerHTML='<div class="msg info">Ən azı bir uğursuzluq səbəbi yaz.</div>'; return; }
  o.innerHTML=`<div class="msg ok"><b>“${esc(goal)}” üçün qoruyucu qaydalar:</b><ol>${items.map(s=>`<li>🚫 Bundan qaç: <i>${esc(s)}</i><br><span class="fb">Bu riskin ilk əlaməti nə olar və onu görəndə nə edəcəksən?</span></li>`).join('')}</ol>
  İndi <b>ikinci halqanı</b> tamamla: hansı səbəb artıq real faktlarda görünür? Əvvəlcə onunla işlə.</div>`;
};

// ===================== Bottleneck =====================
(()=>{
  const names=['Sifariş qəbulu','Xəmir və bişirmə','Qablaşdırma','Çatdırılma'], base=[30,12,20,25];
  let cap, pts, history;
  const box=document.getElementById('bnStages'), msg=document.getElementById('bnMsg');
  function reset(){ cap=base.slice(); pts=3; history=[]; draw(); }
  function draw(){
    const out=Math.min(...cap), max=Math.max(...cap,40);
    box.innerHTML=`<p><b>Gündəlik nəticə: ${out} sifariş</b> · Qalan xal: ${pts}</p>`+cap.map((c,i)=>`<div class="stage ${c===out?'neck':''}"><span>${names[i]}</span><div class="barbox"><div class="bar" style="width:${c/max*100}%"></div></div><button class="btn" data-i="${i}" ${pts?'':'disabled'} style="padding:4px 8px">+5</button></div><div class="fb" style="margin:-6px 0 0">${c}/gün${c===out?' · <span class="F">darboğaz</span>':''}</div>`).join('');
    box.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{
      const i=+b.dataset.i, before=Math.min(...cap); cap[i]+=5; pts--; const after=Math.min(...cap);
      history.push(after>before);
      msg.innerHTML = after>before ? `<div class="msg ok">“${names[i]}” darboğaz idi və nəticə ${before}-dən ${after}-ə qalxdı. ✓</div>` : `<div class="msg bad">“${names[i]}” darboğaz deyildi, buna görə nəticə dəyişmədi (${after}). Resurs boşa getdi.</div>`;
      if(!pts){ const best=Math.min(...cap);
        msg.innerHTML+= best>=22 ? '<div class="msg ok">🎉 Maksimum nəticə: 22/gün (başlanğıcda 12 idi). Hər xalı darboğaza verdin. Diqqət et: iki xaldan sonra darboğaz bişirmədən qablaşdırmaya keçdi. Ona görə də üçüncü xalı ora vermək lazım idi.</div>' : `<div class="msg info">Nəticə: ${best}/gün. Ən yaxşı mümkün nəticə 22/gündür. “Yenidən başla” düyməsini bas və hər dəfə qırmızı mərhələni gücləndir.</div>`;
        if(best>=22) api.done(13);
      }
      draw();
    });
  }
  document.getElementById('bnReset').onclick=()=>{msg.innerHTML='';reset();};
  reset();
})();

// ===================== Shower =====================
function shower(){
  const d=+shDin.value, k=+shKin.value; shD.textContent=d; shK.textContent=k.toFixed(2);
  const knob=[20], T=[]; const N=50;
  for(let t=0;t<N;t++){ const temp=knob[Math.max(0,t-d)]; T.push(temp); knob.push(Math.max(0,Math.min(70,knob[t]+k*(38-temp)))); }
  chart(shChart,[{data:T,color:'var(--accent)'},{data:T.map(()=>38),color:'var(--ok)',dash:true}],0,70);
  const tail=T.slice(-15), sw=Math.max(...tail)-Math.min(...tail);
  shMsg.innerHTML = sw<1 ? '<div class="msg ok">Temperatur sabitləşdi. Gecikmə ilə reaksiya gücü bir-birinə uyğundur.</div>'
    : sw<15 ? `<div class="msg info">Temperatur rəqs edir (son addımlarda ±${(sw/2).toFixed(1)}°C). Reaksiya gücünü azaltmağı sına.</div>`
    : '<div class="msg bad">Güclü rəqs: gah qaynar, gah buz kimi su. Gecikmə böyük, reaksiya da güclüdür. Real sistemlərdə (iqtisadiyyat, anbar, komanda) bu, tipik problemdir.</div>';
}
const shDin=document.getElementById('shDin'), shKin=document.getElementById('shKin'), shD=document.getElementById('shD'), shK=document.getElementById('shK'), shChart=document.getElementById('shChart'), shMsg=document.getElementById('shMsg');
shDin.oninput=shower; shKin.oninput=shower; shower();

// ===================== Bayes =====================
function bayes(){
  const p=+byPin.value/100, s=+bySin.value/100, f=+byFin.value/100;
  byP.textContent=(p*100).toFixed(1); byS.textContent=Math.round(s*100); byF.textContent=(f*100).toFixed(1);
  const N=10000, sick=N*p, tp=sick*s, fp=(N-sick)*f, post=tp/(tp+fp);
  byOut.innerHTML=`<div class="msg info"><b>10 000 nəfər götürək:</b><br>
   • xəstə: ${Math.round(sick)}, onlardan test müsbət: <span class="T">${Math.round(tp)}</span><br>
   • sağlam: ${Math.round(N-sick)}, onlardan test yalançı müsbət: <span class="F">${Math.round(fp)}</span><br>
   Müsbət nəticə alan ${Math.round(tp+fp)} nəfərdən yalnız ${Math.round(tp)} nəfəri həqiqətən xəstədir.</div>
   <div class="msg ${post<0.5?'bad':'ok'}" style="font-size:18px">P(xəstə | test +) = <b>${(post*100).toFixed(1)}%</b></div>
   <p class="fb">Yayılmanı 1%-dən 20%-ə qaldır və nəticənin necə dəyişdiyinə bax. Həkimlər buna görə ikinci, müstəqil test təyin edirlər.</p>`;
}
const byPin=document.getElementById('byPin'), bySin=document.getElementById('bySin'), byFin=document.getElementById('byFin'), byP=document.getElementById('byP'), byS=document.getElementById('byS'), byF=document.getElementById('byF'), byOut=document.getElementById('byOut');
[byPin,bySin,byFin].forEach(x=>x.oninput=bayes); bayes();

// ===================== Fuzzy =====================
function fuzzy(){
  const T=+fzTin.value; fzT.textContent=T;
  const hot=Math.max(0,Math.min(1,(T-18)/10));
  const crisp=T>=25;
  fzTout.innerHTML=`<div class="row"><div style="flex:1"><div class="barbox" style="height:22px;background:var(--line);border-radius:6px;overflow:hidden"><div style="height:100%;width:${hot*100}%;background:var(--warn)"></div></div></div><b style="min-width:90px">“isti” = ${hot.toFixed(2)}</b></div>
   <p class="fb">Klassik məntiq (“25°C-dən yuxarı isti sayılır”): <b>${crisp?'D':'Y'}</b>. ${T===24||T===25?'24°C ilə 25°C arasında “istidən” “isti deyil”ə sıçrayış baş verir. Bu, süni sərhəddir.':'24 və 25-i sına və klassik sərhədin necə kəskin olduğunu gör.'}</p>`;
  const a=+fzAin.value, b=+fzBin.value; fzA.textContent=a.toFixed(2); fzB.textContent=b.toFixed(2);
  const f=x=>x.toFixed(2);
  fzOut.innerHTML=`<table class="tt"><tr><th>Norma</th><th>a ∧ b (VƏ)</th><th>a ∨ b (VƏ YA)</th><th>Xarakter</th></tr>
   <tr><td>Zadə (min/max)</td><td class="res">${f(Math.min(a,b))}</td><td>${f(Math.max(a,b))}</td><td>ən zəif halqa</td></tr>
   <tr><td>Hasil</td><td class="res">${f(a*b)}</td><td>${f(a+b-a*b)}</td><td>hər zəifliyi cərimələyir</td></tr>
   <tr><td>Lukaşeviç</td><td class="res">${f(Math.max(0,a+b-1))}</td><td>${f(Math.min(1,a+b))}</td><td>ən sərt “VƏ”</td></tr>
   <tr><td>¬a</td><td colspan="3">${f(1-a)}</td></tr></table>
   <p class="fb">Qərar həddi 0.5 olsa: Zadə normasına görə ${Math.min(a,b)>=0.5?'<span class="T">götür</span>':'<span class="F">götürmə</span>'}, hasil normasına görə ${a*b>=0.5?'<span class="T">götür</span>':'<span class="F">götürmə</span>'}, Lukaşeviç normasına görə ${Math.max(0,a+b-1)>=0.5?'<span class="T">götür</span>':'<span class="F">götürmə</span>'}.</p>`;
}
const fzTin=document.getElementById('fzTin'), fzT=document.getElementById('fzT'), fzTout=document.getElementById('fzTout'), fzAin=document.getElementById('fzAin'), fzBin=document.getElementById('fzBin'), fzA=document.getElementById('fzA'), fzB=document.getElementById('fzB'), fzOut=document.getElementById('fzOut');
[fzTin,fzAin,fzBin].forEach(x=>x.oninput=fuzzy); fuzzy();

// ===================== Coin =====================
document.getElementById('coinBtn').onclick=()=>{
  const s=Array.from({length:100},()=>Math.random()<0.5?'Y':'T');
  let best=1,cur=1,end=0; for(let i=1;i<100;i++){ cur=s[i]===s[i-1]?cur+1:1; if(cur>best){best=cur;end=i;} }
  const st=end-best+1;
  document.getElementById('coinOut').innerHTML=s.map((c,i)=>i>=st&&i<=end?`<span class="run">${c}</span>`:c).join('');
  document.getElementById('coinMsg').innerHTML=`<div class="msg info">Ən uzun seriya: <b>${best}</b> ardıcıl “${s[end]==='Y'?'yazı':'tura'}” (sarı ilə işarələnib). 100 atışda ən uzun seriya adətən 5–8 olur. İnsanlar isə “təsadüfi” ardıcıllıq uydurarkən 3–4-dən uzun seriya yazmırlar. Ona görə də real təsadüf bizə “qanunauyğunluq” kimi görünür. Bu, apofeniyadır.</div>`;
};

// ===================== Evolution =====================
(()=>{
  const TARGET='MƏNTİQ ELMLƏRİN ELMİDİR', AB='ABCÇDEƏFGĞHXIİJKQLMNOÖPRSŞTUÜVYZ ';
  const rnd=()=>AB[Math.floor(Math.random()*AB.length)];
  const fit=s=>[...s].filter((c,i)=>c===TARGET[i]).length;
  let best, gen, timer=null;
  const bestEl=document.getElementById('evBest'), info=document.getElementById('evInfo'), btn=document.getElementById('evStart'), mIn=document.getElementById('evMin');
  function reset(){ stop(); best=Array.from(TARGET,rnd).join(''); gen=0; draw(); }
  function draw(){
    bestEl.innerHTML=[...best].map((c,i)=>c===TARGET[i]?`<span class="T">${c===' '?'·':c}</span>`:`<span style="color:var(--muted)">${c===' '?'·':c}</span>`).join('');
    const f=fit(best); info.textContent=`Nəsil: ${gen} · Fitnes: ${f} / ${TARGET.length}`+(f===TARGET.length?' · 🎉 Hədəfə çatdı!':'');
  }
  function step(){
    const m=+mIn.value/100; let cand=best, cf=fit(best);
    for(let k=0;k<100;k++){ const c=[...best].map(ch=>Math.random()<m?rnd():ch).join(''); const f=fit(c); if(f>=cf){cand=c;cf=f;} }
    best=cand; gen++; draw();
    if(cf===TARGET.length){ stop(); api.done(20); }
  }
  function stop(){ if(timer){clearInterval(timer);timer=null;} btn.textContent='Başla'; }
  api.onUnmount(stop);
  btn.onclick=()=>{ if(timer) stop(); else { if(fit(best)===TARGET.length) reset(); timer=setInterval(step,60); btn.textContent='Dayandır'; } };
  mIn.oninput=()=>document.getElementById('evM').textContent=mIn.value;
  document.getElementById('evReset').onclick=reset;
  reset();
})();

});
