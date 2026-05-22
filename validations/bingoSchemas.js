const Joi = require('joi');

const schemas = {
    // Validación para iniciar un juego
    iniciarJuego: Joi.object({
        modalidad: Joi.string()
            .valid('linea', 'dobles-linea', 'carton-lleno', 'forma-x', 'esquinas')
            .required()
            .messages({
                'any.only': 'La modalidad seleccionada no es válida.',
                'any.required': 'La modalidad es obligatoria.'
            })
    }),

    // Validación para cantar una bola
    cantarBola: Joi.object({
        numero: Joi.number()
            .integer()
            .min(1)
            .max(75)
            .required()
            .messages({
                'number.base': 'La bola debe ser un número.',
                'number.min': 'El número mínimo es 1.',
                'number.max': 'El número máximo es 75.',
                'any.required': 'El número de bola es obligatorio.'
            })
    }),

    // Validación para marcar un número manualmente
    marcarManual: Joi.object({
        numeroCarton: Joi.number().integer().required(),
        posicion: Joi.string()
            .pattern(/^[0-4]-[0-4]$/)
            .required()
            .messages({
                'string.pattern.base': 'La posición debe tener el formato fila-columna (ej: 0-2).'
            })
    }),

    // Validación para marcado múltiple (jugadores con código)
    marcarManualMulti: Joi.object({
        codigo: Joi.string().uppercase().trim().required(),
        cartonId: Joi.number().integer().required(),
        posicion: Joi.string()
            .pattern(/^[0-4]-[0-4]$/)
            .required()
    }),

    // Validación para acceso con código
    accesoCodigo: Joi.object({
        codigo: Joi.string().uppercase().trim().min(4).required()
    })
};

module.exports = schemas;
