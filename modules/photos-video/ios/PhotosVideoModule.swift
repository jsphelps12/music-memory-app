import AVFoundation
import ExpoModulesCore
import Photos
import UIKit

// Linked video (1.4): plays a video straight from the Photos library. Photos
// hands over a player item (streaming from iCloud when needed, edits and
// slow-mo applied), so nothing is copied and the item on screen plays the
// original (one loaded ahead may be lighter, see load()).
// The moment film (components/MomentFilm.tsx) drives it with props; it
// reports ready, progress, end (only after real playback) and errors.
public class PhotosVideoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PhotosVideo")

    // Ducking (1.4): ask iOS to lower other audio while a clip's sound is on,
    // and put the session back after. Full Apple Music playback runs in
    // Apple's player (a "sibling" of this app's audio), which apps can't turn
    // down; iOS ducks it (verified on Josh's phone, 2026-11-17). Turning it on
    // returns false if the session refused; turning it off returns at once
    // and finishes on the session queue (endDucking).
    Function("setDuckOthers") { (on: Bool) -> Bool in
      PhotosVideoModule.setDuckOthers(on)
    }

    View(PhotosVideoView.self) {
      Events("onReady", "onProgress", "onEnd", "onError")

      Prop("localId") { (view: PhotosVideoView, id: String?) in
        view.setLocalId(id)
      }
      // 1.4.1: loaded ahead, not on screen (see PhotosVideoView.load).
      Prop("preload") { (view: PhotosVideoView, preload: Bool?) in
        view.setPreload(preload ?? false)
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

      // Loading waits for the whole batch of props, so a view that mounts
      // ahead knows it's ahead before it asks Photos for anything.
      OnViewDidUpdateProps { (view: PhotosVideoView) in
        view.loadIfNeeded()
      }
    }
  }
}

extension PhotosVideoModule {
  // Every session change runs on this queue, in order (AVAudioSession calls
  // can block, so not on main; and an "on" can't overtake an "off").
  private static let sessionQueue = DispatchQueue(label: "expo.modules.photosvideo.audiosession")
  /// The session's options before ducking began, restored after. sessionQueue only.
  private static var savedOptions: AVAudioSession.CategoryOptions?
  /// Bumped by every on and off, so an off still finishing skips its
  /// deactivation if a new duck started meanwhile. sessionQueue only.
  private static var duckGeneration = 0

  static func setDuckOthers(_ on: Bool) -> Bool {
    if on {
      return sessionQueue.sync { startDucking() }
    }
    sessionQueue.async { endDucking() }
    return true
  }

  private static func startDucking() -> Bool {
    duckGeneration += 1
    let session = AVAudioSession.sharedInstance()
    let before = session.categoryOptions.subtracting(.duckOthers)
    if savedOptions == nil { savedOptions = before }
    do {
      try session.setCategory(session.category, mode: session.mode, options: before.union(.duckOthers))
      try session.setActive(true)
      return true
    } catch {
      // Refused: leave nothing half-set (a later activation would duck).
      try? session.setCategory(session.category, mode: session.mode, options: savedOptions ?? before)
      savedOptions = nil
      return false
    }
  }

  /// Unducking (1.4.1). iOS keeps other audio ducked for as long as this
  /// app's session stays active, whatever its options say now; only
  /// deactivating with .notifyOthersOnDeactivation brings it back up. So:
  ///
  /// 1. Options back as they were, without .duckOthers (the app's session is
  ///    .playback + .mixWithOthers from expo-audio), so nothing that plays
  ///    after this ducks again.
  /// 2. On main, pause the film's own players that are running (a clip
  ///    carrying on muted, the next one). Deactivating under running audio
  ///    stops it and fails with "busy", so they step out for a moment.
  ///    The app's preview player (expo-audio) isn't playing here: the film
  ///    only ducks others during full playback, which runs in Apple's player;
  ///    a preview is ducked by its own volume (lib/audioMix.ts).
  /// 3. Deactivate with .notifyOthersOnDeactivation: iOS unducks Apple Music.
  ///    Skipped if a new duck began meanwhile. If it still comes back busy
  ///    (something of ours was playing after all), iOS has deactivated anyway,
  ///    so reactivate at once, without ducking, to keep that sound going.
  /// 4. On main, resume the players paused in 2 that should still play.
  ///    Playing reactivates the session by itself, with the options from 1,
  ///    so mixing with Apple Music, not ducking it.
  private static func endDucking() {
    duckGeneration += 1
    let generation = duckGeneration
    let session = AVAudioSession.sharedInstance()
    let restore = (savedOptions ?? session.categoryOptions).subtracting(.duckOthers)
    savedOptions = nil
    try? session.setCategory(session.category, mode: session.mode, options: restore)
    DispatchQueue.main.async {
      let paused = PhotosVideoView.pauseRunningPlayers()
      PhotosVideoModule.sessionQueue.async {
        if generation == PhotosVideoModule.duckGeneration {
          do {
            try session.setActive(false, options: .notifyOthersOnDeactivation)
          } catch {
            try? session.setActive(true)
          }
        }
        DispatchQueue.main.async {
          for view in paused { view.resumeAfterSessionChange() }
        }
      }
    }
  }
}

