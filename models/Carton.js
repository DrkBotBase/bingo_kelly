const mongoose = require('mongoose');

const cartonSchema = new mongoose.Schema({
  numeroCarton: { type: Number, unique: true, required: true },
  numeros: {
    type: [[Number]],
    required: true,
    validate: {
      validator: function(v) {
        return v.length === 5 && v.every(row => row.length === 5);
      },
      message: 'El cartón debe ser 5x5'
    }
  },
  marcados: [String],
  modoMarcado: {
    type: String,
    enum: ['manual', 'automatico'],
    default: 'automatico'
  },
  socketId: String,
  ultimaConexion: { type: Date, default: Date.now }
});

module.exports = mongoose.model('KCarton', cartonSchema);