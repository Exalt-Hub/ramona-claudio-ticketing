import React,{useEffect,useRef,useState} from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';

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
    ()=>onAuthStateChanged(
      auth,
      async u=>{

        setUser(u||null);
        setRole(null);

        if(u){

          const s=await getDoc(
            doc(
              db,
              'rc_users',
              u.uid
            )
          );

          setRole(
            s.exists()
              ?s.data().role
              :null
          );
        }
      }
    ),
    []
  );


  if(user===undefined){
    return <Splash/>;
  }


  if(!user){
    return <Login/>;
  }


  if(!role){

    return(
      <Center>

        <h2>Geen toegang</h2>

        <p>
          Maak eerst je rol aan in <code>rc_users</code>.
        </p>

        <button
          className="btn"
          onClick={()=>signOut(auth)}
        >
          Uitloggen
        </button>

      </Center>
    );
  }


  return(
    role==='scanner'
    ||
    location.pathname.toLowerCase().startsWith('/scanner')
  )
    ?<Scanner user={user}/>
    :<Admin/>;
}



function Login(){

  const[e,setE]=useState('');
  const[p,setP]=useState('');
  const[err,setErr]=useState('');


  async function go(x){

    x.preventDefault();

    try{

      setErr('');

      await signInWithEmailAndPassword(
        auth,
        e.trim(),
        p
      );

    }catch{

      setErr(
        'Inloggen is niet gelukt.'
      );
    }
  }


  return(

    <div className="login">

      <form
        className="card"
        onSubmit={go}
      >

        <small>
          RAMONA & CLAUDIO
        </small>

        <h1>
          Event Ticketing
        </h1>

        <p>
          Beheer en poortscanner
        </p>


        <label>
          E-mailadres
        </label>

        <input
          type="email"
          value={e}
          onChange={
            x=>setE(
              x.target.value
            )
          }
          required
        />


        <label>
          Wachtwoord
        </label>

        <input
          type="password"
          value={p}
          onChange={
            x=>setP(
              x.target.value
            )
          }
          required
        />


        {
          err
          &&
          <div className="alert">
            {err}
          </div>
        }


        <button className="btn full">
          Inloggen
        </button>

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

    const ticketsListener=
      onSnapshot(

        query(
          collection(
            db,
            'rc_event_tickets'
          ),
          orderBy(
            'ticketNumber'
          )
        ),

        snapshot=>{

          setTickets(
            snapshot.docs.map(
              d=>({
                id:d.id,
                ...d.data()
              })
            )
          );
        }
      );


    const settingsListener=
      onSnapshot(

        doc(
          db,
          'rc_event_settings',
          EVENT.id
        ),

        snapshot=>{

          if(snapshot.exists()){

            setSettings(
              current=>({
                ...current,
                ...snapshot.data()
              })
            );
          }
        }
      );


    return()=>{

      ticketsListener();
      settingsListener();

    };

  },[]);



  const used=
    tickets.filter(
      t=>t.status==='used'
    ).length;


  const blocked=
    tickets.filter(
      t=>t.blocked
    ).length;


  const unused=
    tickets.filter(
      t=>
        t.status!=='used'
        &&
        !t.blocked
    ).length;



  async function generate(){

    try{

      const qty=
        Math.max(
          1,
          Math.min(
            Number(count)||1,
            50
          )
        );


      const max=
        Number(
          settings.maxTickets
          ||
          100
        );


      if(
        tickets.length+qty
        >
        max
      ){

        setMsg(
          `Maximaal ${max} tickets.`
        );

        return;
      }


      const seen=
        new Set(
          tickets.map(
            t=>t.ticketNumber
          )
        );


      let made=0;
      let n=1;


      while(
        made<qty
      ){

        const num=
          `${
            settings.ticketPrefix
            ||
            'RC'
          }-${
            String(n++)
            .padStart(
              4,
              '0'
            )
          }`;


        if(
          seen.has(num)
        ){
          continue;
        }


        await setDoc(

          doc(
            db,
            'rc_event_tickets',
            num
          ),

          {
            ticketNumber:num,
            token:makeToken(),
            status:'unused',
            blocked:false,
            scannedAt:null,
            scannedBy:null,
            createdAt:serverTimestamp(),
            guestName:
              qty===1
                ?name.trim()
                :'',
            eventId:EVENT.id,
            ticketType:'standard'
          }

        );


        seen.add(num);

        made++;
      }


      setName('');

      setMsg(
        `${qty} ticket${
          qty===1
            ?''
            :'s'
        } gegenereerd.`
      );


    }catch(error){

      console.error(error);

      setMsg(
        'Tickets konden niet worden gegenereerd.'
      );
    }
  }



  return(

    <div className="shell">

      <header>

        <div>

          <small>
            UITNODIGING
          </small>

          <h1>
            {
              settings.names
              ||
              EVENT.names
            }
          </h1>

        </div>


        <button
          className="ghost"
          onClick={
            ()=>signOut(auth)
          }
        >
          Uitloggen
        </button>

      </header>



      <main>


        <section className="hero">

          <div>

            <b>
              43 & 45 CELEBRATION
            </b>

            <h2>
              {
                settings.eventName
                ||
                EVENT.eventName
              }
            </h2>

            <p>
              {
                settings.date
                ||
                EVENT.date
              }
              {' · '}
              {
                settings.time
                ||
                EVENT.time
              }
            </p>

            <p>
              {
                settings.location
                ||
                EVENT.location
              }
              {' · '}
              Dresscode:{' '}
              {
                settings.dresscode
                ||
                EVENT.dresscode
              }
            </p>

          </div>


          <span>
            ONE-TIME ENTRY
          </span>

        </section>



        <section className="stats">

          <Stat
            n={tickets.length}
            t="Totaal"
          />

          <Stat
            n={unused}
            t="Nog niet gescand"
          />

          <Stat
            n={used}
            t="Binnen"
          />

          <Stat
            n={blocked}
            t="Geblokkeerd"
          />

        </section>



        <section className="panel">

          <h3>
            Tickets genereren
          </h3>


          <div className="formrow">


            <div>

              <label>
                Aantal
              </label>

              <input
                type="number"
                min="1"
                max="50"
                value={count}
                onChange={
                  e=>setCount(
                    e.target.value
                  )
                }
              />

            </div>



            <div>

              <label>
                Naam (optioneel bij 1 ticket)
              </label>

              <input
                value={name}
                onChange={
                  e=>setName(
                    e.target.value
                  )
                }
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
              onClick={
                ()=>batchPdf(
                  tickets.filter(
                    t=>!t.blocked
                  ),
                  settings
                )
              }
            >
              Alle PDF's
            </button>

          </div>



          {
            msg
            &&
            <div className="alert">
              {msg}
            </div>
          }

        </section>



        <section className="panel">


          <div className="titleline">

            <div>

              <h3>
                Tickets
              </h3>

              <p>
                Limiet:{' '}
                {
                  settings.maxTickets
                  ||
                  100
                }
              </p>

            </div>


            <a
              className="btn"
              href="/scanner"
            >
              Open scanner
            </a>

          </div>



          <div className="table">

            {
              tickets.map(
                t=>

                <div
                  className="row"
                  key={t.id}
                >

                  <strong>
                    {t.ticketNumber}
                  </strong>


                  <Status t={t}/>


                  <span>
                    {
                      t.guestName
                      ||
                      '—'
                    }
                  </span>



                  <div className="actions">


                    <button
                      onClick={
                        ()=>ticketPdf(
                          t,
                          settings
                        )
                      }
                    >
                      PDF
                    </button>



                    <button
                      onClick={
                        ()=>updateDoc(

                          doc(
                            db,
                            'rc_event_tickets',
                            t.id
                          ),

                          {
                            blocked:
                              !t.blocked
                          }

                        )
                      }
                    >

                      {
                        t.blocked
                          ?'Deblokkeer'
                          :'Blokkeer'
                      }

                    </button>



                    <button
                      className="danger"
                      onClick={
                        async()=>{

                          if(
                            confirm(
                              `${t.ticketNumber} verwijderen?`
                            )
                          ){

                            await deleteDoc(
                              doc(
                                db,
                                'rc_event_tickets',
                                t.id
                              )
                            );
                          }
                        }
                      }
                    >
                      Verwijder
                    </button>


                  </div>

                </div>
              )
            }

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

      const scanner=
        new Html5Qrcode(
          'qr-reader'
        );


      ref.current=scanner;

      setActive(true);


      await scanner.start(

        {
          facingMode:'environment'
        },

        {
          fps:10,
          qrbox:{
            width:260,
            height:260
          }
        },

        async text=>{

          await stop();

          await process(text);

        },

        ()=>{}

      );


    }catch(error){

      console.error(error);

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

        if(
          ref.current.isScanning
        ){

          await ref.current.stop();
        }


        await ref.current.clear();

      }catch{}


      ref.current=null;
    }


    setActive(false);
  }



  async function process(raw){

    const parsed=
      parse(raw);


    if(!parsed){

      setResult({
        type:'bad',
        title:'ONGELDIGE QR',
        msg:'Hoort niet bij dit event.'
      });

      return;
    }


    const snapshot=
      await getDocs(

        query(

          collection(
            db,
            'rc_event_tickets'
          ),

          where(
            'token',
            '==',
            parsed.token
          ),

          limit(1)

        )
      );


    if(
      snapshot.empty
    ){

      setResult({
        type:'bad',
        title:'ONGELDIG',
        msg:'Ticket niet gevonden.'
      });

      return;
    }


    await check(
      snapshot.docs[0].ref
    );
  }



  async function check(ticketRef){

    try{

      const out=
        await runTransaction(

          db,

          async transaction=>{

            const ticketSnapshot=
              await transaction.get(
                ticketRef
              );


            if(
              !ticketSnapshot.exists()
            ){

              return{
                c:'bad'
              };
            }


            const data=
              ticketSnapshot.data();


            if(
              data.blocked
            ){

              return{
                c:'blocked',
                d:data
              };
            }


            if(
              data.status==='used'
            ){

              return{
                c:'used',
                d:data
              };
            }


            transaction.update(

              ticketRef,

              {
                status:'used',
                scannedAt:serverTimestamp(),
                scannedBy:user.uid
              }

            );


            transaction.set(

              doc(
                collection(
                  db,
                  'rc_event_scans'
                )
              ),

              {
                ticketNumber:data.ticketNumber,
                ticketId:ticketRef.id,
                scannerId:user.uid,
                scannedAt:serverTimestamp(),
                result:'accepted'
              }

            );


            return{
              c:'ok',
              d:data
            };

          }

        );


      if(
        out.c==='ok'
      ){

        setResult({
          type:'ok',
          title:'TOEGANG GOEDGEKEURD',
          msg:out.d.ticketNumber
        });

      }else if(
        out.c==='used'
      ){

        setResult({
          type:'warn',
          title:'REEDS GEBRUIKT',
          msg:out.d.ticketNumber
        });

      }else if(
        out.c==='blocked'
      ){

        setResult({
          type:'bad',
          title:'TICKET GEBLOKKEERD',
          msg:out.d.ticketNumber
        });

      }else{

        setResult({
          type:'bad',
          title:'ONGELDIG',
          msg:'Niet gevonden'
        });

      }


    }catch(error){

      console.error(error);

      setResult({
        type:'bad',
        title:'SCAN MISLUKT',
        msg:'Controleer internet en regels.'
      });

    }
  }



  async function manualGo(){

    const value=
      manual
      .trim()
      .toUpperCase();


    if(value){

      await check(

        doc(
          db,
          'rc_event_tickets',
          value
        )

      );
    }


    setManual('');
  }



  return(

    <div className="scanpage">


      <header>

        <div>

          <small>
            RAMONA & CLAUDIO
          </small>

          <h1>
            Gate Scanner
          </h1>

        </div>


        <button
          className="ghost dark"
          onClick={
            ()=>signOut(auth)
          }
        >
          Uitloggen
        </button>

      </header>



      <main className="scanmain">


        {
          result
          ?(

            <div
              className={
                `result ${result.type}`
              }
            >

              <div>

                {
                  result.type==='ok'
                    ?'✓'
                    :result.type==='warn'
                    ?'!'
                    :'×'
                }

              </div>


              <h2>
                {result.title}
              </h2>


              <p>
                {result.msg}
              </p>


              <button
                className="btn light"
                onClick={
                  ()=>setResult(null)
                }
              >
                Volgende ticket
              </button>


            </div>

          )
          :(

            <>

              <section className="scanner">


                <div id="qr-reader"></div>


                {
                  !active
                  &&
                  <div className="placeholder">

                    <h2>
                      Scan ticket
                    </h2>

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

                <h3>
                  Handmatige controle
                </h3>


                <div>

                  <input
                    value={manual}
                    onChange={
                      e=>setManual(
                        e.target.value
                      )
                    }
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

      <strong>
        {n}
      </strong>

      <span>
        {t}
      </span>

    </div>
  );
}



function Status({t}){

  return(

    <span
      className={
        `status ${
          t.blocked
            ?'blocked'
            :t.status==='used'
            ?'used'
            :'unused'
        }`
      }
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
    crypto
    .randomUUID()
    .replaceAll('-','')
    +
    crypto
    .randomUUID()
    .replaceAll('-','')
  );
}



function payload(ticket){

  return(
    `RC-EVENT|${ticket.ticketNumber}|${ticket.token}`
  );
}



function parse(value){

  const parts=
    String(value)
    .split('|');


  if(
    parts.length===3
    &&
    parts[0]==='RC-EVENT'
  ){

    return{
      ticketNumber:parts[1],
      token:parts[2]
    };
  }


  return null;
}



// ========================================
// PDF TICKET
// ========================================

const PAGE_W=210;
const PAGE_H=114.6;

let ticketTemplateCache=null;



async function getTicketTemplate(){

  if(
    ticketTemplateCache
  ){

    return ticketTemplateCache;
  }


  const response=
    await fetch(
      '/ticket-template.png'
    );


  if(
    !response.ok
  ){

    throw new Error(
      'public/ticket-template.png niet gevonden.'
    );
  }


  const blob=
    await response.blob();


  ticketTemplateCache=
    await new Promise(

      (
        resolve,
        reject
      )=>{

        const reader=
          new FileReader();


        reader.onload=
          ()=>resolve(
            reader.result
          );


        reader.onerror=
          reject;


        reader.readAsDataURL(
          blob
        );

      }

    );


  return ticketTemplateCache;
}



async function ticketPdf(ticket,settings){

  try{

    const pdf=
      new jsPDF({
        orientation:'landscape',
        unit:'mm',
        format:[
          PAGE_W,
          PAGE_H
        ]
      });


    await drawTicket(
      pdf,
      ticket,
      settings
    );


    pdf.save(
      `${ticket.ticketNumber}.pdf`
    );


  }catch(error){

    console.error(error);

    alert(
      'De ticket PDF kon niet worden gemaakt.'
    );

  }
}



async function batchPdf(tickets,settings){

  if(
    !tickets.length
  ){
    return;
  }


  try{

    const pdf=
      new jsPDF({
        orientation:'landscape',
        unit:'mm',
        format:[
          PAGE_W,
          PAGE_H
        ]
      });


    for(
      let i=0;
      i<tickets.length;
      i++
    ){

      if(i>0){

        pdf.addPage(
          [
            PAGE_W,
            PAGE_H
          ],
          'landscape'
        );

      }


      await drawTicket(
        pdf,
        tickets[i],
        settings
      );
    }


    pdf.save(
      'Ramona-Claudio-Tickets.pdf'
    );


  }catch(error){

    console.error(error);

    alert(
      'De tickets konden niet als PDF worden gemaakt.'
    );

  }
}



async function drawTicket(pdf,ticket,settings){

  const gold=[
    181,
    136,
    58
  ];


  const dark=[
    24,
    20,
    19
  ];


  const paper=[
    252,
    246,
    242
  ];


  // Template
  const background=
    await getTicketTemplate();


  pdf.addImage(
    background,
    'PNG',
    0,
    0,
    PAGE_W,
    PAGE_H
  );


  // ========================================
  // QR CODE
  // ========================================

  const qr=
    await QRCode.toDataURL(

      payload(ticket),

      {
        errorCorrectionLevel:'H',
        margin:1,
        width:800,
        color:{
          dark:'#000000',
          light:'#FFFFFF'
        }
      }

    );


  // Licht vlak achter QR
  pdf.setFillColor(
    ...paper
  );


  pdf.roundedRect(
    157.0,
    34.5,
    31.0,
    31.0,
    2,
    2,
    'F'
  );


  // Echte QR
  pdf.addImage(
    qr,
    'PNG',
    158.0,
    35.5,
    29.0,
    29.0
  );


  // ========================================
  // TICKETNUMMER
  // ========================================

  // Klein zwart vlak in het lege ticketnummergebied
  pdf.setFillColor(
    ...dark
  );


  pdf.roundedRect(
    158.0,
    91.0,
    28.5,
    8.5,
    1.8,
    1.8,
    'F'
  );


  pdf.setTextColor(
    ...gold
  );


  pdf.setFont(
    'helvetica',
    'bold'
  );


  pdf.setFontSize(
    9.5
  );


  pdf.text(
    ticket.ticketNumber,
    172.25,
    96.6,
    {
      align:'center'
    }
  );


  // ========================================
  // GASTNAAM - ALLEEN ALS INGEVULD
  // ========================================

  if(
    ticket.guestName
  ){

    pdf.setFillColor(
      ...paper
    );


    pdf.roundedRect(
      62.5,
      80.0,
      50.0,
      8.2,
      1.5,
      1.5,
      'F'
    );


    pdf.setTextColor(
      ...dark
    );


    pdf.setFont(
      'helvetica',
      'bold'
    );


    pdf.setFontSize(
      7.5
    );


    pdf.text(
      ticket.guestName,
      87.5,
      85.3,
      {
        align:'center'
      }
    );

  }

}
