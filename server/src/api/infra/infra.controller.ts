import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import ServiceTypeModel from './serviceType.model';
import { infraRegistry } from '../../infra/infraRegistry';

const RESERVED_SERVICE_TYPES = new Set(['sdk']);

export const getAvailableServicesHandler = asyncHandler(async (_req: Request, res: Response) => {
  const types = await ServiceTypeModel.find({ name: { $nin: Array.from(RESERVED_SERVICE_TYPES) } }, { name: 1 }).sort({ name: 1 });
  const onlineCounts = infraRegistry.getOnlineCounts();

  const services = types.map((t) => {
    const serviceType = t.name;
    const connections = onlineCounts[serviceType] ?? 0;
    return { serviceType, online: connections > 0, connections };
  });

  res.status(200).json({ services });
});

export const registerServiceTypeHandler = asyncHandler(async (req: Request, res: Response) => {
  const serviceType = String((req.body?.serviceType as string) || (req.query?.serviceType as string) || '').trim();
  if (!serviceType) {
    return res.status(400).json({ message: 'serviceType is required' });
  }
  if (RESERVED_SERVICE_TYPES.has(serviceType)) {
    return res.status(400).json({ message: `serviceType is reserved: ${serviceType}` });
  }

  await ServiceTypeModel.updateOne(
    { name: serviceType },
    { $set: { name: serviceType, lastSeenAt: new Date() } },
    { upsert: true }
  );

  res.status(200).json({ serviceType });
});
