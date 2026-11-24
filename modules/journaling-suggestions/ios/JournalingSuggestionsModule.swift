import ExpoModulesCore
import SwiftUI
import UIKit
// The framework is only in the device SDK (the simulator SDK has none), and
// only from iOS 17.2: everything that touches it is behind this check and an
// availability check, and the menu row is hidden wherever `isAvailable` is
// false.
#if canImport(JournalingSuggestions) && !targetEnvironment(simulator)
import JournalingSuggestions
#endif

// "Your day (Apple)" (1.5): Apple's Journaling Suggestions picker, the one
// Apple's Journal app uses, as a way into capture. The app only ever sees the
// one suggestion the person picks, and only after they pick it. Nothing here
// touches the network: songs, places and names come back as plain JSON,
// photos as copies in the app's caches (JS opens capture with them; nothing
// is saved until the person presses Save).
public class JournalingSuggestionsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("JournalingSuggestions")

    // Whether the picker can run here: an iPhone on iOS 17.2+, a device build.
    Function("isAvailable") { () -> Bool in
      JournalingSuggestionsModule.pickerAvailable
    }

    // Presents the picker over whatever is on screen. Resolves with the
    // picked suggestion's contents, or null when the person closes it.
    AsyncFunction("pick") { (promise: Promise) in
      #if canImport(JournalingSuggestions) && !targetEnvironment(simulator)
      if #available(iOS 17.2, *), JournalingSuggestionsModule.pickerAvailable {
        guard let presenter = self.appContext?.utilities?.currentViewController() else {
          promise.reject("no_presenter", "There's no screen to show the picker from")
          return
        }
        SuggestionPickerSession.start(from: presenter, promise: promise)
        return
      }
      #endif
      promise.reject("unavailable", "Journaling Suggestions needs an iPhone on iOS 17.2 or later")
    }.runOnQueue(.main)

    // Removes every photo copy a pick left behind (sign-out; each pick also
    // clears the previous one's).
    AsyncFunction("clearFiles") { () -> Void in
      SuggestionFiles.clearAll()
    }
  }

  static var pickerAvailable: Bool {
    #if canImport(JournalingSuggestions) && !targetEnvironment(simulator)
    if #available(iOS 17.2, *) {
      return UIDevice.current.userInterfaceIdiom == .phone
    }
    #endif
    return false
  }
}

/// Where a pick's photo copies live: Caches/journaling-suggestions/<pick>/.
enum SuggestionFiles {
  static var root: URL {
    FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("journaling-suggestions", isDirectory: true)
  }

  static func clearAll() {
    try? FileManager.default.removeItem(at: root)
  }

  /// A fresh folder for one pick, after clearing the last pick's. By the time
  /// a new pick starts, the capture that used the old copies has closed, and
  /// a draft or the offline outbox keeps copies of its own.
  static func newPickFolder() -> URL? {
    clearAll()
    let folder = root.appendingPathComponent(UUID().uuidString, isDirectory: true)
    do {
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
      return folder
    } catch {
      return nil
    }
  }

  /// Copies a photo the picker handed over into `folder`; nil if it can't.
  static func copy(_ source: URL, into folder: URL, index: Int) -> URL? {
    let ext = source.pathExtension.isEmpty ? "jpg" : source.pathExtension.lowercased()
    let dest = folder.appendingPathComponent("\(index).\(ext)")
    let scoped = source.startAccessingSecurityScopedResource()
    defer { if scoped { source.stopAccessingSecurityScopedResource() } }
    do {
      try FileManager.default.copyItem(at: source, to: dest)
      return dest
    } catch {
      return nil
    }
  }
}

#if canImport(JournalingSuggestions) && !targetEnvironment(simulator)

/// One picker on screen at a time: a clear full-screen host whose SwiftUI
/// view raises Apple's picker with `journalingSuggestionsPicker(isPresented:)`
/// (no tap on an Apple button needed), then goes away once the person picks
/// or closes it.
@available(iOS 17.2, *)
@MainActor
final class SuggestionPickerSession {
  private static var current: SuggestionPickerSession?

