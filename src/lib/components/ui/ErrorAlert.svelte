<script lang="ts">
let { message }: { message: string | null } = $props()
</script>

{#if message}
  <div role="alert" class="alert alert-error alert-soft mt-2 text-sm">
    {message}
  </div>
{/if}
