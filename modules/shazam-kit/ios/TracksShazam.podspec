Pod::Spec.new do |s|
  s.name           = 'TracksShazam'
  s.version        = '1.0.0'
  s.summary        = 'ShazamKit native module for Tracks'
  s.description    = 'Identifies ambient audio using ShazamKit and AVAudioEngine'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = "**/*.{h,m,swift}"
  s.frameworks = 'ShazamKit', 'AVFoundation'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
