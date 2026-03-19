import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    clearMocks: true,
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.{test,spec}.ts', 'src/index.ts'],
    },
  },
  resolve: {
    alias: {
      '@common': new URL('./src/common/', import.meta.url).pathname,
      '@agent': new URL('./src/agent/', import.meta.url).pathname,
      '@twitter': new URL('./src/twitter/', import.meta.url).pathname,
      '@roast': new URL('./src/roast/', import.meta.url).pathname,
      '@news': new URL('./src/news/', import.meta.url).pathname,
      '@content': new URL('./src/content/', import.meta.url).pathname,
      '@storage': new URL('./src/storage/', import.meta.url).pathname,
      '@queue': new URL('./src/queue/', import.meta.url).pathname,
      '@scheduler': new URL('./src/scheduler/', import.meta.url).pathname,
      '@farm': new URL('./src/farm/', import.meta.url).pathname,
    },
  },
});
