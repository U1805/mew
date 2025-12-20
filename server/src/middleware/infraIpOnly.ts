import { Request, Response, NextFunction } from 'express';
import net from 'net';
import config from '../config';
import { ForbiddenError } from '../utils/errors';

const normalizeIp = (ip: string): string => {
  if (ip.startsWith('::ffff:')) return ip.slice('::ffff:'.length);
  return ip;
};

const isPrivateIpv4 = (ip: string): boolean => {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true; // loopback
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
};

const isPrivateIp = (rawIp: string): boolean => {
  const ip = normalizeIp(rawIp);
  if (ip === '::1') return true;
  const version = net.isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  // For now, treat non-loopback IPv6 as not-private unless explicitly allowlisted
  return false;
};

export const infraIpOnly = (req: Request, _res: Response, next: NextFunction) => {
  const ip = (req.ip || '').trim();
  if (!ip) return next(new ForbiddenError('Forbidden'));

  const normalized = normalizeIp(ip);
  if (config.infraAllowedIps.length > 0) {
    if (!config.infraAllowedIps.includes(normalized)) {
      return next(new ForbiddenError('Forbidden'));
    }
    return next();
  }

  if (!isPrivateIp(normalized)) {
    return next(new ForbiddenError('Forbidden'));
  }

  next();
};

