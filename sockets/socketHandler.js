const Juego = require('../models/Juego');
const Carton = require('../models/Carton');
const Bola = require('../models/Bola');
const Usuario = require('../models/Usuario');
const Historial = require('../models/Historial');
const { verificarGanador } = require('../controllers/juegoController');
const { generarMatrizBingo } = require('../utils/bingoUtils');
const bingoHelpers = require('../utils/ejsHelpers');
const schemas = require('../validations/bingoSchemas');

async function guardarEnHistorial(juego, estadoFinal = 'completado') {
    try {
        if (!juego) return;
        
        const ganadoresConNombre = [];
        if (juego.ganadores && juego.ganadores.length > 0) {
            for (const g of juego.ganadores) {
                const usuario = await Usuario.findOne({ cartonesAsignados: g.cartonId });
                ganadoresConNombre.push({
                    cartonId: g.cartonId,
                    tipo: g.tipo,
                    nombreJugador: usuario ? usuario.nombre : 'Anónimo',
                    timestamp: g.timestamp
                });
            }
        } else if (juego.ganador && juego.ganador.cartonId) {
            const usuario = await Usuario.findOne({ cartonesAsignados: juego.ganador.cartonId });
            ganadoresConNombre.push({
                cartonId: juego.ganador.cartonId,
                tipo: juego.ganador.tipo,
                nombreJugador: usuario ? usuario.nombre : 'Anónimo',
                timestamp: juego.ganador.timestamp
            });
        }

        const nuevoHistorial = new Historial({
            modalidad: juego.modalidad,
            bolasCantadas: juego.bolasCantadas,
            totalBolas: juego.bolasCantadas.length,
            ganadores: ganadoresConNombre,
            estadoFinal: estadoFinal
        });
        
        await nuevoHistorial.save();
        console.log(`📜 Historial guardado: Juego ${juego._id} (${estadoFinal})`);
    } catch (error) {
        console.error('❌ Error guardando historial:', error);
    }
}