  private let promise: Promise
  private let state = SuggestionPickerState()
  private var host: UIViewController?
  private var picked = false
  private var finished = false

  private init(promise: Promise) {
    self.promise = promise
  }

  static func start(from presenter: UIViewController, promise: Promise) {
    guard current == nil else {
      promise.reject("busy", "The picker is already open")
      return
    }
    let session = SuggestionPickerSession(promise: promise)
    current = session
    session.present(from: presenter)
  }

  private func present(from presenter: UIViewController) {
    let root = SuggestionPickerHost(
      state: state,
      onPick: { [weak self] suggestion in
        await self?.didPick(suggestion)
      },
      onDismiss: { [weak self] in
        self?.pickerDismissed()
      },
      onTapBackground: { [weak self] in
        // Only reachable when Apple's picker isn't covering the screen (it
        // failed to appear): a way out instead of a stuck clear layer.
        guard let self, !self.picked else { return }
        self.finish(nil)
      }
    )
    let host = UIHostingController(rootView: root)
    host.view.backgroundColor = .clear
    host.modalPresentationStyle = .overFullScreen
    self.host = host
    presenter.present(host, animated: false)
  }

  private func didPick(_ suggestion: JournalingSuggestion) async {
    guard !finished else { return }
    picked = true
    state.loading = true
    let result = await SuggestionReader.read(suggestion)
    finish(result)
  }

  private func pickerDismissed() {
    guard !picked else { return }
    // Closing the picker and picking both end with it dismissed, and the
    // order of the binding change and the completion isn't documented: give a
    // pick a moment to arrive before calling it a cancel.
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.75) { [weak self] in
      guard let self, !self.picked else { return }
      self.finish(nil)
    }
  }

  private func finish(_ result: [String: Any]?) {
    guard !finished else { return }
    finished = true
    let promise = self.promise
    let done = {
      promise.resolve(result)
      SuggestionPickerSession.current = nil
    }
    if let host, host.presentingViewController != nil {
      host.dismiss(animated: false, completion: done)
    } else {
      done()
    }
  }
}

@available(iOS 17.2, *)
final class SuggestionPickerState: ObservableObject {
  @Published var loading = false
}

@available(iOS 17.2, *)
struct SuggestionPickerHost: View {
  @ObservedObject var state: SuggestionPickerState
  let onPick: (JournalingSuggestion) async -> Void
  let onDismiss: () -> Void
  let onTapBackground: () -> Void
  @State private var isPresented = false

  var body: some View {
    ZStack {
      Color.clear
        .contentShape(Rectangle())
        .onTapGesture { onTapBackground() }
      if state.loading {
        ProgressView()
      }
    }
    .ignoresSafeArea()
    .journalingSuggestionsPicker(isPresented: $isPresented, onCompletion: onPick)
    .onAppear { isPresented = true }
    .onChange(of: isPresented) { _, presented in
      if !presented { onDismiss() }
    }
  }
}

/// A picked suggestion as plain JSON, in the order Apple shows its items.
/// Keys are left out when Apple has nothing for them; JS
/// (lib/yourDay.ts) decides what fills capture.
@available(iOS 17.2, *)
enum SuggestionReader {
  static let maxSongs = 10
  static let maxPhotos = 10
  static let maxPlaces = 10
  static let maxPeople = 20

