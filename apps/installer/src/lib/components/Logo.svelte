<script lang="ts">
import type { ClassValue } from "svelte/elements"

let { class: extra }: { class?: ClassValue } = $props()

const fill = $props.id()
</script>

<svg class={extra} viewBox="0 0 1024 1024" aria-hidden="true">
  <defs>
    <linearGradient id={fill} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#A07BE8" />
      <stop offset="1" stop-color="#5B2BC4" />
    </linearGradient>
  </defs>
  <rect x="64" y="64" width="896" height="896" rx="224" fill="url(#{fill})" />
  <path
    d="M332 744V492a180 180 0 0 1 360 0v252"
    fill="none"
    stroke="#fff"
    stroke-width="112"
    stroke-linecap="round"
  />
  <circle cx="512" cy="584" r="64" fill="#fff" />
</svg>
