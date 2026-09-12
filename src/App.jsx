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
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser || null);
      setRole(null);

      if (!firebaseUser) return;

      const roleSnap = await getDoc(doc(db, 'rc_users', firebaseUser.uid));
      setRole(roleSnap.exists() ? roleSnap.data().role : null);
    });

    return unsub;
  }, []);

  if (user === undefined) return <Splash />;
  if (!user) return <Login />;

  if (!role) {
    return (
      <Center>
        <h2>Geen toegang</h2>
        <p>Voor dit account is nog geen rol ingesteld in <code>rc_users</code>.</p>
        <button className="btn" onClick={() => signOut(auth)}>Uitloggen</button>
      </Center>
    );
  }

  const scannerRoute = window.location.pathname.toLowerCase().startsWith('/scanner');

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
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      console.error(err);
      setError('Inloggen is niet gelukt.');
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

        <button className="btn full" type="submit">Inloggen</button>
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
    const ticketsUnsub = onSnapshot(
      query(collection(db, 'rc_event_tickets'), orderBy('ticketNumber')),
      (snapshot) => {
        setTickets(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      }
    );

    const settingsUnsub = onSnapshot(
      doc(db, 'rc_event_settings', EVENT.id),
      (snapshot) => {
        if (snapshot.exists()) {
          setSettings((current) => ({ ...current, ...snapshot.data() }));
        }
      }
    );

    return () => {
      ticketsUnsub();
      settingsUnsub();
    };
  }, []);

  const used = tickets.filter((t) => t.status === 'used').length;
  const blocked = tickets.filter((t) => t.blocked === true).length;
  const unused = tickets.filter((t) => t.status !== 'used' && !t.blocked).length;

  async function generateTickets() {
    try {
      setMessage('');

      const quantity = Math.max(1, Math.min(Number(count) || 1, 50));
      const maximum = Number(settings.maxTickets || EVENT.maxTickets);

      if (tickets.length + quantity > maximum) {
        setMessage(`Je kunt maximaal ${maximum} tickets hebben.`);
        return;
      }

      const existing = new Set(tickets.map((t) => t.ticketNumber));
      let made = 0;
      let sequence = 1;

      while (made < quantity) {
        const ticketNumber =
          `${settings.ticketPrefix || EVENT.ticketPrefix}-${String(sequence).padStart(4, '0')}`;

        sequence += 1;

        if (existing.has(ticketNumber)) continue;

        await setDoc(doc(db, 'rc_event_tickets', ticketNumber), {
          ticketNumber,
          token: createSecureToken(),
          status: 'unused',
          blocked: false,
          scannedAt: null,
          scannedBy: null,
          createdAt: serverTimestamp(),
          guestName: quantity === 1 ? guestName.trim() : '',
          eventId: EVENT.id,
          ticketType: 'standard'
        });

        existing.add(ticketNumber);
        made += 1;
      }

      setGuestName('');
      setMessage(`${quantity} ticket${quantity === 1 ? '' : 's'} succesvol gegenereerd.`);
    } catch (err) {
      console.error(err);
      setMessage('Tickets konden niet worden gegenereerd.');
    }
  }

  async function removeTicket(ticket) {
    if (!window.confirm(`${ticket.ticketNumber} verwijderen?`)) return;

    await deleteDoc(doc(db, 'rc_event_tickets', ticket.id));
  }

  async function toggleBlock(ticket) {
    await updateDoc(doc(db, 'rc_event_tickets', ticket.id), {
      blocked: !ticket.blocked
    });
  }

  return (
    <div className="shell">
      <header>
        <div>
          <small>UITNODIGING</small>
          <h1>{settings.names || EVENT.names}</h1>
        </div>

        <button className="ghost" onClick={() => signOut(auth)}>Uitloggen</button>
      </header>

      <main>
        <section className="hero">
          <div>
            <b>{settings.subtitle || EVENT.subtitle}</b>
            <h2>{settings.eventName || EVENT.eventName}</h2>
            <p>{settings.date || EVENT.date} · {settings.time || EVENT.time}</p>
            <p>{settings.location || EVENT.location} · Dresscode: {settings.dresscode || EVENT.dresscode}</p>
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
                max="50"
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

            <button className="btn" onClick={generateTickets}>Genereer</button>

            <button
              className="btn soft"
              onClick={() => batchPdf(tickets.filter((t) => !t.blocked), settings)}
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

            <a className="btn" href="/scanner">Open scanner</a>
          </div>

          <div className="table">
            {tickets.map((ticket) => (
              <div className="row" key={ticket.id}>
                <strong>{ticket.ticketNumber}</strong>
                <TicketStatus ticket={ticket} />
                <span>{ticket.guestName || '—'}</span>

                <div className="actions">
                  <button onClick={() => ticketPdf(ticket, settings)}>PDF</button>

                  <button onClick={() => toggleBlock(ticket)}>
                    {ticket.blocked ? 'Deblokkeer' : 'Blokkeer'}
                  </button>

                  <button className="danger" onClick={() => removeTicket(ticket)}>
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
          qrbox: { width: 260, height: 260 }
        },
        async (decodedText) => {
          await stopCamera();
          await processQr(decodedText);
        },
        () => {}
      );
    } catch (err) {
      console.error(err);
      setCameraActive(false);
      setResult({
        type: 'bad',
        title: 'Camera niet beschikbaar',
        message: 'Controleer camera-toestemming.'
      });
    }
  }

  async function stopCamera() {
    if (!scannerRef.current) return;

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

    await validateTicket(snapshot.docs[0].ref);
  }

  async function validateTicket(ticketRef) {
    try {
      const outcome = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(ticketRef);

        if (!snapshot.exists()) {
          return { code: 'invalid' };
        }

        const data = snapshot.data();

        if (data.blocked) {
          return { code: 'blocked', data };
        }

        if (data.status === 'used') {
          return { code: 'used', data };
        }

        transaction.update(ticketRef, {
          status: 'used',
          scannedAt: serverTimestamp(),
          scannedBy: user.uid
        });

        transaction.set(doc(collection(db, 'rc_event_scans')), {
          ticketNumber: data.ticketNumber,
          ticketId: ticketRef.id,
          scannerId: user.uid,
          scannedAt: serverTimestamp(),
          result: 'accepted'
        });

        return { code: 'accepted', data };
      });

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
    } catch (err) {
      console.error(err);
      setResult({
        type: 'bad',
        title: 'SCAN MISLUKT',
        message: 'Controleer internetverbinding en Firebase.'
      });
    }
  }

  async function manualCheck() {
    const ticketNumber = manualTicket.trim().toUpperCase();

    if (!ticketNumber) return;

    await validateTicket(doc(db, 'rc_event_tickets', ticketNumber));
    setManualTicket('');
  }

  return (
    <div className="scanpage">
      <header>
        <div>
          <small>RAMONA & CLAUDIO</small>
          <h1>Gate Scanner</h1>
        </div>

        <button className="ghost dark" onClick={() => signOut(auth)}>Uitloggen</button>
      </header>

      <main className="scanmain">
        {result ? (
          <div className={`result ${result.type}`}>
            <div>{result.type === 'ok' ? '✓' : result.type === 'warn' ? '!' : '×'}</div>
            <h2>{result.title}</h2>
            <p>{result.message}</p>

            <button className="btn light" onClick={() => setResult(null)}>
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
                  <p>Open de camera en richt op de QR-code.</p>
                  <button className="btn" onClick={startCamera}>Camera openen</button>
                </div>
              )}
            </section>

            <section className="manual">
              <h3>Handmatige controle</h3>

              <div>
                <input
                  value={manualTicket}
                  onChange={(event) => setManualTicket(event.target.value)}
                  placeholder="RC-0001"
                />

                <button className="btn" onClick={manualCheck}>Controleer</button>
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

  return <span className={`status ${statusClass}`}>{text}</span>;
}

