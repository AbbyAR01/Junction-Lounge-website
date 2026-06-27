const { v4: uuid } = require('uuid');
const { db } = require('./database');

const database = db();

const existing = database.prepare('SELECT COUNT(*) as c FROM crops').get();
if (existing.c > 0) {
  console.log('Database already seeded.');
  process.exit(0);
}

const crops = [
  { name: 'Tomatoes', unit: 'crate', category: 'vegetables' },
  { name: 'Plantain', unit: 'bunch', category: 'staples' },
  { name: 'Yam', unit: 'tuber', category: 'staples' },
  { name: 'Cassava', unit: 'bag', category: 'staples' },
  { name: 'Onions', unit: 'bag', category: 'vegetables' },
  { name: 'Peppers', unit: 'kg', category: 'vegetables' },
  { name: 'Maize', unit: 'bag', category: 'grains' },
  { name: 'Garden Eggs', unit: 'crate', category: 'vegetables' },
  { name: 'Okra', unit: 'kg', category: 'vegetables' },
  { name: 'Pineapple', unit: 'each', category: 'fruits' },
];

const insertCrop = database.prepare('INSERT INTO crops (id, name, unit, category) VALUES (?, ?, ?, ?)');
const cropIds = {};
for (const c of crops) {
  const id = uuid();
  cropIds[c.name] = id;
  insertCrop.run(id, c.name, c.unit, c.category);
}

const markets = ['Accra Makola', 'Kumasi Central', 'Tamale Market', 'Cape Coast', 'Takoradi'];
const insertPrice = database.prepare(
  'INSERT INTO market_prices (id, crop_id, market, price_ghs) VALUES (?, ?, ?, ?)'
);

const basePrices = {
  Tomatoes: [45, 52, 38, 42, 40],
  Plantain: [25, 28, 20, 22, 24],
  Yam: [8, 10, 7, 9, 8],
  Cassava: [15, 18, 12, 14, 13],
  Onions: [35, 40, 30, 33, 32],
  Peppers: [12, 15, 10, 11, 13],
  Maize: [120, 135, 110, 125, 118],
  'Garden Eggs': [30, 35, 25, 28, 27],
  Okra: [8, 10, 7, 9, 8],
  Pineapple: [5, 6, 4, 5, 5],
};

for (const [cropName, prices] of Object.entries(basePrices)) {
  markets.forEach((market, i) => {
    insertPrice.run(uuid(), cropIds[cropName], market, prices[i] + (Math.random() * 3 - 1.5));
  });
}

const insertUser = database.prepare(
  'INSERT INTO users (id, phone, name, role, region, district) VALUES (?, ?, ?, ?, ?, ?)'
);

const farmers = [
  { phone: '233241111001', name: 'Kwame Asante', region: 'Eastern', district: 'Akosombo' },
  { phone: '233241111002', name: 'Ama Osei', region: 'Ashanti', district: 'Ejisu' },
  { phone: '233241111003', name: 'Kofi Mensah', region: 'Central', district: 'Agona' },
  { phone: '233241111004', name: 'Yaa Boateng', region: 'Volta', district: 'Ho' },
];

const farmerIds = [];
for (const f of farmers) {
  const id = uuid();
  farmerIds.push(id);
  insertUser.run(id, f.phone, f.name, 'farmer', f.region, f.district);
}

const buyers = [
  { phone: '233501111001', name: 'Fresh Foods Aggregator', role: 'aggregator', region: 'Greater Accra' },
  { phone: '233501111002', name: 'Junction Lounge Restaurant', role: 'restaurant', region: 'Central' },
  { phone: '233501111003', name: 'Cape Coast Primary School', role: 'school', region: 'Central' },
  { phone: '233501111004', name: 'Accra Fresh Markets Ltd', role: 'aggregator', region: 'Greater Accra' },
];

const buyerIds = [];
for (const b of buyers) {
  const id = uuid();
  buyerIds.push(id);
  insertUser.run(id, b.phone, b.name, b.role, b.region, null);
}

const driverId = uuid();
insertUser.run(driverId, '233551111001', 'Emmanuel Driver', 'driver', 'Greater Accra', null);

const insertOrder = database.prepare(`
  INSERT INTO buyer_orders (id, buyer_id, crop_id, quantity, unit, max_price_ghs, needed_by, delivery_location, status, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const orders = [
  { buyer: 0, crop: 'Tomatoes', qty: 50, unit: 'crate', price: 48, days: 5, loc: 'Accra, Osu', notes: 'Ripe, firm tomatoes' },
  { buyer: 1, crop: 'Plantain', qty: 100, unit: 'bunch', price: 26, days: 3, loc: 'Cape Coast', notes: 'For restaurant menu' },
  { buyer: 2, crop: 'Yam', qty: 200, unit: 'tuber', price: 9, days: 7, loc: 'Cape Coast School', notes: 'School feeding program' },
  { buyer: 3, crop: 'Onions', qty: 30, unit: 'bag', price: 36, days: 4, loc: 'Accra Makola', notes: 'Bulk purchase' },
  { buyer: 0, crop: 'Peppers', qty: 100, unit: 'kg', price: 13, days: 2, loc: 'Accra', notes: 'Hot peppers preferred' },
];

for (const o of orders) {
  const neededBy = new Date();
  neededBy.setDate(neededBy.getDate() + o.days);
  insertOrder.run(
    uuid(), buyerIds[o.buyer], cropIds[o.crop], o.qty, o.unit, o.price,
    neededBy.toISOString().split('T')[0], o.loc, 'open', o.notes
  );
}

const insertCommitment = database.prepare(`
  INSERT INTO harvest_commitments (id, farmer_id, crop_id, quantity, unit, harvest_date, asking_price_ghs, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const commitments = [
  { farmer: 0, crop: 'Tomatoes', qty: 30, unit: 'crate', days: 4, price: 44 },
  { farmer: 1, crop: 'Plantain', qty: 80, unit: 'bunch', days: 2, price: 24 },
  { farmer: 2, crop: 'Cassava', qty: 50, unit: 'bag', days: 6, price: 14 },
];

for (const c of commitments) {
  const harvestDate = new Date();
  harvestDate.setDate(harvestDate.getDate() + c.days);
  insertCommitment.run(
    uuid(), farmerIds[c.farmer], cropIds[c.crop], c.qty, c.unit,
    harvestDate.toISOString().split('T')[0], c.price, 'available'
  );
}

const insertTransport = database.prepare(`
  INSERT INTO transport_runs (id, route_name, origin_region, destination, departure_date, departure_time, vehicle_capacity_kg, status, driver_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const transportDate = new Date();
transportDate.setDate(transportDate.getDate() + 2);
insertTransport.run(
  uuid(), 'Eastern-Accra Route', 'Eastern', 'Accra Makola',
  transportDate.toISOString().split('T')[0], '05:00', 800, 'forming', driverId
);

console.log('Database seeded successfully.');
console.log('Farmers: dial USSD *920*88# (simulator at /ussd-simulator)');
console.log('Buyers: open http://localhost:3000');
