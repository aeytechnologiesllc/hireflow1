/**
 * Haptic feedback utilities for mobile devices
 * Uses navigator.vibrate() API which is supported on Android Chrome and some browsers
 * Falls back gracefully on unsupported devices (iOS Safari, desktop)
 */

const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;

/**
 * Check if the current device is likely a touch device
 */
const isTouchDevice = () => {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
};

/**
 * Light haptic feedback - for button taps, minor interactions
 * Duration: 10ms
 */
export function hapticLight(): void {
  if (canVibrate && isTouchDevice()) {
    navigator.vibrate(10);
  }
}

/**
 * Medium haptic feedback - for confirmations, toggle switches
 * Duration: 25ms
 */
export function hapticMedium(): void {
  if (canVibrate && isTouchDevice()) {
    navigator.vibrate(25);
  }
}

/**
 * Heavy haptic feedback - for important actions, errors
 * Duration: 50ms
 */
export function hapticHeavy(): void {
  if (canVibrate && isTouchDevice()) {
    navigator.vibrate(50);
  }
}

/**
 * Success haptic pattern - two quick pulses
 * Pattern: 15ms vibrate, 50ms pause, 15ms vibrate
 */
export function hapticSuccess(): void {
  if (canVibrate && isTouchDevice()) {
    navigator.vibrate([15, 50, 15]);
  }
}

/**
 * Error haptic pattern - three short bursts
 * Pattern: 30ms vibrate, 30ms pause, 30ms vibrate, 30ms pause, 30ms vibrate
 */
export function hapticError(): void {
  if (canVibrate && isTouchDevice()) {
    navigator.vibrate([30, 30, 30, 30, 30]);
  }
}

/**
 * Custom haptic pattern
 * @param pattern - Array of vibration/pause durations in ms
 */
export function hapticPattern(pattern: number[]): void {
  if (canVibrate && isTouchDevice()) {
    navigator.vibrate(pattern);
  }
}
