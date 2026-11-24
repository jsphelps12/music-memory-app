import AVFoundation
import CoreMedia
import Foundation
import Speech

// On-device transcription of a voice entry (1.5). The recording is the
// person's own words; this turns it into text without it leaving the phone.
// Recognition is on-device only: when the phone can't do it locally for a
// language we stop with `.unsupported`, never fall back to Apple's servers.
// Downloading Apple's speech model for a language (iOS 26) fetches a model;
// the audio itself never goes anywhere.
//
// Kept free of ExpoModulesCore so it can be type-checked on its own;
// OnDeviceAIModule maps `TranscriptionFailure` to stable JS error codes.

enum TranscriptionFailure: Error {
  /// Speech recognition permission is denied or restricted.
  case denied
  /// No on-device recognizer for this language on this phone.
  case unsupported
  /// The recording had nothing to transcribe.
  case noSpeech
  /// Anything else (unreadable file, recognizer error).
  case failed(String)

  var code: String {
    switch self {
    case .denied: return "denied"
    case .unsupported: return "unsupported"
    case .noSpeech: return "no_speech"
    case .failed: return "failed"
    }
  }

  var message: String {
    switch self {
    case .denied: return "Speech recognition isn't allowed"
    case .unsupported: return "On-device speech recognition isn't available for this language"
    case .noSpeech: return "No speech in the recording"
    case .failed(let reason): return reason
    }
  }
}

struct TranscriptSegment {
  let text: String
  let startMs: Int
  let durationMs: Int
}

struct Transcript {
  let text: String
  let segments: [TranscriptSegment]
  let locale: String

  var dictionary: [String: Any] {
    [
      "text": text,
      "locale": locale,
      "segments": segments.map { ["text": $0.text, "startMs": $0.startMs, "durationMs": $0.durationMs] },
    ]
  }
}

enum SpeechTranscription {
  // MARK: Permission

  static func statusName(_ status: SFSpeechRecognizerAuthorizationStatus) -> String {
    switch status {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .notDetermined: return "undetermined"
    @unknown default: return "denied"
    }
  }

  static func authorizationStatus() -> String {
    statusName(SFSpeechRecognizer.authorizationStatus())
  }

  static func requestAuthorization() async -> SFSpeechRecognizerAuthorizationStatus {
    await withCheckedContinuation { continuation in
      SFSpeechRecognizer.requestAuthorization { status in
        continuation.resume(returning: status)
      }
    }
  }

  // MARK: Transcribe

  /// Transcribe an audio file (a voice entry, at most 3 minutes) on the phone.
  static func transcribe(uri: String, localeId: String?) async throws -> Transcript {
    var status = SFSpeechRecognizer.authorizationStatus()
    if status == .notDetermined {
      status = await requestAuthorization()
    }
    guard status == .authorized else { throw TranscriptionFailure.denied }

    let url = fileURL(uri)
    guard FileManager.default.fileExists(atPath: url.path) else {
      throw TranscriptionFailure.failed("Recording not found")
    }
    let locale = localeId.map { Locale(identifier: $0) } ?? Locale.current

    #if compiler(>=6.2)
    // Built with the iOS 26 SDK: Apple's newer SpeechAnalyzer, which is
    // always on-device, when this phone supports it for the language.
    if #available(iOS 26.0, *) {
      if let transcript = try await transcribeWithAnalyzer(url: url, locale: locale) {
        return transcript
      }
    }
    #endif

