// Capture-from-anywhere (Phase 2): Home Screen and Lock Screen widgets plus
// iOS 18 controls (Control Center, Lock Screen, Action button). Every surface
// is a deep link into the capture screen; nothing here reads app data, so no
// app group is needed yet. Colors mirror constants/theme.ts.
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = () => ({
  type: "widget",
  name: "widget",
  displayName: "Soundtracks",
  bundleIdentifier: ".widget",
  // containerBackground and the accessory families need 17; controls are
  // gated to 18 in Swift.
  deploymentTarget: "17.0",
  colors: {
    $widgetBackground: { light: "#FBF7F2", dark: "#1C1716" },
    $accent: { light: "#D9693F", dark: "#EE8B62" },
    paper: { light: "#FBF7F2", dark: "#1C1716" },
    ink: { light: "#23222B", dark: "#F5F0EB" },
    inkSoft: { light: "#5E5C66", dark: "#ABA39E" },
    chip: { light: "#F0EAE3", dark: "#2A2422" },
    onInk: { light: "#FBF7F2", dark: "#0E0B0A" },
    accent: { light: "#D9693F", dark: "#EE8B62" },
  },
});
