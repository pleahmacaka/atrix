import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { userInfo } from "node:os"
import { dirname, join } from "node:path"
import { strToU8, zipSync } from "fflate"
import {
  DERIVED,
  type ZephyrNode,
  type ZephyrReport,
  type ZephyrUnresolved,
} from "../../src/lib/pcb/types.ts"
import { type Context, run } from "./cli.ts"
import { boardFiles, overlayOf, sampleOverlayOf } from "./zephyr/emit.ts"
import type {
  Board,
  GpioEntry,
  Indicator,
  McuPin,
  Module,
  Part,
  PartData,
  Soc,
  SpiDevice,
  Uart,
} from "./zephyr/model.ts"

const DATA = join(import.meta.dir, "zephyr")

const SPI_ROLES: Record<string, string[]> = {
  SCK: ["SCK", "SCLK", "CLK"],
  MOSI: ["MOSI", "SDI", "COPI", "SI"],
  MISO: ["MISO", "SDO", "CIPO", "SO"],
  CS: ["CS", "NCS", "CSN", "SS", "NSS", "SCS"],
  IRQ: ["IRQ", "INT", "NINT", "NIRQ"],
  RESET: ["RST", "RESET", "NRST", "NRESET"],
}

const UART_ROLES: Record<string, string[]> = {
  TX: ["TX", "TXD"],
  RX: ["RX", "RXD"],
}

const SUPPLY_TOKENS = ["VCC", "VDD", "VIO", "3V3", "V3V3", "1V8", "V1V8"]

const PASSIVE_PREFIXES = ["R", "C", "L", "FB", "TP"]

const LED_PREFIXES = ["D", "LED"]

const BUTTON_PREFIXES = ["SW", "S", "BTN", "KEY"]

const DEFAULT_GPIO_PROPS: Record<string, string> = {
  IRQ: "irq-gpios",
  RESET: "reset-gpios",
}

const BINDING_GLOBS = ["dts/bindings/*.yaml", "*/dts/bindings/*.yaml"]

type Binding = { compatible?: unknown; properties?: Record<string, unknown> }

type Entry = { part: Part; pad: string }

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(join(DATA, path), "utf8"))

const readJsonDir = <T>(dir: string) =>
  readdirSync(join(DATA, dir))
    .filter(f => f.endsWith(".json"))
    .map(f => readJson<T>(`${dir}/${f}`))

const isLetter = (c: string) => c.toUpperCase() !== c.toLowerCase()

const refPrefix = (ref: string) => {
  const end = [...ref].findIndex(c => !isLetter(c))

  return (end < 0 ? ref : ref.slice(0, end)).toUpperCase()
}

const tokensOf = (net: string) =>
  net.toUpperCase().replaceAll("-", "_").split("_").filter(Boolean)

const roleOf = (net: string, table: Record<string, string[]>) => {
  const tokens = tokensOf(net)

  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i] ?? ""
    const role = Object.keys(table).find(r => table[r]?.includes(token))

    if (role) {
      return { role, prefix: tokens.toSpliced(i, 1).join("_") }
    }
  }

  return null
}

const identifier = (text: string, joiner: string) =>
  [...text.toLowerCase()]
    .map(c => (isLetter(c) || (c >= "0" && c <= "9") ? c : joiner))
    .join("")

const textOf = (part: Part) => `${part.value} ${part.mpn} ${part.footprint}`

const matches = (part: Part, keys: string[]) =>
  keys.some(k => textOf(part).toUpperCase().includes(k.toUpperCase()))

const compact = (text: string) =>
  [...text.toLowerCase()]
    .filter(c => isLetter(c) || (c >= "0" && c <= "9"))
    .join("")

const projectBindings = (root: string) =>
  BINDING_GLOBS.flatMap(g => [...new Bun.Glob(g).scanSync({ cwd: root })])
    .map(f => Bun.YAML.parse(readFileSync(join(root, f), "utf8")) as Binding)
    .flatMap(b =>
      typeof b?.compatible === "string"
        ? [{ compatible: b.compatible, props: Object.keys(b.properties ?? {}) }]
        : [],
    )

const netlistOf = (parts: Part[]) => {
  const byNet = new Map<string, Entry[]>()

  for (const part of parts) {
    for (const pad of part.pads) {
      byNet.set(pad.net, [
        ...(byNet.get(pad.net) ?? []),
        { part, pad: pad.number },
      ])
    }
  }

  return byNet
}

