import React, { useEffect, useRef, useState } from 'react';

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

import { Html5Qrcode } from 'html5-qrcode';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';

import { auth, db } from './firebase';

const EVENT = {
  id: 'ramona-claudio',
  eventName: 'Uitnodiging Ramona en Claudio',
  names: 'Ramona & Claudio',
  subtitle: '43 & 45 Celebration',
  date: 'Vrijdag 18 september 2026',
  time: 'Inloop vanaf 19.00 u',
  location: 'Lalarookh',
  dresscode: 'All Black',
  ticketPrefix: 'RC',
  maxTickets: 100
};

export default function App() {
  const [user, setUser] = useState(undefined);
  const [role, setRole] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser || null);
      setRole(null);

      if (!firebaseUser) return;

      try {
        const roleSnapshot = await getDoc(
          doc(db, 'rc_users', firebaseUser.uid)
        );

        setRole(
          roleSnapshot.exists()
            ? roleSnapshot.data().role
            : null
        );
      } catch (error) {
        console.error('Rol ophalen mislukt:', error);
        setRole(null);
      }
    });

    return unsubscribe;
  }, []);

  if (user === undefined) {
    return <Splash />;
  }

  if (!user) {
    return <Login />;
  }

  if (!role) {
    return (
      <Center>
        <h2>Geen toegang</h2>
        <p>
          Voor dit account is nog geen rol ingesteld in <code>rc_users</code>.
        </p>
        <button className="btn" onClick={() => signOut(auth)}>
          Uitloggen
        </button>
      </Center>
    );
  }

  const scannerRoute =
    window.location.pathname.toLowerCase().startsWith('/scanner');

  if (role === 'scanner' || scannerRoute) {
    return <Scanner user={user} />;
  }

  return <Admin />;
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      setError('');
      await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
    } catch (err) {
      console.error(err);
      setError(
        'Inloggen is niet gelukt. Controleer e-mailadres en wachtwoord.'
      );
    }
  }

  return (
    <div className="login">
      <form className="card" onSubmit={handleSubmit}>
        <small>RAMONA & CLAUDIO</small>
        <h1>Event Ticketing</h1>
        <p>Beheer en poortscanner</p>

        <label>E-mailadres</label>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <label>Wachtwoord</label>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        {error && <div className="alert">{error}</div>}

        <button className="btn full" type="submit">
          Inloggen
        </button>
      </form>
    </div>
  );
}

