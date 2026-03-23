const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
require('dotenv').config();
const PORT = process.env.PORT || 3000;
const { info } = require('./config');

const Juego = require('./models/Juego');
const Carton = require('./models/Carton');
const Bola = require('./models/Bola');
const Usuario = require('./models/Usuario');

const indexRoutes = require('./routes/index');
const adminRoutes = require('./routes/admin');
const jugadorRoutes = require('./routes/jugador');

const { verificarGanador } = require('./controllers/juegoController');

function generarMatrizBingo() {
    const matriz = [];
    const rangos = [
        [1, 15], [16, 30], [31, 45], [46, 60], [61, 75]
    ];
    
    for (let col = 0; col < 5; col++) {
        const columna = [];
        const numerosColumna = new Set();
        const [min, max] = rangos[col];
        
        while (numerosColumna.size < 5) {
            const num = Math.floor(Math.random() * (max - min + 1)) + min;
            numerosColumna.add(num);
        }
        
        columna.push(...Array.from(numerosColumna));
        columna.sort((a, b) => a - b);
        
        for (let fila = 0; fila < 5; fila++) {
            if (!matriz[fila]) matriz[fila] = [];
            matriz[fila][col] = columna[fila];
        }
    }
    
    matriz[2][2] = null;
    return matriz;
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'bingo-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/bingo',
        collectionName: 'sessions'
    }),
    cookie: { 
        maxAge: 1000 * 60 * 60 * 24,
        httpOnly: true,
        secure: false
    }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(sessionMiddleware);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const bingoHelpers = require('./utils/ejsHelpers');
app.locals.bingoHelpers = bingoHelpers;

app.use('/', indexRoutes);
app.use('/admin', adminRoutes(io));
app.use('/jugador', jugadorRoutes);

async function conectarDB() {
    try {
        const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/bingo';
        console.log('🔌 Conectando a MongoDB...');
        
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 10000,
        });
        
        console.log('✅ MongoDB conectado correctamente');
        
        await limpiarConexionesAntiguas();
        
    } catch (error) {
        console.error('❌ Error conectando a MongoDB:', error.message);
        process.exit(1);
    }
}

async function limpiarConexionesAntiguas() {
    try {
        const juegoActivo = await Juego.findOne({ estado: 'jugando' });
        if (!juegoActivo) {
            await Carton.updateMany({}, { $set: { marcados: [] } });
        }
    } catch (e) { console.error(e); }
}

conectarDB();

const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));

