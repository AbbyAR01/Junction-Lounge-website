const { v4: uuid } = require('uuid');
const { db } = require('../db/database');

function logSms(phone, message, direction = 'outbound') {
  db().prepare(
    'INSERT INTO sms_log (id, phone, message, direction) VALUES (?, ?, ?, ?)'
  ).run(uuid(), phone, message, direction);
}

function sendSms(phone, message) {
  const normalized = normalizePhone(phone);
  logSms(normalized, message, 'outbound');
  console.log(`[SMS → ${normalized}] ${message}`);
  return { success: true, phone: normalized, message };
}

function normalizePhone(phone) {
  let p = phone.replace(/\D/g, '');
  if (p.startsWith('0')) p = '233' + p.slice(1);
  if (!p.startsWith('233')) p = '233' + p;
  return p;
}

function notifyTransportConfirmed(run, bookings) {
  const messages = [];
  for (const b of bookings) {
    const farmer = db().prepare('SELECT * FROM users WHERE id = ?').get(b.farmer_id);
    const msg = `FarmConnect: Transport confirmed! ${run.route_name} departs ${run.departure_date} at ${run.departure_time}. Pickup: ${b.pickup_location || farmer.district}. Reply CONFIRM to accept. Ref: ${b.id.slice(0, 8)}`;
    messages.push(sendSms(farmer.phone, msg));
  }
  if (run.driver_id) {
    const driver = db().prepare('SELECT * FROM users WHERE id = ?').get(run.driver_id);
  const stops = bookings.map(b => {
      const f = db().prepare('SELECT name, district FROM users WHERE id = ?').get(b.farmer_id);
      return `${f.name} (${f.district}) - ${b.quantity_kg}kg`;
    }).join('; ');
    sendSms(driver.phone, `FarmConnect Driver: Route ${run.route_name}. Stops: ${stops}. Depart ${run.departure_date} ${run.departure_time}.`);
  }
  return messages;
}

function notifyOrderMatched(farmerPhone, order, commitment) {
  const crop = db().prepare('SELECT name FROM crops WHERE id = ?').get(order.crop_id);
  const msg = `FarmConnect: Your ${commitment.quantity}${commitment.unit} ${crop.name} matched to buyer order! Harvest by ${commitment.harvest_date}. Price: GHS ${commitment.asking_price_ghs}/${commitment.unit}. Dial *920*88# for transport.`;
  return sendSms(farmerPhone, msg);
}

function notifyBuyerOrderFulfilled(buyerPhone, order, farmerName) {
  const crop = db().prepare('SELECT name FROM crops WHERE id = ?').get(order.crop_id);
  const msg = `FarmConnect: ${order.quantity} ${order.unit} ${crop.name} from ${farmerName} confirmed for delivery by ${order.needed_by}. Track at farmconnect.gh`;
  return sendSms(buyerPhone, msg);
}

function notifyPriceAlert(phone, cropName, price, market) {
  const msg = `FarmConnect Price Alert: ${cropName} now GHS ${price.toFixed(2)} at ${market}. Roadside avg is 30% lower. Sell direct via *920*88#`;
  return sendSms(phone, msg);
}

function handleInboundSms(phone, text) {
  const normalized = normalizePhone(phone);
  logSms(normalized, text, 'inbound');
  const upper = text.trim().toUpperCase();

  if (upper === 'CONFIRM' || upper.startsWith('CONFIRM ')) {
    const ref = upper.split(' ')[1];
    if (ref) {
      const booking = db().prepare(`
        SELECT tb.* FROM transport_bookings tb
        WHERE tb.id LIKE ? AND tb.status = 'pending'
      `).get(ref + '%');
      if (booking) {
        db().prepare("UPDATE transport_bookings SET status = 'confirmed' WHERE id = ?").run(booking.id);
        return sendSms(normalized, `FarmConnect: Transport booking confirmed! We will SMS pickup details 1 day before departure.`);
      }
    }
    const pending = db().prepare(`
      SELECT tb.* FROM transport_bookings tb
      JOIN users u ON u.id = tb.farmer_id
      WHERE u.phone = ? AND tb.status = 'pending'
      ORDER BY tb.created_at DESC LIMIT 1
    `).get(normalized);
    if (pending) {
      db().prepare("UPDATE transport_bookings SET status = 'confirmed' WHERE id = ?").run(pending.id);
      return sendSms(normalized, `FarmConnect: Transport booking confirmed! Ref: ${pending.id.slice(0, 8)}`);
    }
    return sendSms(normalized, 'FarmConnect: No pending transport booking found. Dial *920*88# → Transport to book.');
  }

  if (upper === 'PRICES' || upper === 'PRICE') {
    const prices = db().prepare(`
      SELECT c.name, mp.price_ghs, mp.market FROM market_prices mp
      JOIN crops c ON c.id = mp.crop_id
      WHERE mp.market = 'Accra Makola'
      ORDER BY c.name LIMIT 5
    `).all();
    const lines = prices.map(p => `${p.name}: GHS${p.price_ghs.toFixed(0)}`).join(', ');
    return sendSms(normalized, `FarmConnect Prices (Accra): ${lines}. More: *920*88#`);
  }

  if (upper === 'HELP') {
    return sendSms(normalized, 'FarmConnect: Dial *920*88# for menu. SMS: PRICES, CONFIRM, HELP. Connect farmers to buyers!');
  }

  return sendSms(normalized, 'FarmConnect: Unknown command. Reply HELP or dial *920*88#');
}

function getSmsLog(limit = 50) {
  return db().prepare('SELECT * FROM sms_log ORDER BY created_at DESC LIMIT ?').all(limit);
}

module.exports = {
  sendSms,
  logSms,
  normalizePhone,
  notifyTransportConfirmed,
  notifyOrderMatched,
  notifyBuyerOrderFulfilled,
  notifyPriceAlert,
  handleInboundSms,
  getSmsLog,
};
