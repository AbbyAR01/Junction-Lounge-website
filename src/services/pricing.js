const { db } = require('../db/database');

function getLatestPrices(cropId = null, market = null) {
  let sql = `
    SELECT c.id as crop_id, c.name, c.unit, c.category,
           mp.market, mp.price_ghs, mp.updated_at,
           (SELECT AVG(price_ghs) FROM market_prices mp2 WHERE mp2.crop_id = c.id) as avg_price,
           (SELECT MIN(price_ghs) FROM market_prices mp2 WHERE mp2.crop_id = c.id) as min_price,
           (SELECT MAX(price_ghs) FROM market_prices mp2 WHERE mp2.crop_id = c.id) as max_price
    FROM crops c
    JOIN market_prices mp ON mp.crop_id = c.id
    WHERE mp.updated_at = (
      SELECT MAX(updated_at) FROM market_prices mp3
      WHERE mp3.crop_id = c.id AND mp3.market = mp.market
    )
  `;
  const params = [];
  if (cropId) { sql += ' AND c.id = ?'; params.push(cropId); }
  if (market) { sql += ' AND mp.market = ?'; params.push(market); }
  sql += ' ORDER BY c.name, mp.market';
  return db().prepare(sql).all(...params);
}

function getPriceSummary() {
  return db().prepare(`
    SELECT c.name, c.unit, c.category,
           ROUND(AVG(mp.price_ghs), 2) as avg_price_ghs,
           ROUND(MIN(mp.price_ghs), 2) as min_price_ghs,
           ROUND(MAX(mp.price_ghs), 2) as max_price_ghs,
           COUNT(DISTINCT mp.market) as markets
    FROM crops c
    JOIN market_prices mp ON mp.crop_id = c.id
    GROUP BY c.id
    ORDER BY c.name
  `).all();
}

function getRoadsideEstimate(marketPrice) {
  return Math.round(marketPrice * 0.65 * 100) / 100;
}

function updatePrice(cropId, market, priceGhs) {
  const { v4: uuid } = require('uuid');
  db().prepare(
    'INSERT INTO market_prices (id, crop_id, market, price_ghs) VALUES (?, ?, ?, ?)'
  ).run(uuid(), cropId, market, priceGhs);
  return getLatestPrices(cropId, market);
}

function simulatePriceFluctuation() {
  const prices = db().prepare('SELECT id, price_ghs FROM market_prices ORDER BY RANDOM() LIMIT 5').all();
  const update = db().prepare('INSERT INTO market_prices (id, crop_id, market, price_ghs) SELECT ?, crop_id, market, ? FROM market_prices WHERE id = ?');
  const { v4: uuid } = require('uuid');
  for (const p of prices) {
    const change = (Math.random() - 0.5) * 4;
    const newPrice = Math.max(1, p.price_ghs + change);
    update.run(uuid(), Math.round(newPrice * 100) / 100, p.id);
  }
}

module.exports = {
  getLatestPrices,
  getPriceSummary,
  getRoadsideEstimate,
  updatePrice,
  simulatePriceFluctuation,
};
