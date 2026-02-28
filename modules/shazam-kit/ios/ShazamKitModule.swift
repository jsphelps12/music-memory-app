import ExpoModulesCore
import ShazamKit
import AVFoundation

public class ShazamKitModule: Module {
  private var audioEngine: AVAudioEngine?
  private var shazamSession: SHSession?
  private var signatureGenerator = SHSignatureGenerator()
  private var pendingPromise: Promise?
  private var matchTimer: Timer?
  private var timeoutTimer: Timer?
  // Serial queue protects signatureGenerator from concurrent audio tap + timer access
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
    signatureGenerator = SHSignatureGenerator()

    let session = SHSession()
    session.delegate = self
    shazamSession = session

    let engine = AVAudioEngine()
    let inputNode = engine.inputNode
    let format = inputNode.outputFormat(forBus: 0)

    inputNode.installTap(onBus: 0, bufferSize: 8192, format: format) { [weak self] buffer, _ in
      guard let self = self else { return }
      self.genQueue.async {
        try? self.signatureGenerator.append(buffer, at: nil)
      }
    }

    do {
      let audioSession = AVAudioSession.sharedInstance()
      try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
      try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
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
        guard let sig = try? self.signatureGenerator.signature() else { return }
        DispatchQueue.main.async { self.shazamSession?.match(sig) }
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
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }
}

// MARK: - SHSessionDelegate

extension ShazamKitModule: SHSessionDelegate {
  public func session(_ session: SHSession, didFind match: SHMatch) {
    guard let item = match.mediaItems.first else { return }

    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
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

  public func session(_ session: SHSession, didNotFindMatchFor signature: SHSignature, error: Error?) {
    // Keep accumulating audio — only stop on a match or timeout
  }
}
