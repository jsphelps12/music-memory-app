import AppIntents
import Foundation
import MediaPlayer
import Security

// "Remember this song" (1.5, docs/PLAN-1.5.md section 3): Siri, Shortcuts and
// the Action button save what Apple Music is playing as a moment, without
// opening the app. Copied into the main app target at prebuild by
// plugins/withRememberThisSong.js: App Shortcuts only register from the app
// bundle itself, not from a pod or the widget extension.
//
// The intent runs in the app's process but never touches the JavaScript app
// or its Supabase session. It reads the capture key the app left in the
// keychain (lib/captureKey.ts) and posts the song to the quick-capture edge
// function, which saves the moment for the key's owner. Siri says what it
// saved; nothing else follows (no notification, by decision). It never sends
// the playing position: the part of the song is only ever picked by hand
// (the position isn't accurate enough). The key is never logged.

// ForegroundContinuableIntent (iOS 16.4, the app's floor) lets a failure
// offer to open the app instead of just failing. Deprecated in iOS 26 in
// favour of supportedModes, still supported there.
@available(iOS 16.4, *)
struct RememberThisSongIntent: ForegroundContinuableIntent {
  static let title: LocalizedStringResource = "Remember this song"
  // App Store Connect rejects an intent description containing "Apple"
  // (ITMS-90626, build 18), so it says "the Music app" and Siri's lines
  // avoid the word too.
  static let description: IntentDescription? = IntentDescription(
    "Saves the song playing in the Music app to your Soundtracks journal without opening the app. Add your words whenever you like."
  )
  static let openAppWhenRun = false
  // Works with the phone locked, screen off: it only adds a moment, and the
  // reply names a song that is audibly playing.
  static let authenticationPolicy: IntentAuthenticationPolicy = .alwaysAllowed

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let song: PlayingSong
    switch await PlayingSong.read() {
    case .playing(let playing):
      song = playing
    case .nothing:
      return .result(dialog: "Nothing's playing")
    case .noLibraryAccess:
      throw openApp("Soundtracks needs access to your music library for this. Open Soundtracks?")
    }

    guard let setup = CaptureKeyStore.read() else {
      throw openApp("Open Soundtracks once to set this up.")
    }

    switch await QuickCaptureClient.save(song, setup: setup) {
    case .saved(let title, let artist):
      return .result(dialog: "Saved \(title) by \(artist)")
    case .keyRefused:
      // Revoked or unknown: drop it so the app issues a new one when it opens.
      CaptureKeyStore.delete()
      throw openApp("Open Soundtracks to set this up again.")
    case .tooMany:
      return .result(dialog: "That's a lot of songs at once. Try again in a little while.")
    case .failed:
      throw openApp("Couldn't save it just now. Open Soundtracks?")
    }
  }

  /// Siri says `dialog` and offers to open Soundtracks; opening it lets the
  /// app issue a key (or capture there).
  private func openApp(_ dialog: IntentDialog) -> Error {
    needsToContinueInForegroundError(dialog, continuation: nil)
  }
}

@available(iOS 16.4, *)
struct SoundtracksShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: RememberThisSongIntent(),
      phrases: [
        "Remember this song in \(.applicationName)",
        "Save this song to \(.applicationName)",
        "Remember this song with \(.applicationName)",
      ],
      shortTitle: "Remember this song",
      systemImageName: "music.note"
    )
  }
}

/// What the system Music player has, read on the main thread.
struct PlayingSong {
  let storeId: String?
  let title: String
  let artist: String
  let album: String?

  enum Reading {
    case playing(PlayingSong)
    case nothing
    case noLibraryAccess
  }

  /// MPMusicPlayerController is main-thread only. The system player sees
  /// Apple Music (and the Music app), not Spotify.
  @MainActor
  static func read() -> Reading {
    let player = MPMusicPlayerController.systemMusicPlayer
    guard let item = player.nowPlayingItem else {
      return MPMediaLibrary.authorizationStatus() == .authorized ? .nothing : .noLibraryAccess
    }
    // Stopped keeps the last song around long after it ended; paused counts.
    guard player.playbackState != .stopped else { return .nothing }
    let title = (item.title ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    let artist = (item.artist ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    guard !title.isEmpty, !artist.isEmpty else { return .nothing }

    // "0" or empty for songs that aren't in the Apple Music catalog.
    let storeId = item.playbackStoreID
    let album = (item.albumTitle ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    return .playing(PlayingSong(
      storeId: storeId.isEmpty || storeId == "0" ? nil : storeId,
      title: String(title.prefix(300)),
      artist: String(artist.prefix(300)),
      album: album.isEmpty ? nil : String(album.prefix(300))
    ))
  }
}

/// The capture key lib/captureKey.ts writes through expo-secure-store:
/// service "<keychainService>:no-auth", the item name as account and generic
/// attribute, default access group, readable after first unlock. The names
/// are checked against lib/captureKeyPayload.ts by its test.
enum CaptureKeyStore {
  struct Setup: Decodable {
    let key: String
    let url: String
    let anonKey: String
  }

  private static let service = "soundtracks.capture:no-auth"
  private static let item = "capture_key_v1"

  private static func query() -> [String: Any] {
    let account = Data(item.utf8)
    return [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrGeneric as String: account,
      kSecAttrAccount as String: account,
    ]
  }

  static func read() -> Setup? {
    var q = query()
    q[kSecMatchLimit as String] = kSecMatchLimitOne
    q[kSecReturnData as String] = kCFBooleanTrue
    var result: AnyObject?
    guard SecItemCopyMatching(q as CFDictionary, &result) == errSecSuccess,
          let data = result as? Data,
          let setup = try? JSONDecoder().decode(Setup.self, from: data),
          setup.key.hasPrefix("stc_"), setup.key.count == 47,
          setup.url.hasPrefix("https://") else {
      return nil
    }
    return setup
  }

  static func delete() {
    SecItemDelete(query() as CFDictionary)
  }
}

/// Posts the song to quick-capture (supabase/functions/quick-capture).
enum QuickCaptureClient {
  enum Outcome {
    case saved(title: String, artist: String)
    case keyRefused
    case tooMany
    case failed
  }

  private struct Saved: Decodable {
    let title: String
    let artist: String
  }

  static func save(_ song: PlayingSong, setup: CaptureKeyStore.Setup) async -> Outcome {
    guard let url = URL(string: "\(setup.url)/functions/v1/quick-capture") else { return .failed }
    let now = Date()
    var body: [String: Any] = [
      "title": song.title,
      "artist": song.artist,
      "capturedAt": ISO8601DateFormatter().string(from: now),
      "utcOffsetMinutes": TimeZone.current.secondsFromGMT(for: now) / 60,
    ]
    if let storeId = song.storeId { body["appleMusicId"] = storeId }
    if let album = song.album { body["album"] = album }

    var request = URLRequest(url: url, timeoutInterval: 10)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Capture \(setup.key)", forHTTPHeaderField: "Authorization")
    request.setValue(setup.anonKey, forHTTPHeaderField: "apikey")
    guard let payload = try? JSONSerialization.data(withJSONObject: body) else { return .failed }
    request.httpBody = payload

    do {
      let (data, response) = try await URLSession.shared.data(for: request)
      switch (response as? HTTPURLResponse)?.statusCode ?? 0 {
      case 200:
        let saved = try? JSONDecoder().decode(Saved.self, from: data)
        return .saved(title: saved?.title ?? song.title, artist: saved?.artist ?? song.artist)
      case 401:
        return .keyRefused
      case 429:
        return .tooMany
      default:
        return .failed
      }
    } catch {
      return .failed
    }
  }
}
