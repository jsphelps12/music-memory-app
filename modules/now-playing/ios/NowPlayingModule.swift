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

    AsyncFunction("getNowPlaying") { () -> [String: Any]? in
      return self.buildNowPlayingInfo()
    }
  }

  @objc private func nowPlayingItemDidChange() {
    guard isObserving else { return }
    let info = buildNowPlayingInfo()
    sendEvent("onNowPlayingChanged", ["item": info as Any])
  }

  private func buildNowPlayingInfo() -> [String: Any]? {
    let player = MPMusicPlayerController.systemMusicPlayer
    guard let item = player.nowPlayingItem else {
      return nil
    }

    let title = item.title ?? ""
    let artist = item.artist ?? ""
    let persistentID = item.persistentID

    var artworkDataUri: String? = nil
    if let artwork = item.artwork {
      let size = CGSize(width: 600, height: 600)
      if let image = artwork.image(at: size),
         let data = image.pngData() {
        artworkDataUri = "data:image/png;base64," + data.base64EncodedString()
      }
    }

    let durationMs = Int(item.playbackDuration * 1000)
    let storeId = item.value(forProperty: "storeID") as? String
    let id = storeId ?? String(persistentID)

    return [
      "id": id,
      "title": title,
      "artistName": artist,
      "artworkUrl": artworkDataUri ?? "",
      "durationMs": durationMs,
    ]
  }
}
