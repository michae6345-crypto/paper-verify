"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";

import { GATE_SEQUENCE, lockGate, unlockGate } from "@/components/gate/gate-store";
import { useGateUnlocked } from "@/components/gate/use-gate";

/**
 * The two ways through the door, mounted once in the root layout so that both
 * work anywhere on the site — including on the quiet 404 a locked visitor gets
 * from a gated route, which is where the owner will most often be standing when
 * they use it.
 *
 * 1. Type `1`, `2`, `3`. No modifier, nothing focused that takes typing.
 * 2. Press `Enter` with nothing focused, and type `123` into the prompt.
 *
 * Both were asked for and they are the same secret, so they share one constant.
 * Neither is a login and neither is described as one: see `gate-store.ts`.
 *
 * This renders nothing at all until the prompt is open. A listener on `window`
 * is the entire resting footprint.
 */
export function GateEntry() {
  const [promptOpen, setPromptOpen] = useState(false);

  useEffect(() => {
    // How far into the sequence we are. A ref would do; a closure variable is
    // narrower, since nothing outside this effect has any business reading it.
    let progress = 0;
    let idle: number | undefined;

    const reset = () => {
      progress = 0;
      if (idle !== undefined) window.clearTimeout(idle);
      idle = undefined;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      // `Ctrl+1` and `Cmd+1` are the browser's, not ours. Taking them would
      // both break tab switching and let a shortcut half-open the curtain.
      if (event.ctrlKey || event.metaKey || event.altKey) {
        reset();
        return;
      }

      // The rule that keeps this from being a nuisance: a text field is for
      // typing in. Somebody entering `2312` as an arXiv identifier, or `123`
      // into this prompt, has not asked for anything.
      if (isEditable(event.target)) {
        reset();
        return;
      }

      if (event.key === "Enter") {
        reset();
        if (event.repeat) return;
        // Enter on a focused link or button belongs to that control. Only when
        // focus is nowhere in particular is it free to mean something here.
        if (!isFocusNowhere()) return;
        // Cancelling the keydown suppresses the `keypress` that would otherwise
        // follow it, and that matters more than it looks. The prompt opens
        // between this event and the next one, `showModal` puts focus in the
        // field, and the field then receives the tail of the very keystroke
        // that opened it — which in a form with a text input is the implicit
        // submission. The prompt opened and closed again inside one press, and
        // it looked exactly like the key not working. Nothing is lost by
        // cancelling: this branch is only reached when nothing is focused, so
        // there is no default action to keep.
        event.preventDefault();
        setPromptOpen(true);
        return;
      }

      if (event.key === GATE_SEQUENCE[progress]) {
        progress += 1;
        if (progress === GATE_SEQUENCE.length) {
          reset();
          unlockGate();
          return;
        }
      } else {
        // A non-matching key resets — but the key that resets may itself be the
        // start of the sequence, so `1123` still opens the door.
        progress = event.key === GATE_SEQUENCE[0] ? 1 : 0;
      }

      // A half-typed sequence should not wait all afternoon for its third key.
      if (idle !== undefined) window.clearTimeout(idle);
      idle = window.setTimeout(() => {
        progress = 0;
        idle = undefined;
      }, IDLE_MS);
    };

    // Capture, so a component that stops propagation on its own keys cannot
    // silently break the door. Nothing here calls `preventDefault`, so no key
    // means anything different to the rest of the page because of this.
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      reset();
    };
  }, []);

  if (!promptOpen) return null;
  return <GatePrompt onDismiss={() => setPromptOpen(false)} />;
}

/** How long a half-typed sequence stays live. Long enough to be deliberate, short enough to forget. */
const IDLE_MS = 1200;

/**
 * Is this key going into something that takes typing?
 *
 * `isContentEditable` covers the editable-div case, which a tag check misses and
 * which is the one people forget.
 */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** Nothing focused: the document itself has focus, so no control is expecting `Enter`. */
