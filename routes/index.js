const express = require('express');
const router = express.Router();
const Juego = require('../models/Juego');
const Carton = require('../models/Carton');
const { info } = require('../config');

router.get('/', async (req, res) => {
  res.render('landing', {
    name_page: info.name_page, 
    dominio: info.dominio,
    contacto: info.ws,
    grupo: info.group });
});
router.get('/manifest.json', (req, res) => {
    res.type('application/manifest+json');
    res.sendFile(path.join(__dirname, '../public/manifest.json'));
});
router.get('/sw.js', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/js/service-worker.js'));
});
router.get('/ping', (req, res) => {
  res.send('Pong');
});

module.exports = router;