const isTwoPad = (part: Part) =>
  new Set(part.pads.map(p => p.number)).size === 2

const across = (part: Part, pad: string) =>
  part.pads.find(p => p.number !== pad)?.net ?? null

const isGround = (net: string) =>
  tokensOf(net).some(t => t.endsWith("GND") || t === "VSS")

const portOf = (pin: string) => pin.slice(1).split(".")[0] ?? ""

const pinOrder = (pin: string) => {
  const [port = "", num = ""] = pin.slice(1).split(".")

  return Number(port) * 100 + Number(num)
}

const infer = (
  parts: Part[],
  mcu: Part,
  module: Module,
  soc: Soc,
  ctx: Context,
  identity: Identity,
): Board => {
  const netlist = netlistOf(parts)
  const others = (net: string, except: Part) =>
    (netlist.get(net) ?? []).filter(e => e.part !== except)
  const vddNet = mcu.pads.find(p => module.pads[p.number] === "VDD")?.net ?? ""
  const isSupply = (net: string) =>
    net === vddNet || tokensOf(net).some(t => SUPPLY_TOKENS.includes(t))
  const partsOn = (net: string) =>
    others(net, mcu)
      .map(e => e.part.ref)
      .toSorted()

  const routed: (McuPin & { signal: string })[] = mcu.pads
    .map(p => ({
      pad: p.number,
      net: p.net,
      signal: module.pads[p.number] ?? "",
      pin: module.pads[p.number] ?? "",
    }))
    .filter(p => p.signal && p.signal !== "GND" && p.signal !== "VDD")
    .filter(p => others(p.net, mcu).length > 0)
    .toSorted((a, b) => Number(a.pad) - Number(b.pad))

  const isGpio = (signal: string) =>
    signal.startsWith("P") && portOf(signal) in soc.ports
  const internalPins = new Set(
    module.internal.flatMap(i => [
      ...Object.values(i.pins),
      ...Object.values(i.sideband),
      ...(i.cs ? [i.cs] : []),
    ]),
  )

  const nodes: ZephyrNode[] = []
  const unresolved: ZephyrUnresolved[] = []
  const pool = new Map<string, McuPin>()

  for (const p of routed) {
    const pin = { pad: p.pad, pin: p.pin, net: p.net }

    if (
      isGpio(p.signal) &&
      !internalPins.has(p.signal) &&
      p.signal !== soc.reset
    ) {
      pool.set(p.net, pin)
    } else if (
      !["SWDCLK", "SWDIO", "VBUS", "D-", "D+"].includes(p.signal) &&
      p.signal !== soc.reset
    ) {
      unresolved.push({ ...pin, parts: partsOn(p.net) })
    }
  }

  for (const internal of module.internal) {
    const pins = [
      ...Object.entries(internal.pins).map(([role, pin]) => ({ role, pin })),
      ...(internal.cs ? [{ role: "CS", pin: internal.cs }] : []),
      ...Object.entries(internal.sideband).map(([role, pin]) => ({
        role,
        pin,
      })),
    ]

    nodes.push({
      id: internal.bus,
      kind: internal.kind,
      parts: [`${mcu.ref} 내부 ${internal.part}`],
      pins: pins.map(p => ({ pad: "", pin: p.pin, net: "", role: p.role })),
      notes:
        internal.device === null
          ? [
              `Zephyr에 ${internal.part} 바인딩이 없어 버스와 CS만 활성화합니다.`,
              `${Object.entries(internal.sideband)
                .map(([role, pin]) => `${role} ${pin}`)
                .join(", ")} 핀은 드라이버 설정에서 지정하세요.`,
            ]
          : [
              `${internal.device.compatible[0]} 노드와 ${internal.device.alias} 별칭을 생성합니다.`,
            ],
    })
  }

  const swd = routed.filter(p => p.signal === "SWDCLK" || p.signal === "SWDIO")

  if (swd.length > 0) {
    nodes.push({
      id: "swd",
      kind: "swd",
      parts: [...new Set(swd.flatMap(p => partsOn(p.net)))],
      pins: swd.map(p => ({
        pad: p.pad,
        pin: p.signal,
        net: p.net,
        role: p.signal,
      })),
      notes: [
        "SWD는 디바이스트리 항목이 없습니다. 디버거로 기록과 디버깅에 사용합니다.",
      ],
    })
  }

  const usbPins = routed.filter(p => ["VBUS", "D-", "D+"].includes(p.signal))
  const usb =
    usbPins.some(p => p.signal === "D+") && usbPins.some(p => p.signal === "D-")

  if (usb) {
    nodes.push({
      id: soc.usb,
      kind: "usb",
      parts: [...new Set(usbPins.flatMap(p => partsOn(p.net)))],
      pins: usbPins.map(p => ({
        pad: p.pad,
        pin: p.signal,
        net: p.net,
        role: p.signal,
      })),
      notes: ["zephyr_udc0 라벨로 USB 장치 컨트롤러를 활성화합니다."],
    })
  }

  const resetPin = routed.find(p => p.signal === soc.reset)

  if (resetPin) {
    nodes.push({
      id: "uicr",
      kind: "reset",
      parts: partsOn(resetPin.net),
      pins: [
        {
          pad: resetPin.pad,
          pin: soc.reset,
          net: resetPin.net,
          role: "nRESET",
        },
      ],
      notes: ["gpio-as-nreset을 지정해서 이 핀을 리셋 입력으로 씁니다."],
    })
  }

  const bindings = projectBindings(
    ctx.ancestorWith("package.json") ?? ctx.source,
  )
  const partData = readJsonDir<PartData>("parts")
  const internalBuses = new Set(module.internal.map(i => i.bus))
  const freeSpis = soc.spi
    .filter(s => !internalBuses.has(s.node))
    .filter(s => !(s.sharesWith && internalBuses.has(s.sharesWith)))
    .toSorted(
      (a, b) => Number(a.sharesWith !== null) - Number(b.sharesWith !== null),
    )

  const spiGroups = Map.groupBy(
    [...pool.values()].flatMap(pin => {
      const found = roleOf(pin.net, SPI_ROLES)

      return found ? [{ ...found, pin }] : []
    }),
    g => g.prefix,
  )

  const spis: SpiDevice[] = []

  const describe = (
    device: Part,
    byRole: Record<string, McuPin>,
    prefix: string,
  ) => {
    const data = partData.find(d => matches(device, d.match))
    const binding = bindings.find(b => {
      const model = b.compatible.split(",")[1] ?? ""

      return model && compact(textOf(device)).includes(compact(model))
    })
    const label = data?.label ?? identifier(device.value, "_")
    const flagOf = (role: string) =>
      (data?.active[role] ?? "low") === "low"
        ? "GPIO_ACTIVE_LOW"
        : "GPIO_ACTIVE_HIGH"
    const propOf = (role: string) => {
      const keys = role === "IRQ" ? ["int", "irq"] : ["reset", "rst"]

      return (
        binding?.props.find(
          p => p.endsWith("-gpios") && keys.some(k => p.includes(k)),
        ) ??
        DEFAULT_GPIO_PROPS[role] ??
        ""
      )
    }
    const extras = Object.entries(data?.gpios ?? {}).flatMap(([role, prop]) => {
      const pin = pool.get(prefix ? `${prefix}_${role}` : role)

      return pin ? [{ prop, pin, flags: flagOf(role) }] : []
    })
    const gpios = [
      ...["IRQ", "RESET"].flatMap(role => {
        const pin = byRole[role]

        return pin ? [{ prop: propOf(role), pin, flags: flagOf(role) }] : []
      }),
      ...extras,
    ]

    return {
      data,
      binding,
      label,
      name: data?.node ?? label,
      compatible: data?.compatible ?? binding?.compatible ?? "spi-device",
      gpios,
    }
  }

  const noteOf = (
    device: Part,
    bus: { node: string; maxHz: number },
    hz: number,
    described: ReturnType<typeof describe>,
    offBoard: string[],
    shared: boolean,
  ) => [
    described.data?.compatible || described.binding
      ? `compatible은 ${described.compatible}입니다.`
      : "프로젝트에 맞는 바인딩이 없어 spi-device 자리 표시 노드로 생성했습니다. 드라이버 바인딩을 추가하세요.",
    shared
      ? "이 SPI 인스턴스를 다른 장치와 공유하며, 장치마다 별도 칩 선택 핀을 씁니다."
      : "이 SPI 인스턴스는 다른 주변장치와 주소를 공유하지 않습니다.",
    `spi-max-frequency ${hz / 1e6} MHz는 ${bus.node} 최대 ${bus.maxHz / 1e6} MHz${described.data ? `와 ${device.value} 최대 ${described.data.maxHz / 1e6} MHz` : ""} 중 낮은 값입니다.`,
    ...described.gpios.map(
      g =>
        `${g.prop} 속성은 ${g.flags === "GPIO_ACTIVE_LOW" ? "active-low" : "active-high"}입니다.`,
    ),
    ...offBoard.map(
      net => `${net} 넷은 MCU에 연결되지 않아 GPIO 속성을 생성하지 않았습니다.`,
    ),
  ]

  const offBoardOf = (device: Part, prefix: string, used: string[]) =>
    device.pads
      .map(p => p.net)
      .filter(net => roleOf(net, SPI_ROLES)?.prefix === prefix)
      .filter(net => !used.includes(net))
      .filter((net, i, all) => all.indexOf(net) === i)

  const claim = (nets: string[]) => {
    for (const net of nets) {
      pool.delete(net)
    }
  }

  const groups = [...spiGroups].map(([prefix, group]) => ({
    prefix,
    group,
    byRole: Object.fromEntries(group.map(g => [g.role, g.pin])) as Record<
      string,
      McuPin
    >,
  }))

  for (const { prefix, group, byRole } of groups) {
    const sck = byRole.SCK

    if (!sck || !(byRole.MOSI || byRole.MISO)) {
      continue
    }

    const dataNets = [byRole.SCK, byRole.MOSI, byRole.MISO].flatMap(p =>
      p ? [p.net] : [],
    )
    const device = others(sck.net, mcu)
      .map(e => e.part)
      .filter(p => !PASSIVE_PREFIXES.includes(refPrefix(p.ref)))
      .find(p => dataNets.every(net => p.pads.some(pad => pad.net === net)))
    const bus = freeSpis[new Set(spis.map(s => s.bus)).size]

    if (!device || !bus) {
      continue
    }

    const described = describe(device, byRole, prefix)
    const hz = Math.min(bus.maxHz, described.data?.maxHz ?? bus.maxHz)
    const pins = Object.fromEntries(
      ["SCK", "MOSI", "MISO"].flatMap(r => (byRole[r] ? [[r, byRole[r]]] : [])),
    )

    spis.push({
      bus: bus.node,
      reg: 0,
      label: described.label,
      name: described.name,
      compatible: described.compatible,
      hz,
      part: device,
      pins,
      cs: byRole.CS ?? null,
      gpios: described.gpios,
    })
    claim([
      ...group.map(g => g.pin.net),
      ...described.gpios.map(g => g.pin.net),
    ])
    nodes.push({
      id: bus.node,
      kind: "spi",
      parts: [device.ref],
      pins: group.map(g => ({ ...g.pin, role: g.role })),
      notes: noteOf(
        device,
        bus,
        hz,
        described,
        offBoardOf(
          device,
          prefix,
          group.map(g => g.pin.net),
        ),
        false,
      ),
    })
  }

  for (const { prefix, group, byRole } of groups) {
    const cs = byRole.CS

    if (byRole.SCK || !cs || !pool.has(cs.net)) {
      continue
    }

    const onBus = (p: Part, host: SpiDevice) =>
      Object.values(host.pins).every(pin =>
        p.pads.some(pad => pad.net === pin.net),
      )
    const device = others(cs.net, mcu)
      .map(e => e.part)
      .filter(p => !PASSIVE_PREFIXES.includes(refPrefix(p.ref)))
      .find(p => spis.some(h => h.reg === 0 && onBus(p, h)))
    const host = device && spis.find(h => h.reg === 0 && onBus(device, h))
    const bus = host && soc.spi.find(s => s.node === host.bus)

    if (!device || !host || !bus) {
      continue
    }

    const described = describe(device, byRole, prefix)
    const hz = Math.min(bus.maxHz, described.data?.maxHz ?? bus.maxHz)

    spis.push({
      bus: host.bus,
      reg: spis.filter(s => s.bus === host.bus).length,
      label: described.label,
      name: described.name,
      compatible: described.compatible,
      hz,
      part: device,
      pins: host.pins,
      cs,
      gpios: described.gpios,
    })
    claim([
      ...group.map(g => g.pin.net),
      ...described.gpios.map(g => g.pin.net),
    ])
    nodes.push({
      id: host.bus,
      kind: "spi",
      parts: [device.ref],
      pins: group.map(g => ({ ...g.pin, role: g.role })),
      notes: noteOf(
        device,
        bus,
        hz,
        described,
        offBoardOf(
          device,
          prefix,
          group.map(g => g.pin.net),
        ),
        true,
      ),
    })
  }

  const uartGroups = Map.groupBy(
    [...pool.values()].flatMap(pin => {
      const found = roleOf(pin.net, UART_ROLES)

      return found ? [{ ...found, pin }] : []
    }),
    g => g.prefix,
  )
  let uart: Uart | null = null

  for (const group of uartGroups.values()) {
    const tx = group.find(g => g.role === "TX")?.pin
    const rx = group.find(g => g.role === "RX")?.pin
    const node = soc.uart[0]

    if (!tx || !rx || !node || uart) {
      continue
    }

    uart = { node, TX: tx, RX: rx }
    pool.delete(tx.net)
    pool.delete(rx.net)
    nodes.push({
      id: node,
      kind: "uart",
      parts: [...new Set([...partsOn(tx.net), ...partsOn(rx.net)])],
      pins: [
        { ...tx, role: "TX" },
        { ...rx, role: "RX" },
      ],
      notes: [
        `콘솔과 셸 UART로 지정합니다. 속도는 ${soc.uartSpeed} bps입니다.`,
      ],
    })
  }

  const railOf = (net: string, from: Part) => {
    const ends = [
      { net, via: [] as string[] },
      ...others(net, from)
        .filter(e => refPrefix(e.part.ref) === "R" && isTwoPad(e.part))
        .flatMap(e => {
          const end = across(e.part, e.pad)

          return end ? [{ net: end, via: [e.part.ref] }] : []
        }),
    ]
    const hit =
      ends.find(e => isGround(e.net)) ?? ends.find(e => isSupply(e.net))

    return hit
      ? { rail: isGround(hit.net) ? "ground" : "supply", via: hit.via }
      : null
  }

  const reach = (net: string) => {
    const direct = others(net, mcu)
    const hops = direct
      .filter(e => refPrefix(e.part.ref) === "R" && isTwoPad(e.part))
      .flatMap(e => {
        const next = across(e.part, e.pad)

        return next
          ? others(next, e.part).map(x => ({ ...x, net: next, via: e.part }))
          : []
      })

    return [
      ...direct.map(e => ({ ...e, net, via: null as Part | null })),
      ...hops,
    ]
  }

  const found: {
    kind: "led" | "button"
    ref: string
    refs: string[]
    pin: McuPin
    flags: string
  }[] = []

  for (const pin of [...pool.values()]) {
    for (const e of reach(pin.net)) {
      const prefix = refPrefix(e.part.ref)

      if (LED_PREFIXES.includes(prefix) && isTwoPad(e.part)) {
        const other = across(e.part, e.pad)
        const rail = other ? railOf(other, e.part) : null

        if (rail) {
          found.push({
            kind: "led",
            ref: e.part.ref,
            refs: [e.part.ref, ...(e.via ? [e.via.ref] : []), ...rail.via],
            pin,
            flags:
              rail.rail === "supply" ? "GPIO_ACTIVE_LOW" : "GPIO_ACTIVE_HIGH",
          })
          pool.delete(pin.net)
          break
        }
      }

      if (BUTTON_PREFIXES.includes(prefix)) {
        const rail = e.part.pads
          .filter(p => p.net !== e.net)
          .map(p => railOf(p.net, e.part))
          .find(r => r !== null)

        if (rail) {
          found.push({
            kind: "button",
            ref: e.part.ref,
            refs: [e.part.ref, ...(e.via ? [e.via.ref] : []), ...rail.via],
            pin,
            flags:
              rail.rail === "ground"
                ? "(GPIO_PULL_UP | GPIO_ACTIVE_LOW)"
                : "(GPIO_PULL_DOWN | GPIO_ACTIVE_HIGH)",
          })
          pool.delete(pin.net)
          break
        }
      }
    }
  }

  const assign = (
    kind: "led" | "button",
    base: GpioEntry[],
    names: { alias: string; label: string; node: string },
  ): Indicator[] => {
    const mine = found
      .filter(f => f.kind === kind)
      .toSorted((a, b) => a.ref.localeCompare(b.ref))
    const kept = mine.flatMap(f => {
      const match = base.find(b => b.pin === f.pin.pin)

      return match
        ? [{ ...match, flags: f.flags, ref: f.ref, source: f.pin }]
        : []
    })
    const used = new Set(kept.flatMap(k => [k.alias, k.label]))
    const fresh: Indicator[] = []

    for (const f of mine.filter(m => !base.some(b => b.pin === m.pin.pin))) {
      let i = 0

      while (used.has(`${names.alias}${i}`) || used.has(`${names.label}${i}`)) {
        i++
      }

      used.add(`${names.alias}${i}`)
      used.add(`${names.label}${i}`)
      fresh.push({
        node: `${names.node}_${i}`,
        label: `${names.label}${i}`,
        alias: `${names.alias}${i}`,
        pin: f.pin.pin,
        flags: f.flags,
        ref: f.ref,
        source: f.pin,
      })
    }

    return [...kept, ...fresh].toSorted((a, b) =>
      a.alias.localeCompare(b.alias),
    )
  }

  const leds = assign("led", module.baseBoard.leds, {
    alias: "led",
    label: "led",
    node: "led",
  })
  const buttons = assign("button", module.baseBoard.buttons, {
    alias: "sw",
    label: "button",
    node: "button",
  })

  for (const i of [...leds, ...buttons]) {
    const hit = found.find(f => f.ref === i.ref)
    const low = i.flags.includes("ACTIVE_LOW")

    nodes.push({
      id: i.alias,
      kind: leds.includes(i) ? "led" : "button",
      parts: hit?.refs ?? [i.ref],
      pins: [{ ...i.source, role: i.flags }],
      notes: [
        leds.includes(i)
          ? `핀이 ${low ? "low" : "high"}일 때 켜집니다.`
          : `눌렀을 때 핀이 ${low ? "low" : "high"}가 됩니다.`,
      ],
    })
  }

  for (const pin of pool.values()) {
    unresolved.push({ ...pin, parts: partsOn(pin.net) })
  }

  const routedPads = new Set(routed.map(p => p.pad))
  const free = Object.entries(module.pads)
    .filter(([pad, signal]) => isGpio(signal) && !routedPads.has(pad))
    .map(([, signal]) => signal)
    .filter(
      s => !internalPins.has(s) && s !== soc.reset && !soc.nfc.includes(s),
    )
    .toSorted((a, b) => pinOrder(a) - pinOrder(b))
  const led =
    leds[0] ?? (free[0] ? { pin: free[0], flags: "GPIO_ACTIVE_HIGH" } : null)
  const spare = leds[0] ? free[0] : free[1]
  const input =
    buttons[0] ??
    (spare ? { pin: spare, flags: "(GPIO_PULL_UP | GPIO_ACTIVE_LOW)" } : null)

  const claimed = [
    ...spis.flatMap(s => [
      ...Object.values(s.pins),
      ...(s.cs ? [s.cs] : []),
      ...s.gpios.map(g => g.pin),
    ]),
    ...(uart ? [uart.TX, uart.RX] : []),
    ...leds.map(l => l.source),
    ...buttons.map(b => b.source),
  ]
  return {
    ...identity,
    sample:
      led && input
        ? {
            led: { pin: led.pin, flags: led.flags },
            input: { pin: input.pin, flags: input.flags },
          }
        : null,
    module,
    soc,
    leds,
    buttons,
    spis,
    uart,
    usb,
    reset: !!resetPin,
    nfcAsGpio: claimed.some(p => soc.nfc.includes(p.pin)),
    nodes,
    unresolved,
  }
}

