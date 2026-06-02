import ExpoModulesCore
import SpotifyiOS

// ─── Delegate proxy ───────────────────────────────────────────────────────────
// Expo's Module class does not inherit NSObject, but Spotify's ObjC protocols
// require it. This proxy bridges the two worlds.

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
  private var connectContinuation: CheckedContinuation<Bool, Never>?
  private var isObservingState = false

  public func definition() -> ModuleDefinition {
    Name("SpotifyRemote")

    Events("onPlayerStateChanged", "onConnected", "onDisconnected")

    // ─── Connection ─────────────────────────────────────────────────────────

    AsyncFunction("connect") { (clientId: String, redirectUrl: String, accessToken: String) -> Bool in
      return await withCheckedContinuation { [weak self] continuation in
        guard let self else { continuation.resume(returning: false); return }

        if let existing = self.appRemote, existing.isConnected {
          existing.disconnect()
        }

        let config = SPTConfiguration(
          clientID: clientId,
          redirectURL: URL(string: redirectUrl)!
        )
        let remote = SPTAppRemote(configuration: config, logLevel: .none)
        remote.connectionParameters.accessToken = accessToken
        remote.delegate = self.proxy
        self.proxy.module = self
        self.appRemote = remote
        self.connectContinuation = continuation

        DispatchQueue.main.async { remote.connect() }
      }
    }

    Function("disconnect") { [weak self] in
      self?.appRemote?.disconnect()
      self?.appRemote = nil
    }

    Function("isConnected") { [weak self] () -> Bool in
      return self?.appRemote?.isConnected ?? false
    }

    // ─── Playback ────────────────────────────────────────────────────────────

    AsyncFunction("playUri") { (uri: String) throws in
      guard let playerAPI = self.appRemote?.playerAPI else {
        throw SpotifyRemoteError.notConnected
      }
      try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
        // SPTAppRemoteCallback = (Any?, Error?) -> Void — both args required
        playerAPI.play(uri) { _, error in
          if let error { continuation.resume(throwing: error) }
          else { continuation.resume() }
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
    connectContinuation?.resume(returning: true)
    connectContinuation = nil
    sendEvent("onConnected")
  }

  func handleConnectionFailed() {
    connectContinuation?.resume(returning: false)
    connectContinuation = nil
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

private enum SpotifyRemoteError: Error {
  case notConnected
}
