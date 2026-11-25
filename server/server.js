'use strict';
/**
 * Kisújszállási Vigadó – json-server (0.17.x) modulként.
 * Indítás: npm start  (http://localhost:3000)
 *
 * Sorrend: body parser → token feldolgozás → nyilvános végpontok (A) → admin / pénztár / riport
 * végpontok (B, ha léteznek) → általános jogosultsági védelem → json-server router.
 */
const fs = require('fs');
const path = require('path');
const jsonServer = require('json-server');

const auth = require('./middleware/auth');
const seatsLib = require('./lib/seats');
const pricingLib = require('./lib/pricing');
const payments = require('./lib/payments');
const publicRoutes = require('./routes/public');

const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'db.json');

const server = jsonServer.create();
const router = jsonServer.router(DB_FILE);

server.use(jsonServer.defaults({ logger: process.env.NODE_ENV !== 'test' })); // CORS, statikus fájlok, naplózás
server.use(jsonServer.bodyParser);
server.use(auth.authenticate(router.db));

// ---- A: nyilvános végpontok --------------------------------------------------------
const errorHandler = publicRoutes(server, router);

// ---- B: admin / pénztár / riport végpontok (opcionális modulok) --------------------
// Minden modul: module.exports = (server, router, ctx) => { ... }
const ctx = { requireRole: auth.requireRole, auth, seats: seatsLib, pricing: pricingLib, payments };
for (const name of ['admin', 'boxoffice', 'reports']) {
  const file = path.join(__dirname, 'routes', `${name}.js`);
  if (fs.existsSync(file)) require(file)(server, router, ctx);
}

// ---- Általános védelem a json-server router előtt ----------------------------------
const INTERNAL = new Set(['reservations', 'sales', 'seatLocks']); // csak a saját végpontokon át módosulnak
const MASTER = new Set(['venues', 'halls', 'sectors', 'seats', 'movies', 'screenings', 'priceOverrides']);
const requireAdmin = auth.requireRole('admin');

server.use((req, res, next) => {
  const collection = req.path.split('/')[1];

  if (INTERNAL.has(collection)) {
    if (req.method !== 'GET' || collection === 'seatLocks') {
      return res.status(403).json({
        error: 'Ez a gyűjtemény kívülről nem módosítható.',
        code: 'FORBIDDEN_COLLECTION',
      });
    }
    return requireAdmin(req, res, next); // a listák adminisztrátornak olvashatók
  }
  if (collection === 'users') return requireAdmin(req, res, next);
  if (MASTER.has(collection) && req.method !== 'GET' && req.method !== 'OPTIONS') {
    return requireAdmin(req, res, next); // törzsadat: olvasás nyilvános, írás admin
  }
  next();
});

// A jelszóhash sosem kerül a válaszba.
router.render = (req, res) => {
  const strip = (v) => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === 'object') {
      const { passwordHash, ...rest } = v; // eslint-disable-line no-unused-vars
      return rest;
    }
    return v;
  };
  res.jsonp(req.path.startsWith('/users') ? strip(res.locals.data) : res.locals.data);
};

server.use(router);
server.use(errorHandler);

// Lejárt zárolások takarítása percenként kétszer.
setInterval(() => seatsLib.withMutex(() => seatsLib.purgeExpiredLocks(router.db)), 30_000).unref();

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Vigadó API: http://localhost:${PORT}  (fizetés: ${payments.mode === 'stripe' ? 'Stripe test mode' : 'DEMO / mock mód'})`);
  });
}

module.exports = server;
