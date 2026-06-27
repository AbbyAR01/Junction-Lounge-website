const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../db/database');
const { getLatestPrices, getPriceSummary, updatePrice, simulatePriceFluctuation } = require('../services/pricing');
const { getSmsLog, sendSms } = require('../services/sms-service');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'FarmConnect Ghana', timestamp: new Date().toISOString() });
});

router.get('/prices', (req, res) => {
  const { crop_id, market } = req.query;
  res.json(getLatestPrices(crop_id, market));
});

router.get('/prices/summary', (req, res) => {
  res.json(getPriceSummary());
});

router.post('/prices/refresh', (req, res) => {
  simulatePriceFluctuation();
  res.json({ message: 'Prices updated', prices: getPriceSummary() });
});

router.get('/crops', (req, res) => {
  res.json(db().prepare('SELECT * FROM crops ORDER BY name').all());
});

router.get('/users', (req, res) => {
  const { role } = req.query;
  if (role) {
    return res.json(db().prepare('SELECT id, phone, name, role, region, district FROM users WHERE role = ?').all(role));
  }
  res.json(db().prepare('SELECT id, phone, name, role, region, district FROM users').all());
});

router.post('/users/register', (req, res) => {
  const { phone, name, role, region, district } = req.body;
  if (!phone || !name || !role) {
    return res.status(400).json({ error: 'phone, name, and role are required' });
  }
  const existing = db().prepare('SELECT * FROM users WHERE phone = ?').get(phone.replace(/\D/g, '').replace(/^0/, '233'));
  if (existing) return res.json(existing);

  const id = uuid();
  const normalizedPhone = phone.replace(/\D/g, '').replace(/^0/, '233');
  db().prepare('INSERT INTO users (id, phone, name, role, region, district) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, normalizedPhone, name, role, region || null, district || null);
  res.status(201).json(db().prepare('SELECT * FROM users WHERE id = ?').get(id));
});

router.get('/orders', (req, res) => {
  const { status, buyer_id } = req.query;
  let sql = `
    SELECT bo.*, c.name as crop_name, c.unit, u.name as buyer_name, u.role as buyer_role
    FROM buyer_orders bo
    JOIN crops c ON c.id = bo.crop_id
    JOIN users u ON u.id = bo.buyer_id
  `;
  const conditions = [];
  const params = [];
  if (status) { conditions.push('bo.status = ?'); params.push(status); }
  if (buyer_id) { conditions.push('bo.buyer_id = ?'); params.push(buyer_id); }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY bo.created_at DESC';
  res.json(db().prepare(sql).all(...params));
});

router.post('/orders', (req, res) => {
  const { buyer_id, crop_id, quantity, unit, max_price_ghs, needed_by, delivery_location, notes } = req.body;
  if (!buyer_id || !crop_id || !quantity || !needed_by) {
    return res.status(400).json({ error: 'buyer_id, crop_id, quantity, and needed_by are required' });
  }
  const id = uuid();
  db().prepare(`
    INSERT INTO buyer_orders (id, buyer_id, crop_id, quantity, unit, max_price_ghs, needed_by, delivery_location, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, buyer_id, crop_id, quantity, unit || 'kg', max_price_ghs, needed_by, delivery_location, notes);

  const farmers = db().prepare("SELECT phone FROM users WHERE role = 'farmer'").all();
  const crop = db().prepare('SELECT name FROM crops WHERE id = ?').get(crop_id);
  for (const f of farmers.slice(0, 5)) {
    sendSms(f.phone, `FarmConnect: New order! ${quantity}${unit || 'kg'} ${crop.name} needed by ${needed_by}. Max GHS ${max_price_ghs}. Dial *920*88# to accept.`);
  }

  res.status(201).json(db().prepare('SELECT * FROM buyer_orders WHERE id = ?').get(id));
});

router.post('/orders/:id/match', (req, res) => {
  const { commitment_id } = req.body;
  const order = db().prepare('SELECT * FROM buyer_orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  db().prepare("UPDATE buyer_orders SET status = 'matched' WHERE id = ?").run(req.params.id);
  if (commitment_id) {
    db().prepare("UPDATE harvest_commitments SET status = 'reserved', order_id = ? WHERE id = ?").run(req.params.id, commitment_id);
  }
  res.json(db().prepare('SELECT * FROM buyer_orders WHERE id = ?').get(req.params.id));
});

router.get('/commitments', (req, res) => {
  const { status, farmer_id } = req.query;
  let sql = `
    SELECT hc.*, c.name as crop_name, u.name as farmer_name, u.region, u.district
    FROM harvest_commitments hc
    JOIN crops c ON c.id = hc.crop_id
    JOIN users u ON u.id = hc.farmer_id
  `;
  const conditions = [];
  const params = [];
  if (status) { conditions.push('hc.status = ?'); params.push(status); }
  if (farmer_id) { conditions.push('hc.farmer_id = ?'); params.push(farmer_id); }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY hc.harvest_date';
  res.json(db().prepare(sql).all(...params));
});

router.get('/transport', (req, res) => {
  const runs = db().prepare(`
    SELECT tr.*, u.name as driver_name,
      (SELECT COALESCE(SUM(quantity_kg), 0) FROM transport_bookings WHERE transport_run_id = tr.id) as booked_kg,
      (SELECT COUNT(*) FROM transport_bookings WHERE transport_run_id = tr.id) as booking_count
    FROM transport_runs tr
    LEFT JOIN users u ON u.id = tr.driver_id
    WHERE tr.departure_date >= date('now', '-1 day')
    ORDER BY tr.departure_date
  `).all();
  res.json(runs);
});

router.post('/transport', (req, res) => {
  const { route_name, origin_region, destination, departure_date, departure_time, vehicle_capacity_kg, driver_id } = req.body;
  const id = uuid();
  db().prepare(`
    INSERT INTO transport_runs (id, route_name, origin_region, destination, departure_date, departure_time, vehicle_capacity_kg, driver_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, route_name, origin_region, destination, departure_date, departure_time, vehicle_capacity_kg || 500, driver_id);
  res.status(201).json(db().prepare('SELECT * FROM transport_runs WHERE id = ?').get(id));
});

router.get('/transport/:id/bookings', (req, res) => {
  const bookings = db().prepare(`
    SELECT tb.*, u.name as farmer_name, u.phone as farmer_phone, u.district
    FROM transport_bookings tb
    JOIN users u ON u.id = tb.farmer_id
    WHERE tb.transport_run_id = ?
  `).all(req.params.id);
  res.json(bookings);
});

router.get('/sms/log', (req, res) => {
  res.json(getSmsLog(parseInt(req.query.limit, 10) || 50));
});

router.get('/stats', (req, res) => {
  const stats = {
    farmers: db().prepare("SELECT COUNT(*) as c FROM users WHERE role = 'farmer'").get().c,
    buyers: db().prepare("SELECT COUNT(*) as c FROM users WHERE role IN ('aggregator', 'restaurant', 'school')").get().c,
    open_orders: db().prepare("SELECT COUNT(*) as c FROM buyer_orders WHERE status = 'open'").get().c,
    matched_orders: db().prepare("SELECT COUNT(*) as c FROM buyer_orders WHERE status = 'matched'").get().c,
    commitments: db().prepare("SELECT COUNT(*) as c FROM harvest_commitments WHERE status = 'available'").get().c,
    transport_runs: db().prepare("SELECT COUNT(*) as c FROM transport_runs WHERE status = 'forming'").get().c,
    sms_sent: db().prepare("SELECT COUNT(*) as c FROM sms_log WHERE direction = 'outbound'").get().c,
  };
  res.json(stats);
});

module.exports = router;
