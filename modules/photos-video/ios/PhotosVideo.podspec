Pod::Spec.new do |s|
  s.name           = 'PhotosVideo'
  s.version        = '1.0.0'
  s.summary        = 'Plays a video from the Photos library in place'
  s.description    = 'Expo view: an AVPlayer fed by PHImageManager, so a linked video streams from Photos (and iCloud) without a copy'
  s.license        = 'MIT'
  s.author         = 'Joshua Phelps'
  s.homepage       = 'https://github.com/joshuaphelps'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.frameworks = 'AVFoundation', 'Photos', 'UIKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
