import ExpoModulesCore
import ShazamKit
import AVFoundation

// SHSessionDelegate requires NSObject — keep it in a separate class.
private class ShazamDelegate: NSObject, SHSessionDelegate {
  var onFound: ((SHMatch) -> Void)?
  var onError: ((Error) -> Void)?

  func session(_ session: SHSession, didFind match: SHMatch) {
    onFound?(match)
  }

  func session(_ session: SHSession, didNotFindMatchFor signature: SHSignature, error: Error?) {
    if let error = error {
      onError?(error)
    }
  }
}

public class ShazamKitModule: Module {
  private var audioEngine: AVAudioEngine?
  private var shazamSession: SHSession?
  private var shazamDelegate: ShazamDelegate?
  private var pendingPromise: Promise?
  private var matchTimer: Timer?
  private var timeoutTimer: Timer?
  // The shared audio session as it was before listening, restored after, so
  // the app's playback mode (set by expo-audio) survives an Identify.
  private var savedSessionConfig: (category: AVAudioSession.Category, mode: AVAudioSession.Mode, options: AVAudioSession.CategoryOptions)?
  // Every use of a listen's SHSignatureGenerator (the audio tap appending,
  // the match timer reading) runs on this serial queue. The generator itself
  // is local to each listen, so the main thread never touches one.
  private let genQueue = DispatchQueue(label: "com.tracks.shazam.gen")

  public func definition() -> ModuleDefinition {
    Name("ShazamKit")

    AsyncFunction("identifyAudio") { (promise: Promise) in
      DispatchQueue.main.async {
        guard self.pendingPromise == nil else {
          promise.reject("ALREADY_RUNNING", "ShazamKit is already identifying")
          return
        }
        self.pendingPromise = promise
        self.startListening()
      }
    }

    AsyncFunction("stopListening") { () -> Void in
      DispatchQueue.main.async {
        let promise = self.pendingPromise
        self.pendingPromise = nil
        self.cleanUpAudio()
        promise?.reject("CANCELLED", "Identification cancelled")
      }
    }
  }

  // MARK: - Private

  private func startListening() {
    AVAudioSession.sharedInstance().requestRecordPermission { [weak self] granted in
      DispatchQueue.main.async {
        guard let self = self else { return }
        if granted {
          self.startListeningWithPermission()
        } else {
          let promise = self.pendingPromise
          self.pendingPromise = nil
          promise?.reject("PERMISSION_DENIED", "Microphone access is required to identify songs.")
        }
      }
    }
  }

  private func startListeningWithPermission() {
    let generator = SHSignatureGenerator()

    let delegate = ShazamDelegate()
    delegate.onFound = { [weak self] match in
      guard let self = self, let item = match.mediaItems.first else { return }
      DispatchQueue.main.async {
        let promise = self.pendingPromise
        self.pendingPromise = nil
        self.cleanUpAudio()
        promise?.resolve([
          "title": item.title ?? "",
          "artist": item.artist ?? "",
          "artworkUrl": item.artworkURL?.absoluteString ?? "",
          "appleMusicId": item.appleMusicID ?? "",
        ] as [String: Any])
      }
    }
    delegate.onError = { _ in
      // Keep accumulating audio on no-match errors — only fail on timeout
    }
    shazamDelegate = delegate

    let session = SHSession()
    session.delegate = delegate
    shazamSession = session

    // Configure audio session BEFORE accessing inputNode — accessing inputNode
    // before the session is active returns an invalid format and crashes.
    do {
      let audioSession = AVAudioSession.sharedInstance()
      if savedSessionConfig == nil {
        savedSessionConfig = (audioSession.category, audioSession.mode, audioSession.categoryOptions)
      }
      try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
      try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
    } catch {
      let promise = pendingPromise
      pendingPromise = nil
      restoreAudioSession()
      promise?.reject("AUDIO_ERROR", error.localizedDescription)
      return
    }

    // installTap raises an Objective-C exception (which Swift can't catch, so
    // the app crashes) when the input format is invalid: no input route, or a
    // 0 Hz / 0 channel format mid route change (AirPods connecting, a call).
    // Check first and fail the listen instead.
    let audioSession = AVAudioSession.sharedInstance()
    guard audioSession.isInputAvailable else {
      failUnavailableMic("no audio input available")
      return
    }

    let engine = AVAudioEngine()
    let inputNode = engine.inputNode
    let hardwareFormat = inputNode.inputFormat(forBus: 0)
    let format = inputNode.outputFormat(forBus: 0)
    guard ShazamKitModule.isUsable(hardwareFormat),
          ShazamKitModule.isUsable(format),
          hardwareFormat.sampleRate == format.sampleRate else {
      failUnavailableMic("input format hw=\(hardwareFormat) tap=\(format)")
      return
    }

    let queue = genQueue
    inputNode.installTap(onBus: 0, bufferSize: 8192, format: format) { buffer, _ in
      queue.async {
        do {
          try generator.append(buffer, at: nil)
        } catch {
          NSLog("[ShazamKit] append error: \(error.localizedDescription)")
        }
      }
    }

    do {
      try engine.start()
    } catch {
      let promise = pendingPromise
      pendingPromise = nil
      cleanUpAudio()
      promise?.reject("AUDIO_ERROR", error.localizedDescription)
      return
    }

    audioEngine = engine

    // Attempt a match every 3 seconds after accumulating audio
    matchTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: true) { [weak self] _ in
      guard let self = self else { return }
      self.genQueue.async {
        do {
          let sig = try generator.signature()
          DispatchQueue.main.async { [weak self] in
            // Only into the listen this signature came from; a late one from
            // a finished listen is dropped.
            guard let self = self, self.shazamSession === session else { return }
            session.match(sig)
          }
        } catch {
          // Not enough audio yet — keep accumulating
        }
      }
    }

    // Give up after 15 seconds
    timeoutTimer = Timer.scheduledTimer(withTimeInterval: 15.0, repeats: false) { [weak self] _ in
      guard let self = self else { return }
      let promise = self.pendingPromise
      self.pendingPromise = nil
      self.cleanUpAudio()
      promise?.reject("TIMEOUT", "Couldn't identify the song. Try again in a quieter spot.")
    }
  }

  private static func isUsable(_ format: AVAudioFormat) -> Bool {
    format.sampleRate > 0 && format.channelCount > 0
  }

  /// The microphone can't be listened to right now. Rejects with the same
  /// code as other audio failures, which the app already shows as an error.
  private func failUnavailableMic(_ detail: String) {
    NSLog("[ShazamKit] microphone unavailable: \(detail)")
    let promise = pendingPromise
    pendingPromise = nil
    cleanUpAudio()
    promise?.reject("AUDIO_ERROR", "The microphone isn't available right now. If you're on a call or just switched headphones, try again in a moment.")
  }

  /// Tears down the audio engine and timers without touching the promise.
  private func cleanUpAudio() {
    matchTimer?.invalidate()
    matchTimer = nil
    timeoutTimer?.invalidate()
    timeoutTimer = nil
    audioEngine?.inputNode.removeTap(onBus: 0)
    audioEngine?.stop()
    audioEngine = nil
    shazamSession?.delegate = nil
    shazamSession = nil
    shazamDelegate = nil
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    restoreAudioSession()
  }

  private func restoreAudioSession() {
    guard let saved = savedSessionConfig else { return }
    savedSessionConfig = nil
    do {
      try AVAudioSession.sharedInstance().setCategory(saved.category, mode: saved.mode, options: saved.options)
    } catch {
      NSLog("[ShazamKit] couldn't restore audio session: \(error.localizedDescription)")
    }
  }
}
