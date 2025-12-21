import { Webhook, IWebhook } from './webhook.model';

class WebhookRepository {
  public async findByChannel(channelId: string): Promise<IWebhook[]> {
    return Webhook.find({ channelId });
  }

  public async findById(webhookId: string): Promise<IWebhook | null> {
    return Webhook.findById(webhookId);
  }

  public async findByIdAndToken(webhookId: string, token: string): Promise<IWebhook | null> {
    return Webhook.findOne({ _id: webhookId, token });
  }

  public async create(data: Partial<IWebhook>): Promise<IWebhook> {
    return Webhook.create(data);
  }

  public async findByIdAndUpdate(webhookId: string, data: Partial<IWebhook>): Promise<IWebhook | null> {
    return Webhook.findByIdAndUpdate(webhookId, data, { new: true });
  }

  public async countOtherWebhooksByBotUserId(webhookId: string, botUserId: string): Promise<number> {
    return Webhook.countDocuments({ botUserId, _id: { $ne: webhookId } });
  }

  public async deleteOne(filter: { _id: string }): Promise<{ deletedCount: number }> {
    return Webhook.deleteOne(filter);
  }
}

export const webhookRepository = new WebhookRepository();
