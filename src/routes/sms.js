const express = require('express');
const { handleInboundSms, sendSms } = require('../services/sms-service');

const router = express.Router();

router.post('/inbound', (req, res) => {
  const phone = req.body.from || req.body.phone || req.body.msisdn;
  const text = req.body.text || req.body.message || req.body.body || '';
  if (!phone) return res.status(400).json({ error: 'phone required' });
  const result = handleInboundSms(phone, text);
  res.json(result);
});

router.post('/send', (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) return res.status(400).json({ error: 'phone and message required' });
  res.json(sendSms(phone, message));
});

module.exports = router;
