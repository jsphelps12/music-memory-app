import { ExpoConfig, ConfigContext } from "expo/config";

const isPreview = process.env.EXPO_PUBLIC_APP_ENV === "preview";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: isPreview ? "Soundtracks β" : "Soundtracks",
  slug: "music-memory",
  version: "1.1.0",
  orientation: "portrait",
  icon: isPreview ? "./assets/images/app-icon-beta-forest-1024.png" : "./assets/images/app-icon.png",
  scheme: "soundtracks",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  splash: {
    image: "./assets/images/app-icon.png",
    resizeMode: "contain",
    backgroundColor: "#FBF6F1",
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: isPreview
      ? "com.joshuaphelps.musicmemory.preview"
      : "com.joshuaphelps.musicmemory",
    usesAppleSignIn: true,
    infoPlist: {
      NSAppleMusicUsageDescription:
        "Soundtracks uses Apple Music to search and play songs linked to your moments.",
      NSPhotoLibraryUsageDescription:
        "Soundtracks uses your photo library to attach photos to your moments.",
      NSCameraUsageDescription:
        "Soundtracks uses your camera to take photos for your moments.",
      NSLocationWhenInUseUsageDescription:
        "Soundtracks reads your photos' location data to suggest where your moment took place.",
      NSMicrophoneUsageDescription:
        "Soundtracks uses the microphone to identify songs playing around you with ShazamKit.",
      ITSAppUsesNonExemptEncryption: false,
    },
    entitlements: {
      "com.apple.developer.applesignin": ["Default"],
      "com.apple.developer.associated-domains": ["applinks:soundtracks.app"],
      "com.apple.security.application-groups": [
        isPreview
          ? "group.com.joshuaphelps.musicmemory.preview"
          : "group.com.joshuaphelps.musicmemory",
      ],
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
    ["react-native-maps", { useGoogleMapsOnAndroid: false }],
    [
      "@sentry/react-native/expo",
      {
        url: "https://sentry.io/",
        project: "react-native",
        organization: "soundtracks",
      },
    ],
    "expo-router",
    "expo-apple-authentication",
    [
      "expo-image-picker",
      {
        photosPermission:
          "Soundtracks uses your photo library to attach photos to your moments.",
        cameraPermission:
          "Soundtracks uses your camera to take photos for your moments.",
      },
    ],
    "expo-sqlite",
    "@react-native-community/datetimepicker",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Soundtracks reads your photos' location data to suggest where your moment took place.",
      },
    ],
    [
      "expo-share-intent",
      {
        iosActivationRules: {
          NSExtensionActivationSupportsWebURLWithMaxCount: 1,
          NSExtensionActivationSupportsText: true,
          NSExtensionActivationSupportsImageWithMaxCount: 5,
        },
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/images/app-icon.png",
        color: "#E8825C",
      },
    ],
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
