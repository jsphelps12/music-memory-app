// The registry behind confirmSheet() (components/ConfirmSheet.tsx): each
// mounted <ConfirmSheetHost/> is one entry. Pure, so the "which host answers"
// rule is tested (lib/__tests__/confirmHosts.test.ts).

export interface ConfirmHost<O> {
  /** Rendered by the root layout (its navigation has no parent). */
  root: boolean;
  /** Its screen is the focused one; kept current by the host component. */
  focused: boolean;
  /** Shows a question; resolves with the answer. */
  present(opts: O): Promise<boolean>;
  /** Answers the open question, if any. True when there was one. */
  answer(confirmed: boolean): boolean;
}

/**
 * A host entry that shows questions through `show` and answers each exactly
 * once. A second question while one is open answers the first with the safe
 * "no", so no caller is ever left waiting.
 */
export function createConfirmHost<O>(show: (opts: O) => void): ConfirmHost<O> {
  let open: ((confirmed: boolean) => void) | null = null;
  const host: ConfirmHost<O> = {
    root: false,
    focused: true,
    answer(confirmed) {
      const resolve = open;
      open = null;
      resolve?.(confirmed);
      return !!resolve;
    },
    present(opts) {
      return new Promise<boolean>((resolve) => {
        host.answer(false);
        open = resolve;
        show(opts);
      });
    },
  };
  return host;
}

/**
 * The host that should present, from a list in mount order (oldest first):
 * the newest focused non-root host, else the root host, else (never
 * expected) the newest host of any kind.
 *
 * Focus matters because a host stays mounted under the screens pushed over
 * it, and under a transparentModal such as moment detail: the newest host
 * could be on a screen no one can see, its sheet would never present, and
 * the awaiting caller would hang (the app looks frozen). The root host is
 * always focused, so it's ranked last: it answers only when the visible
 * screen has no host of its own.
 */
export function pickHost<H extends { root: boolean; focused: boolean }>(list: readonly H[]): H | undefined {
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].focused && !list[i].root) return list[i];
  }
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].root) return list[i];
  }
  return list[list.length - 1];
}
