import ExpoModulesCore
import MediaPlayer
import MusicKit
import Photos
import UIKit

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

    // From before (1.4): for each [from, to) in epoch ms, the photos taken
    // (screenshots left out), how many are favourited, and up to `maxCoords`
    // locations sampled evenly through the range. One PhotoKit fetch per
    // range, metadata only (no image data is loaded). Needs photo access.
    AsyncFunction("photoStats") { (ranges: [[Double]], maxCoords: Int) -> [[String: Any]] in
      let empty: [String: Any] = ["count": 0, "favorites": 0, "coords": [[Double]]()]
      let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
      guard status == .authorized || status == .limited else { return ranges.map { _ in empty } }
      return ranges.map { range in
        guard range.count == 2 else { return empty }
        let options = PHFetchOptions()
        options.predicate = NSPredicate(
          format: "mediaType == %d AND creationDate >= %@ AND creationDate < %@",
          PHAssetMediaType.image.rawValue,
          Date(timeIntervalSince1970: range[0] / 1000) as NSDate,
          Date(timeIntervalSince1970: range[1] / 1000) as NSDate
        )
        let assets = PHAsset.fetchAssets(with: options)
        let step = max(1, assets.count / max(1, maxCoords))
        var count = 0
        var favorites = 0
        var coords: [[Double]] = []
        assets.enumerateObjects { asset, index, _ in
          if asset.mediaSubtypes.contains(.photoScreenshot) { return }
          count += 1
          if asset.isFavorite { favorites += 1 }
          if index % step == 0, coords.count < maxCoords, let location = asset.location {
            coords.append([location.coordinate.latitude, location.coordinate.longitude])
          }
        }
        return ["count": count, "favorites": favorites, "coords": coords]
      }
    }

    // Linked photos and video (1.4): a moment keeps a reference to the
    // owner's Photos library instead of an upload. Local identifiers differ
    // per device; the iCloud identifier is the same on every device signed
    // into the same iCloud Photos, so that's what's stored.
    // localId → cloudId (only the ones that map).
    AsyncFunction("cloudIdsFor") { (localIds: [String]) -> [String: String] in
      let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
      guard status == .authorized || status == .limited, !localIds.isEmpty else { return [:] }
      var out: [String: String] = [:]
      let mappings = PHPhotoLibrary.shared().cloudIdentifierMappings(forLocalIdentifiers: localIds)
      for (localId, result) in mappings {
        if case .success(let cloudId) = result { out[localId] = cloudId.stringValue }
      }
      return out
    }

    // Linked video (1.4): a still frame of a library video, written as a JPEG
    // to upload as the moment's thumbnail (the "poster"), plus its length.
    // May download from iCloud. Nil for anything that isn't a video here.
    AsyncFunction("videoPoster") { (localId: String, maxSide: Int) async -> [String: Any]? in
      let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
      guard status == .authorized || status == .limited,
            let asset = PHAsset.fetchAssets(withLocalIdentifiers: [localId], options: nil).firstObject,
            asset.mediaType == .video else { return nil }
      let image: UIImage? = await withCheckedContinuation { continuation in
        let options = PHImageRequestOptions()
        options.isNetworkAccessAllowed = true
        options.deliveryMode = .highQualityFormat
        options.isSynchronous = false
        let side = CGFloat(max(200, maxSide))
        PHImageManager.default().requestImage(
          for: asset,
          targetSize: CGSize(width: side, height: side),
          contentMode: .aspectFit,
          options: options
        ) { image, _ in continuation.resume(returning: image) }
      }
      guard let data = image?.jpegData(compressionQuality: 0.85) else { return nil }
      let url = FileManager.default.temporaryDirectory.appendingPathComponent("poster_\(UUID().uuidString).jpg")
      do {
        try data.write(to: url)
      } catch {
        return nil
      }
      return ["uri": url.absoluteString, "durationMs": Int(asset.duration * 1000)]
    }

    // cloudId → this device's localId (only the ones found here).
    AsyncFunction("localIdsFor") { (cloudIds: [String]) -> [String: String] in
      let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
      guard status == .authorized || status == .limited, !cloudIds.isEmpty else { return [:] }
      var out: [String: String] = [:]
      let identifiers = cloudIds.map { PHCloudIdentifier(stringValue: $0) }
      let mappings = PHPhotoLibrary.shared().localIdentifierMappings(for: identifiers)
      for (cloudId, result) in mappings {
        if case .success(let localId) = result { out[cloudId.stringValue] = localId }
      }
      return out
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
