import mongoose from 'mongoose';
import config from '../config';
import UserModel from '../api/user/user.model';

const migrateUserUsernameIndex = async () => {
  // Historical schema had a unique index on `username`. We now use (username, discriminator).
  // Existing MongoDB collections may still have the old unique index, which will break bot/user creation.
  try {
    const indexes = await UserModel.collection.indexes();

    const legacy = indexes.find((idx: any) => idx?.name === 'username_1' || (idx?.key?.username === 1 && !idx?.key?.discriminator));
    if (legacy && typeof legacy.name === 'string' && legacy.name) {
      await UserModel.collection.dropIndex(legacy.name);
      console.log(`[db] Dropped legacy users index: ${legacy.name}`);
    }

    const hasComposite = indexes.some(
      (idx: any) => idx?.key?.username === 1 && idx?.key?.discriminator === 1 && idx?.unique === true
    );
    if (!hasComposite) {
      await UserModel.collection.createIndex(
        { username: 1, discriminator: 1 },
        { unique: true, name: 'username_1_discriminator_1' }
      );
      console.log('[db] Ensured users index: username_1_discriminator_1');
    }
  } catch (error) {
    // Best-effort migration: do not prevent boot if we lack permissions, collection doesn't exist yet, etc.
    console.warn('[db] User index migration skipped/failed:', error);
  }
};

const connectDB = async () => {
  try {
    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 5000, // 5 seconds timeout
    });
    console.log('MongoDB connected successfully.');

    await migrateUserUsernameIndex();
  } catch (error) {
    console.error('MongoDB connection failed:', error);
    process.exit(1);
  }
};

export default connectDB;
