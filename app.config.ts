import { ExpoConfig, ConfigContext } from "expo/config";

const isPreview = process.env.EXPO_PUBLIC_APP_ENV === "preview";

// Permission prompts (App Review 5.1.1): say exactly what each one is for.
// Plugins below write the same keys, so they all take these constants; a
// plugin's own option wins over `infoPlist`.
const MUSIC_USAGE =
  "Soundtracks uses Apple Music to search and play songs, show what's playing now, and read your library, recently played songs and play counts for Last week and From before. Your listening history stays on your iPhone.";
const PHOTOS_SAVE_USAGE =
  "Soundtracks saves images you choose to your photo library, like a moment's share card.";
const PHOTOS_USAGE =
  "Soundtracks uses your photo library to attach and link photos and videos to your moments, and analyzes your photos on your iPhone to suggest moments. Only the photos you attach are uploaded; the analysis never leaves your phone.";
const CAMERA_USAGE =
  "Soundtracks uses your camera to take photos for your moments and your profile picture.";
const LOCATION_USAGE =
  "Soundtracks uses your location while you add a moment to suggest where it happened. You can change or remove the place before you save.";
const MICROPHONE_USAGE =
  "Soundtracks uses the microphone to identify a song playing around you, and to record what you say about a moment. It only listens while you're identifying a song or recording.";
