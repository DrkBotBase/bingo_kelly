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

router.get('/api/juego/estado', async (req, res) => {
    try {
        // Usamos .lean() para obtener un objeto JS plano
        const juego = await Juego.findOne().sort({ createdAt: -1 }).lean();
        
        res.json({ 
            success: true,
            juego: juego || { 
                estado: 'esperando', 
                bolasCantadas: [], 
                ganadores: [] // Estructura consistente
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/api/jugador/sync-multi', async (req, res) => {
    try {
        const { codigo, marcados, modo } = req.body;
        
        for (const [cartonId, marcadosArray] of Object.entries(marcados)) {
            await Carton.findOneAndUpdate(
                { numeroCarton: parseInt(cartonId) },
                { 
                    marcados: marcadosArray,
                    modoMarcado: modo,
                    ultimaConexion: new Date()
                }
            );
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;