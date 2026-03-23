const mongoose = require('mongoose');

const juegeSchema = new mongoose.Schema({
  estado: { 
    type: String, 
    enum: ['esperando', 'jugando', 'pausado', 'finalizado'],
    default: 'esperando'
  },
  modalidad: {
    type: String,
    enum: ['linea', 'dobles-linea', 'carton-lleno', 'forma-x', 'esquinas'],
    default: 'carton-lleno'
  },
  bolasCantadas: [Number],
  ultimaBola: Number,
  cartonesActivos: [Number],
  cartonesDisponibles: [Number],
  ganador: {
    cartonId: Number,
    tipo: String,
    timestamp: Date
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('KJuego', juegeSchema);