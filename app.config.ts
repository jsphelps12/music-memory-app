import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Tracks",
  slug: "music-memory",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/app-icon.png",
  scheme: "tracks",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  splash: {
    image: "./assets/images/app-icon.png",
    resizeMode: "contain",
    backgroundColor: "#FBF6F1",
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.joshuaphelps.musicmemory",
    usesAppleSignIn: true,
    infoPlist: {
      NSAppleMusicUsageDescription:
        "Tracks uses Apple Music to search and play songs linked to your moments.",
      NSPhotoLibraryUsageDescription:
        "Tracks uses your photo library to attach photos to your moments.",
      NSCameraUsageDescription:
        "Tracks uses your camera to take photos for your moments.",
      ITSAppUsesNonExemptEncryption: false,
    },
    entitlements: {
      "com.apple.developer.applesignin": ["Default"],
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#ffffff",
    },
    edgeToEdgeEnabled: true,
    package: "com.joshuaphelps.musicmemory",
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-apple-authentication",
    [
      "expo-image-picker",
      {
        photosPermission:
          "Tracks uses your photo library to attach photos to your moments.",
        cameraPermission:
          "Tracks uses your camera to take photos for your moments.",
      },
    ],
    "expo-sqlite",
    "@react-native-community/datetimepicker",
  ],
  updates: {
    url: "https://u.expo.dev/f0add7d9-3321-4ba3-a4c0-c91b97dc462b",
  },
  runtimeVersion: {
    policy: "appVersion",
  },
  extra: {
    eas: {
      projectId: "f0add7d9-3321-4ba3-a4c0-c91b97dc462b",
    },
  },
  experiments: {
    typedRoutes: true,
  },
});
