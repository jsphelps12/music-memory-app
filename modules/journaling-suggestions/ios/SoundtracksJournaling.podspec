Pod::Spec.new do |s|
  # Not "JournalingSuggestions": the pod's module would shadow Apple's
  # framework of that name, and `import JournalingSuggestions` would find it.
  s.name           = 'SoundtracksJournaling'
  s.version        = '1.0.0'
  s.summary        = "Apple's Journaling Suggestions picker as a way into capture"
  s.description    = "Expo module: presents Apple's Journaling Suggestions picker (iOS 17.2+, on a device) and returns what the person picked (songs, photos, places, people, the date) as plain JSON"
  s.license        = 'MIT'
  s.author         = 'Joshua Phelps'
  s.homepage       = 'https://github.com/joshuaphelps'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.frameworks = 'SwiftUI', 'UIKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    # No automatic (strong) link from `import JournalingSuggestions`: the app
    # target weak-links it below instead.
    'OTHER_SWIFT_FLAGS' => '$(inherited) -Xfrontend -disable-autolink-framework -Xfrontend JournalingSuggestions'
  }
  # The framework is iOS 17.2+ and only in the device SDK (the simulator SDK
  # has none), so it's weak-linked for device builds only: the app still
  # launches on iOS 16.4, and simulator builds never look for it. Through a
  # setting of our own: RNSentry already sets OTHER_LDFLAGS[sdk=iphoneos*],
  # and CocoaPods can't merge two values for a conditional setting.
  s.user_target_xcconfig = {
    'ST_JOURNALING_LDFLAGS[sdk=iphoneos*]' => '-weak_framework JournalingSuggestions',
    'OTHER_LDFLAGS' => '$(inherited) $(ST_JOURNALING_LDFLAGS)'
  }
end
