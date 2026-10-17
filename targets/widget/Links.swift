import Foundation

/// Deep links into the app. The beta (com.joshuaphelps.musicmemory.preview)
/// and production apps use different URL schemes so both can be installed;
/// this extension's bundle id says which app it ships inside.
enum SoundtracksLink {
  static var scheme: String {
    (Bundle.main.bundleIdentifier ?? "").contains(".preview") ? "soundtracks-beta" : "soundtracks"
  }

  /// Three slashes: an empty host, so expo-router reads "/create" as the path.
  static var capture: URL { URL(string: "\(scheme):///create?source=widget")! }
  static var identify: URL { URL(string: "\(scheme):///create?identify=1&source=widget")! }
}