io.on('connection', (socket) => {
    const session = socket.request.session;
    
    socket.on('registrar-carton', async (data) => {
        try {
            const { numeroCarton } = data;
            
            let carton = await Carton.findOne({ numeroCarton });
            
            if (!carton) {
                socket.emit('error', { mensaje: 'Cartón no encontrado' });
                return;
            }
            
            const juego = await Juego.findOne().sort({ createdAt: -1 });
            const juegoActivo = juego && juego.estado === 'jugando';
            
            if (carton.socketId && carton.socketId !== socket.id) {
                io.to(carton.socketId).emit('sesion-reemplazada');
            }
            
            carton.socketId = socket.id;
            carton.ultimaConexion = new Date();
            
            if (!juegoActivo) {
                carton.marcados = [];
                carton.modoMarcado = 'manual';
            }
            
            await carton.save();
            socket.join(`carton-${numeroCarton}`);
            
            socket.emit('estado-inicial', {
                carton,
                juego: juego || { estado: 'esperando' },
                juegoActivo
            });
        } catch (error) {
            console.error('Error registrando cartón:', error);
        }
    });
    
socket.on('iniciar-juego', async (data) => {
    try {
        if (!session.admin) {
            socket.emit('error', { mensaje: 'No autorizado' });
            return;
        }
        
        const { modalidad } = data;
        
        const usuariosActivos = await Usuario.find({ activo: true });
        const cartonesActivos = [];
        usuariosActivos.forEach(usuario => {
            cartonesActivos.push(...usuario.cartonesAsignados);
        });
        const cartonesUnicos = [...new Set(cartonesActivos)];
        
        const cartonesExistentes = await Carton.find({
            numeroCarton: { $in: cartonesUnicos }
        });
        
        const numerosExistentes = cartonesExistentes.map(c => c.numeroCarton);
        const cartonesFaltantes = cartonesUnicos.filter(c => !numerosExistentes.includes(c));
        
        if (cartonesFaltantes.length > 0) {
            for (const num of cartonesFaltantes) {
                const nuevoCarton = new Carton({
                    numeroCarton: num,
                    numeros: generarMatrizBingo(),
                    marcados: []
                });
                await nuevoCarton.save();
            }
        }
        
        await Carton.updateMany(
            { numeroCarton: { $in: cartonesUnicos } },
            { 
                $set: { 
                    marcados: [], 
                    modoMarcado: 'manual' 
                }
            }
        );
        
        await Juego.updateMany(
            { estado: { $in: ['jugando', 'pausado', 'esperando'] } }, 
            { estado: 'finalizado' }
        );
        
        const juego = new Juego({
            estado: 'jugando',
            modalidad,
            bolasCantadas: [],
            cartonesActivos: cartonesUnicos
        });
        await juego.save();
        
        io.emit('reiniciar-cartones'); 
        
        io.emit('juego-iniciado', { 
            modalidad,
            juegoId: juego._id
        });
        
        usuariosActivos.forEach(usuario => {
            io.to(`usuario-${usuario.codigoAcceso}`).emit('tus-cartones-reiniciados', {
                cartones: usuario.cartonesAsignados,
                mensaje: '🔄 ¡Nuevo juego! Tus cartones han sido limpiados.'
            });
        });
        
    } catch (error) {
        console.error('❌ Error iniciando juego:', error);
        socket.emit('error', { mensaje: 'Error crítico al iniciar el juego' });
    }
});

    socket.on('pausar-juego', async () => {
        try {
            if (!session.admin) return;
            
            await Juego.findOneAndUpdate(
                { estado: 'jugando' },
                { estado: 'pausado' }
            );
            
            io.emit('juego-pausado');
        } catch (error) {
            console.error('Error pausando juego:', error);
        }
    });
    
    socket.on('reanudar-juego', async () => {
        try {
            if (!session.admin) return;
            
            await Juego.findOneAndUpdate(
                { estado: 'pausado' },
                { estado: 'jugando' }
            );
            
            io.emit('juego-reanudado');
        } catch (error) {
            console.error('Error reanudando juego:', error);
        }
    });
    
    socket.on('finalizar-juego', async () => {
        try {
            if (!session.admin) return;
            
            const juego = await Juego.findOne({ estado: { $in: ['jugando', 'pausado'] } });
            
            if (juego) {
                juego.estado = 'finalizado';
                juego.ganador = {
                    cartonId: null,
                    tipo: 'cancelado',
                    timestamp: new Date()
                };
                await juego.save();
                
                io.emit('juego-terminado', {
                    mensaje: '🏁 Juego finalizado por el administrador',
                    cartonId: null,
                    tipo: 'cancelado'
                });
            }
            
        } catch (error) {
            console.error('Error finalizando juego:', error);
        }
    });
    
socket.on('cantar-bola', async (data) => {
    try {
        if (!session.admin) {
            socket.emit('error', { mensaje: 'No autorizado' });
            return;
        }
        
        const { numero } = data;
        
        const juego = await Juego.findOne({ estado: 'jugando' });
        if (!juego) {
            socket.emit('error', { mensaje: 'No hay juego activo' });
            return;
        }
        
        if (juego.bolasCantadas.includes(numero)) {
            socket.emit('error', { mensaje: 'Esta bola ya salió' });
            return;
        }
        
        juego.bolasCantadas.push(numero);
        juego.ultimaBola = numero;
        await juego.save();
        
        await Bola.create({ 
            juegoId: juego._id, 
            numero
        });

        let colBusqueda = 0;
        if (numero <= 15) colBusqueda = 0;
        else if (numero <= 30) colBusqueda = 1;
        else if (numero <= 45) colBusqueda = 2;
        else if (numero <= 60) colBusqueda = 3;
        else if (numero <= 75) colBusqueda = 4;

        for (let fila = 0; fila < 5; fila++) {
            const posicionStr = `${fila}-${colBusqueda}`;
            
            await Carton.updateMany(
                { 
                    numeroCarton: { $in: juego.cartonesActivos },
                    [`numeros.${fila}.${colBusqueda}`]: numero,
                    marcados: { $ne: posicionStr }
                },
                { $push: { marcados: posicionStr } }
            );
        }

        const formato = bingoHelpers.numeroAFormatoBingo(numero);
        const letra = bingoHelpers.getLetraBingo(numero);
        
        io.emit('nueva-bola', { 
            numero,
            formato,
            letra,
            bolasCantadas: juego.bolasCantadas
        });
        
        const ganador = await verificarGanador(juego._id);
        
        if (ganador) {
            juego.estado = 'finalizado';
            juego.ganador = {
                cartonId: ganador.cartonId,
                tipo: ganador.tipo,
                timestamp: new Date()
            };
            await juego.save();
            
            io.emit('juego-terminado', {
                mensaje: `🎉 ¡BINGO! Ganó el cartón #${ganador.cartonId}`,
                cartonId: ganador.cartonId,
                tipo: ganador.tipo
            });
        }
        
    } catch (error) {
        console.error('❌ Error crítico cantando bola:', error);
    }
});

    socket.on('marcar-manual', async (data) => {
        try {
            const { numeroCarton, posicion } = data;
            
            const carton = await Carton.findOne({ numeroCarton });
            if (!carton) return;
            
            if (!carton.marcados.includes(posicion)) {
                carton.marcados.push(posicion);
                await carton.save();
                
                socket.emit('marcado-exitoso', { posicion });
                
                const juego = await Juego.findOne({ estado: 'jugando' });
                if (juego) {
                    const ganador = await verificarGanador(juego._id, numeroCarton);
                    
                    if (ganador && ganador.cartonId === numeroCarton) {
                        juego.estado = 'finalizado';
                        juego.ganador = {
                            cartonId: numeroCarton,
                            tipo: ganador.tipo,
                            timestamp: new Date()
                        };
                        await juego.save();
                        
                        io.emit('juego-terminado', {
                            mensaje: `🎉 ¡BINGO! Ganó el cartón #${numeroCarton}`,
                            cartonId: numeroCarton,
                            tipo: ganador.tipo
                        });
                    }
                }
            }
            
        } catch (error) {
            console.error('Error marcando manual:', error);
        }
    });
    
    socket.on('marcar-manual-multi', async (data) => {
        try {
            const { codigo, cartonId, posicion } = data;
            const [fila, columna] = posicion.split('-').map(Number);
    
            const usuario = await Usuario.findOne({ 
                codigoAcceso: codigo.toUpperCase(),
                cartonesAsignados: cartonId,
                activo: true 
            });
            if (!usuario) return;
            
            const [carton, juego] = await Promise.all([
                Carton.findOne({ numeroCarton: cartonId }),
                Juego.findOne({ estado: 'jugando' })
            ]);
    
            if (!carton || !juego) return;
            
            const numeroEnPosicion = carton.numeros[fila][columna];
    
            const esCentro = (fila === 2 && columna === 2);
    
            if (!esCentro && !juego.bolasCantadas.includes(numeroEnPosicion)) {
                socket.emit('error', { mensaje: 'Ese número aún no ha salido' });
                return;
            }

            if (!carton.marcados.includes(posicion)) {
                carton.marcados.push(posicion);
                await carton.save();
                
                socket.emit('marcado-exitoso', { cartonId, posicion });
    
                const ganador = await verificarGanador(juego._id, cartonId);
                
                if (ganador && ganador.cartonId === cartonId) {
                    juego.estado = 'finalizado';
                    juego.ganador = {
                        cartonId: cartonId,
                        tipo: ganador.tipo,
                        timestamp: new Date()
                    };
                    await juego.save();
                    
                    io.emit('juego-terminado', {
                        mensaje: `🎉 ¡BINGO! Ganó el cartón #${cartonId}`,
                        cartonId: cartonId,
                        tipo: ganador.tipo
                    });
                }
            }
        } catch (error) {
            console.error('❌ Error en validación de marcado:', error);
        }
    });

    socket.on('cambiar-modo', async (data) => {
        try {
            const { numeroCarton, modo } = data;
            
            await Carton.findOneAndUpdate(
                { numeroCarton },
                { modoMarcado: modo }
            );
            
            socket.emit('modo-cambiado', { modo });
            
        } catch (error) {
            console.error('Error cambiando modo:', error);
        }
    });
    
    socket.on('cambiar-modo-global', async (data) => {
        try {
            const { codigo, modo } = data;
            
            const usuario = await Usuario.findOne({ codigoAcceso: codigo.toUpperCase() });
            
            if (usuario) {
                await Carton.updateMany(
                    { numeroCarton: { $in: usuario.cartonesAsignados } },
                    { modoMarcado: modo }
                );
                
            }
            
            socket.emit('modo-global-actualizado', { modo });
            
        } catch (error) {
            console.error('Error cambiando modo global:', error);
        }
    });
    
    socket.on('cantar-bingo', async (data) => {
        try {
            const { numeroCarton } = data;
            
            const juego = await Juego.findOne({ estado: 'jugando' });
            if (!juego) {
                socket.emit('error', { mensaje: 'No hay juego activo' });
                return;
            }
            
            const ganador = await verificarGanador(juego._id, numeroCarton);
            
            if (ganador && ganador.cartonId === numeroCarton) {
                juego.estado = 'finalizado';
                juego.ganador = {
                    cartonId: numeroCarton,
                    tipo: ganador.tipo,
                    timestamp: new Date()
                };
                await juego.save();
                
                io.emit('juego-terminado', {
                    mensaje: `🎉 ¡BINGO! Ganó el cartón #${numeroCarton}`,
                    cartonId: numeroCarton,
                    tipo: ganador.tipo
                });
            } else {
                socket.emit('error', { mensaje: '❌ Aún no has ganado' });
            }
            
        } catch (error) {
            console.error('Error cantando bingo:', error);
        }
    });
    
    socket.on('acceder-con-codigo', async (data) => {
        try {
            const { codigo } = data;
            
            const usuario = await Usuario.findOne({ 
                codigoAcceso: codigo.toUpperCase(),
                activo: true 
            });
            
            if (!usuario) {
                socket.emit('error-acceso', { 
                    mensaje: 'Código inválido o no activo' 
                });
                return;
            }
            
            const cartonesFinales = [];
            
            for (const num of usuario.cartonesAsignados) {
                let carton = await Carton.findOne({ numeroCarton: num });
                
                if (!carton) {
                    carton = new Carton({
                        numeroCarton: num,
                        numeros: generarMatrizBingo(),
                        marcados: []
                    });
                    await carton.save();
                }
                
                cartonesFinales.push(carton);
            }
            
            if (!usuario.socketIds.includes(socket.id)) {
                usuario.socketIds.push(socket.id);
            }
            usuario.ultimaConexion = new Date();
            await usuario.save();
            
            socket.join(`usuario-${usuario.codigoAcceso}`);
            
            const juego = await Juego.findOne().sort({ createdAt: -1 });
            
            socket.emit('acceso-exitoso', {
                usuario: {
                    codigo: usuario.codigoAcceso,
                    nombre: usuario.nombre,
                    cartones: usuario.cartonesAsignados
                },
                cartones: cartonesFinales,
                juego: juego || { estado: 'esperando' }
            });
            
        } catch (error) {
            console.error('Error en acceso:', error);
            socket.emit('error-acceso', { mensaje: 'Error del servidor' });
        }
    });
    
    socket.on('registrar-usuario-multi', async (data) => {
        try {
            const { codigo, modo } = data;
            
            const usuario = await Usuario.findOne({ 
                codigoAcceso: codigo.toUpperCase(),
                activo: true 
            });
            
            if (!usuario) {
                socket.emit('error', { mensaje: 'Usuario no encontrado' });
                return;
            }
            
            if (!usuario.socketIds.includes(socket.id)) {
                usuario.socketIds.push(socket.id);
            }
            usuario.ultimaConexion = new Date();
            await usuario.save();
            
            socket.join(`usuario-${usuario.codigoAcceso}`);
            
        } catch (error) {
            console.error('Error registrando usuario multi:', error);
        }
    });
    
    socket.on('obtener-usuarios', async () => {
        try {
            if (!session.admin) return;
            
            const usuarios = await Usuario.find({ activo: true }).lean();
            socket.emit('lista-usuarios', usuarios);
            
        } catch (error) {
            console.error('Error obteniendo usuarios:', error);
        }
    });
    
    socket.on('disconnect', async () => {
        try {
            const carton = await Carton.findOne({ socketId: socket.id });
            
            if (carton) {
                const juegoActivo = await Juego.findOne({ estado: 'jugando' });
                
                if (juegoActivo) {
                    carton.socketId = null;
                    carton.ultimaConexion = new Date();
                    await carton.save();
                } else {
                    carton.socketId = null;
                    carton.marcados = [];
                    carton.modoMarcado = 'manual';
                    carton.ultimaConexion = new Date();
                    await carton.save();
                }
                
                io.emit('jugador-desconectado', { 
                    cartonId: carton.numeroCarton
                });
            }
        } catch (error) {
            console.error('Error en desconexión:', error);
        }
    });
});

