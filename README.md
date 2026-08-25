# Ramona & Claudio Ticketing

Kant-en-klaar React + Firebase systeem met admin, PDF tickets, QR-codes en aparte poortscanner.

## Eerst doen
1. Installeer Node.js LTS.
2. Open PowerShell in deze map.
3. Voer uit:
   npm install
   npm run dev

## Firebase Authentication
Ga naar Firebase > Security > Authentication > Get started > Sign-in method en schakel Email/Password in.
Maak 2 gebruikers: één admin en één scanner.

## Rollen
Maak collection `rc_users`.
Gebruik voor elk document exact de Firebase Authentication UID.
Admin-document: role = admin, name = Admin.
Scanner-document: role = scanner, name = Gate 1.

## Firestore Rules
Kopieer de inhoud van `firestore.rules` naar Firestore > Rules en klik Publish.

## Event settings
Document `rc_event_settings/ramona-claudio` kan deze velden hebben:
eventName, names, date, time, location, dresscode, ticketPrefix, maxTickets.

## Testticket
Verwijder eventueel het eerder handmatig aangemaakte RC-0001 testticket voordat je echte tickets genereert.

## Links lokaal
Admin: http://localhost:5173/
Scanner: http://localhost:5173/scanner

De scanner gebruikt een apart Firebase Authentication-account en dus niet jouw ChatGPT-, Google- of Firebase-account.
