const express = require('express');
const router = express.Router();
const Juego = require('../models/Juego');
const Carton = require('../models/Carton');
const Usuario = require('../models/Usuario');
const { info } = require('../config');

const TOTAL_MAX_CARTONES = 1000; 
module.exports = function(io) {
    const requireAdmin = (req, res, next) => {
      if (req.session.admin) {
        next();
      } else {
        res.redirect('/admin/login');
      }
    };
    
    router.get('/login', (req, res) => {
      if (req.session.admin) {
        return res.redirect('/admin/dashboard');
      }
      res.render('admin/login', { error: null, name_page: info.name_page });
    });
    
    router.post('/login', async (req, res) => {
      const { username, password } = req.body;
      if (username === process.env.ADMIN_USERNAME && 
          password === process.env.ADMIN_PASSWORD) {
        req.session.admin = true;
        res.redirect('/admin/dashboard');
      } else {
        res.render('admin/login', { error: 'Credenciales incorrectas', name_page: info.name_page });
      }
    });
    
    router.get('/logout', (req, res) => {
      req.session.destroy();
      res.redirect('/admin/login');
    });
    
    router.get('/dashboard', requireAdmin, async (req, res) => {
      try {
        const juego = await Juego.findOne().sort({ createdAt: -1 });
        const cartonesActivos = await Carton.countDocuments({ socketId: { $ne: null } });
        const totalCartones = await Carton.countDocuments();
        
        const cartones = await Carton.find()
          .sort({ ultimaConexion: -1 })
          .limit(20)
          .lean();
        
        res.render('admin/dashboard', {
          juego: juego || { estado: 'esperando', bolasCantadas: [] },
          estadisticas: {
            cartonesActivos,
            totalCartones,
            bolasCantadas: juego?.bolasCantadas?.length || 0
          },
          name_page: info.name_page,
          cartones: cartones || []
        });
      } catch (error) {
        console.error('Error en dashboard:', error);
        res.status(500).render('errores', { mensaje: 'Error cargando el dashboard', name_page: info.name_page });
      }
    });
    
    router.get('/control', requireAdmin, async (req, res) => {
      try {
        const juego = await Juego.findOne().sort({ createdAt: -1 });
        const cartones = await Carton.find().limit(10).lean();
        
        res.render('admin/control', {
          juego: juego || { estado: 'esperando', bolasCantadas: [] },
          cartones: cartones || [],
          name_page: info.name_page
        });
      } catch (error) {
        res.status(500).render('errores', { mensaje: 'Error cargando el panel de control', name_page: info.name_page });
      }
    });
    
    router.post('/api/reset', requireAdmin, async (req, res) => {
        try {
            await Juego.updateMany({ estado: { $ne: 'finalizado' } }, { estado: 'finalizado' });
            
            const nuevoJuego = new Juego({
                estado: 'esperando',
                bolasCantadas: [],
                cartonesActivos: []
            });
            await nuevoJuego.save();
            
            await Carton.updateMany({}, { $set: { marcados: [] } });

            io.emit('reiniciar-cartones'); 
            io.emit('juego-terminado', { mensaje: '🏁 Nuevo juego iniciado' });

            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.get('/api/stats', requireAdmin, async (req, res) => {
        try {
            const juego = await Juego.findOne({ estado: 'jugando' });
            const cartonesConectados = await Carton.find({ socketId: { $ne: null } })
                .select('numeroCarton marcados')
                .lean();
            
            const conectadosList = cartonesConectados.map(c => c.numeroCarton);
            
            let progresoTotal = 0;
            cartonesConectados.forEach(c => {
                progresoTotal += (c.marcados?.length || 0);
            });
            
            const progresoPromedio = cartonesConectados.length > 0 ? 
                Math.round((progresoTotal / (cartonesConectados.length * 24)) * 100) : 0;
            
            res.json({
                juego,
                cartonesConectados: cartonesConectados.length,
                cartonesConectadosList: conectadosList,
                progresoPromedio,
                timestamp: new Date()
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    
    router.get('/cartones', requireAdmin, async (req, res) => {
        try {
            let juego = await Juego.findOne().sort({ createdAt: -1 });
            
            if (!juego) {
                juego = new Juego({
                    estado: 'esperando',
                    cartonesActivos: [],
                    cartonesDisponibles: Array.from({ length: TOTAL_MAX_CARTONES }, (_, i) => i + 1)
                });
                await juego.save();
            }
            
            const cartonesConectados = await Carton.find({ socketId: { $ne: null } })
                .select('numeroCarton')
                .lean();
            
            const conectadosList = cartonesConectados.map(c => c.numeroCarton);
            
            res.render('admin/cartones', {
                juego: juego,
                cartonesConectados: conectadosList,
                totalMax: TOTAL_MAX_CARTONES,
                name_page: info.name_page
            });
        } catch (error) {
            res.status(500).render('errores', { mensaje: 'Error: ' + error.message, name_page: info.name_page });
        }
    });
    
    router.post('/api/cartones/activar', requireAdmin, async (req, res) => {
        try {
            const { cartones } = req.body;
            if (!Array.isArray(cartones)) {
                return res.status(400).json({ success: false, error: 'Formato inválido' });
            }
            
            const validos = cartones.filter(c => c >= 1 && c <= TOTAL_MAX_CARTONES);
            let juego = await Juego.findOne().sort({ createdAt: -1 });
            
            if (!juego) {
                juego = new Juego({
                    estado: 'esperando',
                    cartonesActivos: validos,
                    cartonesDisponibles: Array.from({ length: TOTAL_MAX_CARTONES }, (_, i) => i + 1)
                });
            } else {
                juego.cartonesActivos = validos;
            }
            
            await juego.save();
            res.json({ success: true, message: `${validos.length} cartones activados`, cartones: validos });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    router.get('/api/cartones/estado', requireAdmin, async (req, res) => {
        try {
            const juego = await Juego.findOne().sort({ createdAt: -1 });
            const cartonesConectados = await Carton.find({ socketId: { $ne: null } })
                .select('numeroCarton')
                .lean();
            
            res.json({
                activos: juego ? juego.cartonesActivos : [],
                conectados: cartonesConectados.map(c => c.numeroCarton),
                total: TOTAL_MAX_CARTONES
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    
    router.post('/api/cartones/reset', requireAdmin, async (req, res) => {
        try {
            const juego = await Juego.findOne().sort({ createdAt: -1 });
            if (juego) {
                juego.cartonesActivos = [];
                await juego.save();
            }
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    router.get('/usuarios', requireAdmin, async (req, res) => {
        try {
            const usuarios = await Usuario.find({ activo: true }).sort({ createdAt: -1 }).lean();
            const cartones = await Carton.find().select('numeroCarton').lean();
            const juego = await Juego.findOne().sort({ createdAt: -1 });
            
            res.render('admin/usuarios', {
                usuarios: usuarios,
                cartones: cartones.map(c => c.numeroCarton),
                juego: juego || { estado: 'esperando' },
                name_page: info.name_page
            });
        } catch (error) {
            res.status(500).render('errores', { mensaje: 'Error: ' + error.message, name_page: info.name_page });
        }
    });
    
    router.get('/api/usuarios', requireAdmin, async (req, res) => {
        try {
            const usuarios = await Usuario.find({ activo: true })
                .sort({ createdAt: -1 })
                .lean();
            
            res.json({ 
                success: true, 
                usuarios: usuarios 
            });
        } catch (error) {
            console.error('Error al obtener usuarios:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Error al cargar la lista de usuarios' 
            });
        }
    });
    router.post('/api/usuarios', requireAdmin, async (req, res) => {
        try {
            const { codigo, nombre, cartones } = req.body;
            const codigoLimpio = codigo.toUpperCase().trim();
    
            if (!codigoLimpio) return res.status(400).json({ success: false, error: 'Código requerido' });
            
            if (cartones && cartones.length > 0) {
                const usuarioConMismoCarton = await Usuario.findOne({
                    codigoAcceso: { $ne: codigoLimpio },
                    cartonesAsignados: { $in: cartones },
                    activo: true
                });
    
                if (usuarioConMismoCarton) {
                    const cartonRepetido = cartones.find(c => 
                        usuarioConMismoCarton.cartonesAsignados.includes(c)
                    );
    
                    return res.status(400).json({ 
                        success: false, 
                        error: `El cartón #${cartonRepetido} ya lo tiene el usuario: ${usuarioConMismoCarton.codigoAcceso}` 
                    });
                }
            }
    
            if (cartones && cartones.length > 4) {
                return res.status(400).json({ success: false, error: 'Máximo 4 cartones por usuario' });
            }
            
            let usuario = await Usuario.findOne({ codigoAcceso: codigoLimpio });
            
            if (usuario) {
                usuario.nombre = nombre || usuario.nombre;
                if (cartones) usuario.cartonesAsignados = cartones;
                usuario.activo = true;
            } else {
                usuario = new Usuario({
                    codigoAcceso: codigoLimpio,
                    nombre: nombre || 'Jugador',
                    cartonesAsignados: cartones || []
                });
            }
            
            await usuario.save();
            res.json({ success: true, usuario });
    
        } catch (error) {
            console.error("Error al guardar usuario:", error);
            res.status(500).json({ success: false, error: 'Error interno del servidor' });
        }
    });
    
    router.post('/api/usuarios/desactivar', requireAdmin, async (req, res) => {
        try {
            const { codigo } = req.body;
            
            const resultado = await Usuario.findOneAndUpdate(
                { codigoAcceso: codigo.toUpperCase() },
                { activo: false }
            );
            
            if (!resultado) {
                return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
            }
            
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    return router;
}