function Admin() {
  const [tickets, setTickets] = useState([]);
  const [settings, setSettings] = useState(EVENT);
  const [count, setCount] = useState(1);
  const [guestName, setGuestName] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const ticketsQuery = query(
      collection(db, 'rc_event_tickets'),
      orderBy('ticketNumber')
    );

    const unsubscribeTickets = onSnapshot(
      ticketsQuery,
      (snapshot) => {
        setTickets(
          snapshot.docs.map((ticketDoc) => ({
            id: ticketDoc.id,
            ...ticketDoc.data()
          }))
        );
      },
      (error) => {
        console.error('Tickets ophalen mislukt:', error);
      }
    );

    const unsubscribeSettings = onSnapshot(
      doc(db, 'rc_event_settings', EVENT.id),
      (snapshot) => {
        if (snapshot.exists()) {
          setSettings((current) => ({
            ...current,
            ...snapshot.data()
          }));
        }
      },
      (error) => {
        console.error('Event instellingen ophalen mislukt:', error);
      }
    );

    return () => {
      unsubscribeTickets();
      unsubscribeSettings();
    };
  }, []);

  const used = tickets.filter((ticket) => ticket.status === 'used').length;
  const blocked = tickets.filter((ticket) => ticket.blocked === true).length;
  const unused = tickets.filter(
    (ticket) => ticket.status !== 'used' && !ticket.blocked
  ).length;

  async function generateTickets() {
    try {
      setMessage('');

      const quantity = Math.max(
        1,
        Math.min(Number(count) || 1, 200)
      );

      const maximum = Number(
        settings.maxTickets || EVENT.maxTickets
      );

      if (tickets.length + quantity > maximum) {
        setMessage(`Je kunt maximaal ${maximum} tickets hebben.`);
        return;
      }

      const existingNumbers = new Set(
        tickets.map((ticket) => ticket.ticketNumber)
      );

      let generated = 0;
      let sequence = 1;

      while (generated < quantity) {
        const ticketNumber =
          `${settings.ticketPrefix || EVENT.ticketPrefix}-${String(sequence).padStart(4, '0')}`;

        sequence += 1;

        if (existingNumbers.has(ticketNumber)) {
          continue;
        }

        await setDoc(
          doc(db, 'rc_event_tickets', ticketNumber),
          {
            ticketNumber,
            token: createSecureToken(),
            status: 'unused',
            blocked: false,
            scannedAt: null,
            scannedBy: null,
            createdAt: serverTimestamp(),
            guestName:
              quantity === 1
                ? guestName.trim()
                : '',
            eventId: EVENT.id,
            ticketType: 'standard'
          }
        );

        existingNumbers.add(ticketNumber);
        generated += 1;
      }

      setGuestName('');
      setMessage(
        `${quantity} ticket${quantity === 1 ? '' : 's'} succesvol gegenereerd.`
      );
    } catch (error) {
      console.error(error);
      setMessage('Tickets konden niet worden gegenereerd.');
    }
  }

  async function removeTicket(ticket) {
    const confirmed = window.confirm(
      `${ticket.ticketNumber} verwijderen?`
    );

    if (!confirmed) return;

    try {
      await deleteDoc(
        doc(db, 'rc_event_tickets', ticket.id)
      );
    } catch (error) {
      console.error(error);
      window.alert('Ticket kon niet worden verwijderd.');
    }
  }

  async function toggleBlock(ticket) {
    try {
      await updateDoc(
        doc(db, 'rc_event_tickets', ticket.id),
        {
          blocked: !ticket.blocked
        }
      );
    } catch (error) {
      console.error(error);
      window.alert('Ticketstatus kon niet worden aangepast.');
    }
  }

  return (
    <div className="shell">
      <header>
        <div>
          <small>UITNODIGING</small>
          <h1>{settings.names || EVENT.names}</h1>
        </div>

        <button
          className="ghost"
          onClick={() => signOut(auth)}
        >
          Uitloggen
        </button>
      </header>

      <main>
        <section className="hero">
          <div>
            <b>{settings.subtitle || EVENT.subtitle}</b>
            <h2>{settings.eventName || EVENT.eventName}</h2>

            <p>
              {settings.date || EVENT.date}
              {' · '}
              {settings.time || EVENT.time}
            </p>

            <p>
              {settings.location || EVENT.location}
              {' · '}
              Dresscode: {settings.dresscode || EVENT.dresscode}
            </p>
          </div>

          <span>ONE-TIME ENTRY</span>
        </section>

        <section className="stats">
          <Stat number={tickets.length} title="Totaal" />
          <Stat number={unused} title="Nog niet gescand" />
          <Stat number={used} title="Binnen" />
          <Stat number={blocked} title="Geblokkeerd" />
        </section>

        <section className="panel">
          <h3>Tickets genereren</h3>

          <div className="formrow">
            <div>
              <label>Aantal</label>
              <input
                type="number"
                min="1"
                max="200"
                value={count}
                onChange={(event) => setCount(event.target.value)}
              />
            </div>

            <div>
              <label>Naam (optioneel bij 1 ticket)</label>
              <input
                value={guestName}
                onChange={(event) => setGuestName(event.target.value)}
                placeholder="Bijv. Familie Jansen"
              />
            </div>

            <button
              className="btn"
              onClick={generateTickets}
            >
              Genereer
            </button>

            <button
              className="btn soft"
              onClick={() =>
                batchPdf(
                  tickets.filter((ticket) => !ticket.blocked),
                  settings
                )
              }
            >
              Alle PDF's
            </button>
          </div>

          {message && <div className="alert">{message}</div>}
        </section>

        <section className="panel">
          <div className="titleline">
            <div>
              <h3>Tickets</h3>
              <p>Limiet: {settings.maxTickets || EVENT.maxTickets}</p>
            </div>

            <a className="btn" href="/scanner">
              Open scanner
            </a>
          </div>

          <div className="table">
            {tickets.map((ticket) => (
              <div className="row" key={ticket.id}>
                <strong>{ticket.ticketNumber}</strong>

                <TicketStatus ticket={ticket} />

                <span>{ticket.guestName || '—'}</span>

                <div className="actions">
                  <button
                    onClick={() =>
                      ticketPdf(ticket, settings)
                    }
                  >
                    PDF
                  </button>

                  <button
                    onClick={() =>
                      toggleBlock(ticket)
                    }
                  >
                    {ticket.blocked ? 'Deblokkeer' : 'Blokkeer'}
                  </button>

                  <button
                    className="danger"
                    onClick={() =>
                      removeTicket(ticket)
                    }
                  >
                    Verwijder
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function Scanner({ user }) {
  const [result, setResult] = useState(null);
  const [manualTicket, setManualTicket] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const scannerRef = useRef(null);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  async function startCamera() {
    setResult(null);

    try {
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      setCameraActive(true);

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: {
            width: 260,
            height: 260
          }
        },
        async (decodedText) => {
          await stopCamera();
          await processQr(decodedText);
        },
        () => {}
      );
    } catch (error) {
      console.error(error);
      setCameraActive(false);

      setResult({
        type: 'bad',
        title: 'Camera niet beschikbaar',
        message: 'Controleer camera-toestemming.'
      });
    }
  }

  async function stopCamera() {
    if (!scannerRef.current) {
      return;
    }

    try {
      if (scannerRef.current.isScanning) {
        await scannerRef.current.stop();
      }

      await scannerRef.current.clear();
    } catch {}

    scannerRef.current = null;
    setCameraActive(false);
  }

  async function processQr(raw) {
    const parsed = parseTicketPayload(raw);

    if (!parsed) {
      setResult({
        type: 'bad',
        title: 'ONGELDIGE QR',
        message: 'Deze QR hoort niet bij dit event.'
      });

      return;
    }

    try {
      const snapshot = await getDocs(
        query(
          collection(db, 'rc_event_tickets'),
          where('token', '==', parsed.token),
          limit(1)
        )
      );

      if (snapshot.empty) {
        setResult({
          type: 'bad',
          title: 'ONGELDIG',
          message: 'Ticket niet gevonden.'
        });

        return;
      }

      await validateTicket(
        snapshot.docs[0].ref
      );
    } catch (error) {
      console.error(error);

      setResult({
        type: 'bad',
        title: 'SCAN MISLUKT',
        message: 'Ticket kon niet worden gecontroleerd.'
      });
    }
  }

  async function validateTicket(ticketRef) {
    try {
      const outcome = await runTransaction(
        db,
        async (transaction) => {
          const snapshot = await transaction.get(ticketRef);

          if (!snapshot.exists()) {
            return {
              code: 'invalid'
            };
          }

          const data = snapshot.data();

          if (data.blocked) {
            return {
              code: 'blocked',
              data
            };
          }

          if (data.status === 'used') {
            return {
              code: 'used',
              data
            };
          }

          transaction.update(
            ticketRef,
            {
              status: 'used',
              scannedAt: serverTimestamp(),
              scannedBy: user.uid
            }
          );

          const scanRef = doc(
            collection(
              db,
              'rc_event_scans'
            )
          );

          transaction.set(
            scanRef,
            {
              ticketNumber: data.ticketNumber,
              ticketId: ticketRef.id,
              scannerId: user.uid,
              scannedAt: serverTimestamp(),
              result: 'accepted'
            }
          );

          return {
            code: 'accepted',
            data
          };
        }
      );

      if (outcome.code === 'accepted') {
        setResult({
          type: 'ok',
          title: 'TOEGANG GOEDGEKEURD',
          message: outcome.data.ticketNumber
        });
      } else if (outcome.code === 'used') {
        setResult({
          type: 'warn',
          title: 'REEDS GEBRUIKT',
          message: outcome.data.ticketNumber
        });
      } else if (outcome.code === 'blocked') {
        setResult({
          type: 'bad',
          title: 'TICKET GEBLOKKEERD',
          message: outcome.data.ticketNumber
        });
      } else {
        setResult({
          type: 'bad',
          title: 'ONGELDIG',
          message: 'Ticket niet gevonden.'
        });
      }
    } catch (error) {
      console.error(error);

      setResult({
        type: 'bad',
        title: 'SCAN MISLUKT',
        message: 'Controleer internetverbinding en Firebase.'
      });
    }
  }

  async function manualCheck() {
    const ticketNumber =
      manualTicket
        .trim()
        .toUpperCase();

    if (!ticketNumber) {
      return;
    }

    await validateTicket(
      doc(
        db,
        'rc_event_tickets',
        ticketNumber
      )
    );

    setManualTicket('');
  }

  return (
    <div className="scanpage">
      <header>
        <div>
          <small>RAMONA & CLAUDIO</small>
          <h1>Gate Scanner</h1>
        </div>

        <button
          className="ghost dark"
          onClick={() => signOut(auth)}
        >
          Uitloggen
        </button>
      </header>

      <main className="scanmain">
        {result ? (
          <div className={`result ${result.type}`}>
            <div>
              {
                result.type === 'ok'
                  ? '✓'
                  : result.type === 'warn'
                  ? '!'
                  : '×'
              }
            </div>

            <h2>{result.title}</h2>
            <p>{result.message}</p>

            <button
              className="btn light"
              onClick={() =>
                setResult(null)
              }
            >
              Volgende ticket
            </button>
          </div>
        ) : (
          <>
            <section className="scanner">
              <div id="qr-reader" />

              {!cameraActive && (
                <div className="placeholder">
                  <h2>Scan ticket</h2>

                  <p>
                    Open de camera en richt op de QR-code.
                  </p>

                  <button
                    className="btn"
                    onClick={startCamera}
                  >
                    Camera openen
                  </button>
                </div>
              )}
            </section>

            <section className="manual">
              <h3>Handmatige controle</h3>

              <div>
                <input
                  value={manualTicket}
                  onChange={(event) =>
                    setManualTicket(
                      event.target.value
                    )
                  }
                  placeholder="RC-0001"
                />

                <button
                  className="btn"
                  onClick={manualCheck}
                >
                  Controleer
                </button>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ number, title }) {
  return (
    <div className="stat">
      <strong>{number}</strong>
      <span>{title}</span>
    </div>
  );
}

function TicketStatus({ ticket }) {
  let statusClass = 'unused';
  let text = 'Ongebruikt';

  if (ticket.blocked) {
    statusClass = 'blocked';
    text = 'Geblokkeerd';
  } else if (ticket.status === 'used') {
    statusClass = 'used';
    text = 'Binnen';
  }

  return (
    <span
      className={`status ${statusClass}`}
    >
      {text}
    </span>
  );
}

function Splash() {
  return (
    <div className="center">
      Laden...
    </div>
  );
}

function Center({ children }) {
  return (
    <div className="center">
      <div className="panel">
        {children}
      </div>
    </div>
  );
}

function createSecureToken() {
  return (
    crypto.randomUUID().replaceAll('-', '')
    +
    crypto.randomUUID().replaceAll('-', '')
  );
}

function createTicketPayload(ticket) {
  return (
    `RC-EVENT|${ticket.ticketNumber}|${ticket.token}`
  );
}

function parseTicketPayload(value) {
  const parts =
    String(value)
      .split('|');

  if (
    parts.length === 3
    &&
    parts[0] === 'RC-EVENT'
  ) {
    return {
      ticketNumber: parts[1],
      token: parts[2]
    };
  }

  return null;
}


// ======================================================
// PDF TEMPLATE BACKGROUND
// ======================================================

const PDF_W = 210;
const PDF_H = 98.82;

let templateCache = null;

async function loadTicketTemplate() {
  if (templateCache) {
    return templateCache;
  }

  const response = await fetch(
    '/ticket-template.png',
    {
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    throw new Error(
      'public/ticket-template.png kon niet worden gevonden.'
    );
  }

  const blob =
    await response.blob();

  templateCache =
    await blobToDataUrl(
      blob
    );

  return templateCache;
}

function blobToDataUrl(blob) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      const reader =
        new FileReader();

      reader.onload =
        () =>
          resolve(
            reader.result
          );

      reader.onerror =
        reject;

      reader.readAsDataURL(
        blob
      );
    }
  );
}

async function ticketPdf(
  ticket,
  settings
) {
  try {
    const pdf =
      new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [
          PDF_W,
          PDF_H
        ]
      });

    await drawTemplateTicket(
      pdf,
      ticket,
      settings
    );

    pdf.save(
      `${ticket.ticketNumber}.pdf`
    );
  } catch (error) {
    console.error(error);

    window.alert(
      'De ticket PDF kon niet worden gemaakt. Controleer public/ticket-template.png.'
    );
  }
}

