import { beforeAll, afterAll, afterEach, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let replSet: MongoMemoryReplSet;

process.env.MEW_ADMIN_SECRET = process.env.MEW_ADMIN_SECRET || 'test-admin-secret';
process.env.MEW_INFRA_ALLOWED_IPS = process.env.MEW_INFRA_ALLOWED_IPS || '';

// Prevent tests from making real S3 network calls via @aws-sdk/lib-storage Upload.
// Individual tests (e.g. src/utils/s3.test.ts) can still override this mock.
vi.mock('@aws-sdk/lib-storage', () => ({
  Upload: vi.fn().mockImplementation(function (this: any) {
    this.done = vi.fn().mockResolvedValue({});
  }),
}));

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
