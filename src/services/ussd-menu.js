const { v4: uuid } = require('uuid');
const { db } = require('../db/database');
const { sendSms, notifyOrderMatched } = require('./sms-service');
// sendSms used throughout for farmer notifications

const CROP_LIST = [
  { key: '1', name: 'Tomatoes' },
  { key: '2', name: 'Plantain' },
  { key: '3', name: 'Yam' },
  { key: '4', name: 'Cassava' },
  { key: '5', name: 'Onions' },
  { key: '6', name: 'Peppers' },
  { key: '7', name: 'Maize' },
  { key: '8', name: 'Garden Eggs' },
  { key: '9', name: 'Okra' },
];

function getSession(sessionId) {
  return db().prepare('SELECT * FROM ussd_sessions WHERE session_id = ?').get(sessionId);
}

function saveSession(sessionId, phone, state, data = {}) {
  const existing = getSession(sessionId);
  const dataStr = JSON.stringify(data);
  if (existing) {
    db().prepare('UPDATE ussd_sessions SET state = ?, data = ?, phone = ?, updated_at = datetime(\'now\') WHERE session_id = ?')
      .run(state, dataStr, phone, sessionId);
  } else {
    db().prepare('INSERT INTO ussd_sessions (session_id, phone, state, data) VALUES (?, ?, ?, ?)')
      .run(sessionId, phone, state, dataStr);
  }
}

function clearSession(sessionId) {
  db().prepare('DELETE FROM ussd_sessions WHERE session_id = ?').run(sessionId);
}

function getOrCreateFarmer(phone) {
  let user = db().prepare('SELECT * FROM users WHERE phone = ? AND role = ?').get(phone, 'farmer');
  if (!user) return null;
  return user;
}

