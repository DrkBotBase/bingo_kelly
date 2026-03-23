const mongoose = require('mongoose');

const bolaSchema = new mongoose.Schema({
  juegoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Juego', required: true },
  numero: { type: Number, required: true, min: 1, max: 75 },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('KBola', bolaSchema);