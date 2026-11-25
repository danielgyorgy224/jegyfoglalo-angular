'use strict';

const fs = require('fs');
const path = require('path');
const { hashPassword } = require('./middleware/auth');

const SAMPLE_FILE = path.join(__dirname, 'db.seed.json');
const TEST_ACCOUNTS = new Map([
  ['admin@vigado.test', { password: 'Admin123!', role: 'admin', active: true }],
  ['penztaros@vigado.test', { password: 'Penztar123!', role: 'cashier', active: true }],
  ['inaktiv@vigado.test', { password: 'Valami123!', role: 'cashier', active: false }],
]);

function seedDatabase(outputFile = process.env.DB_FILE || path.join(__dirname, 'db.json')) {
  const database = JSON.parse(fs.readFileSync(SAMPLE_FILE, 'utf8'));
  for (const [email, account] of TEST_ACCOUNTS) {
    const user = database.users.find((item) => item.email === email);
    if (!user) throw new Error(`A mintaadatokból hiányzik a tesztfiók: ${email}`);
    user.role = account.role;
    user.active = account.active;
    user.passwordHash = hashPassword(account.password);
    delete user.password;
  }

  const requiredCollections = [
    'venues',
    'halls',
    'sectors',
    'seats',
    'movies',
    'screenings',
    'priceOverrides',
    'reservations',
    'sales',
  ];
  for (const name of requiredCollections) {
    if (!Array.isArray(database[name])) throw new Error(`Hiányzó mintaadat-gyűjtemény: ${name}`);
  }

  fs.writeFileSync(
    path.resolve(outputFile),
    `${JSON.stringify(database, null, 2)}\n`,
    'utf8',
  );
}

if (require.main === module) {
  seedDatabase();
  console.log('A server/db.json mintaadatokkal újragenerálva.');
}

module.exports = seedDatabase;