function Splash() {
  return <div className="center">Laden...</div>;
}

function Center({ children }) {
  return (
    <div className="center">
      <div className="panel">{children}</div>
    </div>
  );
}

function createSecureToken() {
  return (
    crypto.randomUUID().replaceAll('-', '') +
    crypto.randomUUID().replaceAll('-', '')
  );
}

function createTicketPayload(ticket) {
  return `RC-EVENT|${ticket.ticketNumber}|${ticket.token}`;
}

function parseTicketPayload(value) {
  const parts = String(value).split('|');

  if (parts.length === 3 && parts[0] === 'RC-EVENT') {
    return {
      ticketNumber: parts[1],
      token: parts[2]
    };
  }

  return null;
}


// ======================================================
// PDF - LUXURY RAMONA & CLAUDIO TICKET
// ======================================================

const PDF_W = 210;
const PDF_H = 99;

async function ticketPdf(ticket, settings) {
  try {
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [PDF_W, PDF_H]
    });

    await drawTicket(pdf, ticket, settings);
    pdf.save(`${ticket.ticketNumber}.pdf`);
  } catch (err) {
    console.error(err);
    alert('De ticket PDF kon niet worden gemaakt.');
  }
}

async function batchPdf(tickets, settings) {
  if (!tickets.length) return;

  try {
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [PDF_W, PDF_H]
    });

    for (let i = 0; i < tickets.length; i += 1) {
      if (i > 0) {
        pdf.addPage([PDF_W, PDF_H], 'landscape');
      }

      await drawTicket(pdf, tickets[i], settings);
    }

    pdf.save('Ramona-Claudio-Tickets.pdf');
  } catch (err) {
    console.error(err);
    alert('De tickets konden niet worden gemaakt.');
  }
}

