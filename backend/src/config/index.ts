import dotenv from 'dotenv';

dotenv.config();

const config = {
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/mew',
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || 'a-very-secret-key',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || 86400,
};

export default config;