function isFocusNowhere(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body || active === document.documentElement;
}

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * The prompt.
 *
 * A native `<dialog>` opened with `showModal`, which is not a shortcut: the
 * platform gives focus containment, `Escape`, the inert background and the top
 * layer, all of which a hand-rolled modal gets wrong at least once. Mounting it
 * only while open means the resting DOM carries no trace of it.
 *
 * Its copy says as little as it can while still being usable by somebody who
 * cannot see it. The field is labelled, because an unlabelled input is
 * unreachable by a screen reader — but "command" is what it is, and a prompt
 * that explained itself would be a sign on the door. A wrong entry closes
 * silently: telling somebody they were close is telling them there is something
 * to be close to.
 */
function GatePrompt({ onDismiss }: { onDismiss: () => void }) {
  const unlocked = useGateUnlocked();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [entry, setEntry] = useState("");
  // Generated rather than written down: a hardcoded `id` can collide with the
  // page underneath, and it is one more word in the DOM naming what this is.
  const fieldId = useId();

  // Before paint, so the dialog does not render in the page for a frame on its
  // way to the top layer. `showModal` also moves focus, which is the browser's
  // job here and not ours: first focusable child, which is the field.
  useIsomorphicLayoutEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  // One close path for all four ways out — Escape, the button, a correct entry,
  // a wrong one — because `close` fires for every one of them and the state
  // that unmounts this lives above. Native `<dialog>` restores focus to
  // whatever had it before, so nothing has to be remembered here.
  const close = () => dialogRef.current?.close();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // An empty submission is not an attempt at anything, and treating it as one
    // is how the prompt closed itself the instant it opened. `GateEntry` cancels
    // the keydown that opens this so the stray `keypress` never arrives; this is
    // the second lock on the same door, because that cancellation is a browser
    // behaviour rather than something this code can enforce. Escape and Close
    // are still the ways out.
    if (entry.trim() === "") return;
    if (entry.trim() === GATE_SEQUENCE) unlockGate();
    close();
  }

  return (
    <dialog
      ref={dialogRef}
      data-prompt=""
      onClose={onDismiss}
      aria-label="Command"
      style={dialogStyle}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: "dialog[data-prompt]::backdrop{background:rgba(0,0,0,.32)}",
        }}
      />

      {unlocked ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={labelStyle}>Unlocked in this browser.</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              style={primaryButtonStyle}
              onClick={() => {
                lockGate();
                close();
              }}
            >
              Lock
            </button>
            <button type="button" style={buttonStyle} onClick={close}>
              Close
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label htmlFor={fieldId} style={labelStyle}>
            Command
          </label>
          <input
            id={fieldId}
            type="text"
            value={entry}
            onChange={(event) => setEntry(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            style={inputStyle}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" style={primaryButtonStyle}>
              Run
            </button>
            <button type="button" style={buttonStyle} onClick={close}>
              Close
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}

/**
 * Plain inline styles rather than the site tokens. The top layer is not inside
 * `[data-site]`, so `var(--site-ink)` and its neighbours resolve to nothing up
 * here, and this has to look the same on the dark run chrome as on the light
 * landing page.
 */
const dialogStyle: CSSProperties = {
  margin: "auto",
  padding: "16px",
  minWidth: "260px",
  border: "1px solid rgba(0,0,0,.18)",
  borderRadius: "10px",
  background: "#ffffff",
  color: "#000000",
  fontFamily: "system-ui,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  fontSize: "14px",
  boxShadow: "0 12px 32px rgba(0,0,0,.18)",
};

const labelStyle: CSSProperties = {
  margin: 0,
  fontSize: "13px",
  color: "#3d3d3d",
};

const inputStyle: CSSProperties = {
  height: "34px",
  padding: "0 10px",
  border: "1px solid rgba(0,0,0,.28)",
  borderRadius: "6px",
  background: "#ffffff",
  color: "#000000",
  fontSize: "14px",
  // Every numeric in this product is tabular, including this one.
  fontVariantNumeric: "tabular-nums",
};

const buttonStyle: CSSProperties = {
  height: "32px",
  padding: "0 12px",
  border: "1px solid rgba(0,0,0,.22)",
  borderRadius: "6px",
  background: "#ffffff",
  color: "#000000",
  fontSize: "13px",
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "#000000",
  color: "#ffffff",
  borderColor: "#000000",
};
