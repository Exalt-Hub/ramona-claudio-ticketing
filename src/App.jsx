import React,{useEffect,useRef,useState} from 'react';
import {collection,deleteDoc,doc,getDoc,getDocs,limit,onSnapshot,orderBy,query,runTransaction,serverTimestamp,setDoc,updateDoc,where} from 'firebase/firestore';
import {onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'firebase/auth';
import {db,auth} from './firebase';
import {Html5Qrcode} from 'html5-qrcode';
import QRCode from 'qrcode';
import {jsPDF} from 'jspdf';

const EVENT={
  id:'ramona-claudio',
  eventName:'Uitnodiging Ramona en Claudio',
  names:'Ramona & Claudio',
  subtitle:'43 & 45 Celebration',
  date:'Vrijdag 18 september 2026',
  time:'Inloop vanaf 19.00 u',
  location:'Lalarookh',
  dresscode:'All Black',
  ticketPrefix:'RC',
  maxTickets:100
};

export default function App(){
  const[user,setUser]=useState(undefined);
  const[role,setRole]=useState(null);

  useEffect(
    ()=>onAuthStateChanged(auth,async u=>{
      setUser(u||null);
      setRole(null);

      if(u){
        const s=await getDoc(doc(db,'rc_users',u.uid));
        setRole(s.exists()?s.data().role:null);
      }
    }),
    []
  );

  if(user===undefined)return <Splash/>;
  if(!user)return <Login/>;

  if(!role){
    return(
      <Center>
        <h2>Geen toegang</h2>
        <p>Maak eerst je rol aan in <code>rc_users</code>.</p>
        <button className="btn" onClick={()=>signOut(auth)}>Uitloggen</button>
      </Center>
    );
  }

  return role==='scanner'||location.pathname.toLowerCase().startsWith('/scanner')
    ? <Scanner user={user}/>
    : <Admin/>;
}

function Login(){
  const[e,setE]=useState('');
  const[p,setP]=useState('');
  const[err,setErr]=useState('');

  async function go(x){
    x.preventDefault();

    try{
      setErr('');
      await signInWithEmailAndPassword(auth,e.trim(),p);
    }catch{
      setErr('Inloggen is niet gelukt.');
    }
  }

  return(
    <div className="login">
      <form className="card" onSubmit={go}>
        <small>RAMONA & CLAUDIO</small>
        <h1>Event Ticketing</h1>
        <p>Beheer en poortscanner</p>

        <label>E-mailadres</label>
        <input
          type="email"
          value={e}
          onChange={x=>setE(x.target.value)}
          required
        />

        <label>Wachtwoord</label>
        <input
          type="password"
          value={p}
          onChange={x=>setP(x.target.value)}
          required
        />

        {err&&<div className="alert">{err}</div>}

        <button className="btn full">Inloggen</button>
      </form>
    </div>
  );
}

function Admin(){
  const[tickets,setTickets]=useState([]);
  const[settings,setSettings]=useState(EVENT);
  const[count,setCount]=useState(1);
  const[name,setName]=useState('');
  const[msg,setMsg]=useState('');

  useEffect(()=>{
    const a=onSnapshot(
      query(
        collection(db,'rc_event_tickets'),
        orderBy('ticketNumber')
      ),
      s=>setTickets(
        s.docs.map(d=>({
          id:d.id,
          ...d.data()
        }))
      )
    );

    const b=onSnapshot(
      doc(db,'rc_event_settings',EVENT.id),
      s=>{
        if(s.exists()){
          setSettings(v=>({
            ...v,
            ...s.data()
          }));
        }
      }
    );

    return()=>{
      a();
      b();
    };
  },[]);

  const used=tickets.filter(t=>t.status==='used').length;
  const blocked=tickets.filter(t=>t.blocked).length;
  const unused=tickets.filter(t=>t.status!=='used'&&!t.blocked).length;

  async function generate(){
    const qty=Math.max(
      1,
      Math.min(Number(count)||1,50)
    );

    const max=Number(settings.maxTickets||100);

    if(tickets.length+qty>max){
      setMsg(`Maximaal ${max} tickets.`);
      return;
    }

    const seen=new Set(
      tickets.map(t=>t.ticketNumber)
    );

    let made=0;
    let n=1;

    while(made<qty){
      const num=
        `${settings.ticketPrefix||'RC'}-${String(n++).padStart(4,'0')}`;

      if(seen.has(num))continue;

      await setDoc(
        doc(db,'rc_event_tickets',num),
        {
          ticketNumber:num,
          token:makeToken(),
          status:'unused',
          blocked:false,
          scannedAt:null,
          scannedBy:null,
          createdAt:serverTimestamp(),
          guestName:qty===1?name.trim():'',
          eventId:EVENT.id,
          ticketType:'standard'
        }
      );

      seen.add(num);
      made++;
    }

    setName('');
    setMsg(`${qty} ticket${qty===1?'':'s'} gegenereerd.`);
  }

  return(
    <div className="shell">
      <header>
        <div>
          <small>UITNODIGING</small>
          <h1>{settings.names||EVENT.names}</h1>
        </div>

        <button
          className="ghost"
          onClick={()=>signOut(auth)}
        >
          Uitloggen
        </button>
      </header>

      <main>
        <section className="hero">
          <div>
            <b>43 & 45 CELEBRATION</b>

            <h2>
              {settings.eventName||EVENT.eventName}
            </h2>

            <p>
              {settings.date||EVENT.date}
              {' · '}
              {settings.time||EVENT.time}
            </p>

            <p>
              {settings.location||EVENT.location}
              {' · '}
              Dresscode: {settings.dresscode||EVENT.dresscode}
            </p>
          </div>

          <span>ONE-TIME ENTRY</span>
        </section>

        <section className="stats">
          <Stat n={tickets.length} t="Totaal"/>
          <Stat n={unused} t="Nog niet gescand"/>
          <Stat n={used} t="Binnen"/>
          <Stat n={blocked} t="Geblokkeerd"/>
        </section>

        <section className="panel">
          <h3>Tickets genereren</h3>

          <div className="formrow">
            <div>
              <label>Aantal</label>

              <input
                type="number"
                min="1"
                max="50"
                value={count}
                onChange={e=>setCount(e.target.value)}
              />
            </div>

            <div>
              <label>Naam (optioneel bij 1 ticket)</label>

              <input
                value={name}
                onChange={e=>setName(e.target.value)}
                placeholder="Bijv. Familie Jansen"
              />
            </div>

            <button
              className="btn"
              onClick={generate}
            >
              Genereer
            </button>

            <button
              className="btn soft"
              onClick={()=>batchPdf(
                tickets.filter(t=>!t.blocked),
                settings
              )}
            >
              Alle PDF's
            </button>
          </div>

          {msg&&<div className="alert">{msg}</div>}
        </section>

        <section className="panel">
          <div className="titleline">
            <div>
              <h3>Tickets</h3>
              <p>Limiet: {settings.maxTickets||100}</p>
            </div>

            <a
              className="btn"
              href="/scanner"
            >
              Open scanner
            </a>
          </div>

          <div className="table">
            {tickets.map(t=>
              <div className="row" key={t.id}>
                <strong>{t.ticketNumber}</strong>

                <Status t={t}/>

                <span>{t.guestName||'—'}</span>

                <div className="actions">
                  <button
                    onClick={()=>ticketPdf(t,settings)}
                  >
                    PDF
                  </button>

                  <button
                    onClick={()=>updateDoc(
                      doc(db,'rc_event_tickets',t.id),
                      {blocked:!t.blocked}
                    )}
                  >
                    {t.blocked?'Deblokkeer':'Blokkeer'}
                  </button>

                  <button
                    className="danger"
                    onClick={async()=>{
                      if(confirm(`${t.ticketNumber} verwijderen?`)){
                        await deleteDoc(
                          doc(db,'rc_event_tickets',t.id)
                        );
                      }
                    }}
                  >
                    Verwijder
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function Scanner({user}){
  const[result,setResult]=useState(null);
  const[manual,setManual]=useState('');
  const[active,setActive]=useState(false);

  const ref=useRef(null);

  useEffect(
    ()=>()=>stop(),
    []
  );

  async function start(){
    setResult(null);

    try{
      const s=new Html5Qrcode('qr-reader');

      ref.current=s;
      setActive(true);

      await s.start(
        {facingMode:'environment'},
        {
          fps:10,
          qrbox:{
            width:260,
            height:260
          }
        },
        async txt=>{
          await stop();
          await process(txt);
        },
        ()=>{}
      );
    }catch{
      setActive(false);

      setResult({
        type:'bad',
        title:'Camera niet beschikbaar',
        msg:'Controleer camera-toestemming.'
      });
    }
  }

  async function stop(){
    if(ref.current){
      try{
        if(ref.current.isScanning){
          await ref.current.stop();
        }

        await ref.current.clear();
      }catch{}

      ref.current=null;
    }

    setActive(false);
  }

  async function process(raw){
    const p=parse(raw);

    if(!p){
      setResult({
        type:'bad',
        title:'ONGELDIGE QR',
        msg:'Hoort niet bij dit event.'
      });
      return;
    }

    const s=await getDocs(
      query(
        collection(db,'rc_event_tickets'),
        where('token','==',p.token),
        limit(1)
      )
    );

    if(s.empty){
      setResult({
        type:'bad',
        title:'ONGELDIG',
        msg:'Ticket niet gevonden.'
      });
      return;
    }

    await check(s.docs[0].ref);
  }

  async function check(r){
    try{
      const out=await runTransaction(
        db,
        async tx=>{
          const s=await tx.get(r);

          if(!s.exists()){
            return{c:'bad'};
          }

          const d=s.data();

          if(d.blocked){
            return{
              c:'blocked',
              d
            };
          }

          if(d.status==='used'){
            return{
              c:'used',
              d
            };
          }

          tx.update(
            r,
            {
              status:'used',
              scannedAt:serverTimestamp(),
              scannedBy:user.uid
            }
          );

          tx.set(
            doc(collection(db,'rc_event_scans')),
            {
              ticketNumber:d.ticketNumber,
              ticketId:r.id,
              scannerId:user.uid,
              scannedAt:serverTimestamp(),
              result:'accepted'
            }
          );

          return{
            c:'ok',
            d
          };
        }
      );

      setResult(
        out.c==='ok'
          ?{
            type:'ok',
            title:'TOEGANG GOEDGEKEURD',
            msg:out.d.ticketNumber
          }
          :out.c==='used'
          ?{
            type:'warn',
            title:'REEDS GEBRUIKT',
            msg:out.d.ticketNumber
          }
          :out.c==='blocked'
          ?{
            type:'bad',
            title:'TICKET GEBLOKKEERD',
            msg:out.d.ticketNumber
          }
          :{
            type:'bad',
            title:'ONGELDIG',
            msg:'Niet gevonden'
          }
      );

    }catch{
      setResult({
        type:'bad',
        title:'SCAN MISLUKT',
        msg:'Controleer internet en regels.'
      });
    }
  }

  async function manualGo(){
    const v=manual.trim().toUpperCase();

    if(v){
      await check(
        doc(db,'rc_event_tickets',v)
      );
    }

    setManual('');
  }

  return(
    <div className="scanpage">
      <header>
        <div>
          <small>RAMONA & CLAUDIO</small>
          <h1>Gate Scanner</h1>
        </div>

        <button
          className="ghost dark"
          onClick={()=>signOut(auth)}
        >
          Uitloggen
        </button>
      </header>

      <main className="scanmain">
        {result
          ?(
            <div className={`result ${result.type}`}>
              <div>
                {result.type==='ok'
                  ?'✓'
                  :result.type==='warn'
                  ?'!'
                  :'×'}
              </div>

              <h2>{result.title}</h2>
              <p>{result.msg}</p>

              <button
                className="btn light"
                onClick={()=>setResult(null)}
              >
                Volgende ticket
              </button>
            </div>
          )
          :(
            <>
              <section className="scanner">
                <div id="qr-reader"></div>

                {!active&&
                  <div className="placeholder">
                    <h2>Scan ticket</h2>

                    <p>
                      Open de camera en richt op de QR-code.
                    </p>

                    <button
                      className="btn"
                      onClick={start}
                    >
                      Camera openen
                    </button>
                  </div>
                }
              </section>

              <section className="manual">
                <h3>Handmatige controle</h3>

                <div>
                  <input
                    value={manual}
                    onChange={e=>setManual(e.target.value)}
                    placeholder="RC-0001"
                  />

                  <button
                    className="btn"
                    onClick={manualGo}
                  >
                    Controleer
                  </button>
                </div>
              </section>
            </>
          )
        }
      </main>
    </div>
  );
}

function Stat({n,t}){
  return(
    <div className="stat">
      <strong>{n}</strong>
      <span>{t}</span>
    </div>
  );
}

function Status({t}){
  return(
    <span
      className={`status ${
        t.blocked
          ?'blocked'
          :t.status==='used'
          ?'used'
          :'unused'
      }`}
    >
      {
        t.blocked
          ?'Geblokkeerd'
          :t.status==='used'
          ?'Binnen'
          :'Ongebruikt'
      }
    </span>
  );
}

function Splash(){
  return(
    <div className="center">
      Laden...
    </div>
  );
}

function Center({children}){
  return(
    <div className="center">
      <div className="panel">
        {children}
      </div>
    </div>
  );
}

function makeToken(){
  return(
    crypto.randomUUID().replaceAll('-','')
    +
    crypto.randomUUID().replaceAll('-','')
  );
}

function payload(t){
  return `RC-EVENT|${t.ticketNumber}|${t.token}`;
}

function parse(x){
  const p=String(x).split('|');

  return(
    p.length===3
    &&
    p[0]==='RC-EVENT'
  )
    ?{
      ticketNumber:p[1],
      token:p[2]
    }
    :null;
}


// =========================
// CODE-GENERATED LUXURY TICKET
// =========================

const PDF_W=210;
const PDF_H=105;
let coupleImageCache=undefined;

async function getOptionalCoupleImage(){
  if(coupleImageCache!==undefined)return coupleImageCache;

  try{
    const response=await fetch('/couple.png');
    if(!response.ok){
      coupleImageCache=null;
      return null;
    }

    const blob=await response.blob();
    coupleImageCache=await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(reader.result);
      reader.onerror=reject;
      reader.readAsDataURL(blob);
    });

    return coupleImageCache;
  }catch{
    coupleImageCache=null;
    return null;
  }
}

async function ticketPdf(ticket,settings){
  try{
    const pdf=new jsPDF({
      orientation:'landscape',
      unit:'mm',
      format:[PDF_W,PDF_H]
    });

    await drawLuxuryTicket(pdf,ticket,settings);
    pdf.save(`${ticket.ticketNumber}.pdf`);
  }catch(error){
    console.error(error);
    alert('De ticket PDF kon niet worden gemaakt.');
  }
}

async function batchPdf(tickets,settings){
  if(!tickets.length)return;

  try{
    const pdf=new jsPDF({
      orientation:'landscape',
      unit:'mm',
      format:[PDF_W,PDF_H]
    });

    for(let i=0;i<tickets.length;i++){
      if(i>0){
        pdf.addPage([PDF_W,PDF_H],'landscape');
      }

      await drawLuxuryTicket(pdf,tickets[i],settings);
    }

    pdf.save('Ramona-Claudio-Tickets.pdf');
  }catch(error){
    console.error(error);
    alert('De tickets konden niet als PDF worden gemaakt.');
  }
}

async function drawLuxuryTicket(pdf,ticket,settings){
  const blush=[248,231,228];
  const blush2=[255,247,244];
  const rose=[178,112,102];
  const gold=[181,136,58];
  const gold2=[229,202,146];
  const black=[22,18,17];
  const ink=[47,37,33];

  // Base
  pdf.setFillColor(...blush2);
  pdf.rect(0,0,PDF_W,PDF_H,'F');

  // Ticket body
  pdf.setFillColor(235,226,221);
  pdf.roundedRect(5.5,7,199,91.5,3,3,'F');
  pdf.setFillColor(...blush);
  pdf.roundedRect(4,5.5,199,91.5,3,3,'F');

  // Black luxury corners
  pdf.setFillColor(...black);
  pdf.triangle(4,5.5,51,5.5,4,35,'F');
  pdf.triangle(4,97,55,97,4,69,'F');

  // Gold framing
  pdf.setDrawColor(...gold);
  pdf.setLineWidth(.5);
  pdf.roundedRect(7,8.5,193,85.5,2,2);
  pdf.setDrawColor(...gold2);
  pdf.setLineWidth(.2);
  pdf.roundedRect(9,10.5,189,81.5,1.7,1.7);

  // Stub divider
  pdf.setDrawColor(...rose);
  pdf.setLineDashPattern([1.5,1.5],0);
  pdf.line(153,8.5,153,94);
  pdf.setLineDashPattern([],0);

  // Decorative sparkles
  drawSpark(pdf,18,16,gold);
  drawSpark(pdf,25,13,gold2);
  drawSpark(pdf,143,17,gold);
  drawSpark(pdf,146,77,gold2);

  // Florals
  drawFlower(pdf,20,82,11,[222,162,155],gold);
  drawFlower(pdf,31,89,7,[239,192,185],gold);

  // Optional couple image. Upload public/couple.png later.
  const couple=await getOptionalCoupleImage();
  if(couple){
    try{
      pdf.addImage(couple,'PNG',10,16,39,61,undefined,'FAST');
    }catch(error){
      console.warn('couple.png kon niet worden getekend',error);
    }
  }

  // Main title
  pdf.setTextColor(...gold);
  pdf.setFont('times','italic');
  pdf.setFontSize(25);
  pdf.text('Uitnodiging',94,22,{align:'center'});

  // Flourish
  pdf.setDrawColor(...gold);
  pdf.setLineWidth(.3);
  pdf.line(78,26,89,26);
  pdf.line(99,26,110,26);
  pdf.circle(94,26,.8);

  // Names
  pdf.setTextColor(...black);
  pdf.setFont('times','bold');
  pdf.setFontSize(22);
  pdf.text(settings.names||EVENT.names,94,37,{align:'center'});

  // Subtitle
  pdf.setTextColor(...rose);
  pdf.setFont('helvetica','bold');
  pdf.setFontSize(8.4);
  pdf.text('43 & 45 CELEBRATION',94,44,{align:'center'});

  // Event details row
  drawInfoBlock(pdf,62,58,'DATUM','18 SEPTEMBER','2026',gold,ink);
  drawInfoBlock(pdf,85,58,'TIJD','INLOOP VANAF','19.00 U',gold,ink);
  drawInfoBlock(pdf,109,58,'LOCATIE',settings.location||EVENT.location,'',gold,ink);
  drawInfoBlock(pdf,133,58,'DRESSCODE',settings.dresscode||EVENT.dresscode,'',gold,ink);

  // Optional guest name
  if(ticket.guestName){
    pdf.setTextColor(...ink);
    pdf.setFont('helvetica','bold');
    pdf.setFontSize(8.2);
    pdf.text(ticket.guestName,94,76,{align:'center'});
  }

  // Standard ticket plaque
  pdf.setFillColor(...black);
  pdf.roundedRect(67,81.5,55,10,2,2,'F');
  pdf.setDrawColor(...gold);
  pdf.setLineWidth(.45);
  pdf.roundedRect(68,82.5,53,8,1.5,1.5);
  pdf.setTextColor(...gold2);
  pdf.setFont('times','bold');
  pdf.setFontSize(10);
  pdf.text('STANDARD TICKET',94.5,88.7,{align:'center'});

  // Right stub
  pdf.setFillColor(250,232,228);
  pdf.roundedRect(156,10,40,82,2,2,'F');
  pdf.setDrawColor(...gold);
  pdf.setLineWidth(.4);
  pdf.roundedRect(157.5,11.5,37,79,2,2);

  pdf.setTextColor(...rose);
  pdf.setFont('helvetica','bold');
  pdf.setFontSize(7);
  pdf.text('SCAN FOR ENTRY',176,20,{align:'center'});

  // QR frame
  pdf.setFillColor(255,255,255);
  pdf.setDrawColor(...gold);
  pdf.setLineWidth(.6);
  pdf.roundedRect(161,25,30,30,2,2,'FD');

  const qr=await QRCode.toDataURL(
    payload(ticket),
    {
      errorCorrectionLevel:'H',
      margin:1,
      width:800,
      color:{dark:'#000000',light:'#FFFFFF'}
    }
  );

  pdf.addImage(qr,'PNG',163,27,26,26);

  // One-time entry
  pdf.setTextColor(...rose);
  pdf.setFont('helvetica','bold');
  pdf.setFontSize(6.2);
  pdf.text('ONE-TIME ENTRY',176,63,{align:'center'});
  pdf.setDrawColor(...gold);
  pdf.line(166,66,172,66);
  pdf.line(180,66,186,66);
  pdf.circle(176,66,.8);

  // Ticket number plaque
  pdf.setFillColor(...black);
  pdf.roundedRect(161,72,30,17,2,2,'F');
  pdf.setDrawColor(...gold);
  pdf.setLineWidth(.45);
  pdf.roundedRect(162,73,28,15,1.5,1.5);
  pdf.setTextColor(...gold2);
  pdf.setFont('helvetica','bold');
  pdf.setFontSize(5.7);
  pdf.text('TICKET NO.',176,78,{align:'center'});
  pdf.setFontSize(12);
  pdf.text(ticket.ticketNumber,176,85,{align:'center'});
}

function drawInfoBlock(pdf,x,y,label,line1,line2,gold,ink){
  pdf.setTextColor(...gold);
  pdf.setFont('helvetica','bold');
  pdf.setFontSize(5.7);
  pdf.text(label,x,y,{align:'center'});

  pdf.setTextColor(...ink);
  pdf.setFont('helvetica','bold');
  pdf.setFontSize(5.6);
  pdf.text(line1,x,y+5,{align:'center'});

  if(line2){
    pdf.setFont('helvetica','normal');
    pdf.setFontSize(5.3);
    pdf.text(line2,x,y+9,{align:'center'});
  }
}

function drawSpark(pdf,x,y,gold){
  pdf.setDrawColor(...gold);
  pdf.setLineWidth(.35);
  pdf.line(x-2,y,x+2,y);
  pdf.line(x,y-2,x,y+2);
  pdf.circle(x,y,.55);
}

function drawFlower(pdf,x,y,r,rose,gold){
  pdf.setFillColor(...rose);

  for(let i=0;i<8;i++){
    const a=(Math.PI*2/8)*i;
    const px=x+Math.cos(a)*(r*.45);
    const py=y+Math.sin(a)*(r*.45);
    pdf.ellipse(px,py,r*.34,r*.18,'F');
  }

  pdf.setFillColor(...gold);
  pdf.circle(x,y,r*.17,'F');
}
