import { icons as devicon } from "@iconify-json/devicon-plain"
import { icons as logos } from "@iconify-json/logos"
import { icons as lucide } from "@iconify-json/lucide"
import { icons as simpleIcons } from "@iconify-json/simple-icons"
import { icons as thesvg } from "@iconify-json/thesvg"
import { paraglideVitePlugin } from "@inlang/paraglide-js"
import adapter from "@sveltejs/adapter-static"
import { sveltekit } from "@sveltejs/kit/vite"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"
import { iconifyEmbed } from "vite-plugin-iconify-embed"

export default defineConfig({
  clearScreen: false,
  server: {
    port: 1460,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**", "**/build/**", "**/target/**"] },
  },
  plugins: [
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/lib/paraglide",
      strategy: ["localStorage", "preferredLanguage", "baseLocale"],
      emitTsDeclarations: true,
      disableAsyncLocalStorage: true,
    }),
    iconifyEmbed({
      collections: [lucide, simpleIcons, logos, thesvg, devicon],
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
})