    return try await transcribeWithRecognizer(url: url, locale: locale)
  }

  static func fileURL(_ uri: String) -> URL {
    if let url = URL(string: uri), url.scheme != nil {
      return url
    }
    return URL(fileURLWithPath: uri)
  }

  // MARK: SFSpeechRecognizer (iOS 16+), on-device only

  static func transcribeWithRecognizer(url: URL, locale: Locale) async throws -> Transcript {
    guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.supportsOnDeviceRecognition else {
      throw TranscriptionFailure.unsupported
    }
    // Results arrive on this queue, not the main one.
    recognizer.queue = OperationQueue()

    let request = SFSpeechURLRecognitionRequest(url: url)
    request.requiresOnDeviceRecognition = true
    request.shouldReportPartialResults = false
    request.addsPunctuation = true
    request.taskHint = .dictation

    // Holds the recognizer and its task until the result is in.
    let running = RunningRecognition(recognizer: recognizer)
    let result: SFSpeechRecognitionResult = try await withCheckedThrowingContinuation { continuation in
      let once = ResumeOnce()
      running.task = recognizer.recognitionTask(with: request) { result, error in
        if let result = result, result.isFinal {
          once.run { continuation.resume(returning: result) }
        } else if let error = error {
          once.run { continuation.resume(throwing: mapRecognizerError(error)) }
        }
      }
    }
    running.task = nil

    let best = result.bestTranscription
    let text = collapse(best.formattedString)
    guard !text.isEmpty else { throw TranscriptionFailure.noSpeech }
    let segments = best.segments.map {
      TranscriptSegment(
        text: $0.substring,
        startMs: Int(($0.timestamp * 1000).rounded()),
        durationMs: Int(($0.duration * 1000).rounded())
      )
    }
    return Transcript(text: text, segments: segments, locale: recognizer.locale.identifier)
  }

  /// "No speech detected" from the recognizer is its own code; the rest fail.
  static func mapRecognizerError(_ error: Error) -> TranscriptionFailure {
    let nsError = error as NSError
    if nsError.domain == "kAFAssistantErrorDomain" && (nsError.code == 1110 || nsError.code == 203) {
      return .noSpeech
    }
    return .failed(nsError.localizedDescription)
  }

  static func collapse(_ text: String) -> String {
    text.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
  }

  // MARK: SpeechAnalyzer (iOS 26+), always on-device

  #if compiler(>=6.2)
  /// Nil when SpeechAnalyzer can't take this one (phone or language not
  /// supported, model not ready) and the older recognizer should try.
  @available(iOS 26.0, *)
  static func transcribeWithAnalyzer(url: URL, locale: Locale) async throws -> Transcript? {
    guard SpeechTranscriber.isAvailable,
          let supported = await SpeechTranscriber.supportedLocale(equivalentTo: locale) else {
      return nil
    }
    let transcriber = SpeechTranscriber(
      locale: supported,
      transcriptionOptions: [],
      reportingOptions: [],
      attributeOptions: []
    )

    let installed = await SpeechTranscriber.installedLocales
      .contains { $0.identifier(.bcp47) == supported.identifier(.bcp47) }
    if !installed {
      let legacyReady = SFSpeechRecognizer(locale: locale)?.supportsOnDeviceRecognition ?? false
      if legacyReady {
        // Don't make this recording wait on a download: the older on-device
        // recognizer takes it, and the model is fetched for next time.
        Task.detached(priority: .background) {
          if let request = try? await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
            try? await request.downloadAndInstall()
          }
        }
        return nil
      }
      do {
        if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
          try await request.downloadAndInstall()
        }
      } catch {
        return nil
      }
    }

    let file: AVAudioFile
    do {
      file = try AVAudioFile(forReading: url)
    } catch {
      throw TranscriptionFailure.failed("Couldn't read the recording")
    }

    let analyzer = SpeechAnalyzer(modules: [transcriber])
    let collector = Task { () throws -> [TranscriptSegment] in
      var parts: [TranscriptSegment] = []
      for try await result in transcriber.results where result.isFinal {
        let text = collapse(String(result.text.characters))
        guard !text.isEmpty else { continue }
        parts.append(TranscriptSegment(
          text: text,
          startMs: milliseconds(result.range.start),
          durationMs: milliseconds(result.range.duration)
        ))
      }
      return parts
    }

    do {
      if let last = try await analyzer.analyzeSequence(from: file) {
        try await analyzer.finalizeAndFinish(through: last)
      } else {
        await analyzer.cancelAndFinishNow()
      }
    } catch {
      await analyzer.cancelAndFinishNow()
      collector.cancel()
      throw TranscriptionFailure.failed(error.localizedDescription)
    }

    let segments: [TranscriptSegment]
    do {
      segments = try await collector.value
    } catch {
      throw TranscriptionFailure.failed(error.localizedDescription)
    }
    let text = collapse(segments.map(\.text).joined(separator: " "))
    guard !text.isEmpty else { throw TranscriptionFailure.noSpeech }
    return Transcript(text: text, segments: segments, locale: supported.identifier)
  }

  static func milliseconds(_ time: CMTime) -> Int {
    let seconds = CMTimeGetSeconds(time)
    guard seconds.isFinite else { return 0 }
    return Int((seconds * 1000).rounded())
  }
  #endif
}

final class RunningRecognition: @unchecked Sendable {
  let recognizer: SFSpeechRecognizer
  var task: SFSpeechRecognitionTask?

  init(recognizer: SFSpeechRecognizer) {
    self.recognizer = recognizer
  }
}

/// Resumes a continuation once, however many times a callback fires.
final class ResumeOnce: @unchecked Sendable {
  private let lock = NSLock()
  private var done = false

  func run(_ body: () -> Void) {
    lock.lock()
    let first = !done
    done = true
    lock.unlock()
    if first { body() }
  }
}
