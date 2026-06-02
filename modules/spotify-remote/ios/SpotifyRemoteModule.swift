import ExpoModulesCore
import SpotifyiOS

public class SpotifyRemoteModule: Module, SPTAppRemoteDelegate, SPTAppRemotePlayerStateDelegate {

  private var appRemote: SPTAppRemote?
  private var connectContinuation: CheckedContinuation<Bool, Never>?
  private var isObservingState = false

  public func definition() -> ModuleDefinition {
    Name("SpotifyRemote")

    Events("onPlayerStateChanged", "onConnected", "onDisconnected")

    // ─── Connection ───────────────────────────────────────────────────────────

    AsyncFunction("connect") { (clientId: String, redirectUrl: String, accessToken: String) -> Bool in
      return await withCheckedContinuation { [weak self] continuation in
        guard let self else { continuation.resume(returning: false); return }

        // Disconnect any existing remote before reconnecting
        if let existing = self.appRemote, existing.isConnected {
          existing.disconnect()
        }

        let config = SPTConfiguration(
          clientID: clientId,
          redirectURL: URL(string: redirectUrl)!
        )
        let remote = SPTAppRemote(configuration: config, logLevel: .none)
        remote.connectionParameters.accessToken = accessToken
        remote.delegate = self
        self.appRemote = remote
        self.connectContinuation = continuation

        DispatchQueue.main.async {
          remote.connect()
        }
      }
    }

    Function("disconnect") { [weak self] in
      self?.appRemote?.disconnect()
      self?.appRemote = nil
    }

    Function("isConnected") { [weak self] () -> Bool in
      return self?.appRemote?.isConnected ?? false
    }

    // ─── Playback ─────────────────────────────────────────────────────────────

    AsyncFunction("playUri") { (uri: String) throws in
      guard let playerAPI = self.appRemote?.playerAPI else {
        throw SpotifyRemoteError.notConnected
      }
      try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
        playerAPI.play(uri) { error in
          if let error { continuation.resume(throwing: error) }
          else { continuation.resume() }
        }
      }
    }

    Function("pause") { [weak self] in
      self?.appRemote?.playerAPI?.pause { _ in }
    }

    Function("resume") { [weak self] in
      self?.appRemote?.playerAPI?.resume { _ in }
    }

    Function("seekTo") { [weak self] (positionMs: Int) in
      self?.appRemote?.playerAPI?.seek(toPosition: positionMs) { _ in }
    }

    // ─── State subscription ───────────────────────────────────────────────────

    OnStartObserving { [weak self] in
      self?.isObservingState = true
      self?.appRemote?.playerAPI?.subscribe(toPlayerState: { _, _ in })
    }

    OnStopObserving { [weak self] in
      self?.isObservingState = false
      self?.appRemote?.playerAPI?.unsubscribe(toPlayerState: { _ in })
    }
  }

  // ─── SPTAppRemoteDelegate ──────────────────────────────────────────────────

  public func appRemoteDidEstablishConnection(_ appRemote: SPTAppRemote) {
    appRemote.playerAPI?.delegate = self
    if isObservingState {
      appRemote.playerAPI?.subscribe(toPlayerState: { _, _ in })
    }
    connectContinuation?.resume(returning: true)
    connectContinuation = nil
    sendEvent("onConnected")
  }

  public func appRemote(_ appRemote: SPTAppRemote, didFailConnectionAttemptWithError error: Error?) {
    connectContinuation?.resume(returning: false)
    connectContinuation = nil
  }

  public func appRemote(_ appRemote: SPTAppRemote, didDisconnectWithError error: Error?) {
    sendEvent("onDisconnected")
  }

  // ─── SPTAppRemotePlayerStateDelegate ──────────────────────────────────────

  public func playerStateDidChange(_ playerState: SPTAppRemotePlayerState) {
    sendEvent("onPlayerStateChanged", [
      "isPlaying": !playerState.isPaused,
      "positionMs": playerState.playbackPosition,
      "durationMs": playerState.track.duration,
    ])
  }
}

private enum SpotifyRemoteError: Error {
  case notConnected
}
