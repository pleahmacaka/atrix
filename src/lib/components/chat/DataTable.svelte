<script lang="ts">
let { columns, rows }: { columns: string[]; rows: unknown[][] } = $props()
</script>

<div class="max-h-96 overflow-auto">
  <table class="table table-sm tabular-nums">
    <thead>
      <tr>
        {#each columns as column, i (i)}
          <th>{column}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each rows as row, r (r)}
        <tr>
          {#each columns as _, c (c)}
            {@const cell = row[c]}
            <td>{cell === null || cell === undefined ? "" : String(cell)}</td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