const SPEECH_USAGE =
  "Soundtracks turns what you say about a song into text on your iPhone. Your recording never leaves your phone to be transcribed.";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: isPreview ? "Soundtracks β" : "Soundtracks",
  slug: "music-memory",
  version: "1.4.1",
  orientation: "portrait",
  icon: isPreview ? "./assets/images/app-icon-beta.png" : "./assets/images/app-icon.png",
  // Per-variant scheme: with both apps installed, iOS routes a shared custom
  // scheme to an arbitrary one — share-extension handoffs and OAuth callbacks
  // would land in the wrong app. Public soundtracks:// links stay prod-only.
  scheme: isPreview ? "soundtracks-beta" : "soundtracks",
  userInterfaceStyle: "automatic",
  ios: {
    // "Pressed S" (2026-10): light, dark and tinted home-screen variants,
    // drawn by scripts/make-app-icon.py. The beta keeps one icon (green
    // label) so it never looks like the App Store app.
    icon: isPreview
      ? "./assets/images/app-icon-beta.png"
      : {
          light: "./assets/images/app-icon.png",
          dark: "./assets/images/app-icon-dark.png",
          tinted: "./assets/images/app-icon-tinted.png",
        },
    supportsTablet: false,
    bundleIdentifier: isPreview
      ? "com.joshuaphelps.musicmemory.preview"
      : "com.joshuaphelps.musicmemory",
    usesAppleSignIn: true,
    // The widget extension (targets/widget, via @bacons/apple-targets) signs
    // with the same team.
    appleTeamId: "J9X5GR82CZ",
    infoPlist: {
      NSAppleMusicUsageDescription: MUSIC_USAGE,
      NSPhotoLibraryUsageDescription: PHOTOS_USAGE,
      NSCameraUsageDescription: CAMERA_USAGE,
      NSLocationWhenInUseUsageDescription: LOCATION_USAGE,
      NSMicrophoneUsageDescription: MICROPHONE_USAGE,
      NSSpeechRecognitionUsageDescription: SPEECH_USAGE,
      ITSAppUsesNonExemptEncryption: false,
      // Required by react-native-spotify-remote so iOS allows querying
      // whether the Spotify app is installed and opening it for OAuth.
      LSApplicationQueriesSchemes: ["spotify", "mailto"],
    },
    // Universal links (/confirm, /m/*, /friend/*, /c/*). This must be
    // `associatedDomains`, not an `entitlements` key: Expo's withAssociatedDomains
    // rewrites that key from this field and drops it when the field is unset,
    // which is why build 12 shipped without the entitlement. Apex only:
    // www permanently redirects to soundtracks.app (Vercel), so it serves no
    // AASA of its own. Production only: the web AASA
    // lists only the store app, so the β app (installed alongside) never
    // takes a sign-in /confirm link meant for the store app.
    ...(isPreview ? {} : { associatedDomains: ["applinks:soundtracks.app"] }),
    entitlements: {
      "com.apple.developer.applesignin": ["Default"],
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
      backgroundColor: "#FBF7F2",
    },
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
    // Local Xcode 27 builds: lift pods below iOS 15 (see the plugin).
    "./plugins/withPodsMinDeploymentTarget",
    "./plugins/withControlLinkOpener",
    // expo-share-intent prepends the app group the config already lists.
    "./plugins/withDedupedAppGroups",
    "expo-apple-authentication",
    [
      // App lock (1.4): Settings → Privacy → Lock with Face ID.
      "expo-local-authentication",
      { faceIDPermission: "Soundtracks uses Face ID to keep your journal private." },
    ],
    [
      // Photos ↔ music prototype (1.4): reads photo dates near when a song
      // was added to the library. Read-only, so no save-to-Photos permission.
      "expo-media-library",
      {
        photosPermission: PHOTOS_USAGE,
        // The share sheet's "Save Image" (share card) writes to Photos; iOS
        // force-closes an app that offers it without this string.
        savePhotosPermission: PHOTOS_SAVE_USAGE,
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: PHOTOS_USAGE,
        cameraPermission: CAMERA_USAGE,
        // Never `false`: that deletes the key Shazam identify needs.
        microphonePermission: MICROPHONE_USAGE,
      },
    ],
    "expo-sqlite",
    "@react-native-community/datetimepicker",
    [
      // Foreground only: LocationField asks once on capture (balanced
      // accuracy); photo places come from Photos and reverse geocoding, which
      // need no location permission. `false` deletes the plugin's generic
      // Always, motion and precise-location strings for APIs the app never
      // calls, and compiles out expo-location's motion code.
      "expo-location",
      {
        locationWhenInUsePermission: LOCATION_USAGE,
        locationAlwaysAndWhenInUsePermission: false,
        locationAlwaysPermission: false,
        motionUsagePermission: false,
        locationFullAccuracyPermission: false,
        isIosBackgroundLocationEnabled: false,
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
    // The launch screen looks like the app already open: its paper color and
    // a small serif wordmark, light and dark. The app holds it until routing
    // resolves and fades into the first screen (app/_layout.tsx).
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-wordmark.png",
        imageWidth: 168,
        resizeMode: "contain",
        backgroundColor: "#FBF7F2",
        dark: {
          image: "./assets/images/splash-wordmark-dark.png",
          backgroundColor: "#0E0B0A",
        },
      },
    ],
    // Capture-from-anywhere widgets and controls (targets/widget).
    "@bacons/apple-targets",
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
  // The runtime version decides which binaries an OTA update is served to —
  // exact string match, no cleverness. Under the previous "appVersion" policy it
  // was literally the `version` field above, so it only moved when a human
  // edited it: App Store build 7 and beta build 20 had genuinely different
  // native code and were both labelled "1.1.0", and EAS could not tell them
  // apart. It would happily serve JS referencing native modules a binary lacks,
  // which is a hard crash at import time for modules/now-playing and
  // modules/shazam-kit (bare requireNativeModule, no try/catch).
  //
  // "fingerprint" derives the label from everything that affects the native
  // build, so a mismatch can no longer happen: the update simply lands in a
  // bucket no binary occupies and reaches nobody. Safe, but silent — hence the
  // reachability check in scripts/fingerprint-gate.mjs.
  //
  // Consequence: any native-affecting change now needs a new binary before any
  // user receives JS. That includes eas.json and package.json's `scripts` block,
  // both of which feed the fingerprint and are easy to touch by accident.
  runtimeVersion: {
    policy: "fingerprint",
  },
  extra: {
    eas: {
      projectId: "f0add7d9-3321-4ba3-a4c0-c91b97dc462b",
    },
  },
  experiments: {
    typedRoutes: true,
    // React Compiler (1.4): memoizes components and hooks at build time, so
    // lists and screens re-render less without hand-written useMemo/useCallback.
    // Components that break the Rules of React are skipped, not miscompiled.
    reactCompiler: true,
  },
});
