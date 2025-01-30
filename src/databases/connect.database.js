const mongoose = require('mongoose');

async function connectToMongo() {
  const login = process.env.DB_LOGIN;
  const password = encodeURIComponent(process.env.DB_PASSWORD);
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || 27017;
  const data = process.env.DB_NAME || 'mydatabase';

  const mongoURI = `mongodb://${login}:${password}@${host}:${port}/${data}`;
  
  try {
    await mongoose.connect(mongoURI);
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('Could not connect to MongoDB:', err.message);
    process.exit(1); // Завершаем процесс при фатальной ошибке
  }

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected. Reconnecting...');
    connectToMongo(); // Переподключение
  });
}

module.exports = { connectToMongo };