const STARTER = "pleahmacaka/zephyr-flake-starter"
const STARTER_SHA = "1806848baf706c467be055c6e677dd1878467a4b"

const SOURCE_TYPES = [
  ".c",
  ".h",
  ".dts",
  ".dtsi",
  ".overlay",
  ".conf",
  ".yml",
  ".yaml",
  ".txt",
  ".md",
  ".nix",
  ".resc",
  ".repl",
  ".py",
]

const firmwareSources = (dir: string) => {
  // git applies .gitignore, so build trees and caches stay out
  const listed = Bun.spawnSync(
    ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
    { cwd: dir },
  )
  const files = listed.stdout
    .toString()
    .split("\n")
    .filter(
      f =>
        SOURCE_TYPES.some(t => f.endsWith(t)) ||
        f.split("/").at(-1)?.startsWith("Kconfig"),
    )

  return Object.fromEntries(
    files.map(f => [f, readFileSync(join(dir, f), "utf-8")]),
  )
}

type Identity = Pick<Board, "name" | "vendor" | "title" | "provenance">

const fetchOk = async (url: string, headers: Record<string, string> = {}) => {
  const response = await fetch(url, { headers })

  if (!response.ok) {
    throw new Error(`${url}: ${response.status} ${await response.text()}`)
  }

  return response
}

