import { Request, Response, NextFunction } from 'express';
import * as authService from './auth.service';
import asyncHandler from '../../utils/asyncHandler';
import config from '../../config';
import { ForbiddenError } from '../../utils/errors';
import { userRepository } from '../user/user.repository';
import { getS3PublicUrl } from '../../utils/s3';
import {
  buildRefreshTokenCookieOptions,
  getRefreshTokenCookieName,
  issueRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
} from './refreshToken.service';
import { buildAccessTokenCookieOptions, getAccessTokenCookieName } from './accessTokenCookie.service';
import { readCookie } from '../../utils/cookies';

const isProduction = () => (process.env.NODE_ENV || '').toLowerCase() === 'production';
const shouldUseSecureCookie = (req: Request) => isProduction() && req.secure;

const setAuthCookies = (
  req: Request,
  res: Response,
  params: { token: string; refreshToken: string; refreshMaxAgeMs?: number; isPersistent: boolean }
) => {
  const secure = shouldUseSecureCookie(req);
  res.cookie(
    getAccessTokenCookieName(),
    params.token,
    buildAccessTokenCookieOptions({ secure, isPersistent: params.isPersistent, jwtExpiresIn: config.jwtExpiresIn })
  );
  res.cookie(
    getRefreshTokenCookieName(),
    params.refreshToken,
    buildRefreshTokenCookieOptions({ maxAgeMs: params.refreshMaxAgeMs, secure })
  );
};

const clearAuthCookies = (req: Request, res: Response) => {
  const secure = shouldUseSecureCookie(req);
  res.clearCookie(getRefreshTokenCookieName(), buildRefreshTokenCookieOptions({ secure }));
  res.clearCookie(
    getAccessTokenCookieName(),
    buildAccessTokenCookieOptions({ secure, isPersistent: false, jwtExpiresIn: config.jwtExpiresIn })
  );
};

export const loginHandler = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { user, token } = await authService.login(req.body);

  const issued = await issueRefreshToken({
    userId: (user as any)._id,
    createdByIp: req.ip,
    userAgent: req.headers['user-agent'] || null,
    rememberMe: req.body?.rememberMe === true,
  });

  setAuthCookies(req, res, {
    token,
    refreshToken: issued.refreshToken,
    refreshMaxAgeMs: issued.maxAgeMs,
    isPersistent: issued.isPersistent,
  });

  res.status(200).json({ message: 'Login successful', user, token });
});

export const loginCookieHandler = asyncHandler(async (req: Request, res: Response) => {
  const { user, token } = await authService.login(req.body);

  const issued = await issueRefreshToken({
    userId: (user as any)._id,
    createdByIp: req.ip,
    userAgent: req.headers['user-agent'] || null,
    rememberMe: req.body?.rememberMe === true,
  });

  setAuthCookies(req, res, {
    token,
    refreshToken: issued.refreshToken,
    refreshMaxAgeMs: issued.maxAgeMs,
    isPersistent: issued.isPersistent,
  });

  res.status(200).json({ message: 'Login successful', user });
});

export const botLoginHandler = asyncHandler(async (req: Request, res: Response) => {
  const { user, token } = await authService.loginBot(req.body);

  const issued = await issueRefreshToken({
    userId: (user as any)._id,
    createdByIp: req.ip,
    userAgent: req.headers['user-agent'] || null,
    rememberMe: true,
  });

  setAuthCookies(req, res, {
    token,
    refreshToken: issued.refreshToken,
    refreshMaxAgeMs: issued.maxAgeMs,
    isPersistent: issued.isPersistent,
  });

  res.status(200).json({ message: 'Bot login successful', user, token });
});

export const registerHandler = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  if (!config.allowUserRegistration) {
    throw new ForbiddenError('User registration is disabled.');
  }
  const { user, token } = await authService.register(req.body);

  const issued = await issueRefreshToken({
    userId: (user as any)._id,
    createdByIp: req.ip,
    userAgent: req.headers['user-agent'] || null,
    rememberMe: req.body?.rememberMe === true,
  });

  setAuthCookies(req, res, {
    token,
    refreshToken: issued.refreshToken,
    refreshMaxAgeMs: issued.maxAgeMs,
    isPersistent: issued.isPersistent,
  });

  res.status(201).json({ message: 'User registered successfully', user, token });
});

