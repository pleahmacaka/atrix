<script lang="ts">
import { m } from "#lib/paraglide/messages.js"
import type { Stackup, StackupLayer } from "../types.ts"

let { stackup }: { stackup: Stackup } = $props()

const SWATCH: Record<StackupLayer["kind"], string> = {
  mask: "bg-success/60 h-1",
  copper: "bg-warning h-2",
  dielectric: "bg-base-300 h-4",
}

const mm = (value: number | null) => (value === null ? "" : value.toString())

const deviation = (calculated: number, target: number) => {
  const percent = Math.round(((calculated - target) / target) * 100)

  return `${percent > 0 ? "+" : ""}${percent}%`
}
</script>

<div class="h-full overflow-auto">
  <div class="mx-auto flex max-w-4xl flex-col gap-8 p-6">
    <section class="flex flex-col gap-2">
      <h2 class="text-sm font-semibold">Stackup</h2>
      <div class="overflow-x-auto rounded-box border border-base-300">
        <table class="table table-sm tabular-nums">
          <thead>
            <tr>
              <th class="w-16"></th>
              <th>Layer</th>
              <th>Name</th>
              <th>Material</th>
              <th>Cu</th>
              <th class="text-right">mm</th>
              <th class="text-right">Er</th>
            </tr>
          </thead>
          <tbody>
            {#each stackup.layers as row, index (index)}
              <tr>
                <td><div class={["w-12 rounded-full", SWATCH[row.kind]]}></div></td>
                <td>{row.layer ?? ""}</td>
                <td>{row.name}</td>
                <td>{row.material}</td>
                <td>{row.cu}</td>
                <td class="text-right">{mm(row.mm)}</td>
                <td class="text-right">{row.er ?? ""}</td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr>
              <td></td>
              <td colspan="4">Total</td>
              <td class="text-right">{stackup.total}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>

    <section class="flex flex-col gap-2">
      <h2 class="text-sm font-semibold">Impedance</h2>
      {#if stackup.lines.length > 0}
        <div class="overflow-x-auto rounded-box border border-base-300">
          <table class="table table-sm tabular-nums">
            <thead>
              <tr>
                <th>Line</th>
                <th>Layer</th>
                <th>Reference</th>
                <th class="text-right">W1</th>
                <th class="text-right">S1</th>
                <th class="text-right">D1</th>
                <th class="text-right">Target</th>
                <th class="text-right">Calc</th>
                <th class="text-right">Dev</th>
              </tr>
            </thead>
            <tbody>
              {#each stackup.lines as line, index (index)}
                <tr>
                  <td class="whitespace-nowrap">{line.name}</td>
                  <td>{line.layer}</td>
                  <td>{line.reference}</td>
                  <td class="text-right">{line.width}</td>
                  <td class="text-right">{mm(line.space)}</td>
                  <td class="text-right">{mm(line.gnd)}</td>
                  <td class="text-right">{line.target}</td>
                  <td class="text-right">{line.calculated}</td>
                  <td class="text-right">{deviation(line.calculated, line.target)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <p class="text-xs text-base-content/60">
          {m.pcb_stackup_legend()}
        </p>
      {:else}
        <p class="text-sm text-base-content/60">{m.pcb_stackup_none()}</p>
      {/if}
    </section>
  </div>
</div>
