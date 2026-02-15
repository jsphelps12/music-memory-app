Pod::Spec.new do |s|
  s.name           = 'NowPlaying'
  s.version        = '1.0.0'
  s.summary        = 'System now playing detection via MPMusicPlayerController'
  s.description    = 'Expo module that reads the currently playing song from the system Music player'
  s.license        = 'MIT'
  s.author         = 'Joshua Phelps'
  s.homepage       = 'https://github.com/joshuaphelps'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.frameworks = 'MediaPlayer'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
