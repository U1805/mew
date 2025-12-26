import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createConfig } from './index';

describe('config/createConfig', () => {
  it('parses PORT and JWT_EXPIRES_IN (defaults + numeric + duration strings)', () => {
    expect(createConfig({}).port).toBe(3000);
    expect(createConfig({ PORT: 'nope' }).port).toBe(3000);
    expect(createConfig({ PORT: '4000' }).port).toBe(4000);

    expect(createConfig({}).jwtExpiresIn).toBe(86400);
    expect(createConfig({ JWT_EXPIRES_IN: '60' }).jwtExpiresIn).toBe(60);
    expect(createConfig({ JWT_EXPIRES_IN: '2h' }).jwtExpiresIn).toBe('2h');
  });

  it('parses booleans and infra allowed IPs from CSV', () => {
    expect(createConfig({ MEW_ALLOW_USER_REGISTRATION: '0' }).allowUserRegistration).toBe(false);
    expect(createConfig({ MEW_ALLOW_USER_REGISTRATION: 'yes' }).allowUserRegistration).toBe(true);
    expect(createConfig({ MEW_ALLOW_USER_REGISTRATION: '??' }).allowUserRegistration).toBe(true);

    expect(createConfig({ MEW_INFRA_ALLOWED_IPS: ' 1.1.1.1, ,2.2.2.2 ' }).infraAllowedIps).toEqual(['1.1.1.1', '2.2.2.2']);
  });

  it('derives CORS + S3 origins from MEW_CORS_ORIGINS', () => {
    const config = createConfig({
      NODE_ENV: 'development',
      MEW_CORS_ORIGINS: 'http://a.test, http://b.test',
    });

    expect(config.cors.allowAnyOrigin).toBe(false);
    expect(config.cors.allowedOrigins).toEqual(['http://a.test', 'http://b.test']);
    expect(config.s3.corsAllowedOrigins).toEqual(['http://a.test', 'http://b.test']);
  });

  it('allows any origin by default in development', () => {
    const config = createConfig({ NODE_ENV: 'development', MEW_CORS_ORIGINS: '' });
    expect(config.cors.allowAnyOrigin).toBe(true);
    expect(config.s3.corsAllowedOrigins).toEqual(['*']);
  });

  it('handles wildcard origins and S3_CORS_ORIGINS overrides', () => {
    const baseProd = {
      NODE_ENV: 'production',
      JWT_SECRET: 'jwt',
      MEW_ADMIN_SECRET: 'admin',
      S3_ACCESS_KEY_ID: 'env-ak',
      S3_SECRET_ACCESS_KEY: 'env-sk',
    };

    const wildcard = createConfig({ ...baseProd, MEW_CORS_ORIGINS: '*' });
    expect(wildcard.cors.allowAnyOrigin).toBe(true);
    expect(wildcard.cors.allowedOrigins).toEqual([]);
    expect(wildcard.s3.corsAllowedOrigins).toEqual(['*']);

    const explicitS3 = createConfig({
      ...baseProd,
      MEW_CORS_ORIGINS: 'http://a.test',
      S3_CORS_ORIGINS: 'http://s3.test',
    });
    expect(explicitS3.cors.allowAnyOrigin).toBe(false);
    expect(explicitS3.s3.corsAllowedOrigins).toEqual(['http://s3.test']);

    const explicitS3Wildcard = createConfig({
      ...baseProd,
      MEW_CORS_ORIGINS: 'http://a.test',
      S3_CORS_ORIGINS: '*',
    });
    expect(explicitS3Wildcard.s3.corsAllowedOrigins).toEqual(['*']);
  });

  it('parses trust proxy settings', () => {
    expect(createConfig({ MEW_TRUST_PROXY: '' }).trustProxy).toBe('loopback');
    expect(createConfig({ MEW_TRUST_PROXY: 'true' }).trustProxy).toBe(true);
    expect(createConfig({ MEW_TRUST_PROXY: '2' }).trustProxy).toBe(2);
    expect(createConfig({ MEW_TRUST_PROXY: '127.0.0.1' }).trustProxy).toBe('127.0.0.1');
    expect(createConfig({ TRUST_PROXY: '1' }).trustProxy).toBe(true);
  });

  it('reads S3 credentials from a file when env vars are missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-config-'));
    const credsPath = path.join(dir, 's3.json');
    fs.writeFileSync(credsPath, JSON.stringify({ accessKeyId: 'file-ak', secretAccessKey: 'file-sk' }), 'utf8');

    const config = createConfig({
      S3_CREDENTIALS_FILE: credsPath,
      S3_ACCESS_KEY_ID: '',
      S3_SECRET_ACCESS_KEY: '',
    });

    expect(config.s3.accessKeyId).toBe('file-ak');
    expect(config.s3.secretAccessKey).toBe('file-sk');
  });

  it('ignores broken credentials file and uses env credentials', () => {
    const config = createConfig(
      {
        NODE_ENV: 'production',
        JWT_SECRET: 'jwt',
        MEW_ADMIN_SECRET: 'admin',
        S3_CREDENTIALS_FILE: '/does/not/exist',
        S3_ACCESS_KEY_ID: 'env-ak',
        S3_SECRET_ACCESS_KEY: 'env-sk',
      },
      {
        fs: {
          ...fs,
          existsSync: () => false,
        },
      }
    );

    expect(config.s3.accessKeyId).toBe('env-ak');
    expect(config.s3.secretAccessKey).toBe('env-sk');
  });

  it('fails fast in production when critical secrets are missing', () => {
    expect(() =>
      createConfig({
        NODE_ENV: 'production',
        JWT_SECRET: '',
        MEW_ADMIN_SECRET: '',
      })
    ).toThrow('Missing required env: JWT_SECRET');
  });

  it('fails fast in production when admin secret is missing', () => {
    expect(() =>
      createConfig({
        NODE_ENV: 'production',
        JWT_SECRET: 'jwt',
        MEW_ADMIN_SECRET: '',
      })
    ).toThrow('Missing required env: MEW_ADMIN_SECRET');
  });

  it('fails fast in production when S3 credentials are missing', () => {
    expect(() =>
      createConfig({
        NODE_ENV: 'production',
        JWT_SECRET: 'jwt',
        MEW_ADMIN_SECRET: 'admin',
        S3_ACCESS_KEY_ID: '',
        S3_SECRET_ACCESS_KEY: '',
      })
    ).toThrow('Missing required S3 credentials');
  });
});