app.get('/api/juego/estado/:numeroCarton', async (req, res) => {
    try {
        const numeroCarton = parseInt(req.params.numeroCarton);
        const juego = await Juego.findOne().sort({ createdAt: -1 });
        const carton = await Carton.findOne({ numeroCarton });
        
        res.json({
            juego: {
                estado: juego?.estado || 'esperando',
                modalidad: juego?.modalidad || null,
                bolasCantadas: juego?.bolasCantadas || []
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

app.post('/api/admin/reiniciar-todo', async (req, res) => {
    try {
        const juegoActivo = await Juego.findOne({ estado: 'jugando' });
        
        if (juegoActivo) {
            return res.status(400).json({ 
                success: false, 
                error: 'No se puede reiniciar mientras hay un juego activo' 
            });
        }
        
        await Carton.updateMany({}, { 
            marcados: [],
            socketId: null,
            modoMarcado: 'manual'
        });
        
        await Juego.updateMany({}, { 
            estado: 'esperando',
            bolasCantadas: [],
            ganador: null
        });
        
        res.json({ 
            success: true, 
            message: 'Todos los cartones han sido reiniciados' 
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/jugador/estado/:codigo', async (req, res) => {
    try {
        const codigo = req.params.codigo.toUpperCase();
        
        const usuario = await Usuario.findOne({ codigoAcceso: codigo });
        if (!usuario) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        const cartones = await Carton.find({
            numeroCarton: { $in: usuario.cartonesAsignados }
        }).select('numeroCarton marcados');
        
        res.json({ 
            success: true, 
            cartones: cartones 
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

setInterval(() => {
  fetch((info.DOMINIO || `http://localhost:${PORT}`) + '/ping')
    .then(res => { /* console.log('Ping OK'); */ })
    .catch(err => console.error('Ping Error:', err.message));
}, 14 * 60 * 1000);

app.use((req, res) => {
  res.status(404).render("errores", {
    errorMessage: "La página que buscas no está en juego.",
    name_page: info.name_page
  });
});

server.listen(PORT, () => {
    console.log(`Servidor corriendo en PORT: ${PORT}`);
});