import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ng.plugsy.app',
  appName: 'Plugsy',
  webDir: 'dist',
  plugins: {
    // Keep fetch semantics familiar to the existing app while using native
    // networking for hosted API requests (including multipart uploads).
    CapacitorHttp: { enabled: true },
  },
};

export default config;
