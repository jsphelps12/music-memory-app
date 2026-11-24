// expo-share-intent prepends `group.<bundle id>` to the main app's app groups,
// and app.config.ts lists that same group (the widget target inherits it from
// there), so the signed entitlements carried it twice. This keeps the first
// of each. Entitlements mods run last-registered first, so this one's
// callback runs after share-intent's whatever its place in `plugins`.
const { withEntitlementsPlist } = require("expo/config-plugins");

const KEY = "com.apple.security.application-groups";

module.exports = function withDedupedAppGroups(config) {
  return withEntitlementsPlist(config, (cfg) => {
    const groups = cfg.modResults[KEY];
    if (Array.isArray(groups)) cfg.modResults[KEY] = [...new Set(groups)];
    return cfg;
  });
};
