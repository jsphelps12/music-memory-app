// Xcode 27 refuses to build pods whose deployment target is below iOS 15
// (Sentry 11.0, SDWebImage 9.0, RNSVG 12.4, ...). This raises just those pods
// to the app's own minimum (iOS 16.4 since Expo SDK 56) in the Podfile's
// post_install. App and extension targets (the widget needs iOS 17) are
// untouched.
const { withPodfile } = require("expo/config-plugins");

const MARK = "# withPodsMinDeploymentTarget";

module.exports = function withPodsMinDeploymentTarget(config, { minimum = "16.4" } = {}) {
  return withPodfile(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes(MARK)) return cfg;
    const hook = `
    ${MARK}
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |bc|
        current = bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current.nil? || Gem::Version.new(current) < Gem::Version.new('${minimum}')
          bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${minimum}'
        end
      end
    end
`;
    const anchor = "  post_install do |installer|\n";
    if (!src.includes(anchor)) throw new Error("withPodsMinDeploymentTarget: post_install block not found");
    cfg.modResults.contents = src.replace(anchor, anchor + hook);
    return cfg;
  });
};
