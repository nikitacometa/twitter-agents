module.exports = {
  apps: [
    {
      name: 'beef-bot',
      script: 'node_modules/.bin/tsx',
      args: 'src/index.ts',
      interpreter: 'none',
      cwd: __dirname,
      env_production: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '2G',
      exp_backoff_restart_delay: 100,
      kill_timeout: 200000,
    },
  ],
};
