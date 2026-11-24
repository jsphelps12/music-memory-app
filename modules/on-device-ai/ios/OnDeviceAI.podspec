Pod::Spec.new do |s|
  s.name           = 'OnDeviceAI'
  s.version        = '1.0.0'
  s.summary        = 'On-device photo understanding (Vision), phrasing (Foundation Models) and speech transcription (Speech)'
  s.description    = 'Expo module: scene labels, faces, text and aesthetics for photos, short questions from Apple Intelligence, and voice entries to text, all on the device'
  s.license        = 'MIT'
  s.author         = 'Joshua Phelps'
  s.homepage       = 'https://github.com/joshuaphelps'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.frameworks = 'Photos', 'Vision', 'UIKit', 'Speech', 'AVFoundation', 'CoreMedia'
  # Foundation Models is iOS 26+; weak so the app still launches on older iOS.
  s.weak_frameworks = 'FoundationModels'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