async function batchPdf(
  tickets,
  settings
) {
  if (!tickets.length) {
    return;
  }

  try {
    const pdf =
      new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [
          PDF_W,
          PDF_H
        ]
      });

    for (
      let i = 0;
      i < tickets.length;
      i += 1
    ) {
      if (i > 0) {
        pdf.addPage(
          [
            PDF_W,
            PDF_H
          ],
          'landscape'
        );
      }

      await drawTemplateTicket(
        pdf,
        tickets[i],
        settings
      );
    }

    pdf.save(
      'Ramona-Claudio-Tickets.pdf'
    );
  } catch (error) {
    console.error(error);

    window.alert(
      'De tickets konden niet als PDF worden gemaakt.'
    );
  }
}

async function drawTemplateTicket(
  pdf,
  ticket,
  settings
) {
  const template =
    await loadTicketTemplate();

  // Full luxury background
  pdf.addImage(
    template,
    'PNG',
    0,
    0,
    PDF_W,
    PDF_H,
    undefined,
    'FAST'
  );

  // ====================================================
  // QR CODE
  // ====================================================

  const qr =
    await QRCode.toDataURL(
      createTicketPayload(
        ticket
      ),
      {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 1000,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      }
    );

  const qrX = 164.0;
  const qrY = 23.4;
  const qrSize = 29.8;

  pdf.setFillColor(
    255,
    255,
    255
  );

  pdf.setDrawColor(
    179,
    133,
    48
  );

  pdf.setLineWidth(
    0.55
  );

  pdf.roundedRect(
    qrX - 1.7,
    qrY - 1.7,
    qrSize + 3.4,
    qrSize + 3.4,
    2,
    2,
    'FD'
  );

  pdf.addImage(
    qr,
    'PNG',
    qrX,
    qrY,
    qrSize,
    qrSize
  );

  // ====================================================
  // TICKET NUMBER
  // ====================================================

  const ticketBoxX = 161.8;
  const ticketBoxY = 70.2;
  const ticketBoxW = 35.0;
  const ticketBoxH = 14.5;

  pdf.setFillColor(
    20,
    18,
    17
  );

  pdf.roundedRect(
    ticketBoxX,
    ticketBoxY,
    ticketBoxW,
    ticketBoxH,
    2,
    2,
    'F'
  );

  pdf.setDrawColor(
    183,
    137,
    55
  );

  pdf.setLineWidth(
    0.55
  );

  pdf.roundedRect(
    ticketBoxX + 1,
    ticketBoxY + 1,
    ticketBoxW - 2,
    ticketBoxH - 2,
    1.5,
    1.5
  );

  pdf.setTextColor(
    229,
    197,
    124
  );

  pdf.setFont(
    'times',
    'bold'
  );

  pdf.setFontSize(
    5.6
  );

  pdf.text(
    'TICKET NO.',
    ticketBoxX
      +
      ticketBoxW / 2,
    ticketBoxY
      +
      5.2,
    {
      align: 'center'
    }
  );

  pdf.setFontSize(
    11.5
  );

  pdf.text(
    ticket.ticketNumber,
    ticketBoxX
      +
      ticketBoxW / 2,
    ticketBoxY
      +
      11.3,
    {
      align: 'center'
    }
  );

  // ====================================================
  // GUEST NAME - SAME BLACK & GOLD LOOK
  // ====================================================

  if (
    ticket.guestName
  ) {
    const guestBoxX = 67;
    const guestBoxY = 81.2;
    const guestBoxW = 56;
    const guestBoxH = 8.6;

    // black plaque
    pdf.setFillColor(
      20,
      18,
      17
    );

    pdf.roundedRect(
      guestBoxX,
      guestBoxY,
      guestBoxW,
      guestBoxH,
      1.6,
      1.6,
      'F'
    );

    // gold border
    pdf.setDrawColor(
      183,
      137,
      55
    );

    pdf.setLineWidth(
      0.45
    );

    pdf.roundedRect(
      guestBoxX + 0.8,
      guestBoxY + 0.8,
      guestBoxW - 1.6,
      guestBoxH - 1.6,
      1.2,
      1.2
    );

    // gold guest name
    pdf.setTextColor(
      229,
      197,
      124
    );

    pdf.setFont(
      'times',
      'bold'
    );

    pdf.setFontSize(
      8.5
    );

    pdf.text(
      ticket.guestName,
      guestBoxX
        +
        guestBoxW / 2,
      guestBoxY
        +
        5.6,
      {
        align: 'center'
      }
    );
  }
}
