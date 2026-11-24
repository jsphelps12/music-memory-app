// "Remember this song" (1.5): puts the App Intent and its App Shortcuts
// (plugins/remember-this-song/RememberThisSong.swift) into the MAIN APP
// target at prebuild.
//
// Why not elsewhere:
// - A local Expo module (modules/*) compiles into a pod. iOS registers App
//   Shortcuts (Siri phrases, the Shortcuts app, the Action button list) only
//   from an AppShortcutsProvider in the app bundle's own metadata, which
//   Xcode extracts from the app target's sources.
// - targets/widget/_shared files are built into the widget extension too,
//   and an extension can't read the system Music player or carry a second
//   AppShortcutsProvider.
//
// The file is copied into ios/<ProjectName>/ and added to the app target's
// Sources, overwritten on every prebuild so the copy in git is the truth.
const fs = require("fs");
const path = require("path");
const { IOSConfig } = require("expo/config-plugins");

const FILE = "RememberThisSong.swift";
const SOURCE = path.join(__dirname, "remember-this-song", FILE);

module.exports = function withRememberThisSong(config) {
  return IOSConfig.XcodeProjectFile.withBuildSourceFile(config, {
    filePath: FILE,
    contents: fs.readFileSync(SOURCE, "utf8"),
    overwrite: true,
  });
};
