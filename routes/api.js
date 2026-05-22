const express = require('express');
const router = express.Router();
const Juego = require('../models/Juego');
const Carton = require('../models/Carton');
const Usuario = require('../models/Usuario');

/**
 * Obtener estado general del juego
 */
router.get('/juego/estado', async (req, res) => {
    try {
        const juego = await Juego.findOne().sort({ createdAt: -1 }).lean();
        res.json({ 
            success: true,
            juego: juego || { 
                estado: 'esperando', 
                bolasCantadas: [], 
                ganadores: [] 
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Obtener estado de un cartón específico y del juego
 */
router.get('/juego/estado/:numeroCarton', async (req, res) => {
    try {
        const numeroCarton = parseInt(req.params.numeroCarton);
        const [juego, carton] = await Promise.all([
            Juego.findOne().sort({ createdAt: -1 }).lean(),
            Carton.findOne({ numeroCarton }).lean()
        ]);
        
        res.json({
            juego: {
                estado: juego?.estado || 'esperando',
                modalidad: juego?.modalidad || null,
                bolasCantadas: juego?.bolasCantadas || [],
                ganadores: juego?.ganadores || [] 
            },
            carton: {
                marcados: carton?.marcados || [],
                modo: carton?.modoMarcado || 'manual'
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Obtener cartones de un jugador por su código
 */
router.get('/jugador/estado/:codigo', async (req, res) => {
    try {
        const codigo = req.params.codigo.toUpperCase();
        const usuario = await Usuario.findOne({ codigoAcceso: codigo });
        
        if (!usuario) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        const cartones = await Carton.find({
            numeroCarton: { $in: usuario.cartonesAsignados }
        }).select('numeroCarton marcados').lean();
        
        res.json({ 
            success: true, 
            cartones: cartones 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Sincronización masiva para modo multi-cartón
 */
router.post('/jugador/sync-multi', async (req, res) => {
    try {
        const { codigo, marcados, modo } = req.body;
        
        // Opcional: Validar que el código pertenece al usuario de estos cartones
        
        const promesas = Object.entries(marcados).map(([cartonId, marcadosArray]) => {
            return Carton.findOneAndUpdate(
                { numeroCarton: parseInt(cartonId) },
                { 
                    marcados: marcadosArray,
                    modoMarcado: modo,
                    ultimaConexion: new Date()
                }
            );
        });
        
        await Promise.all(promesas);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
