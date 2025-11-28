import { describe, it, expect, beforeEach } from 'vitest';
import * as authService from './auth.service.js';
import User from '../user/user.model.js';

const userData = {
  email: 'test@example.com',
  username: 'testuser',
  password: 'password123',
};

describe('Auth Service', () => {
  describe('register', () => {
    it('should create a new user and return it without the password', async () => {
      const newUser = await authService.register(userData);

      expect(newUser).toBeDefined();
      expect(newUser.email).toBe(userData.email);
      expect(newUser.username).toBe(userData.username);
      expect((newUser as any).password).toBeUndefined();

      const userInDb = await User.findById(newUser._id).select('+password');
      expect(userInDb).toBeDefined();
      expect(userInDb?.password).not.toBe(userData.password);
    });

    it('should throw an error if email is already taken', async () => {
      await authService.register(userData);
      // Try to register the same user again and expect a duplicate key error from mongoose
      await expect(authService.register(userData)).rejects.toThrow();
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await authService.register(userData);
    });

    it('should log in a user with correct credentials and return a token', async () => {
      const { user, token } = await authService.login({ email: userData.email, password: userData.password });

      expect(user).toBeDefined();
      expect(token).toBeDefined();
      expect(user.email).toBe(userData.email);
    });

    it('should throw an error with incorrect password', async () => {
      await expect(authService.login({ email: userData.email, password: 'wrongpassword' })).rejects.toThrow(
        'Invalid credentials'
      );
    });

    it('should throw an error with non-existent email', async () => {
      await expect(authService.login({ email: 'wrong@example.com', password: userData.password })).rejects.toThrow(
        'Invalid credentials'
      );
    });
  });
});