const slug = (text: string, joiner: string) =>
  [...text.toLowerCase()]
    .map(c => ((c >= "a" && c <= "z") || (c >= "0" && c <= "9") ? c : " "))
    .join("")
    .split(" ")
    .filter(Boolean)
    .join(joiner)

const identityOf = (ctx: Context): Identity => {
  const base = slug(ctx.projectName, "_") || "board"
  const digest = new Bun.CryptoHasher("sha256")
    .update(readFileSync(ctx.boardFile))
    .digest("hex")

  return {
    name: base[0] && base[0] >= "a" && base[0] <= "z" ? base : `board_${base}`,
    vendor: slug(userInfo().username, "_") || "local",
    title: ctx.projectName,
    provenance: `Generated from ${ctx.projectName}, board.kicad_pcb sha256 ${digest.slice(0, 12)}`,
  }
}

const starterOf = async () => {
  const tarball = await fetchOk(
    `https://codeload.github.com/${STARTER}/tar.gz/${STARTER_SHA}`,
  )
  const entries = await new Bun.Archive(await tarball.bytes()).files()
  const files = await Promise.all(
    [...entries].map(
      async ([path, file]) =>
        [path.slice(path.indexOf("/") + 1), await file.bytes()] as const,
    ),
  )

  return { sha: STARTER_SHA, files: Object.fromEntries(files) }
}

