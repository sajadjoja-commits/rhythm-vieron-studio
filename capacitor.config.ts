import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vireon.ai',
  appName: 'Vireon AI Studio',
  webDir: 'dist',
  backgroundColor: '#090d16',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      launchAutoHide: true,
      backgroundColor: '#090d16',
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#090d16',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'body',
      style: 'DARK',
      resizeOnFullScreen: true,
    },
    CapacitorUpdater: {
      appId: '4ff5064c-bd8c-4b62-b998-25e5da1d59c5',
      // Keep OTA disabled while native packaging is being verified.
      autoUpdate: 'off',
      // Explicitly discard old downloaded bundles when a newer native build is installed.
      resetWhenUpdate: true,
    },
  },
};

export default config;
