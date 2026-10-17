import SwiftUI
import WidgetKit

// Static: there's nothing to refresh, so one entry and no reloads.
struct CaptureEntry: TimelineEntry {
  let date: Date
}

struct CaptureProvider: TimelineProvider {
  func placeholder(in context: Context) -> CaptureEntry { CaptureEntry(date: .now) }

  func getSnapshot(in context: Context, completion: @escaping (CaptureEntry) -> Void) {
    completion(CaptureEntry(date: .now))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<CaptureEntry>) -> Void) {
    completion(Timeline(entries: [CaptureEntry(date: .now)], policy: .never))
  }
}

struct CaptureWidget: Widget {
  let kind = "CaptureWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: CaptureProvider()) { _ in
      CaptureWidgetView()
        .containerBackground(for: .widget) { Color("paper") }
    }
    .configurationDisplayName("Capture a song")
    .description("Save a song and what it means to you, from anywhere.")
    .supportedFamilies([
      .systemSmall, .systemMedium,
      .accessoryCircular, .accessoryRectangular, .accessoryInline,
    ])
  }
}

struct CaptureWidgetView: View {
  @Environment(\.widgetFamily) private var family

  var body: some View {
    switch family {
    case .systemMedium:
      MediumCaptureView()
    case .accessoryCircular:
      ZStack {
        AccessoryWidgetBackground()
        Image(systemName: "music.note")
          .font(.system(size: 22, weight: .semibold))
          .widgetAccentable()
      }
      .widgetURL(SoundtracksLink.capture)
    case .accessoryRectangular:
      VStack(alignment: .leading, spacing: 2) {
        Label("Soundtracks", systemImage: "music.note")
          .font(.system(size: 13, weight: .semibold))
          .widgetAccentable()
        Text("Capture a song")
          .font(.system(size: 15, weight: .regular, design: .serif))
        Text("What's this one doing for you?")
          .font(.system(size: 11))
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .widgetURL(SoundtracksLink.capture)
    case .accessoryInline:
      Label("Capture a song", systemImage: "music.note")
        .widgetURL(SoundtracksLink.capture)
    default:
      SmallCaptureView()
        .widgetURL(SoundtracksLink.capture)
    }
  }
}

/// The ink "+" disc, same as the app's floating capture button.
struct PlusDisc: View {
  var size: CGFloat = 40

  var body: some View {
    ZStack {
      Circle().fill(Color("ink"))
      Image(systemName: "plus")
        .font(.system(size: size * 0.45, weight: .medium))
        .foregroundStyle(Color("onInk"))
    }
    .frame(width: size, height: size)
  }
}

struct SmallCaptureView: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .top) {
        Circle()
          .fill(Color("accent"))
          .frame(width: 7, height: 7)
          .padding(.top, 6)
        Spacer()
        PlusDisc(size: 40)
      }
      Spacer(minLength: 0)
      Text("Capture\na song")
        .font(.system(size: 22, weight: .regular, design: .serif))
        .foregroundStyle(Color("ink"))
        .lineSpacing(-2)
        .fixedSize(horizontal: false, vertical: true)
      Text("What's playing?")
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(Color("inkSoft"))
        .padding(.top, 4)
    }
  }
}

struct MediumCaptureView: View {
  var body: some View {
    HStack(spacing: 12) {
      Link(destination: SoundtracksLink.capture) {
        VStack(alignment: .leading, spacing: 0) {
          PlusDisc(size: 40)
          Spacer(minLength: 0)
          Text("Capture a song")
            .font(.system(size: 19, weight: .regular, design: .serif))
            .foregroundStyle(Color("ink"))
          Text("Write what it means, or nothing at all")
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(Color("inkSoft"))
            .lineLimit(2)
            .padding(.top, 3)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      }

      Link(destination: SoundtracksLink.identify) {
        VStack(alignment: .leading, spacing: 0) {
          ZStack {
            Circle().fill(Color("paper"))
            Image(systemName: "waveform")
              .font(.system(size: 17, weight: .semibold))
              .foregroundStyle(Color("ink"))
          }
          .frame(width: 40, height: 40)
          Spacer(minLength: 0)
          Text("Identify")
            .font(.system(size: 19, weight: .regular, design: .serif))
            .foregroundStyle(Color("ink"))
          Text("Name what's playing nearby")
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(Color("inkSoft"))
            .lineLimit(2)
            .padding(.top, 3)
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color("chip")))
      }
    }
  }
}

#Preview(as: .systemSmall) {
  CaptureWidget()
} timeline: {
  CaptureEntry(date: .now)
}

#Preview(as: .systemMedium) {
  CaptureWidget()
} timeline: {
  CaptureEntry(date: .now)
}
