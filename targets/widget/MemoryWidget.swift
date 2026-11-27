import SwiftUI
import WidgetKit

// Memory widget (1.5): one of your moments each day, opening into its film.
// The app writes the week's picks into the App Group (lib/widgetData.ts);
// this only reads them (MemoryStore) and shows one per local day, so the
// widget turns over at midnight with no app launch.

struct MemoryEntry: TimelineEntry {
  enum Content {
    case moment(MemoryMoment)
    /// No file, nothing old enough yet, or signed out.
    case empty
    /// The widget gallery and loading placeholder: never real data.
    case sample
  }

  let date: Date
  let content: Content
}

struct MemoryMoment {
  let momentId: String
  let title: String
  let artist: String
  let dateLabel: String
  let onThisDay: Bool
  let line: String?
  let artwork: UIImage?
}

struct MemoryProvider: TimelineProvider {
  func placeholder(in context: Context) -> MemoryEntry {
    MemoryEntry(date: .now, content: .sample)
  }

  func getSnapshot(in context: Context, completion: @escaping (MemoryEntry) -> Void) {
    // The gallery shows a made-up moment, never one of yours.
    if context.isPreview {
      completion(MemoryEntry(date: .now, content: .sample))
      return
    }
    // Only today's entry: the snapshot shows one, so it reads one image.
    completion(entries(from: .now, days: 1).first ?? MemoryEntry(date: .now, content: .empty))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<MemoryEntry>) -> Void) {
    let now = Date.now
    let calendar = Calendar.current
    let list = entries(from: now, days: 7)
    // The app rewrites the file (and reloads) whenever it's opened; this is
    // for a week without that.
    let nextWeek = calendar.date(byAdding: .day, value: 7, to: calendar.startOfDay(for: now)) ?? now.addingTimeInterval(7 * 86_400)
    completion(Timeline(entries: list, policy: .after(nextWeek)))
  }

  /// One entry per local day for `days` days, starting now; each later one
  /// at its midnight.
  private func entries(from now: Date, days: Int) -> [MemoryEntry] {
    let calendar = Calendar.current
    let today = calendar.startOfDay(for: now)
    guard let file = MemoryStore.load(), !file.entries.isEmpty else {
      return [MemoryEntry(date: now, content: .empty)]
    }
    let byDay = Dictionary(file.entries.map { ($0.day, $0) }, uniquingKeysWith: { first, _ in first })
    let latest = file.entries.max { $0.day < $1.day }

    // Each image read once per call: when the file runs out, the last
    // moment fills several days with the same artwork.
    var images: [String: UIImage] = [:]
    func artwork(_ name: String?) -> UIImage? {
      guard let name else { return nil }
      if let cached = images[name] { return cached }
      let image = MemoryStore.image(named: name)
      images[name] = image
      return image
    }

    var list: [MemoryEntry] = []
    for offset in 0..<max(days, 1) {
      let start = calendar.date(byAdding: .day, value: offset, to: today) ?? today
      let key = MemoryStore.dayKey(start, calendar: calendar)
      let date = offset == 0 ? now : start
      if let item = byDay[key] {
        let shown = moment(item, showWords: file.showWords, fresh: true, artwork: artwork(item.image))
        list.append(MemoryEntry(date: date, content: .moment(shown)))
      } else if let latest, latest.day < key {
        // The file ran out (the app hasn't been opened for a week): keep the
        // last moment up, with its plain date, rather than go blank.
        let shown = moment(latest, showWords: file.showWords, fresh: false, artwork: artwork(latest.image))
        list.append(MemoryEntry(date: date, content: .moment(shown)))
      } else {
        list.append(MemoryEntry(date: date, content: .empty))
      }
    }
    return list
  }

  private func moment(_ item: MemoryStore.Item, showWords: Bool, fresh: Bool, artwork: UIImage?) -> MemoryMoment {
    MemoryMoment(
      momentId: item.momentId,
      title: item.title,
      artist: item.artist,
      // "3 years ago today" is only true on its day.
      dateLabel: fresh ? item.dateLabel : item.dateText,
      onThisDay: fresh && item.onThisDay,
      line: showWords ? item.line : nil,
      artwork: artwork
    )
  }
}

struct MemoryWidget: Widget {
  let kind = "MemoryWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: MemoryProvider()) { entry in
      MemoryWidgetView(entry: entry)
    }
    .configurationDisplayName("A moment a day")
    .description("One of your moments each day. Tap to play its film.")
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
  }
}

// MARK: - Views

