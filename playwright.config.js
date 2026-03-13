const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  workers: 1, // serial — each test spins up servers
  use: {
    headless: true,
    // WebGL needs a real GPU context; use headed + channel if flaky
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader'],
    },
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
