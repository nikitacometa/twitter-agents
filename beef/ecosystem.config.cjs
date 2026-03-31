module.exports = {
  apps: [
    {
      name: 'beef-bot',
      script: 'node_modules/.bin/tsx',
      args: 'src/index.ts',
      interpreter: 'none',
      cwd: __dirname,
      env: {
        BEEF_ENV: 'production',
        DRY_RUN: 'false',
        DISPLAY: ':99',
      },
      env_test: {
        BEEF_ENV: 'test',
        DRY_RUN: 'true',
        DISPLAY: ':99',
      },
      max_memory_restart: '2G',
      exp_backoff_restart_delay: 100,
      kill_timeout: 220000,
    },
  ],
};
