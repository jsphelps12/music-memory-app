Pod::Spec.new do |s|
  s.name           = 'ContextMenu'
  s.version        = '1.0.0'
  s.summary        = 'The iOS context menu around a React Native view'
  s.description    = 'Expo view: wraps its children in a UIContextMenuInteraction (lift, blur, attached menu)'
  s.license        = 'MIT'
  s.author         = 'Joshua Phelps'
  s.homepage       = 'https://github.com/joshuaphelps'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.frameworks = 'UIKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
