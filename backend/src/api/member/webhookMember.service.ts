import { Webhook } from '../webhook/webhook.model';
import Server from '../server/server.model';
import { NotFoundError } from '../../utils/errors';

const webhookMemberService = {
  async getWebhookMembers(serverId: string): Promise<any[]> {
    // Step 1: Get the server's webhooks
    const webhooks = await Webhook.find({ serverId }).lean();

    // Step 2: Get the @everyone role ID from the server
    const server = await Server.findById(serverId).select('everyoneRoleId').lean();
    if (!server) {
      throw new NotFoundError('Server not found.');
    }
    const everyoneRoleId = server.everyoneRoleId;

    // Step 3: Build virtual member objects for each webhook
    const webhookMembers = webhooks.map(webhook => ({
      _id: webhook._id, // Use webhook's ID for a unique key
      serverId: webhook.serverId,
      channelId: webhook.channelId,
      userId: {
        _id: webhook.botUserId,
        username: webhook.name,
        avatarUrl: webhook.avatarUrl,
        isBot: true,
        email: `webhook-${webhook._id}@internal.mew`,
        createdAt: webhook.createdAt,
      },
      roleIds: [everyoneRoleId],
      isOwner: false,
      nickname: null,
      createdAt: webhook.createdAt,
      updatedAt: webhook.updatedAt,
    }));

    return webhookMembers;
  }
};

export default webhookMemberService;
