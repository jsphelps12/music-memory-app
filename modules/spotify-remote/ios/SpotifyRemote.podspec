Pod::Spec.new do |s|
  s.name           = 'SpotifyRemote'
  s.version        = '1.0.0'
  s.summary        = 'Spotify App Remote playback control via SpotifyiOS SDK v5.0.1'
  s.description    = 'Expo module wrapping the official Spotify iOS App Remote SDK for in-app playback control'
  s.license        = 'MIT'
  s.author         = 'Joshua Phelps'
  s.homepage       = 'https://github.com/joshuaphelps'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files   = '*.swift'
  s.vendored_frameworks = 'SpotifyiOS.xcframework'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