function registerFarmer(phone, name, region) {
  const existing = db().prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (existing) return existing;
  const id = uuid();
  db().prepare('INSERT INTO users (id, phone, name, role, region) VALUES (?, ?, ?, ?, ?)')
    .run(id, phone, name, 'farmer', region);
  return db().prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function mainMenu() {
  return `CON FarmConnect Ghana
1. Today's Prices
2. Buyer Orders (Order-Ahead)
3. Commit Harvest
4. My Commitments
5. Shared Transport
6. Register / My Profile
7. Help`;
}

function pricesMenu() {
  let menu = 'CON Select Crop:\n';
  CROP_LIST.forEach(c => { menu += `${c.key}. ${c.name}\n`; });
  menu += '0. Back';
  return menu;
}

function regionsMenu() {
  return `CON Select Region:
1. Eastern
2. Ashanti
3. Central
4. Volta
5. Northern
6. Greater Accra
0. Back`;
}

function handleUssd(sessionId, phone, text) {
  const normalizedPhone = phone.replace(/\D/g, '').replace(/^0/, '233');
  const inputs = text ? text.split('*') : [];
  const lastInput = inputs[inputs.length - 1] || '';
  const session = getSession(sessionId);
  const state = session ? session.state : 'main';
  const data = session ? JSON.parse(session.data || '{}') : {};

  if (!text || text === '') {
    saveSession(sessionId, normalizedPhone, 'main', {});
    return mainMenu();
  }

  switch (state) {
    case 'main':
      return handleMain(sessionId, normalizedPhone, lastInput, data);
    case 'prices_crop':
      return handlePricesCrop(sessionId, normalizedPhone, lastInput, data);
    case 'orders_list':
      return handleOrdersList(sessionId, normalizedPhone, lastInput, data);
    case 'orders_detail':
      return handleOrdersDetail(sessionId, normalizedPhone, lastInput, data);
    case 'commit_crop':
      return handleCommitCrop(sessionId, normalizedPhone, lastInput, data);
    case 'commit_qty':
      return handleCommitQty(sessionId, normalizedPhone, lastInput, data);
    case 'commit_price':
      return handleCommitPrice(sessionId, normalizedPhone, lastInput, data);
    case 'commit_date':
      return handleCommitDate(sessionId, normalizedPhone, lastInput, data);
    case 'transport_list':
      return handleTransportList(sessionId, normalizedPhone, lastInput, data);
    case 'transport_book':
      return handleTransportBook(sessionId, normalizedPhone, lastInput, data);
    case 'register_name':
      return handleRegisterName(sessionId, normalizedPhone, lastInput, data);
    case 'register_region':
      return handleRegisterRegion(sessionId, normalizedPhone, lastInput, data);
    case 'profile':
      return handleProfile(sessionId, normalizedPhone, lastInput, data);
    default:
      saveSession(sessionId, normalizedPhone, 'main', {});
      return mainMenu();
  }
}

function handleMain(sessionId, phone, input, data) {
  switch (input) {
    case '1':
      saveSession(sessionId, phone, 'prices_crop', data);
      return pricesMenu();
    case '2': {
      const orders = db().prepare(`
        SELECT bo.*, c.name as crop_name, c.unit, u.name as buyer_name
        FROM buyer_orders bo
        JOIN crops c ON c.id = bo.crop_id
        JOIN users u ON u.id = bo.buyer_id
        WHERE bo.status = 'open'
        ORDER BY bo.needed_by LIMIT 5
      `).all();
      if (orders.length === 0) {
        return 'END No open buyer orders right now. Check back tomorrow!';
      }
      data.orders = orders.map((o, i) => ({ idx: i + 1, id: o.id }));
      saveSession(sessionId, phone, 'orders_list', data);
      let menu = 'CON Buyer Orders (Order-Ahead):\n';
      orders.forEach((o, i) => {
        menu += `${i + 1}. ${o.crop_name} ${o.quantity}${o.unit} by ${o.needed_by}\n   Max GHS${o.max_price_ghs || '?'}/${o.unit}\n`;
      });
      menu += '0. Back';
      return menu;
    }
    case '3':
      saveSession(sessionId, phone, 'commit_crop', data);
      return pricesMenu().replace('CON Select Crop:', 'CON Commit Harvest - Select Crop:');
    case '4': {
      const farmer = getOrCreateFarmer(phone);
      if (!farmer) return 'END Register first (option 6).';
      const commits = db().prepare(`
        SELECT hc.*, c.name as crop_name FROM harvest_commitments hc
        JOIN crops c ON c.id = hc.crop_id
        WHERE hc.farmer_id = ? ORDER BY hc.harvest_date
      `).all(farmer.id);
      if (commits.length === 0) return 'END No harvest commitments yet. Use option 3.';
      let msg = 'END My Commitments:\n';
      commits.forEach(c => {
        msg += `${c.crop_name} ${c.quantity}${c.unit} on ${c.harvest_date} @ GHS${c.asking_price_ghs} [${c.status}]\n`;
      });
      clearSession(sessionId);
      return msg;
    }
    case '5': {
      const runs = db().prepare(`
        SELECT * FROM transport_runs
        WHERE status IN ('forming', 'confirmed') AND departure_date >= date('now')
        ORDER BY departure_date LIMIT 5
      `).all();
      if (runs.length === 0) return 'END No transport runs available. Check back soon!';
      data.runs = runs.map((r, i) => ({ idx: i + 1, id: r.id }));
      saveSession(sessionId, phone, 'transport_list', data);
      let menu = 'CON Shared Transport:\n';
      runs.forEach((r, i) => {
        menu += `${i + 1}. ${r.route_name}\n   ${r.departure_date} ${r.departure_time}\n   ${r.origin_region} → ${r.destination}\n`;
      });
      menu += '0. Back';
      return menu;
    }
    case '6': {
      const farmer = getOrCreateFarmer(phone);
      if (farmer) {
        saveSession(sessionId, phone, 'profile', { farmerId: farmer.id });
        return `CON My Profile:\n${farmer.name}\n${farmer.region || 'No region'}\n${phone}\n\n1. Update Region\n0. Back`;
      }
      saveSession(sessionId, phone, 'register_name', data);
      return 'CON Register as Farmer\nEnter your full name:';
    }
    case '7':
      clearSession(sessionId);
      return 'END FarmConnect Ghana\nConnects farmers to buyers.\n*920*88# anytime.\nSMS PRICES for market prices.\nReduce spoilage, earn more!';
    default:
      return mainMenu();
  }
}

function handlePricesCrop(sessionId, phone, input, data) {
  if (input === '0') {
    saveSession(sessionId, phone, 'main', {});
    return mainMenu();
  }
  const crop = CROP_LIST.find(c => c.key === input);
  if (!crop) return pricesMenu();

  const prices = db().prepare(`
    SELECT mp.market, mp.price_ghs, c.unit FROM market_prices mp
    JOIN crops c ON c.id = mp.crop_id
    WHERE c.name = ?
    ORDER BY mp.updated_at DESC
  `).all(crop.name);

  const seen = new Set();
  const unique = prices.filter(p => {
    if (seen.has(p.market)) return false;
    seen.add(p.market);
    return true;
  });

  const roadside = unique.length > 0 ? Math.round(unique[0].price_ghs * 0.65) : 0;
  let msg = `END ${crop.name} Prices (${unique[0]?.unit || 'unit'}):\n`;
  unique.slice(0, 4).forEach(p => {
    msg += `${p.market}: GHS ${p.price_ghs.toFixed(0)}\n`;
  });
  msg += `\nRoadside offer: ~GHS ${roadside}\nFarmConnect avg: GHS ${Math.round(unique.reduce((s, p) => s + p.price_ghs, 0) / unique.length)}\n\nSell direct & earn 30%+ more!`;
  clearSession(sessionId);
  return msg;
}

function handleOrdersList(sessionId, phone, input, data) {
  if (input === '0') {
    saveSession(sessionId, phone, 'main', {});
    return mainMenu();
  }
  const idx = parseInt(input, 10);
  const orderRef = data.orders?.find(o => o.idx === idx);
  if (!orderRef) return 'CON Invalid. ' + handleMain(sessionId, phone, '2', data).replace('CON ', '');

  const order = db().prepare(`
    SELECT bo.*, c.name as crop_name, c.unit, u.name as buyer_name, u.role as buyer_role
    FROM buyer_orders bo
    JOIN crops c ON c.id = bo.crop_id
    JOIN users u ON u.id = bo.buyer_id
    WHERE bo.id = ?
  `).get(orderRef.id);

  data.selectedOrder = order;
  saveSession(sessionId, phone, 'orders_detail', data);
  return `CON Order Details:
${order.crop_name} ${order.quantity}${order.unit}
Buyer: ${order.buyer_name} (${order.buyer_role})
Needed by: ${order.needed_by}
Max price: GHS ${order.max_price_ghs}/${order.unit}
Deliver to: ${order.delivery_location}
${order.notes ? 'Note: ' + order.notes : ''}

1. Accept & Commit Harvest
0. Back`;
}

function handleOrdersDetail(sessionId, phone, input, data) {
  if (input === '0') {
    saveSession(sessionId, phone, 'main', {});
    return mainMenu();
  }
  if (input !== '1') return 'CON Press 1 to accept or 0 to go back.';

  const farmer = getOrCreateFarmer(phone);
  if (!farmer) {
    saveSession(sessionId, phone, 'register_name', { pendingOrder: data.selectedOrder });
    return 'CON Register first.\nEnter your full name:';
  }

  const order = data.selectedOrder;
  const commitId = uuid();
  const harvestDate = order.needed_by;

  db().prepare(`
    INSERT INTO harvest_commitments (id, farmer_id, crop_id, quantity, unit, harvest_date, asking_price_ghs, order_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reserved')
  `).run(commitId, farmer.id, order.crop_id, order.quantity, order.unit, harvestDate, order.max_price_ghs, order.id);

  db().prepare("UPDATE buyer_orders SET status = 'matched' WHERE id = ?").run(order.id);
  notifyOrderMatched(phone, order, { quantity: order.quantity, unit: order.unit, harvest_date: harvestDate, asking_price_ghs: order.max_price_ghs });

  clearSession(sessionId);
  return `END Order accepted!\n${order.crop_name} ${order.quantity}${order.unit}\nHarvest by: ${harvestDate}\nPrice: GHS ${order.max_price_ghs}/${order.unit}\n\nSMS sent with details.\nBook transport via option 5.`;
}

function handleCommitCrop(sessionId, phone, input, data) {
  if (input === '0') {
    saveSession(sessionId, phone, 'main', {});
    return mainMenu();
  }
  const crop = CROP_LIST.find(c => c.key === input);
  if (!crop) return pricesMenu().replace('CON Select Crop:', 'CON Commit Harvest - Select Crop:');

  const cropRow = db().prepare('SELECT * FROM crops WHERE name = ?').get(crop.name);
  data.commitCrop = cropRow;
  saveSession(sessionId, phone, 'commit_qty', data);
  return `CON ${crop.name}\nEnter quantity (${cropRow.unit}):`;
}

function handleCommitQty(sessionId, phone, input, data) {
  const qty = parseFloat(input);
  if (isNaN(qty) || qty <= 0) return `CON Invalid quantity.\nEnter quantity (${data.commitCrop.unit}):`;
  data.commitQty = qty;
  saveSession(sessionId, phone, 'commit_price', data);

  const avgPrice = db().prepare(`
    SELECT AVG(price_ghs) as avg FROM market_prices mp
    JOIN crops c ON c.id = mp.crop_id WHERE c.id = ?
  `).get(data.commitCrop.id);

  return `CON Quantity: ${qty} ${data.commitCrop.unit}\nMarket avg: GHS ${Math.round(avgPrice?.avg || 0)}\nEnter your asking price (GHS):`;
}

function handleCommitPrice(sessionId, phone, input, data) {
  const price = parseFloat(input);
  if (isNaN(price) || price <= 0) return 'CON Invalid price.\nEnter asking price (GHS):';
  data.commitPrice = price;
  saveSession(sessionId, phone, 'commit_date', data);
  return 'CON Enter harvest date (DD-MM-YYYY):\nOr press:\n1. Tomorrow\n2. In 3 days\n3. In 1 week';
}

function handleCommitDate(sessionId, phone, input, data) {
  let harvestDate;
  const today = new Date();
  if (input === '1') { today.setDate(today.getDate() + 1); harvestDate = today; }
  else if (input === '2') { today.setDate(today.getDate() + 3); harvestDate = today; }
  else if (input === '3') { today.setDate(today.getDate() + 7); harvestDate = today; }
  else {
    const parts = input.split('-');
    if (parts.length !== 3) return 'CON Invalid date. Use DD-MM-YYYY or press 1/2/3:';
    harvestDate = new Date(parts[2], parts[1] - 1, parts[0]);
    if (isNaN(harvestDate)) return 'CON Invalid date. Try again:';
  }

  const farmer = getOrCreateFarmer(phone);
  if (!farmer) {
    saveSession(sessionId, phone, 'register_name', { pendingCommit: data });
    return 'CON Register first.\nEnter your full name:';
  }

  const dateStr = harvestDate.toISOString().split('T')[0];
  const commitId = uuid();
  db().prepare(`
    INSERT INTO harvest_commitments (id, farmer_id, crop_id, quantity, unit, harvest_date, asking_price_ghs, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'available')
  `).run(commitId, farmer.id, data.commitCrop.id, data.commitQty, data.commitCrop.unit, dateStr, data.commitPrice);

  sendSms(phone, `FarmConnect: Harvest committed! ${data.commitQty} ${data.commitCrop.unit} ${data.commitCrop.name} on ${dateStr} @ GHS ${data.commitPrice}. Buyers can now order ahead.`);

  clearSession(sessionId);
  return `END Harvest Committed!\n${data.commitCrop.name}: ${data.commitQty} ${data.commitCrop.unit}\nDate: ${dateStr}\nPrice: GHS ${data.commitPrice}/${data.commitCrop.unit}\n\nBuyers will be notified.`;
}

function handleTransportList(sessionId, phone, input, data) {
  if (input === '0') {
    saveSession(sessionId, phone, 'main', {});
    return mainMenu();
  }
  const idx = parseInt(input, 10);
  const runRef = data.runs?.find(r => r.idx === idx);
  if (!runRef) return 'CON Invalid selection.';

  const run = db().prepare('SELECT * FROM transport_runs WHERE id = ?').get(runRef.id);
  const booked = db().prepare('SELECT COALESCE(SUM(quantity_kg), 0) as total FROM transport_bookings WHERE transport_run_id = ?').get(run.id);

  data.selectedRun = run;
  saveSession(sessionId, phone, 'transport_book', data);
  return `CON ${run.route_name}
${run.departure_date} at ${run.departure_time}
${run.origin_region} → ${run.destination}
Capacity: ${booked.total}/${run.vehicle_capacity_kg} kg booked

Enter quantity to ship (kg):`;
}

function handleTransportBook(sessionId, phone, input, data) {
  const qty = parseFloat(input);
  if (isNaN(qty) || qty <= 0) return 'CON Enter quantity in kg:';

  const farmer = getOrCreateFarmer(phone);
  if (!farmer) {
    saveSession(sessionId, phone, 'register_name', {});
    return 'CON Register first.\nEnter your full name:';
  }

  const run = data.selectedRun;
  const bookingId = uuid();
  db().prepare(`
    INSERT INTO transport_bookings (id, transport_run_id, farmer_id, quantity_kg, pickup_location, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).run(bookingId, run.id, farmer.id, qty, farmer.district);

  sendSms(phone, `FarmConnect: Transport booked on ${run.route_name}. ${qty}kg. Departs ${run.departure_date} ${run.departure_time}. Reply CONFIRM ${bookingId.slice(0, 8)} to confirm.`);

  clearSession(sessionId);
  return `END Transport Booked!\n${run.route_name}\n${qty} kg\nPickup: ${farmer.district || 'TBD'}\nDepart: ${run.departure_date} ${run.departure_time}\n\nReply CONFIRM via SMS.`;
}

function handleRegisterName(sessionId, phone, input, data) {
  if (!input || input.length < 2) return 'CON Enter your full name:';
  data.regName = input;
  saveSession(sessionId, phone, 'register_region', data);
  return regionsMenu();
}

function handleRegisterRegion(sessionId, phone, input, data) {
  const regions = ['', 'Eastern', 'Ashanti', 'Central', 'Volta', 'Northern', 'Greater Accra'];
  if (input === '0') {
    saveSession(sessionId, phone, 'main', {});
    return mainMenu();
  }
  const region = regions[parseInt(input, 10)];
  if (!region) return regionsMenu();

  const farmer = registerFarmer(phone, data.regName, region);
  sendSms(phone, `FarmConnect: Welcome ${data.regName}! You are registered in ${region}. Dial *920*88# to check prices, accept orders & book transport.`);

  if (data.pendingOrder) {
    data.selectedOrder = data.pendingOrder;
    delete data.pendingOrder;
    return handleOrdersDetail(sessionId, phone, '1', data);
  }

  clearSession(sessionId);
  return `END Registered!\n${data.regName}\n${region}\n\nDial *920*88# anytime.\nSMS PRICES for market rates.`;
}

function handleProfile(sessionId, phone, input, data) {
  if (input === '0') {
    saveSession(sessionId, phone, 'main', {});
    return mainMenu();
  }
  if (input === '1') {
    saveSession(sessionId, phone, 'register_region', { regName: db().prepare('SELECT name FROM users WHERE id = ?').get(data.farmerId).name });
    return regionsMenu();
  }
  return 'CON Press 1 to update region or 0 to go back.';
}

module.exports = { handleUssd, mainMenu };
