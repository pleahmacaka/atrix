import { icons as lucide } from "@iconify-json/lucide"
import adapter from "@sveltejs/adapter-static"
import { sveltekit } from "@sveltejs/kit/vite"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"
import { iconifyEmbed } from "vite-plugin-iconify-embed"

export default defineConfig({
  plugins: [
    iconifyEmbed({
      collections: [lucide],
      scan: ["src"],
    }),
    tailwindcss(),
    sveltekit({
      compilerOptions: {
        runes: ({ filename }) =>
          filename.includes("node_modules") ? undefined : true,
      },

      adapter: adapter(),
    }),
  ],

  clearScreen: false,

  server: {
    port: 1470,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
})
