const express = require('express');
const router = express.Router();
const Carton = require('../models/Carton');
const Juego = require('../models/Juego');
const Usuario = require('../models/Usuario');
const { info } = require('../config');

router.get('/login', (req, res) => {
    res.render('jugador/login', { name_page: info.name_page });
});

router.get('/mis-cartones', (req, res) => {
    res.render('jugador/mis-cartones', { name_page: info.name_page });
});

router.get('/carton/:numero', async (req, res) => {
    try {
        const numeroCarton = parseInt(req.params.numero);
        const codigo = req.query.codigo;
        
        if (!codigo) {
            return res.redirect('/jugador/login');
        }
        
        const usuario = await Usuario.findOne({ 
            codigoAcceso: codigo.toUpperCase(),
            cartonesAsignados: numeroCarton,
            activo: true
        });
        
        if (!usuario) {
            return res.status(403).render('errores', { 
                mensaje: 'No tienes acceso a este cartón',
                name_page: info.name_page
            });
        }
        
        let carton = await Carton.findOne({ numeroCarton });
        
        if (!carton) {
            return res.status(404).render('errores', { 
                mensaje: 'Cartón no encontrado',
                name_page: info.name_page
            });
        }
        
        const juego = await Juego.findOne().sort({ createdAt: -1 });
        
        res.render('jugador/carton', {
            carton,
            juego: juego || { estado: 'esperando', bolasCantadas: [] },
            usuario: { codigo: usuario.codigoAcceso },
            name_page: info.name_page
        });
        
    } catch (error) {
        console.error('Error cargando cartón:', error);
        res.status(500).render('errores', { 
            mensaje: 'Error cargando el cartón',
            name_page: info.name_page
        });
    }
});

router.post('/api/:numero/sync', async (req, res) => {
    try {
        const numeroCarton = parseInt(req.params.numero);
        const { marcados, modo, codigo } = req.body;
        
        if (codigo) {
            const usuario = await Usuario.findOne({ 
                codigoAcceso: codigo.toUpperCase(),
                cartonesAsignados: numeroCarton
            });
            
            if (!usuario) {
                return res.status(403).json({ error: 'No autorizado' });
            }
        }
        
        const carton = await Carton.findOne({ numeroCarton });
        if (!carton) {
            return res.status(404).json({ error: 'Cartón no encontrado' });
        }
        
        carton.marcados = marcados || [];
        if (modo) carton.modoMarcado = modo;
        carton.ultimaConexion = new Date();
        
        await carton.save();
        
        res.json({ success: true, marcados: carton.marcados.length });
        
    } catch (error) {
        console.error('Error en sync:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/multi', (req, res) => {
    res.render('jugador/multi-carton', { name_page: info.name_page });
});

module.exports = router;