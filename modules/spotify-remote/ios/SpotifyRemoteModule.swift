import ExpoModulesCore
import SpotifyiOS

// ─── Delegate proxy ───────────────────────────────────────────────────────────
// Expo's Module class does not inherit NSObject, but Spotify's ObjC protocols
// require it. This proxy satisfies that requirement.

private class SpotifyDelegateProxy: NSObject, SPTAppRemoteDelegate, SPTAppRemotePlayerStateDelegate {
  weak var module: SpotifyRemoteModule?

  func appRemoteDidEstablishConnection(_ appRemote: SPTAppRemote) {
    module?.handleConnected(appRemote)
  }
  func appRemote(_ appRemote: SPTAppRemote, didFailConnectionAttemptWithError error: Error?) {
    module?.handleConnectionFailed()
  }
  func appRemote(_ appRemote: SPTAppRemote, didDisconnectWithError error: Error?) {
    module?.handleDisconnected()
  }
  func playerStateDidChange(_ playerState: SPTAppRemotePlayerState) {
    module?.handlePlayerStateChanged(playerState)
  }
}

// ─── Module ───────────────────────────────────────────────────────────────────

public class SpotifyRemoteModule: Module {

  private var appRemote: SPTAppRemote?
  private let proxy = SpotifyDelegateProxy()
  private var connectPromise: Promise?
  private var isObservingState = false

  public func definition() -> ModuleDefinition {
    Name("SpotifyRemote")

    Events("onPlayerStateChanged", "onConnected", "onDisconnected")

    // ─── Connection ─────────────────────────────────────────────────────────
    // Uses Promise (not async/await) — whole-module-optimization compiles
    // AsyncFunction closures as non-async; SPTAppRemote also isn't Sendable.

    AsyncFunction("connect") { (clientId: String, redirectUrl: String, accessToken: String, promise: Promise) in
      if let existing = self.appRemote, existing.isConnected {
        existing.disconnect()
      }

      guard let redirectURL = URL(string: redirectUrl) else {
        promise.resolve(false)
        return
      }

      let config = SPTConfiguration(clientID: clientId, redirectURL: redirectURL)
      let remote = SPTAppRemote(configuration: config, logLevel: .none)
      remote.connectionParameters.accessToken = accessToken
      remote.delegate = self.proxy
      self.proxy.module = self
      self.appRemote = remote
      self.connectPromise = promise

      DispatchQueue.main.async { remote.connect() }
    }

    Function("disconnect") { [weak self] in
      self?.appRemote?.disconnect()
      self?.appRemote = nil
    }

    Function("isConnected") { [weak self] () -> Bool in
      return self?.appRemote?.isConnected ?? false
    }

    // ─── Playback ────────────────────────────────────────────────────────────

    AsyncFunction("playUri") { (uri: String, promise: Promise) in
      guard let playerAPI = self.appRemote?.playerAPI else {
        promise.reject("NOT_CONNECTED", "Spotify App Remote is not connected", nil)
        return
      }
      // SPTAppRemoteCallback = (Any?, Error?) -> Void
      playerAPI.play(uri) { _, error in
        if let error = error {
          promise.reject("PLAY_FAILED", error.localizedDescription, error)
        } else {
          promise.resolve(nil)
        }
      }
    }

    Function("pause") { [weak self] in
      self?.appRemote?.playerAPI?.pause { _, _ in }
    }

    Function("resume") { [weak self] in
      self?.appRemote?.playerAPI?.resume { _, _ in }
    }

    Function("seekTo") { [weak self] (positionMs: Int) in
      self?.appRemote?.playerAPI?.seek(toPosition: positionMs) { _, _ in }
    }

    // ─── State subscription ──────────────────────────────────────────────────

    OnStartObserving { [weak self] in
      self?.isObservingState = true
      self?.appRemote?.playerAPI?.subscribe(toPlayerState: { _, _ in })
    }

    OnStopObserving { [weak self] in
      self?.isObservingState = false
      self?.appRemote?.playerAPI?.unsubscribe(toPlayerState: { _, _ in })
    }
  }

  // ─── Called by SpotifyDelegateProxy ──────────────────────────────────────

  func handleConnected(_ appRemote: SPTAppRemote) {
    appRemote.playerAPI?.delegate = proxy
    if isObservingState {
      appRemote.playerAPI?.subscribe(toPlayerState: { _, _ in })
    }
    connectPromise?.resolve(true)
    connectPromise = nil
    sendEvent("onConnected")
  }

  func handleConnectionFailed() {
    connectPromise?.resolve(false)
    connectPromise = nil
  }

  func handleDisconnected() {
    sendEvent("onDisconnected")
  }

  func handlePlayerStateChanged(_ state: SPTAppRemotePlayerState) {
    sendEvent("onPlayerStateChanged", [
      "isPlaying": !state.isPaused,
      "positionMs": state.playbackPosition,
      "durationMs": state.track.duration,
    ])
  }
}