class PhotosVideoView: ExpoView {
  /// Every live view, so unducking can pause and resume them. Main only.
  private static let all = NSHashTable<PhotosVideoView>.weakObjects()
  /// Seconds an item loaded ahead buffers (enough to start the fade smoothly).
  private static let aheadBufferSeconds: TimeInterval = 4

  let player = AVPlayer()
  private let playerLayer = AVPlayerLayer()
  let onReady = EventDispatcher()
  let onProgress = EventDispatcher()
  let onEnd = EventDispatcher()
  let onError = EventDispatcher()

  var loop = false
  private var shouldPlay = false
  private var preload = false
  private var currentId: String?
  private var needsLoad = false
  private var requestId: PHImageRequestID?
  /// Which Photos request is in flight, and a token that tells a stale
  /// answer (cancelled, or for an earlier load) from the current one.
  private enum Stage { case onPhone, light, full }
  private var requestStage: Stage?
  private var requestToken = 0
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
    PhotosVideoView.all.add(self)
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
    needsLoad = true
    // Normally loaded by OnViewDidUpdateProps once every prop is in; this
    // is the backstop (props are set together on main, so by the next turn
    // `preload` is in too).
    DispatchQueue.main.async { [weak self] in self?.loadIfNeeded() }
  }

  func loadIfNeeded() {
    guard needsLoad else { return }
    needsLoad = false
    load()
  }

  /// The film moved on: this item came on screen, or went behind / ahead.
  func setPreload(_ on: Bool) {
    guard on != preload else { return }
    preload = on
    // A load still to come picks the role up itself.
    guard !needsLoad else { return }
    // Came on screen while its lighter version was still being fetched:
    // nothing is showing from it yet, so ask for the original instead. One
    // already handed over keeps playing (no swap mid-clip).
    if !on, requestStage == .light, let id = currentId,
       let asset = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject {
      cancelRequest()
      request(asset, id: id, stage: .full)
    }
    applyBuffer()
  }

  /// Ahead: only a few seconds buffered. On screen: AVPlayer decides.
  private func applyBuffer() {
    player.currentItem?.preferredForwardBufferDuration = preload ? PhotosVideoView.aheadBufferSeconds : 0
  }

  /// Unducking (PhotosVideoModule.endDucking): the players that were running.
  static func pauseRunningPlayers() -> [PhotosVideoView] {
    var paused: [PhotosVideoView] = []
    for view in all.allObjects where view.player.rate != 0 {
      view.player.pause()
      paused.append(view)
    }
    return paused
  }

  /// Unducking done: carry on, unless it was paused or emptied meanwhile.
  func resumeAfterSessionChange() {
    if shouldPlay, player.currentItem?.status == .readyToPlay { player.play() }
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

  private func cancelRequest() {
    if let requestId { PHImageManager.default().cancelImageRequest(requestId) }
    requestId = nil
    requestStage = nil
    requestToken += 1
  }

  private func reset() {
    cancelRequest()
    statusObservation = nil
    if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
    endObserver = nil
    player.replaceCurrentItem(with: nil)
  }

  /// On screen: the original (from iCloud if need be). Loaded ahead (1.4.1):
  /// the copy on the phone if there is one, else Photos' lighter streaming
  /// version, so a film never pulls several originals from iCloud at once.
  private func load() {
    reset()
    guard let id = currentId else { return }
    guard let asset = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject,
          asset.mediaType == .video else {
      onError(["message": "notFound"])
      return
    }
    request(asset, id: id, stage: preload ? .onPhone : .full)
  }

  private func request(_ asset: PHAsset, id: String, stage: Stage) {
    let options = PHVideoRequestOptions()
    options.isNetworkAccessAllowed = stage != .onPhone
    options.deliveryMode = stage == .light ? .mediumQualityFormat : .highQualityFormat
    options.version = .current
    requestToken += 1
    let token = requestToken
    requestStage = stage
    requestId = PHImageManager.default().requestPlayerItem(forVideo: asset, options: options) { [weak self] item, info in
      DispatchQueue.main.async {
        guard let self, self.currentId == id, self.requestToken == token else { return }
        self.requestId = nil
        self.requestStage = nil
        if let item {
          self.attach(item, id: id)
          return
        }
        if (info?[PHImageCancelledKey] as? Bool) == true { return }
        if stage == .onPhone {
          // Not on the phone (iCloud only): fetch it, lightly while it's
          // still ahead, the original if it has come on screen meanwhile.
          self.request(asset, id: id, stage: self.preload ? .light : .full)
          return
        }
        self.onError(["message": "unavailable"])
      }
    }
  }

  private func attach(_ item: AVPlayerItem, id: String) {
    statusObservation = item.observe(\.status, options: [.new]) { [weak self] observed, _ in
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
    endObserver = NotificationCenter.default.addObserver(
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
    player.replaceCurrentItem(with: item)
    applyBuffer()
  }

  deinit {
    if let timeObserver { player.removeTimeObserver(timeObserver) }
    reset()
  }
}
