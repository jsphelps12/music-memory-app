/**
 * Fingerprint inputs to ignore.
 *
 * `runtimeVersion.policy` is "fingerprint", so this hash decides which binaries
 * an OTA reaches. It therefore has to be reproducible: the value computed on a
 * developer machine, in CI, and on the EAS build server must agree, or
 * `eas build` stamps a build with one value while the server computes another
 * and the "Configure expo-updates" phase fails.
 *
 * react-native-maps generates ios/AirMaps/RNMapsDefines.h during `pod install`,
 * writing HAVE_GOOGLE_MAPS 1 or 0 depending on whether the Google Maps pods are
 * present. A fresh `npm ci` has the shipped default (1); any machine that has
 * run `expo run:ios` has the post-pod-install value (0). That single line was
 * enough to diverge the whole fingerprint and break build 21.
 *
 * Ignoring it is safe because it is *derived* state, not an input: what it
 * encodes is determined by the Podfile and the dependency list, both of which
 * are already fingerprinted. A real change to whether Google Maps is compiled
 * in would move the fingerprint through those.
 */
module.exports = {
  ignorePaths: ["node_modules/react-native-maps/ios/AirMaps/RNMapsDefines.h"],
};