struct MemoryWidgetView: View {
  @Environment(\.widgetFamily) private var family
  @Environment(\.widgetRenderingMode) private var renderingMode
  @Environment(\.showsWidgetContainerBackground) private var showsBackground
  let entry: MemoryEntry

  /// The small widget's artwork is its background, which the system drops on
  /// a tinted Home Screen, in StandBy at night and on the iPad Lock Screen.
  /// There the cover comes forward as a tile instead (MemorySmallView).
  private var artworkBehind: Bool {
    renderingMode == .fullColor && showsBackground
  }

  var body: some View {
    switch entry.content {
    case .moment(let moment):
      momentView(moment)
        .widgetURL(SoundtracksLink.moment(moment.momentId))
    case .sample:
      momentView(MemoryMoment.sample)
    case .empty:
      emptyView
        .widgetURL(SoundtracksLink.home)
    }
  }

  @ViewBuilder
  private func momentView(_ moment: MemoryMoment) -> some View {
    switch family {
    case .systemMedium:
      MemoryMediumView(moment: moment)
        .containerBackground(for: .widget) { Color("paper") }
    case .accessoryRectangular:
      MemoryRectangularView(moment: moment)
        .containerBackground(for: .widget) { Color.clear }
    default:
      MemorySmallView(moment: moment, artworkBehind: artworkBehind)
        .containerBackground(for: .widget) {
          if artworkBehind {
            ArtworkFill(image: moment.artwork)
          } else {
            Color("paper")
          }
        }
    }
  }

