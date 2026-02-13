import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Music Memory",
  slug: "music-memory",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "musicmemory",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  splash: {
    image: "./assets/images/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.joshuaphelps.musicmemory",
    usesAppleSignIn: true,
    infoPlist: {
      NSAppleMusicUsageDescription:
        "Music Memory uses Apple Music to search and play songs linked to your moments.",
      NSPhotoLibraryUsageDescription:
        "Music Memory uses your photo library to attach photos to your moments.",
      NSCameraUsageDescription:
        "Music Memory uses your camera to take photos for your moments.",
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
          "Music Memory uses your photo library to attach photos to your moments.",
        cameraPermission:
          "Music Memory uses your camera to take photos for your moments.",
      },
    ],
    "expo-sqlite",
    "@react-native-community/datetimepicker",
  ],
  experiments: {
    typedRoutes: true,
  },
});
