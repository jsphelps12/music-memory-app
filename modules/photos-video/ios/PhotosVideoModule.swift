import AVFoundation
import ExpoModulesCore
import Photos
import UIKit

// Linked video (1.4): plays a video straight from the Photos library. Photos
// hands over a player item (streaming from iCloud when needed, edits and
// slow-mo applied), so nothing is copied and quality is the original's.
// The moment film (components/MomentFilm.tsx) drives it with props; it
// reports ready, progress, end (only after real playback) and errors.
public class PhotosVideoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PhotosVideo")

    // Ducking (1.4): ask iOS to lower other audio while a clip's sound is on,
    // and put the session back after. Full Apple Music playback runs in
    // Apple's player (a "sibling" of this app's audio), which apps can't turn
    // down; iOS ducks it (verified on Josh's phone, 2026-11-17). Returns false
    // if the session refused.
    Function("setDuckOthers") { (on: Bool) -> Bool in
      PhotosVideoModule.setDuckOthers(on)
    }

    View(PhotosVideoView.self) {
      Events("onReady", "onProgress", "onEnd", "onError")

      Prop("localId") { (view: PhotosVideoView, id: String?) in
        view.setLocalId(id)
      }
      Prop("playing") { (view: PhotosVideoView, playing: Bool) in
        view.setPlaying(playing)
      }
      Prop("muted") { (view: PhotosVideoView, muted: Bool) in
        view.player.isMuted = muted
      }
      Prop("loop") { (view: PhotosVideoView, loop: Bool) in
        view.loop = loop
      }
      Prop("volume") { (view: PhotosVideoView, volume: Double) in
        view.player.volume = Float(max(0, min(1, volume)))
      }
    }
  }
}

extension PhotosVideoModule {
  /// The session's options before ducking began, restored after.
  private static var savedOptions: AVAudioSession.CategoryOptions?

  static func setDuckOthers(_ on: Bool) -> Bool {
    let session = AVAudioSession.sharedInstance()
    do {
      if on {
        if savedOptions == nil { savedOptions = session.categoryOptions }
        try session.setCategory(session.category, mode: session.mode, options: session.categoryOptions.union(.duckOthers))
        try session.setActive(true)
      } else {
        let restore = savedOptions ?? session.categoryOptions.subtracting(.duckOthers)
        savedOptions = nil
        try session.setCategory(session.category, mode: session.mode, options: restore)
        try session.setActive(true)
      }
      return true
    } catch {
      return false
    }
  }
}

class PhotosVideoView: ExpoView {
  let player = AVPlayer()
  private let playerLayer = AVPlayerLayer()
  let onReady = EventDispatcher()
  let onProgress = EventDispatcher()
  let onEnd = EventDispatcher()
  let onError = EventDispatcher()

  var loop = false
  private var shouldPlay = false
  private var currentId: String?
  private var requestId: PHImageRequestID?
  private var timeObserver: Any?
  private var endObserver: NSObjectProtocol?
  private var statusObservation: NSKeyValueObservation?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = .clear
    player.actionAtItemEnd = .pause
    player.isMuted = true
    playerLayer.player = player
    playerLayer.videoGravity = .resizeAspect
    layer.addSublayer(playerLayer)
    timeObserver = player.addPeriodicTimeObserver(
      forInterval: CMTime(seconds: 0.25, preferredTimescale: 600),
      queue: .main
    ) { [weak self] time in
      guard let self, let item = self.player.currentItem else { return }
      let duration = item.duration.seconds
      if duration.isFinite, duration > 0 {
        self.onProgress(["fraction": min(1, max(0, time.seconds / duration))])
      }
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    playerLayer.frame = bounds
  }

  func setLocalId(_ id: String?) {
    guard id != currentId else { return }
    currentId = id
    load()
  }

  func setPlaying(_ playing: Bool) {
    shouldPlay = playing
    if playing {
      if player.currentItem?.status == .readyToPlay { player.play() }
    } else {
      // Paused where it is; a fresh view starts from the top.
      player.pause()
    }
  }

  private func reset() {
    if let requestId { PHImageManager.default().cancelImageRequest(requestId) }
    requestId = nil
    statusObservation = nil
    if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
    endObserver = nil
    player.replaceCurrentItem(with: nil)
  }

  private func load() {
    reset()
    guard let id = currentId else { return }
    guard let asset = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject,
          asset.mediaType == .video else {
      onError(["message": "notFound"])
      return
    }
    let options = PHVideoRequestOptions()
    options.isNetworkAccessAllowed = true
    options.deliveryMode = .highQualityFormat
    options.version = .current
    requestId = PHImageManager.default().requestPlayerItem(forVideo: asset, options: options) { [weak self] item, _ in
      DispatchQueue.main.async {
        guard let self, self.currentId == id else { return }
        guard let item else {
          self.onError(["message": "unavailable"])
          return
        }
        self.statusObservation = item.observe(\.status, options: [.new]) { [weak self] observed, _ in
          DispatchQueue.main.async {
            guard let self, self.currentId == id else { return }
            switch observed.status {
            case .readyToPlay:
              let seconds = observed.duration.seconds
              self.onReady(["durationMs": seconds.isFinite ? seconds * 1000 : 0])
              if self.shouldPlay { self.player.play() }
            case .failed:
              self.onError(["message": observed.error?.localizedDescription ?? "failed"])
            default:
              break
            }
          }
        }
        self.endObserver = NotificationCenter.default.addObserver(
          forName: .AVPlayerItemDidPlayToEndTime,
          object: item,
          queue: .main
        ) { [weak self] _ in
          guard let self else { return }
          if self.loop {
            self.player.seek(to: .zero)
            self.player.play()
          } else {
            self.onEnd()
          }
        }
        self.player.replaceCurrentItem(with: item)
      }
    }
  }

  deinit {
    if let timeObserver { player.removeTimeObserver(timeObserver) }
    reset()
  }
}
