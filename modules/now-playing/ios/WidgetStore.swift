import Foundation
import ImageIO
import UIKit

/// Memory widget (1.5): the app's side of the files the widget reads.
///
/// Layout in the App Group container (targets/widget/MemoryWidget.swift reads
/// the same paths; keep the two in step):
///   widget/moments.json   the week of picks (lib/widgetData.ts writes it)
///   widget/images/*.jpg   one small artwork per pick, named in the JSON
enum WidgetStore {
  /// Same group as app.config.ts gives each variant. The beta app's bundle id
  /// carries ".preview", the same test targets/widget/_shared/Links.swift uses
  /// to pick the URL scheme.
  static var groupId: String {
    (Bundle.main.bundleIdentifier ?? "").contains(".preview")
      ? "group.com.joshuaphelps.musicmemory.preview"
      : "group.com.joshuaphelps.musicmemory"
  }

  /// Artwork is drawn at widget size; anything bigger only costs the
  /// extension memory, which iOS caps tightly.
  static let maxImagePixels = 300

  struct StoreError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
  }

  private static func containerURL() -> URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupId)
  }

  private static func folder() throws -> URL {
    guard let root = containerURL() else {
      throw StoreError(message: "App Group container unavailable (\(groupId))")
    }
    return root.appendingPathComponent("widget", isDirectory: true)
  }

  /// Copies the images in, swaps the JSON in atomically, then removes images
  /// the new file no longer names. A widget reading mid-write sees either the
  /// old file (whose images are still there) or the new one.
  static func write(json: String, images: [String: String]) throws {
    let fm = FileManager.default
    let dir = try folder()
    let imagesDir = dir.appendingPathComponent("images", isDirectory: true)
    try fm.createDirectory(at: imagesDir, withIntermediateDirectories: true)

    var kept = Set<String>()
    for (name, source) in images {
      // Names come from JS as "<moment id>.jpg"; nothing that could leave
      // the folder.
      guard isSafeName(name), let sourceURL = fileURL(source) else { continue }
      let dest = imagesDir.appendingPathComponent(name)
      if writeThumbnail(from: sourceURL, to: dest) { kept.insert(name) }
    }

    guard let data = json.data(using: .utf8) else {
      throw StoreError(message: "Widget data isn't UTF-8")
    }
    try data.write(to: dir.appendingPathComponent("moments.json"), options: .atomic)

    let existing = (try? fm.contentsOfDirectory(atPath: imagesDir.path)) ?? []
    for name in existing where !kept.contains(name) {
      try? fm.removeItem(at: imagesDir.appendingPathComponent(name))
    }
  }

  static func clear() throws {
    let dir = try folder()
    if FileManager.default.fileExists(atPath: dir.path) {
      try FileManager.default.removeItem(at: dir)
    }
  }

  private static func isSafeName(_ name: String) -> Bool {
    !name.isEmpty && name.count <= 128 && !name.hasPrefix(".")
      && name.unicodeScalars.allSatisfy { CharacterSet.alphanumerics.contains($0) || "-_.".unicodeScalars.contains($0) }
  }

  private static func fileURL(_ uri: String) -> URL? {
    if let url = URL(string: uri), url.isFileURL { return url }
    return uri.hasPrefix("/") ? URL(fileURLWithPath: uri) : nil
  }

  /// Decodes at most maxImagePixels on the long side (ImageIO never loads
  /// the full image) and writes a JPEG.
  private static func writeThumbnail(from source: URL, to dest: URL) -> Bool {
    guard let src = CGImageSourceCreateWithURL(source as CFURL, nil) else { return false }
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: maxImagePixels,
    ]
    guard let image = CGImageSourceCreateThumbnailAtIndex(src, 0, options as CFDictionary),
          let data = UIImage(cgImage: image).jpegData(compressionQuality: 0.85)
    else { return false }
    do {
      try data.write(to: dest, options: .atomic)
      return true
    } catch {
      return false
    }
  }
}
