export type RolePart = {
  ref: string
  value: string
  footprint: string
  mpn: string
  at: [number, number]
  pads: { number: string; net: string }[]
}

export type Role = {
  nets: string[]
  category: string
  purpose: string
  block?: string
}

const CATEGORIES: Record<string, string> = {
  C: "커패시터",
  R: "저항",
  L: "인덕터",
  FB: "페라이트 비드",
  D: "다이오드",
  LED: "LED",
  Q: "트랜지스터",
  U: "IC",
  IC: "IC",
  J: "커넥터",
  P: "커넥터",
  CN: "커넥터",
  F: "퓨즈",
  SW: "스위치",
  S: "스위치",
  Y: "크리스털",
  X: "크리스털",
  BT: "배터리",
  TP: "테스트 포인트",
  H: "고정 구멍",
  MH: "고정 구멍",
  K: "릴레이",
  T: "트랜스포머",
  FID: "피듀셜",
  ANT: "안테나",
}

const DIODES = [
  { cues: ["LED"], category: "LED" },
  { cues: ["TVS", "SMAJ", "SMBJ", "ESD"], category: "TVS 다이오드" },
  { cues: ["ZENER", "BZT", "BZX", "MMSZ"], category: "제너 다이오드" },
]

const GROUNDS = ["GND", "VSS", "RTN", "GROUND"]

const RAILS = [
  "VCC",
  "VDD",
  "VBUS",
  "VIN",
  "VBAT",
  "VOUT",
  "VPWR",
  "VSYS",
  "PWR",
]

const VOLTAGE = /^(V\d+|V?\d+V\d*)$/

const TICKED = /`[^`]+`/g

const prefixOf = (ref: string) => {
  const end = [...ref].findIndex(c => !(c >= "A" && c <= "Z"))

  return end < 0 ? ref : ref.slice(0, end)
}

const firstSentences = (markdown: string) =>
  markdown
    .split("\n")
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("|") && !line.startsWith("#"))
    .map(line => {
      const marker = line.match(/^(?:[-*]|\d+\.)\s+/)?.[0] ?? ""

      return line.slice(marker.length).split(/(?<=[.!?])\s+/)[0] ?? ""
    })

const notesOf = (markdown: string | null) => {
  const notes = new Map<string, string>()
  const blocks = new Map<string, string>()

  for (const line of markdown?.split("\n") ?? []) {
    const [, label, ...rest] = line.split("|").map(c => c.trim())

    if (!line.trim().startsWith("|") || !label || rest.length === 0) {
      continue
    }

    for (const ref of rest.join(" ").match(TICKED) ?? []) {
      blocks.set(ref.slice(1, -1), label)
    }
  }

  for (const sentence of firstSentences(markdown ?? "")) {
    const ref = sentence.startsWith("`")
      ? sentence.slice(1, sentence.indexOf("`", 1))
      : ""

    const rest = sentence.slice(ref.length + 2)
    const subject = rest.startsWith(" ") ? rest : sentence

    if (ref && !notes.has(ref)) {
      notes.set(ref, subject.replaceAll("`", "").trim())
    }
  }

  return { notes, blocks }
}

export const rolesOf = (
  parts: RolePart[],
  pours: string[],
  markdown: string | null,
) => {
  const { notes, blocks } = notesOf(markdown)
  const netsOf = new Map(
    parts.map(p => [p.ref, [...new Set(p.pads.map(pad => pad.net))]]),
  )
  const partsOn = new Map<string, RolePart[]>()

  for (const part of parts) {
    for (const net of netsOf.get(part.ref) ?? []) {
      partsOn.set(net, [...(partsOn.get(net) ?? []), part])
    }
  }

  const tokens = (net: string) => net.toUpperCase().split(/[^A-Z0-9]+/)

  const isGround = (net: string) =>
    tokens(net).some(t => GROUNDS.some(g => t.endsWith(g)))

  const isPower = (net: string) =>
    !isGround(net) &&
    (pours.includes(net) ||
      tokens(net).some(
        t => VOLTAGE.test(t) || RAILS.some(r => t.startsWith(r)),
      ))

  const isSignal = (net: string) => !isGround(net) && !isPower(net)

  const categoryOf = (part: RolePart) => {
    const prefix = prefixOf(part.ref.toUpperCase())
    const text = [part.ref, part.value, part.footprint, part.mpn]
      .concat(netsOf.get(part.ref) ?? [])
      .join(" ")
      .toUpperCase()
    const diode = DIODES.find(d => d.cues.some(c => text.includes(c)))

    return (prefix === "D" && diode?.category) || CATEGORIES[prefix] || "부품"
  }

  const isIc = (part: RolePart) => categoryOf(part) === "IC"

  const distance = (a: RolePart, b: RolePart) =>
    Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1])

  const nearestIc = (part: RolePart, net: string) =>
    (partsOn.get(net) ?? [])
      .filter(isIc)
      .toSorted((a, b) => distance(a, part) - distance(b, part))[0]?.ref

  const purposeOf = (part: RolePart, category: string) => {
    const nets = netsOf.get(part.ref) ?? []
    const [a = "", b = a] = nets
    const ground = nets.find(isGround)
    const power = nets.find(isPower)
    const signal = nets.find(isSignal)
    const neighbors = (net: string) =>
      (partsOn.get(net) ?? []).filter(p => p.ref !== part.ref)

    switch (category) {
      case "커패시터":
        if (power && ground) {
          return `${nearestIc(part, power) ?? power} 전원 바이패스`
        }

        return signal && (ground || power)
          ? `${signal} 노이즈 필터`
          : `${a}, ${b} 결합`
      case "저항": {
        const led = nets.flatMap(neighbors).find(p => categoryOf(p) === "LED")

        if (led) {
          return `${led.ref} 전류 제한`
        }

        if (signal && power) {
          return `${signal} 풀업`
        }

        return signal && ground ? `${signal} 풀다운` : `${a}, ${b} 사이 연결`
      }
      case "인덕터":
      case "페라이트 비드": {
        const narrow = nets.toSorted(
          (x, y) => neighbors(x).length - neighbors(y).length,
        )[0]
        const ic = narrow && neighbors(narrow).find(isIc)

        return ic ? `${ic.ref} 스위칭 출력` : `${power ?? a} 전원 필터`
      }
      case "LED":
        return "상태 표시"
      case "TVS 다이오드":
      case "제너 다이오드":
        return `${signal ?? power ?? a} 과전압 보호`
      case "다이오드":
        return `${a}, ${b} 사이 연결`
      case "퓨즈":
        return `${power ?? a} 과전류 보호`
      case "테스트 포인트":
        return `${a} 측정`
      case "스위치":
        return `${signal ?? a} 입력`
      case "크리스털": {
        const ic = nets.filter(isSignal).flatMap(neighbors).find(isIc)

        return ic ? `${ic.ref} 클럭` : "클럭"
      }
      case "커넥터":
        return `외부 연결, 네트 ${nets.length}개`
      case "고정 구멍":
        return "기구 고정"
      default: {
        const rails = nets.filter(isPower).slice(0, 3)
        const signals = nets.filter(isSignal).length

        return rails.length
          ? `전원 ${rails.join(", ")}, 신호 ${signals}개`
          : `신호 ${signals}개`
      }
    }
  }

  return new Map(
    parts.map(part => {
      const category = categoryOf(part)
      const block = blocks.get(part.ref)
      const role: Role = {
        nets: netsOf.get(part.ref) ?? [],
        category,
        purpose: notes.get(part.ref) ?? purposeOf(part, category),
        ...(block && { block }),
      }

      return [part.ref, role]
    }),
  )
}
