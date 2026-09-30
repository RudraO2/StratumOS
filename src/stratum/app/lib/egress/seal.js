/**
 * The seal — one boolean the egress denial waterfall consults before it
 * refuses anything. Ported from the prototype's `egress/seal.js`: CLOSED at
 * boot, never persisted, opening and closing both recorded on the session log.
 * The RPC channel is gone; the store calls `setSealed` directly.
 */

/** The session-log event recording an operator opening or closing the seal. */
export const SEAL_EVENT = "egress/seal";

let closed = true;

/** Is the seal closed? The waterfall asks this before it refuses anything. */
export function isSealed() {
	return closed;
}

/**
 * Set the seal directly.
 * @param {boolean} next - true to close the seal, false to open it.
 * @returns {boolean} the state after the change.
 */
export function setSealed(next) {
	closed = next !== false;
	return closed;
}
