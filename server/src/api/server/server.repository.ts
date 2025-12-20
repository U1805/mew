import Server from './server.model';

import ServerMember from '../member/member.model';

class ServerRepository {
  save(document: any) {
    return document.save();
  }

  async create(serverData: object) {
    return Server.create(serverData);
  }

  async updateById(serverId: string, data: object) {
    return Server.findByIdAndUpdate(serverId, data, { new: true });
  }

  async deleteById(serverId: string) {
    return Server.deleteOne({ _id: serverId });
  }

  async findById(serverId: string) {
    return Server.findById(serverId);
  }

  async findServersByUserId(userId: string) {
    const memberships = await ServerMember.find({ userId }).populate('serverId');
    const servers = memberships
      .map((m: any) => m.serverId)
      .filter((s) => s !== null);
    return servers;
  }
}

export const serverRepository = new ServerRepository();
