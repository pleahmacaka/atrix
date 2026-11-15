<script lang="ts">
import { createQuery } from "@tanstack/svelte-query"
import { z } from "zod"
import { m } from "#lib/paraglide/messages.js"
import { persisted } from "#lib/store/stored.svelte.ts"
import { lcscUrl } from "../bom/bom.ts"
import { loadDerived, type Outputs } from "../derived.ts"
import { type BomLine, DERIVED, type Pcb, type PriceLadder, type PurchaseItem } from "../types.ts"
import { purchaseCost, quoteLine, usd } from "./quote.ts"

type Board = { key: string; label: string; outputs: Outputs }

let { boards, storageKey }: { boards: Board[]; storageKey: string } = $props()

const saved = () => persisted(storageKey, {}, z.record(z.string(), z.number()))

let counts = $state(saved())

const countOf = (key: string) => counts[key] ?? 1

const setCount = (key: string, value: number) => {
  counts = { ...counts, [key]: Math.max(0, Math.floor(Number.isFinite(value) ? value : 0)) }
  localStorage.setItem(storageKey, JSON.stringify(counts))
}

const data = createQuery(() => ({
  queryKey: ["quote", ...boards.map(b => b.outputs.manifest.source.sha256)],
  queryFn: () =>
    Promise.all(
      boards.map(async b => {
        const [bom, prices, purchase, pcb] = await Promise.all([
          loadDerived<BomLine[]>(b.outputs, DERIVED.bom),
          loadDerived<Record<string, PriceLadder>>(b.outputs, DERIVED.prices),
          loadDerived<PurchaseItem[]>(b.outputs, DERIVED.purchase),
          loadDerived<Pcb>(b.outputs, DERIVED.pcb),
        ])

        return { ...b, bom: bom ?? [], prices: prices ?? {}, purchase: purchase ?? [], pcb }
      }),
    ),
  staleTime: Number.POSITIVE_INFINITY,
}))

const sections = $derived(
  (data.data ?? []).map(b => {
    const count = countOf(b.key)
    const lines = b.bom.map(l => quoteLine(l, b.prices[l.lcsc] ?? [], count))
    const parts = lines.reduce((sum, l) => sum + (l.cost ?? 0), 0)
    const extra = purchaseCost(b.purchase, count)
    const box = b.pcb?.dims.board

    return {
      ...b,
      count,
      lines,
      parts,
      extra,
      missing: lines.filter(l => l.cost === null).length,
      size: box ? `${(box.max[0] - box.min[0]).toFixed(1)} × ${(box.max[1] - box.min[1]).toFixed(1)} mm` : null,
      copper: b.pcb?.layers.filter(l => l.endsWith(".Cu")).length ?? null,
    }
  }),
)

const total = $derived(sections.reduce((sum, s) => sum + s.parts + s.extra, 0))
</script>

<div class="flex size-full min-h-0 flex-col">
  <div class="min-h-0 flex-1 overflow-y-auto">
    {#if data.isPending}
      <div class="flex flex-col gap-2 p-4" aria-busy="true">
        <div class="skeleton h-8 w-1/3"></div>
        <div class="skeleton h-40 w-full"></div>
      </div>
    {/if}
    {#each sections as s (s.key)}
      <section class="border-b border-base-300">
        <header class="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-base-100 px-4 py-2">
          <h3 class="text-sm font-semibold">{s.label}</h3>
          <span class="text-xs text-base-content/60 tabular-nums">
            {[s.copper && m.pcb_quote_layers({ count: s.copper }), s.size].filter(Boolean).join(", ")}
          </span>
          <label class="ml-auto flex items-center gap-2 text-sm">
            {m.pcb_quote_qty()}
            <input
              type="number"
              min="0"
              class="input input-sm w-24 tabular-nums"
              value={s.count}
              oninput={e => setCount(s.key, e.currentTarget.valueAsNumber)}
            />
          </label>
        </header>
        <div class="overflow-x-auto px-4">
          <table class="table table-xs tabular-nums">
            <thead>
              <tr>
                <th>{m.pcb_quote_value()}</th>
                <th>{m.pcb_bom_package()}</th>
                <th class="text-right">{m.pcb_quote_per_board()}</th>
                <th class="text-right">{m.pcb_quote_need()}</th>
                <th class="text-right">{m.pcb_quote_buy()}</th>
                <th class="text-right">{m.pcb_quote_unit()}</th>
                <th class="text-right">{m.pcb_quote_amount()}</th>
                <th>LCSC</th>
              </tr>
            </thead>
            <tbody>
              {#each s.lines as l (`${l.lcsc}|${l.value}|${l.package}`)}
                <tr>
                  <td>{l.value}</td>
                  <td class="text-base-content/60">{l.package}</td>
                  <td class="text-right">{l.perBoard}</td>
                  <td class="text-right">{l.need}</td>
                  <td class={["text-right", l.buy > l.need && "text-warning"]}>{l.buy}</td>
                  <td class="text-right">{l.unit === null ? "-" : `$${l.unit}`}</td>
                  <td class="text-right">{l.cost === null ? m.pcb_quote_unknown() : usd(l.cost)}</td>
                  <td>
                    {#if l.lcsc}
                      <a class="link link-hover" href={lcscUrl(l.lcsc)} target="_blank" rel="noreferrer">{l.lcsc}</a>
                    {:else}
                      <span class="text-base-content/50">{m.pcb_bom_consigned()}</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if s.purchase.length > 0}
          <div class="flex flex-col gap-1 px-4 pt-4">
            <h4 class="text-xs font-semibold text-base-content/70">{m.pcb_quote_extra()}</h4>
            <ul class="flex flex-col gap-1 text-sm">
              {#each s.purchase as p (p.name)}
                <li class="flex gap-2 tabular-nums">
                  {#if p.url}
                    <a class="link link-hover" href={p.url} target="_blank" rel="noreferrer">{p.name}</a>
                  {:else}
                    <span>{p.name}</span>
                  {/if}
                  <span class="text-base-content/60">× {p.qty * s.count}</span>
                  {#if p.note}<span class="text-base-content/50">{p.note}</span>{/if}
                  <span class="ml-auto">{p.usd === undefined ? m.pcb_quote_no_price() : usd(p.usd * p.qty * s.count)}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
        <dl class="grid grid-cols-2 gap-x-4 gap-y-1 p-4 text-sm tabular-nums">
          <dt class="text-base-content/60">{m.pcb_quote_parts()}</dt>
          <dd class="text-right">{usd(s.parts)}{s.missing ? `, ${m.pcb_quote_missing({ count: s.missing })}` : ""}</dd>
          {#if s.purchase.length > 0}
            <dt class="text-base-content/60">{m.pcb_quote_extra()}</dt>
            <dd class="text-right">{usd(s.extra)}</dd>
          {/if}
          <dt class="text-base-content/60">{m.pcb_quote_fab()}</dt>
          <dd class="text-right">
            <a class="link link-hover" href="https://cart.jlcpcb.com/quote" target="_blank" rel="noreferrer">{m.pcb_quote_jlc()}</a>
          </dd>
        </dl>
      </section>
    {/each}
  </div>
  <footer class="flex shrink-0 items-baseline gap-2 border-t border-base-300 px-4 py-2 tabular-nums">
    <span class="text-sm text-base-content/60">{m.pcb_quote_total()}</span>
    <span class="ml-auto text-lg font-bold">{usd(total)}</span>
  </footer>
</div>
