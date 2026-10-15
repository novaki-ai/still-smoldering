export interface InputVector {
  x: number;
  y: number;
}

export class InputManager {
  private keysDown: Set<string> = new Set();
  private dashPressed: boolean = false;
  private overdrivePressed: boolean = false;
  private pausePressed: boolean = false;
  private numberPressed: number | null = null;

  // Touch / Virtual Joystick state
  private touchVector: InputVector = { x: 0, y: 0 };
  private joystickActive: boolean = false;
  private joystickPointerId: number | null = null;
  private joystickOriginX: number = 0;
  private joystickOriginY: number = 0;
  private joystickMaxRadius: number = 48;

  // Gamepad edge tracking
  private prevGamepadDash: boolean = false;
  private prevGamepadOverdrive: boolean = false;
  private prevGamepadPause: boolean = false;
  private prevGamepadCards: boolean[] = [false, false, false];

  // DOM elements for virtual joystick knob visual feedback
  private joystickBaseEl: HTMLElement | null = null;
  private joystickKnobEl: HTMLElement | null = null;

  constructor() {
    this.setupKeyboardListeners();
  }

  private setupKeyboardListeners(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      const code = e.code;
      const key = e.key.toLowerCase();
      this.keysDown.add(code);
      this.keysDown.add(key);

      if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight' || key === ' ') {
        if (!e.repeat) this.dashPressed = true;
      }
      if (code === 'KeyE' || code === 'KeyQ' || code === 'KeyR' || key === 'e' || key === 'q') {
        if (!e.repeat) this.overdrivePressed = true;
      }
      if (code === 'Escape' || code === 'KeyP' || key === 'escape' || key === 'p') {
        if (!e.repeat) this.pausePressed = true;
      }
      if (!e.repeat) {
        if (code === 'Digit1' || key === '1') this.numberPressed = 0;
        if (code === 'Digit2' || key === '2') this.numberPressed = 1;
        if (code === 'Digit3' || key === '3') this.numberPressed = 2;
        if (code === 'Digit4' || key === '4') this.numberPressed = 3;
      }
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      this.keysDown.delete(e.code);
      this.keysDown.delete(e.key.toLowerCase());
    });

    window.addEventListener('blur', () => {
      this.keysDown.clear();
      this.resetJoystick();
    });
  }

  public bindTouchControls(
    joystickZone: HTMLElement,
    joystickBase: HTMLElement,
    joystickKnob: HTMLElement,
    dashBtn: HTMLElement,
    overdriveBtn: HTMLElement
  ): void {
    this.joystickBaseEl = joystickBase;
    this.joystickKnobEl = joystickKnob;

    const startJoystick = (clientX: number, clientY: number, pointerId: number) => {
      const rect = joystickBase.getBoundingClientRect();
      this.joystickActive = true;
      this.joystickPointerId = pointerId;
      this.joystickOriginX = rect.left + rect.width / 2;
      this.joystickOriginY = rect.top + rect.height / 2;
      this.updateJoystickPosition(clientX, clientY);
    };

    const moveJoystick = (clientX: number, clientY: number) => {
      if (!this.joystickActive) return;
      this.updateJoystickPosition(clientX, clientY);
    };

    // Pointer events (handles mouse, pen, and modern touch)
    joystickZone.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      try {
        joystickZone.setPointerCapture(e.pointerId);
      } catch {
        // Ignore capture errors on synthetic events
      }
      startJoystick(e.clientX, e.clientY, e.pointerId);
    });

    joystickZone.addEventListener('pointermove', (e: PointerEvent) => {
      if (!this.joystickActive || (this.joystickPointerId !== null && e.pointerId !== this.joystickPointerId)) return;
      e.preventDefault();
      moveJoystick(e.clientX, e.clientY);
    });

    const endPointer = (e: PointerEvent) => {
      if (this.joystickPointerId !== null && e.pointerId !== this.joystickPointerId) return;
      this.resetJoystick();
    };
    joystickZone.addEventListener('pointerup', endPointer);
    joystickZone.addEventListener('pointercancel', endPointer);

    // Explicit TouchEvents fallback for older mobile Safari / synthetic touch dispatch
    joystickZone.addEventListener(
      'touchstart',
      (e: TouchEvent) => {
        if (e.changedTouches.length > 0) {
          const t = e.changedTouches[0];
          startJoystick(t.clientX, t.clientY, t.identifier);
        }
      },
      { passive: true }
    );

    joystickZone.addEventListener(
      'touchmove',
      (e: TouchEvent) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (this.joystickPointerId === null || t.identifier === this.joystickPointerId) {
            moveJoystick(t.clientX, t.clientY);
            break;
          }
        }
      },
      { passive: true }
    );

    joystickZone.addEventListener(
      'touchend',
      () => {
        this.resetJoystick();
      },
      { passive: true }
    );

    dashBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.dashPressed = true;
    });

    overdriveBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.overdrivePressed = true;
    });
  }

  private updateJoystickPosition(clientX: number, clientY: number): void {
    const dx = clientX - this.joystickOriginX;
    const dy = clientY - this.joystickOriginY;
    const dist = Math.hypot(dx, dy);
    const maxR = this.joystickMaxRadius;

    if (dist < 4) {
      this.touchVector.x = 0;
      this.touchVector.y = 0;
      if (this.joystickKnobEl) {
        this.joystickKnobEl.style.transform = `translate(0px, 0px)`;
      }
      return;
    }

    const clampedDist = Math.min(dist, maxR);
    const nx = dx / dist;
    const ny = dy / dist;
    const strength = clampedDist / maxR;

    this.touchVector.x = nx * strength;
    this.touchVector.y = ny * strength;

    if (this.joystickKnobEl) {
      const kx = nx * clampedDist;
      const ky = ny * clampedDist;
      this.joystickKnobEl.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px)`;
    }
    if (this.joystickBaseEl) {
      this.joystickBaseEl.classList.add('active');
    }
  }

  public resetJoystick(): void {
    this.joystickActive = false;
    this.joystickPointerId = null;
    this.touchVector.x = 0;
    this.touchVector.y = 0;
    if (this.joystickKnobEl) {
      this.joystickKnobEl.style.transform = `translate(0px, 0px)`;
    }
    if (this.joystickBaseEl) {
      this.joystickBaseEl.classList.remove('active');
    }
  }

  public pollGamepad(): InputVector {
    const out: InputVector = { x: 0, y: 0 };
    if (typeof navigator.getGamepads !== 'function') return out;

    try {
      const pads = navigator.getGamepads();
      for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        if (!pad || !pad.connected) continue;

        let gx = pad.axes[0] || 0;
        let gy = pad.axes[1] || 0;
        if (Math.hypot(gx, gy) < 0.16) {
          gx = 0;
          gy = 0;
        }

        // D-pad buttons 12 (Up), 13 (Down), 14 (Left), 15 (Right)
        if (pad.buttons[12]?.pressed) gy -= 1;
        if (pad.buttons[13]?.pressed) gy += 1;
        if (pad.buttons[14]?.pressed) gx -= 1;
        if (pad.buttons[15]?.pressed) gx += 1;

        if (gx !== 0 || gy !== 0) {
          const len = Math.hypot(gx, gy);
          out.x = len > 1 ? gx / len : gx;
          out.y = len > 1 ? gy / len : gy;
        }

        // Dash: A (0), B (1), RB (5)
        const dashNow = Boolean(pad.buttons[0]?.pressed || pad.buttons[1]?.pressed || pad.buttons[5]?.pressed);
        if (dashNow && !this.prevGamepadDash) {
          this.dashPressed = true;
        }
        this.prevGamepadDash = dashNow;

        // Overdrive: X (2), Y (3), LB (4)
        const odNow = Boolean(pad.buttons[2]?.pressed || pad.buttons[3]?.pressed || pad.buttons[4]?.pressed);
        if (odNow && !this.prevGamepadOverdrive) {
          this.overdrivePressed = true;
        }
        this.prevGamepadOverdrive = odNow;

        // Pause: Start (9)
        const pauseNow = Boolean(pad.buttons[9]?.pressed);
        if (pauseNow && !this.prevGamepadPause) {
          this.pausePressed = true;
        }
        this.prevGamepadPause = pauseNow;

        // Level-up card quick select with D-Pad Left / Up / Right
        const cardBtns = [
          Boolean(pad.buttons[14]?.pressed),
          Boolean(pad.buttons[12]?.pressed),
          Boolean(pad.buttons[15]?.pressed),
        ];
        for (let c = 0; c < 3; c++) {
          if (cardBtns[c] && !this.prevGamepadCards[c]) {
            this.numberPressed = c;
          }
          this.prevGamepadCards[c] = cardBtns[c];
        }

        break;
      }
    } catch {
      // Ignore gamepad permission errors
    }

    return out;
  }

  public getMovementVector(): InputVector {
    let kx = 0;
    let ky = 0;

    if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft') || this.keysDown.has('a') || this.keysDown.has('arrowleft')) {
      kx -= 1;
    }
    if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight') || this.keysDown.has('d') || this.keysDown.has('arrowright')) {
      kx += 1;
    }
    if (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp') || this.keysDown.has('w') || this.keysDown.has('arrowup')) {
      ky -= 1;
    }
    if (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown') || this.keysDown.has('s') || this.keysDown.has('arrowdown')) {
      ky += 1;
    }

    if (kx !== 0 || ky !== 0) {
      const len = Math.hypot(kx, ky);
      return { x: kx / len, y: ky / len };
    }

    if (this.joystickActive || Math.hypot(this.touchVector.x, this.touchVector.y) > 0.05) {
      return { x: this.touchVector.x, y: this.touchVector.y };
    }

    return this.pollGamepad();
  }

  public consumeDash(): boolean {
    const val = this.dashPressed;
    this.dashPressed = false;
    return val;
  }

  public consumeOverdrive(): boolean {
    const val = this.overdrivePressed;
    this.overdrivePressed = false;
    return val;
  }

  public consumePause(): boolean {
    const val = this.pausePressed;
    this.pausePressed = false;
    return val;
  }

  public consumeNumberKey(): number | null {
    const val = this.numberPressed;
    this.numberPressed = null;
    return val;
  }

  public triggerDash(): void {
    this.dashPressed = true;
  }

  public triggerOverdrive(): void {
    this.overdrivePressed = true;
  }
}
