// React Native 0.87 removed InteractionManager. Work we used to defer with
// runAfterInteractions (a refetch after a screen's entry animation, preloading
// tabs) now waits for the JS thread to go idle, with a ceiling so it can't be
// put off indefinitely on a busy screen.

export interface IdleTask {
  cancel: () => void;
}

export function runWhenIdle(fn: () => void, timeoutMs = 500): IdleTask {
  const handle = requestIdleCallback(() => fn(), { timeout: timeoutMs });
  return { cancel: () => cancelIdleCallback(handle) };
}
