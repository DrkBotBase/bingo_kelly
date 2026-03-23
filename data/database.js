require('dotenv').config();
const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/bingo';
        
        const options = {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 10000,
            socketTimeoutMS: 45000,
        };

        console.log('🔌 Conectando a MongoDB...');
        await mongoose.connect(uri, options);
        console.log('✅ MongoDB conectado correctamente');

        mongoose.connection.on('error', (err) => {
            console.error('❌ Error en la conexión de MongoDB:', err);
        });

        mongoose.connection.on('disconnected', () => {
            console.log('🔴 MongoDB desconectado');
        });

        mongoose.connection.on('reconnected', () => {
            console.log('🟢 MongoDB reconectado');
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return mongoose.connection;

    } catch (error) {
        console.error('❌ Error conectando a MongoDB:', error.message);
        process.exit(1);
    }
};

module.exports = connectDB;