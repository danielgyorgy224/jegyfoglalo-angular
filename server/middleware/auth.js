'use strict';
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const DEV_SECRET = 'vigado-dev-secret-change-me';
const SECRET = process.env.JWT_SECRET || DEV_SECRET;
const TOKEN_TTL = process.env.JWT_TTL || '8h';

if (SECRET === DEV_SECRET) {
  console.warn('[auth] Figyelem: JWT_SECRET nincs beállítva, fejlesztői titkos kulcs van használatban.');
}

// ---- Jelszó: scrypt$N$r$p$saltHex$hashHex (a db.json formátuma) --------------------
function hashPassword(password) {
  const N = 16384, r = 8, p = 1;
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  try {
    const [alg, N, r, p, saltHex, hashHex] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length, {
      N: +N, r: +r, p: +p,
    });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// ---- Token --------------------------------------------------------------------------
function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, SECRET, { expiresIn: TOKEN_TTL });
}

/** Publikus felhasználói alak – a jelszóhash sosem kerül ki. */
function publicUser(user) {
  return { id: user.id, name: user.name, role: user.role };
}

/**
 * Bearer token feldolgozása. Ha van érvényes token, a req.user-be kerül a db-beli,
 * aktív felhasználó (a szerepkört a db-ből olvassuk, nem a tokenből).
 */
function authenticate(db) {
  return (req, _res, next) => {
    const header = req.headers.authorization || '';
    const match = /^Bearer (.+)$/i.exec(header);
    if (match) {
      try {
        const payload = jwt.verify(match[1], SECRET);
        const user = db.get('users').find({ id: payload.sub }).value();
        if (user && user.active) req.user = user;
      } catch {
        /* érvénytelen / lejárt token: req.user marad üres */
      }
    }
    next();
  };
}

/** Védett végpont: 401 token nélkül/érvénytelen tokennel, 403 rossz szerepkörrel. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Bejelentkezés szükséges.', code: 'UNAUTHORIZED' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Ehhez nincs jogosultságod.', code: 'FORBIDDEN' });
    }
    next();
  };
}

module.exports = { hashPassword, verifyPassword, signToken, publicUser, authenticate, requireRole };
