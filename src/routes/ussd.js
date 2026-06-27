const express = require('express');
const { handleUssd } = require('../services/ussd-menu');

const router = express.Router();

router.post('/', (req, res) => {
  const sessionId = req.body.sessionId || req.body.session_id || 'default';
  const phone = req.body.phoneNumber || req.body.msisdn || req.body.phone || '233000000000';
  const text = req.body.text || req.body.ussd_string || '';

  const response = handleUssd(sessionId, phone, text);
  const isEnd = response.startsWith('END');
  const body = response.replace(/^(CON|END)\s*/, '');

  res.type('text/plain').send(body);
});

router.post('/callback', (req, res) => {
  const { sessionId, phoneNumber, text } = req.body;
  const response = handleUssd(sessionId, phoneNumber, text || '');
  res.json({
    response,
    continueSession: response.startsWith('CON'),
  });
});

module.exports = router;
