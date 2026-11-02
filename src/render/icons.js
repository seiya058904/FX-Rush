// Skill icons: 12 x 12 pixel sprites, drawn once per color into small canvases.
// k ink, 1 dark, 2 mid, 3 light, 4 white-hot, w a fixed off-white.

const ICONS = {
  blade: [
    "........kk..",
    "......kk34k.",
    ".....k344k..",
    "....k343k...",
    "...k333k....",
    "..k332k.....",
    ".k322k......",
    "k221k.......",
    "k21k........",
    ".kk.........",
    "............",
    "............",
  ],
  chain: [
    "......kkkk..",
    ".....k443k..",
    "....k443k...",
    "...k443k....",
    "..k4433kkk..",
    ".kk44433k...",
    "...kk43k....",
    "....k3k.....",
    "...k32k.....",
    "...k2k......",
    "..k1k.......",
    "..kk........",
  ],
  inferno: [
    ".....k......",
    "....k3k.....",
    "....k32k..k.",
    "...k322k.k3k",
    "..k3223kk32k",
    "..k32443k22k",
    ".k3244443k2k",
    ".k3244443k1k",
    ".k2234432kk.",
    "..k223322k..",
    "...kk11kk...",
    ".....kk.....",
  ],
  frost: [
    ".....k......",
    ".k..k4k..k..",
    "k3k.k3k.k3k.",
    ".k3kk3kk3k..",
    "..kk444kk...",
    "kk334w433kk.",
    "..kk444kk...",
    ".k3kk3kk3k..",
    "k3k.k3k.k3k.",
    ".k..k4k..k..",
    ".....k......",
    "............",
  ],
  missile: [
    "............",
    "........kk..",
    ".......k44k.",
    "......k4w43k",
    "....kk34443k",
    "..kk2233k3k.",
    ".k1122kk.k..",
    "k1122k......",
    ".kk1k.......",
    "...k........",
    "............",
    "............",
  ],
  vortex: [
    "...kkkkk....",
    "..k22222k...",
    ".k2kkkkk2k..",
    "k2k33333k2k.",
    "k2k3kkk3k2k.",
    "k2k3k4k3k2k.",
    "k2k3k4kk2k..",
    "k2k33kk2k...",
    ".k2kkk22k...",
    "..k22222k...",
    "...kkkkk....",
    "............",
  ],
  aegis: [
    ".kkkkkkkkk..",
    "k333434333k.",
    "k334444433k.",
    "k333434333k.",
    "k333434333k.",
    "k223333322k.",
    ".k2233322k..",
    ".k2223222k..",
    "..k22222k...",
    "...k222k....",
    "....kkk.....",
    "............",
  ],
  meteor: [
    "k...........",
    ".k3.........",
    "..k32.......",
    "...k322.....",
    "....k32kkk..",
    ".....kk1112k",
    "......k1w12k",
    "......k1112k",
    "......k2221k",
    ".......kkkk.",
    "............",
    "............",
  ],
  thunder: [
    "...kkkkk....",
    ".kk22222kk..",
    "k2233333322k",
    "k1222222221k",
    ".kk1kkkk1kk.",
    "....k44k....",
    "...k44k.....",
    "..k4444k....",
    "....k44k....",
    "...k4k......",
    "...kk.......",
    "............",
  ],
  holy: [
    ".....kk.....",
    "..k..k4k..k.",
    "...k.k4k.k..",
    "....kk4kk...",
    ".kkkk444kkkk",
    "k44444w44444",
    ".kkkk444kkkk",
    "....kk4kk...",
    "...k.k4k.k..",
    "..k..k4k..k.",
    ".....kk.....",
    "............",
  ],
  earth: [
    "....k.......",
    "...k3k......",
    "...k32k..k..",
    "..k332k.k3k.",
    "..k322kk32k.",
    ".k3322k3322k",
    ".k3221k3221k",
    "k33221k32211",
    "k22211k22111",
    "kkkkkkkkkkkk",
    "k1111111111k",
    "kkkkkkkkkkkk",
  ],
  plague: [
    "...kkkkkk...",
    "..k333333k..",
    ".k33333333k.",
    ".k3kk33kk3k.",
    ".k3k4k3k4k3.",
    ".k33kk33kk3k",
    "..k33k33k3k.",
    "...k3333k...",
    "...kk2k2kk..",
    "..k2.k2k.2k.",
    "..k1..k..1k.",
    "...k.....k..",
  ],
  fury: [
    "............",
    "..k...k.....",
    ".k3k.k3k....",
    "k343k343k...",
    ".k343k343k..",
    "..k343k343k.",
    ".k343k343k..",
    "k343k343k...",
    ".k3k.k3k....",
    "..k...k.....",
    "............",
    "............",
  ],
  edge: [
    "..........kk",
    ".........k4k",
    "........k43k",
    ".......k43k.",
    "......k43k..",
    ".....k43k...",
    "..kkk43k....",
    "..k232k.....",
    "...k2k......",
    "..k1k2k.....",
    ".k1k.kk.....",
    ".kk.........",
  ],
  vigor: [
    "............",
    ".kkk...kkk..",
    "k344k.k333k.",
    "k3443k33332k",
    "k3333333332k",
    "k3333333322k",
    ".k33333322k.",
    "..k333322k..",
    "...k3322k...",
    "....k32k....",
    ".....kk.....",
    "............",
  ],
  vamp: [
    "............",
    "..kkkkkkkk..",
    ".k22222222k.",
    "k2222222222k",
    "k2k4k22k4k2k",
    "k2k44kk44k2k",
    ".k.k4kk4k.k.",
    "....k33k....",
    "....k33k....",
    ".....33.....",
    ".....k3k....",
    "......k.....",
  ],
  greed: [
    "...kkkkkk...",
    "..k333333k..",
    ".k33444433k.",
    "k3334kk4333k",
    "k3333kk43332",
    "k3334kk43332",
    "k3333kk43332",
    "k3334kk4333k",
    ".k23444432k.",
    "..k222222k..",
    "...kkkkkk...",
    "............",
  ],
  might: [
    "............",
    "...kkkkk....",
    "..k33333k...",
    ".k3343433k..",
    ".k3333333k..",
    ".k3333333kk.",
    ".k22333332k.",
    ".k2222222k..",
    "..k22222k...",
    "..k11111k...",
    "..kkkkkkk...",
    "............",
  ],
};

