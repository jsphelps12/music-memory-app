import Foundation
import UIKit

/// Memory widget (1.5): reads what the app wrote into the App Group
/// container. The app side is modules/now-playing/ios/WidgetStore.swift and
/// lib/widgetData.ts; keep the paths and the JSON in step with them.
///   widget/moments.json   { version, generatedAt, showWords, entries: [...] }
///   widget/images/*.jpg   one artwork per entry, named by `image`
enum MemoryStore {
  /// The JSON shape this widget understands (WIDGET_SCHEMA_VERSION in JS).
  static let schemaVersion = 1

  /// The same group as the app variant this extension ships inside.
  static var groupId: String {
    (Bundle.main.bundleIdentifier ?? "").contains(".preview")
      ? "group.com.joshuaphelps.musicmemory.preview"
      : "group.com.joshuaphelps.musicmemory"
  }

  static var folder: URL? {
    FileManager.default
      .containerURL(forSecurityApplicationGroupIdentifier: groupId)?
      .appendingPathComponent("widget", isDirectory: true)
  }

  struct File: Decodable {
    let version: Int
    let showWords: Bool
    let entries: [Item]
  }

  struct Item: Decodable, Hashable {
    /// The local day it's for, "YYYY-MM-DD".
    let day: String
    let momentId: String
    let title: String
    let artist: String
    /// "3 years ago today" on its day, otherwise the date.
    let dateLabel: String
    /// Always the date: shown instead when the entry is past its day.
    let dateText: String
    let onThisDay: Bool
    let line: String?
    let image: String?
  }

  /// Nil when there's no file (signed out, or the app hasn't written one yet)
  /// or it's a version this widget doesn't know.
  static func load() -> File? {
    guard let url = folder?.appendingPathComponent("moments.json"),
          let data = try? Data(contentsOf: url),
          let file = try? JSONDecoder().decode(File.self, from: data),
          file.version == schemaVersion
    else { return nil }
    return file
  }

  static func image(named name: String?) -> UIImage? {
    guard let name, !name.contains("/"),
          let url = folder?.appendingPathComponent("images").appendingPathComponent(name)
    else { return nil }
    return UIImage(contentsOfFile: url.path)
  }

  /// "YYYY-MM-DD" for a date, in the phone's calendar and time zone (the
  /// app picks days the same way, in local time).
  static func dayKey(_ date: Date, calendar: Calendar = .current) -> String {
    let c = calendar.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
  }
}
