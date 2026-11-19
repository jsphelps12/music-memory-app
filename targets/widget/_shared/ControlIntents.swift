import AppIntents
import Foundation

// The actions behind the iOS 18 controls (CaptureControls.swift).
//
// Two things make a control open the capture screen, both learned from the
// phone's log (2026-11-17):
// - The intents live in _shared so they're built into the app as well as the
//   widget extension, and openAppWhenRun makes iOS run them in the app.
//   Built into the extension alone, iOS ran them there and nothing opened.
// - iOS then drops an OpenURLIntent handed back from perform(), so the app
//   opens the deep link itself through ControlLinkOpener. The app sets the
//   opener at launch (plugins/withControlLinkOpener); the link goes through
//   the AppDelegate like any other, so expo-router sees it whether the app
//   was running or just launched.

/// How the app opens one of its own links. Set by the AppDelegate; nil in the
/// widget extension, which can't open URLs.
enum ControlLinkOpener {
  nonisolated(unsafe) static var open: ((URL) -> Void)?
}

@available(iOS 18.0, *)
struct OpenCaptureIntent: AppIntent {
  static let title: LocalizedStringResource = "Capture a song"
  static let isDiscoverable = false
  static let openAppWhenRun = true

  @MainActor
  func perform() async throws -> some IntentResult {
    ControlLinkOpener.open?(SoundtracksLink.capture)
    return .result()
  }
}

@available(iOS 18.0, *)
struct OpenIdentifyIntent: AppIntent {
  static let title: LocalizedStringResource = "Identify a song"
  static let isDiscoverable = false
  static let openAppWhenRun = true

  @MainActor
  func perform() async throws -> some IntentResult {
    ControlLinkOpener.open?(SoundtracksLink.identify)
    return .result()
  }
}
