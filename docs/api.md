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