const write = (ctx: Context, file: string, data: string | Uint8Array) => {
  const target = join(ctx.staging, file)

  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, data)
}

export const deriveZephyr = async (ctx: Context) => {
  const dumpFile = join(ctx.scratch, "zephyr-dump.json")

  await run(
    [
      join(ctx.kicadBin, "python.exe"),
      "-I",
      join(ctx.root, "scripts/derive-pcb.py"),
      ctx.boardFile,
      dumpFile,
    ],
    ctx.scratch,
  )

  const { footprints }: { footprints: Part[] } = JSON.parse(
    readFileSync(dumpFile, "utf8"),
  )
  const hit = readJsonDir<Module>("modules").flatMap(module => {
    const mcu = footprints.find(f => matches(f, module.match))

    return mcu ? [{ module, mcu }] : []
  })[0]

  if (!hit) {
    console.log(
      `no Zephyr module map matches ${ctx.boardFile}, skipped zephyr/`,
    )

    return
  }

  const identity = identityOf(ctx)
  const starter = await starterOf()
  const soc = readJson<Soc>(`socs/${hit.module.soc}.json`)
  const board = infer(footprints, hit.mcu, hit.module, soc, ctx, identity)
  const sample = sampleOverlayOf(board)
  const files: Record<string, string> = {
    [`app/boards/${hit.module.baseBoard.name}.overlay`]: overlayOf(board),
    ...(sample ? { [`app/boards/${board.name}.overlay`]: sample } : {}),
    ...Object.fromEntries(
      Object.entries(boardFiles(board)).map(([file, text]) => [
        `boards/${board.vendor}/${board.name}/${file}`,
        text,
      ]),
    ),
  }
  const report: ZephyrReport = {
    module: hit.module.name,
    mcu: hit.mcu.ref,
    soc: soc.name,
    base: hit.module.baseBoard.name,
    board: board.name,
    vendor: board.vendor,
    starter: { repo: STARTER, sha: starter.sha },
    nodes: board.nodes,
    unresolved: board.unresolved,
  }
  const top = `${board.name}-zephyr`
  const sources = ctx.firmware ? firmwareSources(ctx.firmware) : {}

  for (const [file, text] of Object.entries(sources)) {
    write(ctx, DERIVED.zephyr(`firmware/${file}`), text)
  }

  for (const [file, text] of Object.entries(files)) {
    write(ctx, DERIVED.zephyr(file), text)
  }

  write(
    ctx,
    DERIVED.zephyrProject,
    zipSync(
      Object.fromEntries(
        Object.entries({ ...starter.files, ...files }).map(([file, data]) => [
          `${top}/${file}`,
          typeof data === "string" ? strToU8(data) : data,
        ]),
      ),
    ),
  )
  write(ctx, DERIVED.zephyrReport, JSON.stringify(report, null, 2))
}
