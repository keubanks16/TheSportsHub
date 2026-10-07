# Adjusts the Xcode project Capacitor generates (called by scripts/ios-setup.sh).
begin
  require 'xcodeproj'
rescue LoadError
  Gem.paths = { 'GEM_PATH' => [Gem.user_dir, *Gem.path].join(File::PATH_SEPARATOR) }
  require 'xcodeproj'
end

proj = Xcodeproj::Project.open(File.expand_path('../ios/App/App.xcodeproj', __dir__))
target = proj.targets.find { |t| t.name == 'App' } or abort('App target not found')
group = proj.main_group.children.find { |g| g.respond_to?(:display_name) && g.display_name == 'App' } or abort('App group not found')

unless target.resources_build_phase.files_references.any? { |f| f && f.path && f.path.end_with?('GoogleService-Info.plist') }
  ref = group.files.find { |f| f.path == 'GoogleService-Info.plist' } || group.new_reference('GoogleService-Info.plist')
  target.add_resources([ref])
end

(target.build_configurations + proj.build_configurations).each do |c|
  s = c.build_settings
  # App Store builds sign with a distribution profile, which needs no registered devices.
  s.keys.grep(/\ACODE_SIGN_IDENTITY/).each { |k| s.delete(k) }
  s['CODE_SIGN_IDENTITY'] = c.name == 'Release' ? 'Apple Distribution' : 'Apple Development'
  next unless target.build_configurations.include?(c)
  s['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements'
  s['TARGETED_DEVICE_FAMILY'] = '1'
  s['CODE_SIGN_STYLE'] = 'Automatic'
  s['DEVELOPMENT_TEAM'] = ENV['APPLE_TEAM_ID'] if ENV['APPLE_TEAM_ID'] && !ENV['APPLE_TEAM_ID'].empty?
end
proj.save
puts 'Xcode project updated'
