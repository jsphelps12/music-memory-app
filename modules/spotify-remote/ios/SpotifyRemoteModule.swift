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
    module?.handleConnectionFailed(appRemote)
  }
  func appRemote(_ appRemote: SPTAppRemote, didDisconnectWithError error: Error?) {
    module?.handleDisconnected(appRemote)
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

    // All connection state is read and written on the main queue, where the
    // SDK delivers its delegate callbacks.
    AsyncFunction("connect") { (clientId: String, redirectUrl: String, accessToken: String, promise: Promise) in
      guard let redirectURL = URL(string: redirectUrl) else {
        promise.resolve(false)
        return
      }

      DispatchQueue.main.async {
        // Retire the previous remote first: settle its pending connect and
        // stop listening to it, so its late callbacks can't touch this one.
        self.teardownRemote()

        let config = SPTConfiguration(clientID: clientId, redirectURL: redirectURL)
        let remote = SPTAppRemote(configuration: config, logLevel: .none)
        remote.connectionParameters.accessToken = accessToken
        remote.delegate = self.proxy
        self.proxy.module = self
        self.appRemote = remote
        self.connectPromise = promise
        remote.connect()
      }
    }

    Function("disconnect") { [weak self] in
      DispatchQueue.main.async { self?.teardownRemote() }
    }

    Function("isConnected") { [weak self] () -> Bool in
      return self?.appRemote?.isConnected ?? false
    }

    // ─── Playback ────────────────────────────────────────────────────────────

    AsyncFunction("playUri") { (uri: String, promise: Promise) in
      DispatchQueue.main.async {
        guard let playerAPI = self.appRemote?.playerAPI else {
          promise.reject("NOT_CONNECTED", "Spotify App Remote is not connected")
          return
        }
        // SPTAppRemoteCallback = (Any?, Error?) -> Void
        playerAPI.play(uri) { _, error in
          if let error = error {
            promise.reject(error)
          } else {
            promise.resolve(nil)
          }
        }
      }
    }

    Function("pause") { [weak self] in
      DispatchQueue.main.async { self?.appRemote?.playerAPI?.pause { _, _ in } }
    }

    Function("resume") { [weak self] in
      DispatchQueue.main.async { self?.appRemote?.playerAPI?.resume { _, _ in } }
    }

    Function("seekTo") { [weak self] (positionMs: Int) in
      DispatchQueue.main.async { self?.appRemote?.playerAPI?.seek(toPosition: positionMs) { _, _ in } }
    }

    // ─── State subscription ──────────────────────────────────────────────────

    OnStartObserving { [weak self] in
      DispatchQueue.main.async {
        self?.isObservingState = true
        self?.appRemote?.playerAPI?.subscribe(toPlayerState: { _, _ in })
      }
    }

    OnStopObserving { [weak self] in
      DispatchQueue.main.async {
        self?.isObservingState = false
        self?.appRemote?.playerAPI?.unsubscribe(toPlayerState: { _, _ in })
      }
    }
  }

  /// Main queue only. Settles any pending connect as failed, detaches the
  /// delegate and drops the remote.
  private func teardownRemote() {
    connectPromise?.resolve(false)
    connectPromise = nil
    if let existing = appRemote {
      existing.delegate = nil
      existing.playerAPI?.delegate = nil
      if existing.isConnected { existing.disconnect() }
    }
    appRemote = nil
  }

  // ─── Called by SpotifyDelegateProxy ──────────────────────────────────────

  // Each handler ignores callbacks from a remote that is no longer current.

  func handleConnected(_ appRemote: SPTAppRemote) {
    guard appRemote === self.appRemote else { return }
    appRemote.playerAPI?.delegate = proxy
    if isObservingState {
      appRemote.playerAPI?.subscribe(toPlayerState: { _, _ in })
    }
    connectPromise?.resolve(true)
    connectPromise = nil
    sendEvent("onConnected")
  }

  func handleConnectionFailed(_ appRemote: SPTAppRemote) {
    guard appRemote === self.appRemote else { return }
    connectPromise?.resolve(false)
    connectPromise = nil
  }

  func handleDisconnected(_ appRemote: SPTAppRemote) {
    guard appRemote === self.appRemote else { return }
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
