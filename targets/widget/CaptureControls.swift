import AppIntents
import SwiftUI
import WidgetKit

// iOS 18 controls: Control Center, the Lock Screen's bottom buttons and the
// Action button. Each one just opens the capture screen through its deep link.

@available(iOSApplicationExtension 18.0, *)
struct CaptureControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "soundtracks.capture") {
      ControlWidgetButton(action: OpenCaptureIntent()) {
        Label("Capture a song", systemImage: "music.note")
      }
    }
    .displayName("Capture a song")
    .description("Open Soundtracks to capture what's playing.")
  }
}

@available(iOSApplicationExtension 18.0, *)
struct IdentifyControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "soundtracks.identify") {
      ControlWidgetButton(action: OpenIdentifyIntent()) {
        Label("Identify a song", systemImage: "waveform")
      }
    }
    .displayName("Identify a song")
    .description("Open Soundtracks and start listening for the song nearby.")
  }
}

// The intents themselves are in _shared/ControlIntents.swift: they must be
// built into the app too, or tapping a control opens nothing.
