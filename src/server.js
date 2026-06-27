const express = require('express');
const path = require('path');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const ussdRoutes = require('./routes/ussd');
const smsRoutes = require('./routes/sms');
const { db } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

db();

app.use('/api', apiRoutes);
app.use('/ussd', ussdRoutes);
app.use('/sms', smsRoutes);

app.use(express.static(path.join(__dirname, '../public')));

app.get('/ussd-simulator', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/ussd-simulator.html'));
});

setInterval(() => {
  try {
    const { simulatePriceFluctuation } = require('./services/pricing');
    simulatePriceFluctuation();
  } catch (_) { /* ignore during startup */ }
}, 5 * 60 * 1000);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║         FarmConnect Ghana                        ║
║  Connecting farmers to urban buyers              ║
╠══════════════════════════════════════════════════╣
║  Web App:        http://localhost:${PORT}           ║
║  USSD Simulator: http://localhost:${PORT}/ussd-simulator  ║
║  API:            http://localhost:${PORT}/api       ║
║  USSD Code:      *920*88#                        ║
╚══════════════════════════════════════════════════╝
  `);
});

module.exports = app;
