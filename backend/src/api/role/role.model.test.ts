import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import Role from './role.model';
import '../../test/setup';

describe('Role Model', () => {
  it('should create and save a new role successfully', async () => {
    const serverId = new mongoose.Types.ObjectId();
    const roleData = {
      name: 'Admin',
      serverId: serverId,
      permissions: ['MANAGE_ROLES', 'KICK_MEMBERS'],
      color: '#FF0000',
      position: 1,
      isDefault: false,
    };

    const role = new Role(roleData);
    const savedRole = await role.save();

    expect(savedRole._id).toBeDefined();
    expect(savedRole.name).toBe(roleData.name);
    expect(savedRole.serverId).toEqual(roleData.serverId);
    expect(Array.from(savedRole.permissions)).toEqual(roleData.permissions);
    expect(savedRole.color).toBe(roleData.color);
    expect(savedRole.position).toBe(roleData.position);
    expect(savedRole.isDefault).toBe(roleData.isDefault);
    expect(savedRole.createdAt).toBeDefined();
    expect(savedRole.updatedAt).toBeDefined();
  });

  it('should use default values for optional fields', async () => {
    const serverId = new mongoose.Types.ObjectId();
    const roleData = {
      name: '@everyone',
      serverId: serverId,
      position: 0,
    };

    const role = new Role(roleData);
    const savedRole = await role.save();

    expect(savedRole.permissions).toEqual([]);
    expect(savedRole.color).toBe('#99AAB5');
    expect(savedRole.isDefault).toBe(false);
  });

  it('should fail if required fields are missing', async () => {
    const roleWithoutName = new Role({ serverId: new mongoose.Types.ObjectId(), position: 1 });
    await expect(roleWithoutName.save()).rejects.toThrow();

    const roleWithoutServerId = new Role({ name: 'Test', position: 1 });
    await expect(roleWithoutServerId.save()).rejects.toThrow();

    const roleWithoutPosition = new Role({ name: 'Test', serverId: new mongoose.Types.ObjectId() });
    await expect(roleWithoutPosition.save()).rejects.toThrow();
  });
});
