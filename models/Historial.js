const mongoose = require('mongoose');

const historialSchema = new mongoose.Schema({
    fecha: { type: Date, default: Date.now },
    modalidad: { type: String, required: true },
    bolasCantadas: [Number],
    totalBolas: Number,
    ganadores: [{
        cartonId: Number,
        tipo: String,
        nombreJugador: String,
        timestamp: Date
    }],
    estadoFinal: { 
        type: String, 
        enum: ['completado', 'cancelado'],
        default: 'completado'
    }
});

module.exports = mongoose.model('KHistorial', historialSchema);
