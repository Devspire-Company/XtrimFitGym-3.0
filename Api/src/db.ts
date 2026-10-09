import mongoose from 'mongoose';
import { config } from './config.js';

export async function connectDatabase() {
  const env = config();
  await mongoose.connect(env.MONGODB_URI, { dbName: env.MONGODB_DATABASE, serverSelectionTimeoutMS: 10_000 });
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
