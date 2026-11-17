// iOS 27 won't launch an app linked against the iOS 27 SDK unless it uses
// the UIScene lifecycle (crash: _UIApplicationEvaluateRuntimeIssueForNo-
// SceneLifecycleAdoption). Expo SDK 54's AppDelegate template creates its
// window in didFinishLaunching, the old way. EAS's older Xcode didn't hit
// this; Xcode 27 builds (local, and eventually EAS) do.
//
// This moves window creation into a SceneDelegate and forwards URLs and user
// activities from the scene back through the AppDelegate, so deep links
// (auth confirm, widgets, share extension) and Expo's delegate subscribers
// see exactly what they saw before. A cold-start URL arrives in the scene's
// connection options instead of launchOptions, so it's put back into the
// launchOptions React Native reads for Linking.getInitialURL.
//
// It mirrors Expo SDK 58's own ExpoAppSceneDelegate (the first SDK whose
// template uses scenes). Delete this plugin when we upgrade to SDK 58+.
const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

const MARK = "// withSceneLifecycle";

const WINDOW_BLOCK = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif`;

const FACTORY_PROP = "  var reactNativeFactory: RCTReactNativeFactory?\n";

const SCENE_DELEGATE = `
${MARK}: the window and React Native start here, not in didFinishLaunching.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else { return }

    var launchOptions = appDelegate.sceneLaunchOptions ?? [:]
    if let context = connectionOptions.urlContexts.first {
      launchOptions[.url] = context.url
      if let source = context.options.sourceApplication {
        launchOptions[.sourceApplication] = source
      }
    }
    if let activity = connectionOptions.userActivities.first {
      launchOptions[.userActivityDictionary] = [
        "UIApplicationLaunchOptionsUserActivityKey": activity,
        "UIApplicationLaunchOptionsUserActivityTypeKey": activity.activityType,
      ]
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    // Libraries (expo-updates among them) look for the app delegate's window.
    appDelegate.window = window
    factory.startReactNative(withModuleName: "main", in: window, launchOptions: launchOptions)

    // Expo modules (expo-linking's initial URL) still hear about a link that
    // cold-started the app. React Native doesn't: it reads the launch options
    // above, and a second delivery could spend a single-use auth code twice.
    let app = UIApplication.shared
    for context in connectionOptions.urlContexts {
      _ = ExpoAppDelegateSubscriberManager.application(app, open: context.url, options: Self.openURLOptions(context.options))
    }
    for activity in connectionOptions.userActivities {
      _ = ExpoAppDelegateSubscriberManager.application(app, continue: activity, restorationHandler: { _ in })
    }
  }

  // Under scenes UIKit stops calling the app delegate's lifecycle methods;
  // pass them on so Expo's subscribers see them as before.
  func sceneDidBecomeActive(_ scene: UIScene) {
    (UIApplication.shared.delegate as? AppDelegate)?.applicationDidBecomeActive(UIApplication.shared)
  }

  func sceneWillResignActive(_ scene: UIScene) {
    (UIApplication.shared.delegate as? AppDelegate)?.applicationWillResignActive(UIApplication.shared)
  }

  func sceneWillEnterForeground(_ scene: UIScene) {
    (UIApplication.shared.delegate as? AppDelegate)?.applicationWillEnterForeground(UIApplication.shared)
  }

  func sceneDidEnterBackground(_ scene: UIScene) {
    (UIApplication.shared.delegate as? AppDelegate)?.applicationDidEnterBackground(UIApplication.shared)
  }

  static func openURLOptions(_ options: UIScene.OpenURLOptions) -> [UIApplication.OpenURLOptionsKey: Any] {
    var result: [UIApplication.OpenURLOptionsKey: Any] = [.openInPlace: options.openInPlace]
    if let source = options.sourceApplication { result[.sourceApplication] = source }
    if let annotation = options.annotation { result[.annotation] = annotation }
    return result
  }

  // Warm links: the AppDelegate's handler reaches both Expo and React Native.
  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    for context in URLContexts {
      _ = appDelegate.application(UIApplication.shared, open: context.url, options: Self.openURLOptions(context.options))
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    _ = appDelegate.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}
`;

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== "swift") {
      throw new Error("withSceneLifecycle: expected a Swift AppDelegate");
    }
    let src = cfg.modResults.contents;
    if (src.includes(MARK)) return cfg;
    if (!src.includes(WINDOW_BLOCK)) {
      throw new Error("withSceneLifecycle: AppDelegate window setup not found (Expo template changed?)");
    }
    if (!src.includes(FACTORY_PROP)) {
      throw new Error("withSceneLifecycle: reactNativeFactory property not found");
    }
    src = src.replace(
      FACTORY_PROP,
      FACTORY_PROP + `  ${MARK}: kept for SceneDelegate, which starts React Native.\n  var sceneLaunchOptions: [UIApplication.LaunchOptionsKey: Any]?\n`
    );
    src = src.replace(WINDOW_BLOCK, `    ${MARK}: SceneDelegate creates the window.\n    sceneLaunchOptions = launchOptions`);
    if (!src.includes("import ExpoModulesCore")) src = src.replace("import Expo\n", "import Expo\nimport ExpoModulesCore\n");
    cfg.modResults.contents = src.trimEnd() + "\n" + SCENE_DELEGATE;
    return cfg;
  });
}

function withSceneManifest(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    };
    return cfg;
  });
}

module.exports = function withSceneLifecycle(config) {
  return withSceneManifest(withSceneAppDelegate(config));
};
