import SwiftUI
import WidgetKit

@main
struct SoundtracksWidgets: WidgetBundle {
  var body: some Widget {
    CaptureWidget()
    if #available(iOSApplicationExtension 18.0, *) {
      CaptureControl()
      IdentifyControl()
    }
  }
}