module.exports = function(io, sessionMiddleware) {
    // Middleware para que socket.io use las sesiones de Express
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

                // Asegurar que el cartón esté en la lista de activos si hay juego en curso
                if (juegoActivo && !juego.cartonesActivos.includes(numeroCarton)) {
                    juego.cartonesActivos.push(numeroCarton);
                    await juego.save();
                }

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

                // VALIDACIÓN
                const { error, value } = schemas.iniciarJuego.validate(data);
                if (error) {
                    socket.emit('error', { mensaje: error.details[0].message });
                    return;
                }
                
                const { modalidad } = value;
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
                    { $set: { marcados: [], modoMarcado: 'manual' } }
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
                io.emit('juego-iniciado', { modalidad, juegoId: juego._id });
                
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
                await Juego.findOneAndUpdate({ estado: 'jugando' }, { estado: 'pausado' });
                io.emit('juego-pausado');
            } catch (error) { console.error('Error pausando juego:', error); }
        });
        
        socket.on('reanudar-juego', async () => {
            try {
                if (!session.admin) return;
                await Juego.findOneAndUpdate({ estado: 'pausado' }, { estado: 'jugando' });
                io.emit('juego-reanudado');
            } catch (error) { console.error('Error reanudando juego:', error); }
        });
        
        socket.on('finalizar-juego', async () => {
            try {
                if (!session.admin) return;
                const juego = await Juego.findOne({ estado: { $in: ['jugando', 'pausado'] } });
                if (juego) {
                    juego.estado = 'finalizado';
                    juego.ganador = { cartonId: null, tipo: 'cancelado', timestamp: new Date() };
                    await juego.save();
                    
                    // GUARDAR EN HISTORIAL
                    await guardarEnHistorial(juego, 'cancelado');

                    io.emit('juego-terminado', {
                        mensaje: '🏁 Juego finalizado por el administrador',
                        cartonId: null,
                        tipo: 'cancelado'
                    });
                }
            } catch (error) { console.error('Error finalizando juego:', error); }
        });

        socket.on('solicitar-bola-aleatoria', async () => {
            try {
                if (!session.admin) return;
                const juego = await Juego.findOne({ estado: 'jugando' });
                if (!juego) {
                    socket.emit('error', { mensaje: 'No hay juego activo' });
                    return;
                }
                const todasLasPosibles = Array.from({ length: 75 }, (_, i) => i + 1);
                const bolasDisponibles = todasLasPosibles.filter(num => !juego.bolasCantadas.includes(num));

                if (bolasDisponibles.length === 0) {
                    socket.emit('error', { mensaje: '¡Ya salieron todas las bolas!' });
                    return;
                }
                const indiceAleatorio = Math.floor(Math.random() * bolasDisponibles.length);
                const numeroElegido = bolasDisponibles[indiceAleatorio];
                socket.emit('confirmar-bola-sugerida', { numero: numeroElegido });
            } catch (error) { console.error('Error generando bola aleatoria:', error); }
        });

        socket.on('cantar-bola', async (data) => {
            try {
                if (!session.admin) {
                    socket.emit('error', { mensaje: 'No autorizado' });
                    return;
                }

                // VALIDACIÓN
                const { error, value } = schemas.cantarBola.validate(data);
                if (error) {
                    socket.emit('error', { mensaje: error.details[0].message });
                    return;
                }
                
                const { numero } = value;
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
                await Bola.create({ juegoId: juego._id, numero });

                // Marcar la bola en todos los cartones (en base de datos)
                const colBusqueda = Math.floor((numero - 1) / 15);
                const bulkOps = [];
                for (let fila = 0; fila < 5; fila++) {
                    const posicionStr = `${fila}-${colBusqueda}`;
                    bulkOps.push({
                        updateMany: {
                            filter: { 
                                [`numeros.${fila}.${colBusqueda}`]: numero,
                                marcados: { $ne: posicionStr }
                            },
                            update: { $push: { marcados: posicionStr } }
                        }
                    });
                }
                
                if (bulkOps.length > 0) {
                    await Carton.bulkWrite(bulkOps);
                }

                const formato = bingoHelpers.numeroAFormatoBingo(numero);
                const letra = bingoHelpers.getLetraBingo(numero);
                
                // Notificar nueva bola inmediatamente
                io.emit('nueva-bola', { 
                    numero, formato, letra, bolasCantadas: juego.bolasCantadas
                });
                
                // Verificar ganadores después de actualizar la DB
                const ganadores = await verificarGanador(juego._id);
                if (ganadores && ganadores.length > 0) {
                    juego.estado = 'finalizado';
                    juego.ganadores = ganadores.map(g => ({
                        cartonId: g.cartonId, tipo: g.tipo, timestamp: new Date()
                    }));
                    juego.ganador = {
                        cartonId: ganadores[0].cartonId, tipo: ganadores[0].tipo, timestamp: new Date()
                    };
                    await juego.save();
                    
                    // GUARDAR EN HISTORIAL
                    await guardarEnHistorial(juego, 'completado');

                    const listaIds = ganadores.map(g => `#${g.cartonId}`).join(', ');
                    const mensajeFinal = ganadores.length > 1 
                        ? `🎉 ¡BINGO MÚLTIPLE! Ganaron los cartones: ${listaIds}`
                        : `🎉 ¡BINGO! Ganó el cartón #${ganadores[0].cartonId}`;
                    
                    // Retraso para asegurar que los clientes vean la bola marcada antes del aviso de ganador
                    setTimeout(() => {
                        io.emit('juego-terminado', {
                            mensaje: mensajeFinal,
                            ganadores: ganadores,
                            cartonId: ganadores[0].cartonId,
                            tipo: ganadores[0].tipo
                        });
                    }, 1500);
                }
            } catch (error) { console.error('❌ Error crítico cantando bola:', error); }
        });

        socket.on('marcar-manual', async (data) => {
            try {
                // VALIDACIÓN
                const { error, value } = schemas.marcarManual.validate(data);
                if (error) {
                    socket.emit('error', { mensaje: error.details[0].message });
                    return;
                }

                const { numeroCarton, posicion } = value;
                const carton = await Carton.findOne({ numeroCarton });
                if (!carton) return;
                
                if (!carton.marcados.includes(posicion)) {
                    carton.marcados.push(posicion);
                    await carton.save();
                    socket.emit('marcado-exitoso', { posicion });
                    
                    const juego = await Juego.findOne({ estado: 'jugando' });
                    if (juego) {
                        const ganadores = await verificarGanador(juego._id, numeroCarton);
                        if (ganadores && ganadores.some(g => g.cartonId === numeroCarton)) {
                            const ganador = ganadores.find(g => g.cartonId === numeroCarton);
                            juego.estado = 'finalizado';
                            juego.ganador = {
                                cartonId: numeroCarton, tipo: ganador.tipo, timestamp: new Date()
                            };
                            await juego.save();
                            
                            // GUARDAR EN HISTORIAL
                            await guardarEnHistorial(juego, 'completado');

                            io.emit('juego-terminado', {
                                mensaje: `🎉 ¡BINGO! Ganó el cartón #${numeroCarton}`,
                                cartonId: numeroCarton,
                                tipo: ganador.tipo
                            });
                        }
                    }
                }
            } catch (error) { console.error('Error marcando manual:', error); }
        });
        
        socket.on('marcar-manual-multi', async (data) => {
            try {
                // VALIDACIÓN
                const { error, value } = schemas.marcarManualMulti.validate(data);
                if (error) {
                    socket.emit('error', { mensaje: error.details[0].message });
                    return;
                }

                const { codigo, cartonId, posicion } = value;
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
                    const ganadores = await verificarGanador(juego._id, cartonId);
                    if (ganadores && ganadores.some(g => g.cartonId === cartonId)) {
                        const ganador = ganadores.find(g => g.cartonId === cartonId);
                        juego.estado = 'finalizado';
                        juego.ganador = {
                            cartonId: cartonId, tipo: ganador.tipo, timestamp: new Date()
                        };
                        await juego.save();

                        // GUARDAR EN HISTORIAL
                        await guardarEnHistorial(juego, 'completado');

                        io.emit('juego-terminado', {
                            mensaje: `🎉 ¡BINGO! Ganó el cartón #${cartonId}`,
                            cartonId: cartonId,
                            tipo: ganador.tipo
                        });
                    }
                }
            } catch (error) { console.error('❌ Error en validación de marcado:', error); }
        });

        socket.on('cambiar-modo', async (data) => {
            try {
                const { numeroCarton, modo } = data;
                await Carton.findOneAndUpdate({ numeroCarton }, { modoMarcado: modo });
                socket.emit('modo-cambiado', { modo });
            } catch (error) { console.error('Error cambiando modo:', error); }
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
            } catch (error) { console.error('Error cambiando modo global:', error); }
        });
        
        socket.on('cantar-bingo', async (data) => {
            try {
                const { numeroCarton } = data;
                const juego = await Juego.findOne({ estado: 'jugando' });
                if (!juego) {
                    socket.emit('error', { mensaje: 'No hay juego activo' });
                    return;
                }
                const ganadores = await verificarGanador(juego._id, numeroCarton);
                if (ganadores && ganadores.some(g => g.cartonId === numeroCarton)) {
                    const ganador = ganadores.find(g => g.cartonId === numeroCarton);
                    juego.estado = 'finalizado';
                    juego.ganador = {
                        cartonId: numeroCarton, tipo: ganador.tipo, timestamp: new Date()
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
            } catch (error) { console.error('Error cantando bingo:', error); }
        });
        
        socket.on('acceder-con-codigo', async (data) => {
            try {
                // VALIDACIÓN
                const { error, value } = schemas.accesoCodigo.validate(data);
                if (error) {
                    socket.emit('error-acceso', { mensaje: error.details[0].message });
                    return;
                }

                const { codigo } = value;
                const usuario = await Usuario.findOne({ 
                    codigoAcceso: codigo.toUpperCase(),
                    activo: true 
                });
                
                if (!usuario) {
                    socket.emit('error-acceso', { mensaje: 'Código inválido o no activo' });
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

                // Si el juego está en curso, añadir sus cartones a la lista de activos
                if (juego && juego.estado === 'jugando') {
                    let huboCambio = false;
                    usuario.cartonesAsignados.forEach(num => {
                        if (!juego.cartonesActivos.includes(num)) {
                            juego.cartonesActivos.push(num);
                            huboCambio = true;
                        }
                    });
                    if (huboCambio) await juego.save();
                }
                
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
                const { codigo } = data;
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
            } catch (error) { console.error('Error registrando usuario multi:', error); }
        });
        
        socket.on('obtener-usuarios', async () => {
            try {
                if (!session.admin) return;
                const usuarios = await Usuario.find({ activo: true }).lean();
                socket.emit('lista-usuarios', usuarios);
            } catch (error) { console.error('Error obteniendo usuarios:', error); }
        });
        
        socket.on('disconnect', async () => {
            try {
                const carton = await Carton.findOne({ socketId: socket.id });
                if (carton) {
                    const juegoActivo = await Juego.findOne({ estado: 'jugando' });
                    carton.socketId = null;
                    carton.ultimaConexion = new Date();
                    if (!juegoActivo) {
                        carton.marcados = [];
                        carton.modoMarcado = 'manual';
                    }
                    await carton.save();
                    io.emit('jugador-desconectado', { cartonId: carton.numeroCarton });
                }
            } catch (error) { console.error('Error en desconexión:', error); }
        });
    });
};