async function drawTicket(pdf, ticket, settings) {
  const blush = [249, 232, 228];
  const blushLight = [255, 248, 245];
  const rose = [180, 111, 101];
  const gold = [183, 137, 55];
  const goldLight = [230, 198, 125];
  const black = [22, 18, 17];
  const text = [48, 37, 32];

  pdf.setFillColor(...blushLight);
  pdf.rect(0, 0, PDF_W, PDF_H, 'F');

  pdf.setFillColor(...blush);
  pdf.roundedRect(3, 4, 202, 90, 3, 3, 'F');

  pdf.setFillColor(...black);
  pdf.triangle(3, 4, 45, 4, 3, 30, 'F');
  pdf.triangle(3, 94, 53, 94, 3, 70, 'F');
  pdf.triangle(205, 94, 183, 94, 205, 72, 'F');

  pdf.setDrawColor(...gold);
  pdf.setLineWidth(0.5);
  pdf.roundedRect(6, 7, 196, 84, 2, 2);

  pdf.setDrawColor(...goldLight);
  pdf.setLineWidth(0.2);
  pdf.roundedRect(8, 9, 192, 80, 1.5, 1.5);

  const dividerX = 153;

  pdf.setDrawColor(65, 55, 50);
  pdf.setLineDashPattern([1.5, 1.5], 0);
  pdf.line(dividerX, 5, dividerX, 92);
  pdf.setLineDashPattern([], 0);

  drawFlower(pdf, 17, 80, 10, rose, gold);
  drawFlower(pdf, 29, 86, 7, [236, 190, 184], gold);
  drawFlower(pdf, 143, 82, 8, rose, gold);

  drawSpark(pdf, 14, 15, gold);
  drawSpark(pdf, 25, 11, gold);
  drawSpark(pdf, 145, 18, gold);

  pdf.setTextColor(...gold);
  pdf.setFont('times', 'italic');
  pdf.setFontSize(24);
  pdf.text('Uitnodiging', 100, 21, { align: 'center' });

  pdf.setFillColor(...black);
  pdf.roundedRect(62, 27, 77, 14, 2, 2, 'F');

  pdf.setDrawColor(...gold);
  pdf.roundedRect(63, 28, 75, 12, 1.4, 1.4);

  pdf.setTextColor(...goldLight);
  pdf.setFont('times', 'bold');
  pdf.setFontSize(14);
  pdf.text(settings.names || EVENT.names, 100.5, 36.5, { align: 'center' });

  pdf.setTextColor(...text);
  pdf.setFont('times', 'italic');
  pdf.setFontSize(13);
  pdf.text('43 & 45 Celebration', 100, 49, { align: 'center' });

  drawDetail(pdf, 68, 58, 'DATUM', 'Vrijdag 18 September 2026', gold, text);
  drawDetail(pdf, 68, 65, 'TIJD', 'Inloop vanaf 19.00 u', gold, text);
  drawDetail(pdf, 68, 72, 'LOCATIE', settings.location || EVENT.location, gold, text);
  drawDetail(pdf, 68, 79, 'DRESSCODE', settings.dresscode || EVENT.dresscode, gold, text);

  if (ticket.guestName) {
    pdf.setTextColor(...text);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.text(ticket.guestName, 104, 85, { align: 'center' });
  }

  pdf.setFillColor(251, 232, 227);
  pdf.roundedRect(157, 9, 42, 79, 2, 2, 'F');

  pdf.setDrawColor(...gold);
  pdf.roundedRect(158.5, 10.5, 39, 76, 1.5, 1.5);

  pdf.setTextColor(...text);
  pdf.setFont('times', 'bold');
  pdf.setFontSize(8);
  pdf.text('SCAN FOR ENTRY', 178, 18, { align: 'center' });

  const qr = await QRCode.toDataURL(
    createTicketPayload(ticket),
    {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 900,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    }
  );

  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(...gold);
  pdf.setLineWidth(0.6);
  pdf.roundedRect(162.5, 23, 31, 31, 2, 2, 'FD');

  pdf.addImage(qr, 'PNG', 164.5, 25, 27, 27);

  pdf.setTextColor(...text);
  pdf.setFont('times', 'bold');
  pdf.setFontSize(7);
  pdf.text('ONE-TIME ENTRY', 178, 62, { align: 'center' });

  pdf.setFillColor(...black);
  pdf.roundedRect(162, 69, 32, 17, 2, 2, 'F');

  pdf.setDrawColor(...gold);
  pdf.roundedRect(163, 70, 30, 15, 1.5, 1.5);

  pdf.setTextColor(...goldLight);
  pdf.setFont('times', 'bold');
  pdf.setFontSize(5.5);
  pdf.text('TICKET NO.', 178, 76, { align: 'center' });

  pdf.setFontSize(12);
  pdf.text(ticket.ticketNumber, 178, 83, { align: 'center' });
}

function drawDetail(pdf, x, y, label, value, gold, text) {
  pdf.setTextColor(...gold);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(5.5);
  pdf.text(label, x, y);

  pdf.setTextColor(...text);
  pdf.setFont('times', 'normal');
  pdf.setFontSize(7);
  pdf.text(value, x + 15, y);
}

function drawSpark(pdf, x, y, gold) {
  pdf.setDrawColor(...gold);
  pdf.line(x - 2, y, x + 2, y);
  pdf.line(x, y - 2, x, y + 2);
  pdf.circle(x, y, 0.5);
}

function drawFlower(pdf, x, y, radius, rose, gold) {
  pdf.setFillColor(...rose);

  for (let i = 0; i < 8; i += 1) {
    const angle = ((Math.PI * 2) / 8) * i;
    const px = x + Math.cos(angle) * radius * 0.42;
    const py = y + Math.sin(angle) * radius * 0.42;

    pdf.ellipse(
      px,
      py,
      radius * 0.34,
      radius * 0.18,
      'F'
    );
  }

  pdf.setFillColor(...gold);
  pdf.circle(x, y, radius * 0.16, 'F');
}
