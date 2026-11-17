import ExpoModulesCore
import MediaPlayer
import MusicKit

public class NowPlayingModule: Module {
  private var isObserving = false

  public func definition() -> ModuleDefinition {
    Name("NowPlaying")

    Events("onNowPlayingChanged")

    OnStartObserving {
      let player = MPMusicPlayerController.systemMusicPlayer
      player.beginGeneratingPlaybackNotifications()
      NotificationCenter.default.addObserver(
        self,
        selector: #selector(self.nowPlayingItemDidChange),
        name: .MPMusicPlayerControllerNowPlayingItemDidChange,
        object: player
      )
      isObserving = true
    }

    OnStopObserving {
      let player = MPMusicPlayerController.systemMusicPlayer
      NotificationCenter.default.removeObserver(
        self,
        name: .MPMusicPlayerControllerNowPlayingItemDidChange,
        object: player
      )
      player.endGeneratingPlaybackNotifications()
      isObserving = false
    }

    // MPMusicPlayerController is main-thread only; AsyncFunctions run on the
    // module's background queue unless told otherwise.
    AsyncFunction("getNowPlaying") { () -> [String: Any]? in
      return self.buildNowPlayingInfo()
    }.runOnQueue(.main)

    // App lock (1.4): milliseconds on a clock the user can't change and that
    // keeps counting while the phone sleeps (CLOCK_MONOTONIC on Darwin
    // includes sleep). Date.now() would let someone holding the phone set the
    // date back to skip the lock. Lives here because this is the app's own
    // native module, not because it's about music.
    Function("monotonicMs") { () -> Double in
      return Double(clock_gettime_nsec_np(CLOCK_MONOTONIC)) / 1_000_000
    }

    // Photos ↔ music prototype (1.4): the user's own library with when each
    // song was added and how often it's been played. On device only; nothing
    // here leaves the phone.
    AsyncFunction("requestLibraryAccess") { (promise: Promise) in
      MPMediaLibrary.requestAuthorization { status in
        promise.resolve(NowPlayingModule.statusName(status))
      }
    }

    AsyncFunction("getLibrarySongs") { (limit: Int) -> [[String: Any]] in
      guard MPMediaLibrary.authorizationStatus() == .authorized else { return [] }
      let items = MPMediaQuery.songs().items ?? []
      let newestFirst = items.sorted { $0.dateAdded > $1.dateAdded }
      return newestFirst.prefix(max(0, limit)).map { item in
        var song: [String: Any] = [
          "persistentId": String(item.persistentID),
          "storeId": (item.value(forProperty: MPMediaItemPropertyPlaybackStoreID) as? String) ?? "",
          "title": item.title ?? "",
          "artistName": item.artist ?? "",
          "albumTitle": item.albumTitle ?? "",
          "albumId": String(item.albumPersistentID),
          "dateAdded": item.dateAdded.timeIntervalSince1970 * 1000,
          "playCount": item.playCount,
        ]
        if let last = item.lastPlayedDate {
          song["lastPlayed"] = last.timeIntervalSince1970 * 1000
        }
        return song
      }
    }

    // "Last week" (1.4): whether the library may be read, without asking.
    Function("libraryAccessStatus") { () -> String in
      NowPlayingModule.statusName(MPMediaLibrary.authorizationStatus())
    }

    // "Last week" (1.4): Apple Music's recently played songs, streamed ones
    // included (the library API only sees songs added to the library). The
    // list is short and undated, so JS records when each song first appears.
    // Needs MusicKit access already granted and a subscription; otherwise [].
    AsyncFunction("getRecentlyPlayed") { (limit: Int) async -> [[String: Any]] in
      guard MusicAuthorization.currentStatus == .authorized else { return [] }
      do {
        var request = MusicRecentlyPlayedRequest<Song>()
        request.limit = max(1, min(limit, 100))
        let response = try await request.response()
        return response.items.map { song in
          var item: [String: Any] = [
            "storeId": song.id.rawValue,
            "title": song.title,
            "artistName": song.artistName,
            "albumTitle": song.albumTitle ?? "",
          ]
          if let url = song.artwork?.url(width: 600, height: 600) {
            item["artworkUrl"] = url.absoluteString
          }
          return item
        }
      } catch {
        return []
      }
    }
  }

  private static func statusName(_ status: MPMediaLibraryAuthorizationStatus) -> String {
    switch status {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .notDetermined: return "notDetermined"
    @unknown default: return "unknown"
    }
  }

  @objc private func nowPlayingItemDidChange() {
    DispatchQueue.main.async {
      guard self.isObserving else { return }
      let info = self.buildNowPlayingInfo()
      self.sendEvent("onNowPlayingChanged", ["item": info as Any])
    }
  }

  private func buildNowPlayingInfo() -> [String: Any]? {
    let player = MPMusicPlayerController.systemMusicPlayer
    guard let item = player.nowPlayingItem else {
      return nil
    }

    let title = item.title ?? ""
    let artist = item.artist ?? ""
    let durationMs = Int(item.playbackDuration * 1000)
    let storeId = item.value(forProperty: MPMediaItemPropertyPlaybackStoreID) as? String

    return [
      "id": storeId ?? "",
      "title": title,
      "artistName": artist,
      "artworkUrl": artworkFileUrl(for: item) ?? "",
      "durationMs": durationMs,
    ]
  }

  /// The item's artwork as a file:// URL in the temp directory, for display
  /// only. Image data never crosses the bridge, and JS never persists a local
  /// URL: it swaps in the catalog artwork before saving.
  private func artworkFileUrl(for item: MPMediaItem) -> String? {
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("now-playing-artwork-\(item.persistentID).jpg")
    if FileManager.default.fileExists(atPath: url.path) {
      return url.absoluteString
    }
    guard let artwork = item.artwork,
          let image = artwork.image(at: CGSize(width: 600, height: 600)),
          let data = image.jpegData(compressionQuality: 0.8) else {
      return nil
    }
    do {
      try data.write(to: url, options: .atomic)
      return url.absoluteString
    } catch {
      return nil
    }
  }
}
