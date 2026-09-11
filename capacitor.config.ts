import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vireon.ai',
  appName: 'Vireon AI Studio',
  webDir: 'dist',
  backgroundColor: '#090d16',
  server: {
    // The published app is the primary source of the UI. Web releases become
    // available to Android on the next launch without a separate OTA service.
    url: 'https://rhythm-vieron-studio.lovable.app',
    androidScheme: 'https',
    cleartext: false,
    // Keep navigation restricted to our published app and the built-in
    // localhost fallback that is used if the network is unavailable.
    allowNavigation: ['rhythm-vieron-studio.lovable.app', 'localhost'],
  },
  android: {
    allowMixedContent: false,
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
  },
};

export default config;

