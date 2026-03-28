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
        REBROWSER_PATCHES_RUNTIME_FIX_MODE: 'addBinding',
        REBROWSER_PATCHES_SOURCE_URL: 'app.js',
      },
      env_test: {
        BEEF_ENV: 'test',
        DRY_RUN: 'true',
        DISPLAY: ':99',
        REBROWSER_PATCHES_RUNTIME_FIX_MODE: 'addBinding',
        REBROWSER_PATCHES_SOURCE_URL: 'app.js',
      },
      max_memory_restart: '2G',
      exp_backoff_restart_delay: 100,
      kill_timeout: 220000,
    },
  ],
};
