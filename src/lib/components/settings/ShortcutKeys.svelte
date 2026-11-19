<script lang="ts">
let { keys }: { keys: string[] } = $props()
</script>

{#each keys as key, i (`${i}:${key}`)}
  <kbd class="kbd kbd-sm font-sans tabular-nums">{key}</kbd>
{/each}