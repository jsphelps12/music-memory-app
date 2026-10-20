import ExpoModulesCore
import MediaPlayer

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