  static func read(_ suggestion: JournalingSuggestion) async -> [String: Any] {
    var songs: [[String: Any]] = []
    var photos: [[String: Any]] = []
    var places: [[String: Any]] = []
    var people: [String] = []
    var skipped = 0
    let folder = SuggestionFiles.newPickFolder()

    for item in suggestion.items {
      var used = false

      if songs.count < maxSongs, item.hasContent(ofType: JournalingSuggestion.Song.self),
         let song = try? await item.content(forType: JournalingSuggestion.Song.self) {
        if let title = clean(song.song) {
          songs.append(dict([
            "title": title,
            "artist": clean(song.artist),
            "album": clean(song.album),
            "date": song.date.map(iso),
            "kind": "song",
          ]))
        }
        used = true
      }

      // iOS 18+: music from other apps (Spotify and the like) comes as
      // generic media. Kept apart so a real Apple Music song wins.
      if #available(iOS 18.0, *), !used, songs.count < maxSongs,
         item.hasContent(ofType: JournalingSuggestion.GenericMedia.self),
         let media = try? await item.content(forType: JournalingSuggestion.GenericMedia.self) {
        if let title = clean(media.title) {
          songs.append(dict([
            "title": title,
            "artist": clean(media.artist),
            "album": clean(media.album),
            "date": media.date.map(iso),
            "kind": "media",
          ]))
        }
        used = true
      }

      if !used, item.hasContent(ofType: JournalingSuggestion.Photo.self) {
        used = true
        if photos.count < maxPhotos, let folder,
           let photo = try? await item.content(forType: JournalingSuggestion.Photo.self),
           let copy = SuggestionFiles.copy(photo.photo, into: folder, index: photos.count) {
          photos.append(dict(["uri": copy.absoluteString, "date": photo.date.map(iso)]))
        }
      }

      // A Live Photo's still frame, like any other photo.
      if !used, item.hasContent(ofType: JournalingSuggestion.LivePhoto.self) {
        used = true
        if photos.count < maxPhotos, let folder,
           let live = try? await item.content(forType: JournalingSuggestion.LivePhoto.self),
           let copy = SuggestionFiles.copy(live.image, into: folder, index: photos.count) {
          photos.append(dict(["uri": copy.absoluteString, "date": live.date.map(iso)]))
        }
      }

      if !used, item.hasContent(ofType: JournalingSuggestion.Location.self) {
        used = true
        if places.count < maxPlaces, let location = try? await item.content(forType: JournalingSuggestion.Location.self) {
          places.append(place(location))
        }
      }

      if !used, item.hasContent(ofType: JournalingSuggestion.LocationGroup.self) {
        used = true
        if let group = try? await item.content(forType: JournalingSuggestion.LocationGroup.self) {
          for location in group.locations where places.count < maxPlaces {
            places.append(place(location))
          }
        }
      }

      if !used, item.hasContent(ofType: JournalingSuggestion.Contact.self) {
        used = true
        if people.count < maxPeople, let contact = try? await item.content(forType: JournalingSuggestion.Contact.self),
           let name = clean(contact.name) {
          people.append(name)
        }
      }

      // Workouts, videos, podcasts, steps, state of mind, reflections, event
      // posters: nothing in a moment holds them (yet). Counted, not read.
      if !used { skipped += 1 }
    }

    return dict([
      "title": clean(suggestion.title),
      "date": suggestion.date.map { iso($0.start) },
      "songs": songs,
      "photos": photos,
      "places": places,
      "people": people,
      "skipped": skipped,
    ])
  }

  private static func place(_ location: JournalingSuggestion.Location) -> [String: Any] {
    let coordinate = location.location?.coordinate
    return dict([
      "place": clean(location.place),
      "city": clean(location.city),
      "lat": coordinate?.latitude,
      "lng": coordinate?.longitude,
      "date": location.date.map(iso),
    ])
  }

  private static func clean(_ text: String?) -> String? {
    guard let trimmed = text?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else { return nil }
    return trimmed
  }

  private static func iso(_ date: Date) -> String {
    ISO8601DateFormatter().string(from: date)
  }

  /// Drops nil values so JS sees missing keys, not NSNull.
  private static func dict(_ values: [String: Any?]) -> [String: Any] {
    values.compactMapValues { $0 }
  }
}

#endif
