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
const { generarMatrizBingo } = require('./utils/bingoUtils');
const socketHandler = require('./sockets/socketHandler');

const Juego = require('./models/Juego');
const Carton = require('./models/Carton');
const Usuario = require('./models/Usuario');

const indexRoutes = require('./routes/index');
const adminRoutes = require('./routes/admin');
const jugadorRoutes = require('./routes/jugador');
const apiRoutes = require('./routes/api');

const { verificarGanador } = require('./controllers/juegoController');

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
app.use('/api', apiRoutes);

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

// Configurar Sockets
socketHandler(io, sessionMiddleware);

setInterval(() => {
  fetch((info.dominio || `http://localhost:${PORT}`) + '/ping')
    .then(res => { /* console.log('Ping OK '); */ })
    .catch(err => console.error('Ping Error:', err.message));
}, 14 * 60 * 1000);

const { error404Handler, globalErrorHandler } = require('./middleware/errorHandlers');

app.use(error404Handler);
app.use(globalErrorHandler);

server.listen(PORT, () => {
    console.log(`Servidor corriendo en PORT: ${PORT}`);
});