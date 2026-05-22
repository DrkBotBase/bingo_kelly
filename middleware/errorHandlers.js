/**
 * Middleware para capturar errores 404 (Página no encontrada)
 */
function error404Handler(req, res, next) {
    const { info } = require('../config');
    res.status(404).render("errores", {
        errorMessage: "La página que buscas no está en juego.",
        name_page: info.name_page
    });
}

/**
 * Middleware global para manejar errores 500
 */
function globalErrorHandler(err, req, res, next) {
    console.error('❌ [Error Global]:', err.stack);
    
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Algo salió mal en el servidor';

    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(statusCode).json({
            success: false,
            error: message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }

    const { info } = require('../config');
    res.status(statusCode).render("errores", {
        errorMessage: message,
        name_page: info.name_page || 'Bingo Kelly'
    });
}

module.exports = {
    error404Handler,
    globalErrorHandler
};
