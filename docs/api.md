# API-szerződés – A személy végpontjai

Hibák: `{ "error": "üzenet", "code": "KÓD", ... }`. Ütközés: **409** `SEAT_UNAVAILABLE` + `seatIds[]`.

| Végpont | Törzs / válasz |
|---|---|
| `POST /auth/login` | `{email,password}` → `{token, user:{id,name,role}}` · 401 hibás adat · 403 inaktív |
| `GET /screenings/:id/seatmap` | → `{screening, movie, hall, venue, bookable, bookableReason, maxSeats, sectors[], seats[{id,sectorId,row,number,label,status}], prices{seatId:ár}}` · status: `free\|reserved\|sold\|disabled\|locked` |
| `POST /reservations` | `{screeningId, seatIds[], customerName, customerContact}` → 201 `{code, seats[{id,label,price}], total, …előadás adatai}` |
| `POST /checkout` | ugyanaz → 201 `{ref, mode:'stripe'\|'mock', checkoutUrl, total, expiresAt}` (helyek 10 percre zárolva; összeget a szerver számol) |
| `GET /payments/confirm?ref&session_id[&mock]` | 302 → `FRONTEND/payment/result?status=success&order=…` vagy `failed&reason=…` |
| `POST /payments/cancel` | `{ref}` → `{released}` (zárolás azonnali felszabadítása) |
| `GET /public/config`, `/public/reservations/:code`, `/public/checkouts/:ref`, `/public/orders/:ref` | csak olvasható, személyes adat nélküli visszaigazoló adatok |

Közös kódhoz B számára: `lib/seats.js` (`withMutex`, `computeStatuses`, `checkAvailability`), `lib/pricing.js` (`buildPriceMap`, `calcTotal`), `middleware/auth.js` (`requireRole`, `hashPassword`).
`routes/{admin,boxoffice,reports}.js` modulok: `module.exports = (server, router, ctx) => {…}`; a `ctx` tartalmazza a fenti könyvtárakat.

## Adminisztráció

Az alábbi végpontok adminisztrátori jogosultságot igényelnek. Jelszó mezőt fogadó felhasználó-végpontok hash-elve tárolják azt; a `passwordHash` egyik válaszban sem szerepel.

| Végpont | Törzs / válasz |
|---|---|
| `POST /users` | `{name,email,password,role,active?}` → 201 felhasználó · szerepkör: `admin\|cashier` · kis- és nagybetűtől független egyedi e-mail |
| `PUT /users/:id`, `PATCH /users/:id` | felhasználó adatainak módosítása; a `PATCH {active:false}` az inaktiválás |
| `DELETE /users/:id` | 405 `METHOD_NOT_ALLOWED`; felhasználót törlés helyett inaktiválni kell |
| `POST /admin/halls/:hallId/seats/generate` | `{sectors:[{name,rows:["A","B"],seatsPerRow:10}]}` → 201 `{sectors[],seats[]}` · meglévő ülésrácsra 409 `SEAT_GRID_EXISTS` |
| `PATCH /seats/:id/disable`, `PATCH /seats/:id/enable` | letiltásnál opcionális `{disabledReason}` · jövőbeli foglalás vagy eladott jegy esetén 409 `SEAT_HAS_FUTURE_BOOKINGS` + `screeningIds[]` |
| `PUT /screenings/:id/prices` | `{basePrice,sectors:{sectorId:price\|null},seats:{seatId:price\|null}}` · a `null` törli az adott felülírást |
| `PUT /movies/:id/poster` | `{dataUrl}` · legfeljebb 1 MiB-os PNG/JPEG/WebP data URL |
| `DELETE /venues/:id`, `/halls/:id`, `/sectors/:id`, `/movies/:id`, `/screenings/:id` | hivatkozott foglalás vagy eladás esetén 409 `HAS_DEPENDENCIES` |

Az admin végpontok hibái is `{error,code,...}` alakúak; hibás mezők esetén 400, hiányzó rekordnál 404, jogosultsági hibánál 401/403 érkezik.

## Pénztár

Minden alábbi végpont pénztáros vagy adminisztrátor jogosultságot igényel. A foglalásból kiadott és az azonnal eladott jegyek ára a szerveroldali árlistából számolódik; a jegykód `TK-<saleId>-<sorszám>`.

| Végpont | Törzs / válasz |
|---|---|
| `POST /box-office/reservations` | `{screeningId,seatIds[],customerName,customerContact}` → 201 pénztári foglalás (`channel:cashier`, `createdBy`) |
| `POST /box-office/sales` | `{screeningId,seatIds[],paymentMethod:'cash'\|'card'}` → 201 fizetett eladás és jegyek |
| `POST /box-office/reservations/:id/issue` | `{paymentMethod:'cash'\|'card'}` → 201 eladás; a foglalás `converted` állapotú lesz |
| `POST /box-office/reservations/:id/cancel` | aktív foglalás lemondása → a frissített foglalás |
| `GET /box-office/reservations?query=...` | foglalás keresése kód vagy névrészlet szerint → `{items[],count}` · legfeljebb 50 találat |

Foglalt, eladott, zárolt vagy letiltott szék esetén 409 `SEAT_UNAVAILABLE` + `seatIds[]`; ismeretlen, másik teremhez tartozó szék esetén 400, hiányzó előadás/foglalás esetén 404 érkezik.

## Riportok

Adminisztrátori jogosultság szükséges. A `from` és `to` a rekord `createdAt` mezőjére szűr; az `YYYY-MM-DD` formájú határnapok teljes napot jelentenek. Lapozásnál a `count` és a `totalRevenue` a teljes szűrt eredményre vonatkozik. A sales darabszám és bevétel kizárólag `paid` eladásokból számolódik.

| Végpont | Query / válasz |
|---|---|
| `GET /reservations` | opcionális `from`, `to`, `venueId`, `screeningId`, `movieId`, `channel`, `status`, `page`, `pageSize` → `{items[],count,totalRevenue}` · a `count` a foglalások száma, `totalRevenue:0` |
| `GET /sales` | ugyanazok a szűrők → `{items[],count,totalRevenue}` · a `count` a fizetett jegyek száma, a `totalRevenue` a fizetett eladások összege |

Az `items` elemei a rekord mezőin felül tartalmazzák a `movieTitle`, `venue`/`venueName`, `hall`/`hallName`, `startsAt`, `seats[]` és `seatLabels[]` mezőket. A sales `tickets[]` elemei `seatLabel` értékkel is kiegészülnek. Csatorna: `online` vagy `cashier`; a `pageSize` legfeljebb 100.

## Mintaadat-seed tesztfiókok

`npm run seed` a `db.seed.json` mintaadataiból újragenerálja a `db.json`-t; a jelszavak minden futáskor az `auth.hashPassword` segítségével hashelődnek.

| E-mail | Jelszó | Szerepkör / állapot |
|---|---|---|
| `admin@vigado.test` | `Admin123!` | aktív admin |
| `penztaros@vigado.test` | `Penztar123!` | aktív pénztáros |
| `inaktiv@vigado.test` | `Valami123!` | inaktív pénztáros |
