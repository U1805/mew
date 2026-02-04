import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import ServiceTypeModel from './serviceType.model';
import { infraRegistry } from '../../infra/infraRegistry';
import Bot from '../bot/bot.model';

const RESERVED_SERVICE_TYPES = new Set(['sdk']);

export const getAvailableServicesHandler = asyncHandler(async (_req: Request, res: Response) => {
  const includeOfflineRaw = String((_req.query as any)?.includeOffline || '').trim().toLowerCase();
  const includeOffline = includeOfflineRaw === '1' || includeOfflineRaw === 'true' || includeOfflineRaw === 'yes' || includeOfflineRaw === 'on';

  const types = await ServiceTypeModel.find(
    { name: { $nin: Array.from(RESERVED_SERVICE_TYPES) } },
    { name: 1, serverName: 1, icon: 1, description: 1, configTemplate: 1 }
  ).sort({ name: 1 });
  const onlineCounts = infraRegistry.getOnlineCounts();

  const services = types.map((t) => {
    const serviceType = t.name;
    const connections = onlineCounts[serviceType] ?? 0;
    return {
      serviceType,
      serverName: (t as any).serverName || serviceType,
      icon: (t as any).icon || '',
      description: (t as any).description || '',
      configTemplate: (t as any).configTemplate || '',
      online: connections > 0,
      connections,
    };
  });

  res.status(200).json({ services: includeOffline ? services : services.filter((s) => s.online) });
});

export const registerServiceTypeHandler = asyncHandler(async (req: Request, res: Response) => {
  const serviceType = String((req.body?.serviceType as string) || (req.query?.serviceType as string) || '').trim();
  if (!serviceType) {
    return res.status(400).json({ message: 'serviceType is required' });
  }
  if (RESERVED_SERVICE_TYPES.has(serviceType)) {
    return res.status(400).json({ message: `serviceType is reserved: ${serviceType}` });
  }

  const serverName = String((req.body?.serverName as string) || '').trim() || serviceType;
  const icon = String((req.body?.icon as string) || '').trim();
  const description = String((req.body?.description as string) || '').trim();

  // Allow configTemplate to be either a JSON string (legacy) or a structured JSON value (object/array).
  const rawConfigTemplate = (req.body as any)?.configTemplate;
  let configTemplate = '';
  if (typeof rawConfigTemplate === 'string') {
    configTemplate = rawConfigTemplate;
  } else if (rawConfigTemplate != null) {
    try {
      configTemplate = JSON.stringify(rawConfigTemplate);
    } catch {
      configTemplate = '';
    }
  }

  await ServiceTypeModel.updateOne(
    { name: serviceType },
    { $set: { name: serviceType, serverName, icon, description, configTemplate, lastSeenAt: new Date() } },
    { upsert: true }
  );

  res.status(200).json({ serviceType, serverName });
});

export const getServiceBotUserHandler = asyncHandler(async (req: Request, res: Response) => {
  const serviceType = String((req.query as any)?.serviceType || '').trim();
  if (!serviceType) {
    return res.status(400).json({ message: 'serviceType is required' });
  }
  if (RESERVED_SERVICE_TYPES.has(serviceType)) {
    return res.status(400).json({ message: `serviceType is reserved: ${serviceType}` });
  }

  const bot = await Bot.findOne({
    serviceType,
    dmEnabled: true,
    botUserId: { $exists: true, $ne: null },
  })
    .sort({ updatedAt: -1 })
    .select('botUserId');

  const botUserId = bot?.botUserId?.toString() || '';
  if (!botUserId) {
    return res.status(404).json({ message: 'No dmEnabled bot found for serviceType' });
  }

  res.status(200).json({ botUserId });
});