const cache = new Map();
function hexToRgb(h) {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const shade = ([r, g, b], k) => (k < 1 ? [r * k, g * k, b * k] : [r + (255 - r) * (k - 1), g + (255 - g) * (k - 1), b + (255 - b) * (k - 1)]).map((v) => Math.round(Math.max(0, Math.min(255, v))));

/** A canvas with the icon in a color (the color is the "3" tone). */
export function icon(name, color, dim = false) {
  const key = name + color + dim;
  if (cache.has(key)) return cache.get(key);
  const rows = ICONS[name] ?? ICONS.might;
  const cv = document.createElement("canvas");
  cv.width = 12;
  cv.height = 12;
  const c = cv.getContext("2d"), id = c.createImageData(12, 12);
  const base = hexToRgb(color);
  const pal = { k: [10, 8, 16], 1: shade(base, 0.35), 2: shade(base, 0.62), 3: base, 4: shade(base, 1.6), w: [255, 250, 240] };
  rows.forEach((r, y) =>
    [...r].forEach((ch, x) => {
      const p = pal[ch];
      if (!p) return;
      let [R, G, B] = p;
      if (dim && ch !== "k") [R, G, B] = [R * 0.4 + 20, G * 0.4 + 20, B * 0.4 + 24];
      const j = (y * 12 + x) * 4;
      id.data[j] = R;
      id.data[j + 1] = G;
      id.data[j + 2] = B;
      id.data[j + 3] = 255;
    }),
  );
  c.putImageData(id, 0, 0);
  cache.set(key, cv);
  return cv;
}
