// Witnessed rewrite, 23 Nov 2026: this file's final content was last touched by the recorded agent session.
// Azure Cove — keyboard and mouse input. Held keys steer and drive; one-shot
// presses (interact, shoot, pause, radio, confirm) are queued as flags and taken
// once by the loop, so a press between two frames is never lost or counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let interactPressed = false;
  let shootPressed = false;
  let radioPressed = false;
  let mutePressed = false;
  let exitPressed = false;

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') event.preventDefault();
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'Enter') actions |= ACTION_CONFIRM;
    else if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    else if (event.code === 'KeyE') interactPressed = true;
    else if (event.code === 'KeyQ') exitPressed = true;
    else if (event.code === 'KeyR') radioPressed = true;
    else if (event.code === 'KeyM') mutePressed = true;
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('pointerdown', () => { shootPressed = true; });

  function held(...codes) { return codes.some((c) => keys.has(c)); }

  return {
    /** The driving / walking input for one fixed step. */
    read() {
      return {
        forward: held('KeyW', 'ArrowUp'),
        back: held('KeyS', 'ArrowDown'),
        left: held('KeyA', 'ArrowLeft'),
        right: held('KeyD', 'ArrowRight'),
        run: held('ShiftLeft', 'ShiftRight'),
        brake: held('Space'),
        interact: interactPressed,
        exit: exitPressed,
        shoot: shootPressed,
      };
    },
    /** Clear the one-shot flags after the loop has read them. */
    clearOneShots() {
      interactPressed = false;
      shootPressed = false;
      exitPressed = false;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    takeRadio() {
      const taken = radioPressed;
      radioPressed = false;
      return taken;
    },
    takeMute() {
      const taken = mutePressed;
      mutePressed = false;
      return taken;
    },
  };
}