  @ViewBuilder
  private var emptyView: some View {
    switch family {
    case .accessoryRectangular:
      VStack(alignment: .leading, spacing: 2) {
        Label("Soundtracks", systemImage: "music.note")
          .font(.system(size: 13, weight: .semibold))
          .widgetAccentable()
        Text("Your moments will show here")
          .font(.system(size: 15, weight: .regular, design: .serif))
          .lineLimit(2)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .containerBackground(for: .widget) { Color.clear }
    default:
      VStack(alignment: .leading, spacing: 0) {
        Image(systemName: "music.note")
          .font(.system(size: 18, weight: .medium))
          .foregroundStyle(Color("inkSoft"))
        Spacer(minLength: 0)
        Text("Your moments will show here")
          .font(.system(size: family == .systemMedium ? 20 : 17, weight: .regular, design: .serif))
          .foregroundStyle(Color("ink"))
          .fixedSize(horizontal: false, vertical: true)
        Text("One a day, from a month back or more")
          .font(.system(size: 12, weight: .medium))
          .foregroundStyle(Color("inkSoft"))
          .lineLimit(2)
          .padding(.top, 4)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      .containerBackground(for: .widget) { Color("paper") }
    }
  }
}

/// Small: the artwork edge to edge, the date over a night scrim at the foot.
/// Where the system drops the background (tinted, StandBy at night), the
/// cover is a rounded tile above the date and title instead, like the medium
/// widget's, so it never vanishes or turns into a flat square.
struct MemorySmallView: View {
  let moment: MemoryMoment
  let artworkBehind: Bool

  var body: some View {
    if artworkBehind {
      VStack(alignment: .leading, spacing: 2) {
        Spacer(minLength: 0)
        DateLine(label: moment.dateLabel, onThisDay: moment.onThisDay, onArtwork: true)
        Text(moment.title)
          .font(.system(size: 15, weight: .regular, design: .serif))
          .foregroundStyle(Color.white)
          .lineLimit(1)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
    } else {
      VStack(alignment: .leading, spacing: 2) {
        Color.clear
          .aspectRatio(1, contentMode: .fit)
          .overlay(ArtworkTile(image: moment.artwork))
          .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
          .padding(.bottom, 6)
        DateLine(label: moment.dateLabel, onThisDay: moment.onThisDay, onArtwork: false)
        Text(moment.title)
          .font(.system(size: 15, weight: .regular, design: .serif))
          .foregroundStyle(Color("ink"))
          .lineLimit(1)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
  }
}

/// Medium: artwork on the left; song, artist, date and, if allowed, a line.
struct MemoryMediumView: View {
  let moment: MemoryMoment

  var body: some View {
    HStack(spacing: 14) {
      // A square as tall as the widget's content, the cover filling it.
      Color.clear
        .aspectRatio(1, contentMode: .fit)
        .overlay(ArtworkTile(image: moment.artwork))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

      VStack(alignment: .leading, spacing: 0) {
        DateLine(label: moment.dateLabel, onThisDay: moment.onThisDay, onArtwork: false)
        Spacer(minLength: 4)
        Text(moment.title)
          .font(.system(size: 18, weight: .regular, design: .serif))
          .foregroundStyle(Color("ink"))
          .lineLimit(2)
        Text(moment.artist)
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(Color("inkSoft"))
          .lineLimit(1)
          .padding(.top, 2)
        if let line = moment.line {
          Text(line)
            .font(.system(size: 13, weight: .regular, design: .serif))
            .italic()
            .foregroundStyle(Color("ink"))
            .lineLimit(2)
            .padding(.top, 6)
            // Redacted on a locked phone (StandBy, Lock Screen).
            .privacySensitive()
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
  }
}

/// Lock Screen: when, then the song. Never words.
struct MemoryRectangularView: View {
  let moment: MemoryMoment

  var body: some View {
    VStack(alignment: .leading, spacing: 1) {
      Text(moment.dateLabel)
        .font(.system(size: 12, weight: .semibold))
        .widgetAccentable()
        .lineLimit(1)
      Text(moment.title)
        .font(.system(size: 15, weight: .regular, design: .serif))
        .lineLimit(1)
      Text(moment.artist)
        .font(.system(size: 12))
        .foregroundStyle(.secondary)
        .lineLimit(1)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// The date, with the one terracotta dot when it's this day in an earlier year.
struct DateLine: View {
  let label: String
  let onThisDay: Bool
  let onArtwork: Bool

  var body: some View {
    HStack(spacing: 5) {
      if onThisDay {
        Circle()
          .fill(Color("accent"))
          .frame(width: 6, height: 6)
      }
      Text(label)
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(onArtwork ? Color.white.opacity(0.85) : Color("inkSoft"))
        .lineLimit(1)
    }
  }
}

/// The small widget's background: artwork with a night scrim at the foot so
/// the date reads on any cover.
struct ArtworkFill: View {
  let image: UIImage?

  var body: some View {
    ZStack {
      ArtworkTile(image: image)
      LinearGradient(
        colors: [Color(red: 14 / 255, green: 11 / 255, blue: 10 / 255).opacity(0), Color(red: 14 / 255, green: 11 / 255, blue: 10 / 255).opacity(0.78)],
        startPoint: .center,
        endPoint: .bottom
      )
    }
  }
}

/// The artwork, or the app's flat placeholder with a note when there's none.
struct ArtworkTile: View {
  @Environment(\.widgetRenderingMode) private var renderingMode
  let image: UIImage?

  var body: some View {
    if let image {
      Image(uiImage: image)
        .resizable()
        .artworkKeepsItsPicture()
        .scaledToFill()
    } else {
      ZStack {
        // Tinted and StandBy-at-night keep only a color's opacity: a faint
        // square under a solid note, rather than a solid square hiding it.
        if renderingMode == .fullColor {
          Color("chip")
        } else {
          Color.primary.opacity(0.15)
        }
        Image(systemName: "music.note")
          .font(.system(size: 24, weight: .medium))
          .foregroundStyle(Color("inkSoft"))
      }
    }
  }
}

extension Image {
  /// On a tinted Home Screen (iOS 18+) an image is flattened into the tint
  /// unless it says otherwise; desaturated keeps the cover readable, as a
  /// grey picture in the tint's color. Full color is untouched.
  /// (An Image method returning a view, so it comes straight after
  /// resizable, before any View modifier.)
  @ViewBuilder
  func artworkKeepsItsPicture() -> some View {
    if #available(iOS 18.0, *) {
      widgetAccentedRenderingMode(.desaturated)
    } else {
      self
    }
  }
}

extension MemoryMoment {
  /// Made up for the gallery and placeholder: no one's real moment.
  static let sample = MemoryMoment(
    momentId: "",
    title: "The song from that summer",
    artist: "Your moments, one a day",
    dateLabel: "3 years ago today",
    onThisDay: true,
    line: nil,
    artwork: nil
  )
}

#Preview(as: .systemSmall) {
  MemoryWidget()
} timeline: {
  MemoryEntry(date: .now, content: .sample)
  MemoryEntry(date: .now, content: .empty)
}

#Preview(as: .systemMedium) {
  MemoryWidget()
} timeline: {
  MemoryEntry(date: .now, content: .sample)
  MemoryEntry(date: .now, content: .empty)
}

#Preview(as: .accessoryRectangular) {
  MemoryWidget()
} timeline: {
  MemoryEntry(date: .now, content: .sample)
}
