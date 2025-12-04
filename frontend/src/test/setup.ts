import '@testing-library/jest-dom';
import { beforeAll, afterEach, afterAll } from 'vitest';
import { server } from '../mocks/server';

// 在所有测试开始前启动服务器
beforeAll(() => server.listen());

// 在每个测试后重置所有处理器，以确保测试之间不会相互影响
afterEach(() => server.resetHandlers());

// 在所有测试结束后关闭服务器
afterAll(() => server.close());