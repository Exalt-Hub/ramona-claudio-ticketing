# Ramona & Claudio Ticketing

Volledig nieuwe clean build.

## Inhoud
- Admin login
- Scanner login
- Tickets genereren
- Optionele gastnaam
- Ticket blokkeren/verwijderen
- QR-code per ticket
- Eenmalige scan
- PDF per ticket
- Alle tickets in één PDF
- Firebase Authentication + Firestore
- Code-generated luxe ticketlayout

## Belangrijk
Firebase-config is al gekoppeld aan:
`glassy-acolyte-472202-h0`

## GitHub/Vercel
Upload de INHOUD van deze map naar je GitHub repository.
Vercel instellingen:
- Framework: Vite
- Root Directory: ./
- Build Command: npm run build
- Output Directory: dist
- Install Command: npm install

## Firestore Rules
Kopieer `firestore.rules` naar Firebase > Firestore > Rules en klik Publish.

## Rollen
`rc_users/<uid>`:
- Admin: `role = "admin"`
- Scanner: `role = "scanner"`

## Belangrijk
Verwijder oude projectbestanden uit GitHub voordat je deze clean versie uploadt, zodat er geen oude App.jsx of dubbele bestanden blijven staan.
