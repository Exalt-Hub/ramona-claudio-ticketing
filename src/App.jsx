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
  where,
  writeBatch
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
  maxTickets: 200
};


// ======================================================
// APP
// ======================================================

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

  if (user === undefined) return <Splash />;
  if (!user) return <Login />;

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


// ======================================================
// LOGIN
// ======================================================

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


// ======================================================
// ADMIN
// ======================================================

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

  const used = tickets.filter((ticket) => ['used', 'Binnen'].includes(ticket.status)).length;
  const blocked = tickets.filter((ticket) => ticket.blocked === true).length;
  const unused = tickets.filter(
    (ticket) => !['used', 'Binnen'].includes(ticket.status) && !ticket.blocked
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

        if (existingNumbers.has(ticketNumber)) continue;

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
            guestName: guestName.trim(),
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


  async function deleteAllTickets() {
    if (!tickets.length) {
      window.alert('Er zijn geen tickets om te verwijderen.');
      return;
    }

    const confirmed = window.confirm(
      `Weet je zeker dat je ALLE ${tickets.length} tickets wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`
    );

    if (!confirmed) {
      return;
    }

    const secondConfirm = window.confirm(
      'Laatste controle: echt alle tickets verwijderen?'
    );

    if (!secondConfirm) {
      return;
    }

    try {
      const batch = writeBatch(db);

      tickets.forEach((ticket) => {
        batch.delete(
          doc(
            db,
            'rc_event_tickets',
            ticket.id
          )
        );
      });

      await batch.commit();

      setMessage(
        `${tickets.length} tickets zijn verwijderd.`
      );
    } catch (error) {
      console.error(error);

      window.alert(
        'Niet alle tickets konden worden verwijderd.'
      );
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

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                className="btn danger"
                onClick={deleteAllTickets}
                style={{
                  background: '#8f2424',
                  color: '#fff'
                }}
              >
                Verwijder alle tickets
              </button>

              <a className="btn" href="/scanner">
                Open scanner
              </a>
            </div>
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
                      ticketJpeg(ticket, settings)
                    }
                  >
                    JPEG
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


// ======================================================
// SCANNER
// ======================================================

function Scanner({ user }) {
  const [result, setResult] = useState(null);
  const [manualTicket, setManualTicket] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraMessage, setCameraMessage] = useState('');
  const scannerRef = useRef(null);
  const processingRef = useRef(false);
  const lastScanRef = useRef({
    text: '',
    time: 0
  });

  // Externe HID-scanner (Eyoyo EY-H2)
  const hidBufferRef = useRef('');
  const hidTimerRef = useRef(null);
  const hidBusyRef = useRef(false);
  const hidLastKeyTimeRef = useRef(0);
  const [hidStatus, setHidStatus] = useState('Klaar om te scannen');
  const [hidLastScan, setHidLastScan] = useState('');
  const [scanLight, setScanLight] = useState('idle');

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  useEffect(() => {
    if (!result) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setResult(null);
    }, 2200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [result]);

  useEffect(() => {
    if (scanLight === 'idle') {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setScanLight('idle');
    }, 2200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [scanLight]);

  // ------------------------------------------------------
  // EYOYO EY-H2 / EXTERNE HID SCANNER
  // ------------------------------------------------------
  useEffect(() => {
    async function processHidValue(rawValue) {
      const value = String(rawValue || '')
        .replace(/[\r\n\t]/g, '')
        .trim();

      if (!value || hidBusyRef.current) {
        return;
      }

      const upper = value.toUpperCase();
      const isFullQr = upper.startsWith('RC-EVENT|');
      const isTicketOnly = /^RC-\d{4,}$/.test(upper);

      // Alleen tickets van dit systeem verwerken.
      if (!isFullQr && !isTicketOnly) {
        setHidStatus('Klaar om te scannen');
        return;
      }

      hidBusyRef.current = true;
      setHidStatus('Ticket controleren...');

      setHidLastScan(
        isFullQr
          ? upper.split('|')[1] || 'QR-ticket'
          : upper
      );

      try {
        if (isFullQr) {
          await processQr(value);
        } else {
          const ticketRef = doc(
            db,
            'rc_event_tickets',
            upper
          );

          const directSnapshot = await getDoc(ticketRef);

          if (directSnapshot.exists()) {
            await validateTicket(ticketRef);
          } else {
            const snapshot = await getDocs(
              query(
                collection(db, 'rc_event_tickets'),
                where('ticketNumber', '==', upper),
                limit(1)
              )
            );

            if (snapshot.empty) {
              setResult({
                type: 'bad',
                title: 'TICKET NIET GEVONDEN',
                message: upper
              });
            } else {
              await validateTicket(snapshot.docs[0].ref);
            }
          }
        }
      } catch (error) {
        console.error('Eyoyo scan fout:', error);

        setResult({
          type: 'bad',
          title: 'EYOYO SCAN MISLUKT',
          message: 'Probeer het ticket opnieuw te scannen.'
        });
      } finally {
        setHidStatus('Klaar om te scannen');

        window.setTimeout(() => {
          hidBusyRef.current = false;
        }, 450);
      }
    }

    function flushHidBuffer() {
      if (hidTimerRef.current) {
        window.clearTimeout(hidTimerRef.current);
        hidTimerRef.current = null;
      }

      const value = hidBufferRef.current;
      hidBufferRef.current = '';

      if (value) {
        processHidValue(value);
      }
    }

    function handleHidKeyDown(event) {
      if (
        event.ctrlKey
        || event.altKey
        || event.metaKey
      ) {
        return;
      }

      const now = Date.now();

      if (now - hidLastKeyTimeRef.current > 500) {
        hidBufferRef.current = '';
      }

      hidLastKeyTimeRef.current = now;

      if (
        event.key === 'Enter'
        || event.key === 'Tab'
      ) {
        const candidate = hidBufferRef.current
          .replace(/[\r\n\t]/g, '')
          .trim()
          .toUpperCase();

        if (
          candidate.startsWith('RC-EVENT|')
          || /^RC-\d{4,}$/.test(candidate)
        ) {
          event.preventDefault();
          event.stopPropagation();
          flushHidBuffer();
        }

        return;
      }

      if (event.key.length !== 1) {
        return;
      }

      hidBufferRef.current += event.key;

      const current = hidBufferRef.current.toUpperCase();

      if (
        current.startsWith('RC-')
        || current.startsWith('RC-EVENT|')
      ) {
        setHidStatus('Eyoyo leest ticket...');
      }

      if (hidTimerRef.current) {
        window.clearTimeout(hidTimerRef.current);
      }

      // Werkt ook wanneer de Eyoyo geen Enter/CR meestuurt.
      hidTimerRef.current = window.setTimeout(
        flushHidBuffer,
        140
      );
    }

    document.addEventListener(
      'keydown',
      handleHidKeyDown,
      true
    );

    return () => {
      document.removeEventListener(
        'keydown',
        handleHidKeyDown,
        true
      );

      if (hidTimerRef.current) {
        window.clearTimeout(hidTimerRef.current);
      }
    };
  }, []);

  async function startCamera() {
    setResult(null);
    setCameraMessage('');

    try {
      if (!window.isSecureContext) {
        throw new Error('Deze pagina moet via HTTPS geopend worden.');
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera wordt niet ondersteund door deze browser.');
      }

      // First ask for camera permission directly.
      // This also helps browsers expose useful device labels.
      let permissionStream = null;

      try {
        permissionStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' }
          },
          audio: false
        });
      } catch (permissionError) {
        console.warn('Camera permission request failed:', permissionError);
      }

      if (permissionStream) {
        permissionStream.getTracks().forEach((track) => track.stop());
      }

      const cameras = await Html5Qrcode.getCameras();

      if (!cameras || cameras.length === 0) {
        throw new Error('Geen camera gevonden.');
      }

      console.log('Beschikbare camera’s:', cameras);

      const rearCamera =
        cameras.find((camera) =>
          /back|rear|environment|achter|world/i.test(camera.label || '')
        )
        ||
        cameras[cameras.length - 1];

      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      setCameraActive(true);

      const cameraConfig =
        rearCamera?.id
          ? rearCamera.id
          : { facingMode: { ideal: 'environment' } };

      await scanner.start(
        cameraConfig,
        {
          fps: 12,
          qrbox: {
            width: 280,
            height: 280
          },
          aspectRatio: 1
        },
        async (decodedText) => {
          const now = Date.now();

          if (
            processingRef.current
            ||
            (
              lastScanRef.current.text === decodedText
              &&
              now - lastScanRef.current.time < 3500
            )
          ) {
            return;
          }

          processingRef.current = true;

          lastScanRef.current = {
            text: decodedText,
            time: now
          };

          try {
            await processQr(decodedText);
          } finally {
            window.setTimeout(() => {
              processingRef.current = false;
            }, 900);
          }
        },
        () => {}
      );

      requestAnimationFrame(() => {
        const reader = document.getElementById('qr-reader');
        const video = reader?.querySelector('video');

        if (reader) {
          reader.style.width = '100%';
          reader.style.minHeight = '420px';
          reader.style.display = 'block';
        }

        if (video) {
          video.style.display = 'block';
          video.style.width = '100%';
          video.style.height = '420px';
          video.style.objectFit = 'cover';
          video.style.borderRadius = '20px';
          video.setAttribute('playsinline', 'true');
          video.muted = true;
        }
      });

      setCameraMessage(
        rearCamera?.label
          ? `Camera actief: ${rearCamera.label}`
          : 'Camera actief'
      );
    } catch (firstError) {
      console.error('Rear camera start failed:', firstError);

      // Fallback: ask browser directly for environment camera.
      try {
        if (scannerRef.current) {
          try {
            await scannerRef.current.clear();
          } catch {}
        }

        const scanner = new Html5Qrcode('qr-reader');
        scannerRef.current = scanner;
        setCameraActive(true);

        await scanner.start(
          {
            facingMode: 'environment'
          },
          {
            fps: 10,
            qrbox: {
              width: 260,
              height: 260
            }
          },
          async (decodedText) => {
          const now = Date.now();

          if (
            processingRef.current
            ||
            (
              lastScanRef.current.text === decodedText
              &&
              now - lastScanRef.current.time < 3500
            )
          ) {
            return;
          }

          processingRef.current = true;

          lastScanRef.current = {
            text: decodedText,
            time: now
          };

          try {
            await processQr(decodedText);
          } finally {
            window.setTimeout(() => {
              processingRef.current = false;
            }, 900);
          }
        },
          () => {}
        );

        requestAnimationFrame(() => {
          const reader = document.getElementById('qr-reader');
          const video = reader?.querySelector('video');

          if (reader) {
            reader.style.width = '100%';
            reader.style.minHeight = '420px';
            reader.style.display = 'block';
          }

          if (video) {
            video.style.display = 'block';
            video.style.width = '100%';
            video.style.height = '420px';
            video.style.objectFit = 'cover';
            video.style.borderRadius = '20px';
            video.setAttribute('playsinline', 'true');
            video.muted = true;
          }
        });

        setCameraMessage('Achtercamera actief');
      } catch (fallbackError) {
        console.error('Camera fallback failed:', fallbackError);

        setCameraActive(false);

        setResult({
          type: 'bad',
          title: 'CAMERA KAN NIET OPENEN',
          message:
            'Controleer Chrome > Site-instellingen > Camera en Android/iPhone camera-machtigingen. Herlaad daarna de pagina.'
        });
      }
    }
  }

  async function stopCamera() {
    if (!scannerRef.current) {
      setCameraActive(false);
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
    setCameraMessage('');
  }

  async function processQr(raw) {
    setResult(null);

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

          if (['used', 'Binnen'].includes(data.status)) {
            return {
              code: 'used',
              data
            };
          }

          transaction.update(
            ticketRef,
            {
              status: 'Binnen',
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
        setScanLight('green');

        setResult({
          type: 'ok',
          title: 'BINNEN',
          message: `${outcome.data.ticketNumber} • Toegang goedgekeurd`
        });
      } else if (outcome.code === 'used') {
        setScanLight('red');

        setResult({
          type: 'bad',
          title: 'REEDS GESCAND',
          message: `${outcome.data.ticketNumber} • Is al binnen`
        });
      } else if (outcome.code === 'blocked') {
        setScanLight('red');

        setResult({
          type: 'bad',
          title: 'TICKET GEBLOKKEERD',
          message: outcome.data.ticketNumber
        });
      } else {
        setScanLight('red');

        setResult({
          type: 'bad',
          title: 'ONGELDIG',
          message: 'Ticket niet gevonden.'
        });
      }
    } catch (error) {
      console.error(error);
      setScanLight('red');

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
        .toUpperCase()
        .replace(/\s+/g, '');

    if (!ticketNumber) {
      setResult({
        type: 'warn',
        title: 'VUL EEN TICKETNUMMER IN',
        message: 'Bijvoorbeeld RC-0001'
      });

      return;
    }

    try {
      setResult(null);

      // Eerst rechtstreeks zoeken op document-ID.
      const directRef = doc(
        db,
        'rc_event_tickets',
        ticketNumber
      );

      const directSnapshot = await getDoc(
        directRef
      );

      if (directSnapshot.exists()) {
        await validateTicket(
          directRef
        );

        setManualTicket('');
        return;
      }

      // Fallback: zoeken op het veld ticketNumber.
      const snapshot = await getDocs(
        query(
          collection(
            db,
            'rc_event_tickets'
          ),
          where(
            'ticketNumber',
            '==',
            ticketNumber
          ),
          limit(1)
        )
      );

      if (snapshot.empty) {
        setResult({
          type: 'bad',
          title: 'TICKET NIET GEVONDEN',
          message: ticketNumber
        });

        return;
      }

      await validateTicket(
        snapshot.docs[0].ref
      );

      setManualTicket('');

    } catch (error) {
      console.error(
        'Handmatige controle mislukt:',
        error
      );

      setResult({
        type: 'bad',
        title: 'CONTROLE MISLUKT',
        message:
          'Controleer internetverbinding en Firebase-regels.'
      });
    }
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

        {result && (
          <div
            className={`result ${result.type}`}
            style={{
              minHeight: 'auto',
              padding: '18px',
              marginBottom: '14px',
              borderRadius: '18px'
            }}
          >
            <div
              style={{
                width: '54px',
                height: '54px',
                fontSize: '32px',
                borderWidth: '3px'
              }}
            >
              {
                result.type === 'ok'
                  ? '✓'
                  : result.type === 'warn'
                  ? '!'
                  : '×'
              }
            </div>

            <h2
              style={{
                fontSize: '24px',
                margin: '10px 0 4px'
              }}
            >
              {result.title}
            </h2>

            <p
              style={{
                fontSize: '18px',
                margin: 0
              }}
            >
              {result.message}
            </p>
          </div>
        )}

        <section
          className="scanner"
          style={{
            display: 'block',
            minHeight: '420px',
            overflow: 'hidden',
            position: 'relative'
          }}
        >
          <div
            id="qr-reader"
            style={{
              width: '100%',
              minHeight: '420px',
              overflow: 'hidden',
              borderRadius: '20px'
            }}
          />

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
                Achtercamera openen
              </button>
            </div>
          )}

          {cameraMessage && cameraActive && (
            <p
              style={{
                textAlign: 'center',
                padding: '10px',
                margin: 0
              }}
            >
              {cameraMessage}
            </p>
          )}
        </section>

        <section
          className="manual"
          style={{
            marginTop: '16px',
            border: '1px solid rgba(183, 137, 55, .45)'
          }}
        >
          <h3>Eyoyo EY-H2 scanner</h3>

          <p
            style={{
              margin: '6px 0 12px',
              color: '#74665f'
            }}
          >
            Laat deze Gate Scanner-pagina actief staan en scan direct.
            Je hoeft nergens in te klikken.
          </p>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 14px',
              borderRadius: '12px',
              background:
                scanLight === 'red'
                  ? '#ffe4e4'
                  : scanLight === 'green'
                  ? '#e0f7e9'
                  : '#f6f1eb',
              border:
                scanLight === 'red'
                  ? '2px solid #d32f2f'
                  : scanLight === 'green'
                  ? '2px solid #20a35a'
                  : '2px solid transparent'
            }}
          >
            <span
              style={{
                width: '11px',
                height: '11px',
                borderRadius: '50%',
                background:
                  scanLight === 'red'
                    ? '#d32f2f'
                    : scanLight === 'green'
                    ? '#20a35a'
                    : hidStatus === 'Ticket controleren...'
                    ? '#d49a32'
                    : '#7a7a7a',
                display: 'inline-block',
                flexShrink: 0
              }}
            />

            <div>
              <strong>
                {
                  scanLight === 'red'
                    ? 'ROOD — REEDS GESCAND'
                    : scanLight === 'green'
                    ? 'GROEN — BINNEN'
                    : hidStatus
                }
              </strong>

              {hidLastScan && (
                <div
                  style={{
                    marginTop: '3px',
                    fontSize: '14px',
                    opacity: 0.7
                  }}
                >
                  Laatste scan: {hidLastScan}
                </div>
              )}
            </div>
          </div>
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

      </main>
    </div>
  );
}


