// The Control Center / Lock Screen controls (targets/widget) run their intent
// in the app, but iOS drops the OpenURLIntent they return, so the app opens
// the deep link itself. This gives the shared ControlLinkOpener
// (targets/widget/_shared/ControlIntents.swift) the app's own URL opener at
// launch. The widget extension never sets it: extensions can't open URLs.
const { withAppDelegate } = require("expo/config-plugins");

const MARK = "// withControlLinkOpener";
const ANCHOR = "    return super.application(application, didFinishLaunchingWithOptions: launchOptions)";

module.exports = function withControlLinkOpener(config) {
  return withAppDelegate(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes(MARK)) return cfg;
    if (cfg.modResults.language !== "swift" || !src.includes(ANCHOR)) {
      throw new Error("withControlLinkOpener: didFinishLaunching return not found in AppDelegate.swift");
    }
    const hook = `    ${MARK}: controls open their deep link through the app.
    ControlLinkOpener.open = { url in UIApplication.shared.open(url) }

`;
    cfg.modResults.contents = src.replace(ANCHOR, hook + ANCHOR);
    return cfg;
  });
};
