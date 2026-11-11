import type { BomLine, PriceLadder, PurchaseItem } from "../types.ts"

export type QuoteLine = BomLine & {
  perBoard: number
  need: number
  buy: number
  unit: number | null
  cost: number | null
}

export const quoteLine = (
  line: BomLine,
  ladder: PriceLadder,
  boards: number,
): QuoteLine => {
  const perBoard = line.refs.length
  const need = perBoard * boards
  const [moq] = ladder[0] ?? [0]
  const buy = Math.max(need, moq)
  const tier = ladder.findLast(([qty]) => qty <= buy) ?? ladder[0]

  return {
    ...line,
    perBoard,
    need,
    buy,
    unit: tier ? tier[1] : null,
    cost: tier ? buy * tier[1] : null,
  }
}

export const purchaseCost = (items: PurchaseItem[], boards: number) =>
  items.reduce((sum, i) => sum + (i.usd ?? 0) * i.qty * boards, 0)

export const usd = (n: number) => `$${n.toFixed(2)}`
