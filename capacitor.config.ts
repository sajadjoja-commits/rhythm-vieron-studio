import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vireon.vireon',
  appName: 'vieron',
  webDir: 'dist',
  backgroundColor: '#090d16',
  server: {
    url: 'https://rhythm-vieron-studio.lovable.app',
    cleartext: true
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      launchAutoHide: false,
      backgroundColor: '#090d16',
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#090d16',
      overlaysWebView: false
    },
    Keyboard: {
      resize: 'body',
      style: 'DARK',
      resizeOnFullScreen: true
    },
    CapacitorUpdater: {
      autoUpdate: 'always',
      appId: 'com.vireon.vireon',
      version: '1.0.0',
      autoSplashscreen: true
    },
    Media: {
      androidGallery: true
    }
  }
};

export default config;
