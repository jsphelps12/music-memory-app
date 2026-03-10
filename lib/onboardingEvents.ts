type OnboardingMomentPayload = { momentId: string; hasPerson: boolean };
type Listener = (payload: OnboardingMomentPayload) => void;
let _listener: Listener | null = null;

export function onOnboardingMomentSaved(fn: Listener): () => void {
  _listener = fn;
  return () => {
    if (_listener === fn) _listener = null;
  };
}

export function emitOnboardingMomentSaved(payload: OnboardingMomentPayload) {
  _listener?.(payload);
}