// ======================================================
// UI HELPERS
// ======================================================

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
  } else if (['used', 'Binnen'].includes(ticket.status)) {
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


// ======================================================
// TOKEN / QR PAYLOAD
// ======================================================

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
// PDF/JPEG TEMPLATE
// ======================================================

const PDF_W = 210;
const PDF_H = 98.82;

let templateCache = null;
let templateImageCache = null;

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

  const blob = await response.blob();

  templateCache =
    await blobToDataUrl(
      blob
    );

  return templateCache;
}

function blobToDataUrl(blob) {
  return new Promise(
    (resolve, reject) => {
      const reader = new FileReader();

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

async function loadHtmlImage(src) {
  return new Promise(
    (resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    }
  );
}

async function loadTemplateImage() {
  if (templateImageCache) {
    return templateImageCache;
  }

  const template = await loadTicketTemplate();
  templateImageCache = await loadHtmlImage(template);

  return templateImageCache;
}


// ======================================================
// PDF
// ======================================================

async function ticketPdf(ticket, settings) {
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
      'De ticket PDF kon niet worden gemaakt.'
    );
  }
}

async function batchPdf(tickets, settings) {
  if (!tickets.length) return;

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

  drawPdfTicketNumber(
    pdf,
    ticket
  );

  drawPdfGuestName(
    pdf,
    ticket
  );
}

function drawPdfTicketNumber(pdf, ticket) {
  const x = 161.8;
  const y = 70.2;
  const w = 35.0;
  const h = 14.5;

  pdf.setFillColor(
    20,
    18,
    17
  );

  pdf.roundedRect(
    x,
    y,
    w,
    h,
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
    x + 1,
    y + 1,
    w - 2,
    h - 2,
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
    x + w / 2,
    y + 5.2,
    {
      align: 'center'
    }
  );

  pdf.setFontSize(
    11.5
  );

  pdf.text(
    ticket.ticketNumber,
    x + w / 2,
    y + 11.3,
    {
      align: 'center'
    }
  );
}

function drawPdfGuestName(pdf, ticket) {
  if (!ticket.guestName) return;

  const x = 67;
  const y = 81.2;
  const w = 56;
  const h = 8.6;

  pdf.setFillColor(
    20,
    18,
    17
  );

  pdf.roundedRect(
    x,
    y,
    w,
    h,
    1.6,
    1.6,
    'F'
  );

  pdf.setDrawColor(
    183,
    137,
    55
  );

  pdf.setLineWidth(
    0.45
  );

  pdf.roundedRect(
    x + 0.8,
    y + 0.8,
    w - 1.6,
    h - 1.6,
    1.2,
    1.2
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
    8.5
  );

  pdf.text(
    ticket.guestName,
    x + w / 2,
    y + 5.6,
    {
      align: 'center'
    }
  );
}


// ======================================================
// JPEG EXPORT
// ======================================================

async function ticketJpeg(ticket, settings) {
  try {
    const canvas =
      await renderTicketToCanvas(
        ticket,
        settings
      );

    const dataUrl =
      canvas.toDataURL(
        'image/jpeg',
        0.96
      );

    const link =
      document.createElement('a');

    link.href =
      dataUrl;

    link.download =
      `${ticket.ticketNumber}.jpg`;

    document.body.appendChild(
      link
    );

    link.click();

    link.remove();
  } catch (error) {
    console.error(error);

    window.alert(
      'De JPEG kon niet worden gemaakt.'
    );
  }
}

async function renderTicketToCanvas(ticket, settings) {
  const templateImage =
    await loadTemplateImage();

  const canvas =
    document.createElement(
      'canvas'
    );

  canvas.width =
    templateImage.naturalWidth
    ||
    1768;

  canvas.height =
    templateImage.naturalHeight
    ||
    832;

  const ctx =
    canvas.getContext('2d');

  ctx.drawImage(
    templateImage,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const mmX =
    canvas.width / PDF_W;

  const mmY =
    canvas.height / PDF_H;

  const qrDataUrl =
    await QRCode.toDataURL(
      createTicketPayload(
        ticket
      ),
      {
        errorCorrectionLevel:
          'H',
        margin:
          1,
        width:
          1200,
        color: {
          dark:
            '#000000',
          light:
            '#FFFFFF'
        }
      }
    );

  const qrImage =
    await loadHtmlImage(
      qrDataUrl
    );

  const qrX =
    164.0;

  const qrY =
    23.4;

  const qrSize =
    29.8;

  drawRoundedRectCanvas(
    ctx,
    (qrX - 1.7) * mmX,
    (qrY - 1.7) * mmY,
    (qrSize + 3.4) * mmX,
    (qrSize + 3.4) * mmY,
    2 * mmX,
    '#ffffff',
    '#b38530',
    Math.max(2, 0.55 * mmX)
  );

  ctx.drawImage(
    qrImage,
    qrX * mmX,
    qrY * mmY,
    qrSize * mmX,
    qrSize * mmY
  );

  drawCanvasTicketNumber(
    ctx,
    ticket,
    mmX,
    mmY
  );

  drawCanvasGuestName(
    ctx,
    ticket,
    mmX,
    mmY
  );

  return canvas;
}

function drawCanvasTicketNumber(
  ctx,
  ticket,
  mmX,
  mmY
) {
  const x = 161.8 * mmX;
  const y = 70.2 * mmY;
  const w = 35.0 * mmX;
  const h = 14.5 * mmY;

  drawRoundedRectCanvas(
    ctx,
    x,
    y,
    w,
    h,
    2 * mmX,
    '#141211',
    '#b78937',
    Math.max(2, 0.55 * mmX)
  );

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e5c57c';

  // Kleine labeltekst bovenaan
  ctx.font = 'bold 18px Georgia, serif';

  ctx.fillText(
    'TICKET NO.',
    x + w / 2,
    y + h * 0.34
  );

  // Dynamisch ticketnummer
  ctx.font = 'bold 34px Georgia, serif';

  ctx.fillText(
    ticket.ticketNumber,
    x + w / 2,
    y + h * 0.70
  );
}

function drawCanvasGuestName(
  ctx,
  ticket,
  mmX,
  mmY
) {
  if (!ticket.guestName) return;

  const x = 67 * mmX;
  const y = 81.2 * mmY;
  const w = 56 * mmX;
  const h = 8.6 * mmY;

  drawRoundedRectCanvas(
    ctx,
    x,
    y,
    w,
    h,
    1.6 * mmX,
    '#141211',
    '#b78937',
    Math.max(2, 0.45 * mmX)
  );

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e5c57c';

  // Zelfde luxe black/gold look als ticketnummer
  ctx.font = 'bold 28px Georgia, serif';

  ctx.fillText(
    ticket.guestName,
    x + w / 2,
    y + h / 2
  );
}

function drawRoundedRectCanvas(
  ctx,
  x,
  y,
  width,
  height,
  radius,
  fill,
  stroke,
  lineWidth
) {
  const r = Math.min(
    radius,
    width / 2,
    height / 2
  );

  ctx.beginPath();

  ctx.moveTo(
    x + r,
    y
  );

  ctx.lineTo(
    x + width - r,
    y
  );

  ctx.quadraticCurveTo(
    x + width,
    y,
    x + width,
    y + r
  );

  ctx.lineTo(
    x + width,
    y + height - r
  );

  ctx.quadraticCurveTo(
    x + width,
    y + height,
    x + width - r,
    y + height
  );

  ctx.lineTo(
    x + r,
    y + height
  );

  ctx.quadraticCurveTo(
    x,
    y + height,
    x,
    y + height - r
  );

  ctx.lineTo(
    x,
    y + r
  );

  ctx.quadraticCurveTo(
    x,
    y,
    x + r,
    y
  );

  ctx.closePath();

  ctx.fillStyle =
    fill;

  ctx.fill();

  ctx.strokeStyle =
    stroke;

  ctx.lineWidth =
    lineWidth;

  ctx.stroke();
}
