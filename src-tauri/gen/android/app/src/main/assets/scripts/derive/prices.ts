import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import type { LcscInfo, PriceLadder } from "../../src/lib/pcb/types.ts"

type Cached = { at: string; ladder: PriceLadder; info?: LcscInfo }

type LcscDetail = {
  result?: {
    productPriceList?: { ladder: number; usdPrice: number }[]
    encapStandard?: string | null
    catalogName?: string | null
    parentCatalogName?: string | null
    brandNameEn?: string | null
    productIntroEn?: string | null
  }
}

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

const fetchDetail = async (code: string): Promise<Cached> => {
  const response = await fetch(
    `https://wmsc.lcsc.com/ftps/wm/product/detail?productCode=${encodeURIComponent(code)}`,
    { headers: { "user-agent": "Mozilla/5.0" } },
  )
  const { result }: LcscDetail = await response.json()

  return {
    at: new Date().toISOString(),
    ladder: (result?.productPriceList ?? []).map(p => [p.ladder, p.usdPrice]),
    info: {
      package: result?.encapStandard ?? "",
      category: result?.catalogName ?? "",
      group: result?.parentCatalogName ?? "",
      manufacturer: result?.brandNameEn ?? "",
      summary: result?.productIntroEn ?? "",
    },
  }
}

export const lcscParts = async (root: string, codes: string[]) => {
  const file = join(root, ".cache/lcsc-prices.json")
  const cache: Record<string, Cached> = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf-8"))
    : {}
  const fresh = (c: Cached | undefined) =>
    !!c?.info && Date.now() - Date.parse(c.at) < MAX_AGE_MS
  const wanted = [...new Set(codes.filter(Boolean))]

  // LCSC throttles bursts, so lookups stay sequential
  for (const code of wanted.filter(c => !fresh(cache[c]))) {
    const detail = await fetchDetail(code).catch(() => null)

    if (detail) {
      cache[code] = detail
    }
  }

  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(cache))

  return new Map(wanted.map(code => [code, cache[code]]))
}
