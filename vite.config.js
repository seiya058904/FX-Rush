import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));
const PFX = resolve(root, "third_party/pixelfx/src");

// PixelFX is vendored under third_party/pixelfx (see third_party/pixelfx/UPSTREAM.md).
// Effects are loaded lazily and bundled one chunk per PixelFX category, so the first screen
// only pulls the categories it needs and the rest stream in during play.
export default defineConfig({
  base: "./",
  resolve: {
    alias: [
      { find: /^pixelfx$/, replacement: resolve(PFX, "core/index.js") },
      { find: /^pixelfx\/core\/(.*)$/, replacement: resolve(PFX, "core/$1.js") },
    ],
  },
  server: { port: 5173, strictPort: false },
  build: {
    target: "es2022",
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      input: {
        main: resolve(root, "index.html"),
        fxlab: resolve(root, "fxlab.html"),
      },
      output: {
        codeSplitting: {
          groups: [
            {
              debugName: "pfx-category",
              name: (id) => {
                const m = id.replace(/\\/g, "/").match(/third_party\/pixelfx\/src\/fx\/([a-z]+)\//);
                return m ? `pfx-${m[1]}` : null;
              },
              test: /third_party[\\/]pixelfx[\\/]src[\\/]fx[\\/][a-z]+[\\/]/,
            },
            { name: "pfx-core", test: /third_party[\\/]pixelfx[\\/]src[\\/]core[\\/]/ },
          ],
        },
      },
    },
  },
});
