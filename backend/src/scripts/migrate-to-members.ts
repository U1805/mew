import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Server from '../api/server/server.model';
import ServerMember from '../api/member/member.model';
import connectDB from '../utils/db'; // Assuming db connection utility exists

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const migrate = async () => {
  await connectDB();

  console.log('Starting migration...');

  try {
    // This is the old model structure, so we must access it with `any`
    const servers: any[] = await Server.find({ ownerId: { $exists: true } });

    if (servers.length === 0) {
      console.log('No servers with ownerId found. Migration might already be complete.');
      return;
    }

    console.log(`Found ${servers.length} servers to migrate.`);

    for (const server of servers) {
      const existingMember = await ServerMember.findOne({
        serverId: server._id,
        userId: server.ownerId,
      });

      if (!existingMember) {
        await ServerMember.create({
          serverId: server._id,
          userId: server.ownerId,
          role: 'OWNER',
        });
        console.log(`Created OWNER member for server ${server.name} (${server._id})`);
      } else {
        console.log(`Member for server ${server.name} (${server._id}) already exists. Skipping.`);
      }
    }

    // After migration, you would typically use a mongo shell command to unset the field
    // db.servers.updateMany({}, { $unset: { ownerId: '' } })
    console.log('Migration script finished. Please manually unset the ownerId field from the servers collection.');
    console.log('Example mongo shell command: db.servers.updateMany({}, { $unset: { ownerId: "" } })');

  } catch (error) {
    console.error('An error occurred during migration:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Database connection closed.');
  }
};

migrate();
