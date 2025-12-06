import { beforeAll, afterAll, afterEach } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let replSet: MongoMemoryReplSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({
    binary: {
      version: '6.0.4',
      skipMD5: true,
    },
    replSet: {
      count: 1,
      dbName: 'jest',
    },
  });
  const mongoUri = replSet.getUri();
  await mongoose.connect(mongoUri);
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});
