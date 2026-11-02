// Screen and world constants. The game renders at PixelFX's native 320 x 180 (its full-screen weather and
// transitions are authored for exactly that), then scales up with nearest-neighbour filtering.

export const W = 320;
export const H = 180;
/** Hidden margin around the visible screen so screen shake never reveals an empty edge. */
export const M = 4;
export const FW = W + M * 2;
export const FH = H + M * 2;
/** Screen row of the floor line. World y = 0 is the floor, negative y is up (PixelFX's local convention). */
export const FLOOR = 150;
/** Fixed logic step. */
export const STEP = 1 / 60;
/** Longest frame the game will simulate in one go (a longer hitch becomes a short slow-down, never a jump). */
export const MAX_FRAME = 1 / 15;

export const DEV = import.meta.env?.DEV ?? false;