export const registerCookieHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!config.allowUserRegistration) {
    throw new ForbiddenError('User registration is disabled.');
  }
  const { user, token } = await authService.register(req.body);

  const issued = await issueRefreshToken({
    userId: (user as any)._id,
    createdByIp: req.ip,
    userAgent: req.headers['user-agent'] || null,
    rememberMe: req.body?.rememberMe === true,
  });

  setAuthCookies(req, res, {
    token,
    refreshToken: issued.refreshToken,
    refreshMaxAgeMs: issued.maxAgeMs,
    isPersistent: issued.isPersistent,
  });

  res.status(201).json({ message: 'User registered successfully', user });
});

export const getAuthConfigHandler = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ allowUserRegistration: config.allowUserRegistration });
});

export const refreshHandler = asyncHandler(async (req: Request, res: Response) => {
  const cookieName = getRefreshTokenCookieName();
  const refreshToken = readCookie(req.headers.cookie, cookieName);
  if (!refreshToken) {
    return res.status(401).json({ message: 'Unauthorized: No refresh token provided' });
  }

  const rotated = await rotateRefreshToken({
    refreshToken,
    createdByIp: req.ip,
    userAgent: req.headers['user-agent'] || null,
  });

  if (!rotated) {
    clearAuthCookies(req, res);
    return res.status(401).json({ message: 'Unauthorized: Invalid refresh token' });
  }

  const secure = shouldUseSecureCookie(req);
  res.cookie(cookieName, rotated.refreshToken, buildRefreshTokenCookieOptions({ maxAgeMs: rotated.maxAgeMs, secure }));

  const user = await userRepository.findById(rotated.userId.toString());
  if (!user) {
    await revokeRefreshToken(rotated.refreshToken);
    clearAuthCookies(req, res);
    return res.status(401).json({ message: 'Unauthorized: User not found' });
  }

  const userObj: any = user.toObject ? user.toObject() : user;
  if (userObj.avatarUrl) userObj.avatarUrl = getS3PublicUrl(userObj.avatarUrl);

  const payload = { id: user._id, username: user.username, discriminator: (user as any).discriminator };
  const token = authService.signAccessToken(payload);
  res.cookie(
    getAccessTokenCookieName(),
    token,
    buildAccessTokenCookieOptions({ secure, isPersistent: rotated.isPersistent, jwtExpiresIn: config.jwtExpiresIn })
  );

  return res.status(200).json({ token, user: userObj });
});

export const refreshCookieHandler = asyncHandler(async (req: Request, res: Response) => {
  const cookieName = getRefreshTokenCookieName();
  const refreshToken = readCookie(req.headers.cookie, cookieName);
  if (!refreshToken) {
    return res.status(401).json({ message: 'Unauthorized: No refresh token provided' });
  }

  const rotated = await rotateRefreshToken({
    refreshToken,
    createdByIp: req.ip,
    userAgent: req.headers['user-agent'] || null,
  });

  if (!rotated) {
    clearAuthCookies(req, res);
    return res.status(401).json({ message: 'Unauthorized: Invalid refresh token' });
  }

  const secure = shouldUseSecureCookie(req);
  res.cookie(cookieName, rotated.refreshToken, buildRefreshTokenCookieOptions({ maxAgeMs: rotated.maxAgeMs, secure }));

  const user = await userRepository.findById(rotated.userId.toString());
  if (!user) {
    await revokeRefreshToken(rotated.refreshToken);
    clearAuthCookies(req, res);
    return res.status(401).json({ message: 'Unauthorized: User not found' });
  }

  const userObj: any = user.toObject ? user.toObject() : user;
  if (userObj.avatarUrl) userObj.avatarUrl = getS3PublicUrl(userObj.avatarUrl);

  const payload = { id: user._id, username: user.username, discriminator: (user as any).discriminator };
  const token = authService.signAccessToken(payload);
  res.cookie(
    getAccessTokenCookieName(),
    token,
    buildAccessTokenCookieOptions({ secure, isPersistent: rotated.isPersistent, jwtExpiresIn: config.jwtExpiresIn })
  );

  return res.status(200).json({ user: userObj });
});

export const logoutHandler = asyncHandler(async (req: Request, res: Response) => {
  const refreshCookieName = getRefreshTokenCookieName();
  const refreshToken = readCookie(req.headers.cookie, refreshCookieName);
  if (refreshToken) {
    await revokeRefreshToken(refreshToken);
  }
  clearAuthCookies(req, res);
  return res.status(204).send();
});
