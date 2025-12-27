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

const isPrivateIpv6 = (ip: string): boolean => {
  const normalized = ip.toLowerCase();
  if (normalized === '::1') return true; // loopback
  // Unique local addresses: fc00::/7
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  // Link-local: fe80::/10 (treat as private-ish for infra)
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
  return false;
};

const isPrivateIp = (rawIp: string): boolean => {
  const ip = normalizeIp(rawIp);
  const version = net.isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version === 6) return isPrivateIpv6(ip);
  return false;
};

export const infraIpOnly = (req: Request, _res: Response, next: NextFunction) => {
  // Note: req.ip is influenced by Express "trust proxy" and X-Forwarded-For.
  // This middleware should remain safe even if the request hits the server directly.
  const ip = String(req.ip || req.socket.remoteAddress || '').trim();
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

