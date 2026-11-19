import type {
  Board,
  GpioEntry,
  Indicator,
  Internal,
  McuPin,
  Soc,
  SpiDevice,
  Uart,
} from "./model.ts"

type Dt = { name: string; label?: string; props: string[]; children: Dt[] }

const node = (
  name: string,
  props: string[] = [],
  children: Dt[] = [],
  label?: string,
): Dt => ({ name, label, props, children })

const render = (n: Dt, depth = 0): string[] => {
  const tab = "\t".repeat(depth)
  const head = n.label ? `${n.label}: ${n.name}` : n.name
  const props = n.props.flatMap(p => {
    const lines = p.split("\n")

    return lines.map(
      (line, i) =>
        `${tab}\t${i > 0 ? "\t" : ""}${line}${i === lines.length - 1 ? ";" : ""}`,
    )
  })
  const blocks = [props, ...n.children.map(c => render(c, depth + 1))].filter(
    b => b.length > 0,
  )

  return [
    `${tab}${head} {`,
    ...blocks.flatMap((b, i) => (i > 0 ? ["", ...b] : b)),
    `${tab}};`,
  ]
}

const hashHeader = (board: Board) =>
  `# SPDX-License-Identifier: Apache-2.0
# ${board.provenance}

`

const blockHeader = (board: Board) =>
  `/*
 * SPDX-License-Identifier: Apache-2.0
 * ${board.provenance}
 */`

const file = (header: string[], nodes: Dt[]) =>
  `${[header.join("\n"), ...nodes.map(n => render(n).join("\n"))]
    .filter(Boolean)
    .join("\n\n")}\n`

const pinParts = (pin: string) => {
  const [port = "", num = ""] = pin.slice(1).split(".")

  return { port, num: Number(num) }
}

const gpio = (soc: Soc, pin: string, flags: string) => {
  const { port, num } = pinParts(pin)

  return `<&${soc.ports[port]?.node} ${num} ${flags}>`
}

const psel = (soc: Soc, role: string, pin: string) => {
  const { port, num } = pinParts(pin)

  return `<NRF_PSEL(${soc.psel[role]}, ${port}, ${num})>`
}

const hex = (n: number, width = 0) => `0x${n.toString(16).padStart(width, "0")}`

const pinctrl = (
  soc: Soc,
  bus: string,
  pins: Record<string, string>,
  extra: string[] = [],
) => {
  const psels = `psels = ${Object.entries(pins)
    .map(([role, pin]) => psel(soc, role, pin))
    .join(",\n")}`

  return [
    node(
      `${bus}_default`,
      [],
      [node("group1", [psels, ...extra])],
      `${bus}_default`,
    ),
    node(
      `${bus}_sleep`,
      [],
      [node("group1", [psels, "low-power-enable"])],
      `${bus}_sleep`,
    ),
  ]
}

const busProps = (bus: string) => [
  `status = "okay"`,
  `pinctrl-0 = <&${bus}_default>`,
  `pinctrl-1 = <&${bus}_sleep>`,
  `pinctrl-names = "default", "sleep"`,
]

const pinsOf = (pins: Record<string, McuPin>) =>
  Object.fromEntries(Object.entries(pins).map(([role, p]) => [role, p.pin]))

const spiBuses = (spis: SpiDevice[]) => [
  ...Map.groupBy(
    spis.toSorted((a, b) => a.reg - b.reg),
    s => s.bus,
  ).values(),
]

const spiNode = (soc: Soc, devices: SpiDevice[]) => {
  const selects = devices.flatMap(d =>
    d.cs ? [gpio(soc, d.cs.pin, "GPIO_ACTIVE_LOW")] : [],
  )

  return node(
    `&${devices[0].bus}`,
    [
      ...busProps(devices[0].bus),
      ...(selects.length > 0 ? [`cs-gpios = ${selects.join(", ")}`] : []),
    ],
    devices.map(spi =>
      node(
        `${spi.name}@${spi.reg}`,
        [
          `compatible = "${spi.compatible}"`,
          `reg = <${spi.reg}>`,
          `spi-max-frequency = <${spi.hz}>`,
          ...spi.gpios.map(g => `${g.prop} = ${gpio(soc, g.pin.pin, g.flags)}`),
        ],
        [],
        spi.label,
      ),
    ),
  )
}

const internalNodes = (soc: Soc, internal: Internal) => {
  const device = internal.device

  return node(
    `&${internal.bus}`,
    [
      ...busProps(internal.bus),
      ...(device?.bus ?? []),
      ...(internal.cs
        ? [`cs-gpios = ${gpio(soc, internal.cs, "GPIO_ACTIVE_LOW")}`]
        : []),
    ],
    device
      ? [
          node(
            `${device.name}@${device.reg.toString(16)}`,
            [
              `compatible = ${device.compatible.map(c => `"${c}"`).join(", ")}`,
              `reg = <${hex(device.reg)}>`,
              ...Object.entries(device.gpios).map(
                ([prop, [pin, flags]]) => `${prop} = ${gpio(soc, pin, flags)}`,
              ),
            ],
            [],
            device.label,
          ),
        ]
      : [],
  )
}

const gpioNode = (soc: Soc, entry: Indicator, button: boolean, index: number) =>
  node(
    entry.node,
    [
      `gpios = ${gpio(soc, entry.pin, entry.flags)}`,
      `label = "${entry.ref}"`,
      ...(button ? [`zephyr,code = <INPUT_KEY_${index}>`] : []),
    ],
    [],
    entry.label,
  )

const sampleNodes = (soc: Soc, sample: Board["sample"]) =>
  sample
    ? [
        node(
          "example-sensor",
          [
            `compatible = "zephyr,example-sensor"`,
            `input-gpios = ${gpio(soc, sample.input.pin, sample.input.flags)}`,
          ],
          [],
          "example_sensor",
        ),
        node(
          "blink-led",
          [
            `compatible = "blink-gpio-led"`,
            `led-gpios = ${gpio(soc, sample.led.pin, sample.led.flags)}`,
            "blink-period-ms = <1000>",
          ],
          [],
          "blink_led",
        ),
      ]
    : []

const keyIndex = (entry: GpioEntry) => Number(entry.alias.slice(2)) || 0

const uartPins = (uart: Uart) => ({ TX: uart.TX.pin, RX: uart.RX.pin })

export const overlayOf = (board: Board) => {
  const { soc, module } = board
  const base = module.baseBoard
  const root: Dt[] = []
  const aliasProps: string[] = []
  const nodes: Dt[] = []
  const deleted: string[] = []

  const delta = (
    container: string,
    compatible: string,
    mine: Indicator[],
    theirs: GpioEntry[],
    button: boolean,
  ) => {
    const children: Dt[] = []
    const emptied = theirs.length > 0 && mine.length === 0

    for (const entry of theirs) {
      const kept = mine.find(m => m.pin === entry.pin)

      if (!kept) {
        aliasProps.push(`/delete-property/ ${entry.alias}`)

        if (!emptied) {
          deleted.push(`/delete-node/ &${entry.label};`)
        }
      } else if (kept.flags !== entry.flags) {
        nodes.push(
          node(`&${entry.label}`, [
            `gpios = ${gpio(soc, kept.pin, kept.flags)}`,
          ]),
        )
      }
    }

    for (const entry of mine.filter(m => !theirs.some(t => t.pin === m.pin))) {
      children.push(gpioNode(soc, entry, button, keyIndex(entry)))
      aliasProps.push(`${entry.alias} = &${entry.label}`)
    }

    if (emptied) {
      deleted.push(`/delete-node/ &{/${container}};`)
    }

    if (children.length > 0) {
      root.push(node(container, [`compatible = "${compatible}"`], children))
    }
  }

  delta("leds", "gpio-leds", board.leds, base.leds, false)
  delta("buttons", "gpio-keys", board.buttons, base.buttons, true)

  const pinctrlNodes = spiBuses(board.spis).flatMap(([s]) =>
    pinctrl(soc, s.bus, pinsOf(s.pins)),
  )

  if (!board.uart) {
    nodes.push(node(`&${base.uart.node}`, [`status = "disabled"`]))
  } else if (
    board.uart.TX.pin !== base.uart.TX ||
    board.uart.RX.pin !== base.uart.RX
  ) {
    nodes.push(
      ...pinctrl(soc, base.uart.node, uartPins(board.uart)).map(n =>
        node(`&${n.name}`, [], n.children),
      ),
    )
  }

  if (base.usb && !board.usb) {
    nodes.push(node(`&${soc.usb}`, [`status = "disabled"`]))
  }

  root.push(...sampleNodes(soc, board.sample))

  const head: Dt[] = [
    ...(aliasProps.length > 0 || root.length > 0
      ? [
          node(
            "/",
            [],
            [
              ...(aliasProps.length > 0 ? [node("aliases", aliasProps)] : []),
              ...root,
            ],
          ),
        ]
      : []),
    ...(board.nfcAsGpio ? [node("&uicr", ["nfct-pins-as-gpios"])] : []),
    ...(pinctrlNodes.length > 0 ? [node("&pinctrl", [], pinctrlNodes)] : []),
    ...spiBuses(board.spis).map(d => spiNode(soc, d)),
  ]

  const body = file([blockHeader(board)], [...head, ...nodes])

  return deleted.length > 0 ? `${body}\n${deleted.join("\n")}\n` : body
}

const boardDts = (board: Board) => {
  const { soc, module } = board
  const hasButtons = board.buttons.length > 0
  const console = board.uart?.node
  const aliases = [
    ...board.leds.map(l => `${l.alias} = &${l.label}`),
    ...board.buttons.map(b => `${b.alias} = &${b.label}`),
    ...Object.entries(soc.aliases).map(
      ([alias, label]) => `${alias} = &${label}`,
    ),
    ...module.internal.flatMap(i =>
      i.device ? [`${i.device.alias} = &${i.device.label}`] : [],
    ),
  ]

  const root = node(
    "/",
    [
      `model = "${board.title}"`,
      `compatible = "${board.vendor},${board.name.replaceAll("_", "-")}"`,
    ],
    [
      node("chosen", [
        ...(console
          ? [`zephyr,console = &${console}`, `zephyr,shell-uart = &${console}`]
          : []),
        ...Object.entries(soc.chosen).map(
          ([key, label]) => `${key} = &${label}`,
        ),
      ]),
      ...(board.leds.length > 0
        ? [
            node(
              "leds",
              [`compatible = "gpio-leds"`],
              board.leds.map(l => gpioNode(soc, l, false, 0)),
            ),
          ]
        : []),
      ...(hasButtons
        ? [
            node(
              "buttons",
              [`compatible = "gpio-keys"`],
              board.buttons.map(b => gpioNode(soc, b, true, keyIndex(b))),
            ),
          ]
        : []),
      node("aliases", aliases),
    ],
  )

  const uicr = [
    ...(board.reset ? ["gpio-as-nreset"] : []),
    ...(board.nfcAsGpio ? ["nfct-pins-as-gpios"] : []),
  ]
  const partitions = node(
    "partitions",
    [
      `compatible = "fixed-partitions"`,
      "#address-cells = <1>",
      "#size-cells = <1>",
    ],
    soc.partitions.map(p =>
      node(
        `partition@${p.offset.toString(16)}`,
        [
          `label = "${p.name}"`,
          `reg = <${hex(p.offset, 8)} ${hex(p.size, 8)}>`,
        ],
        [],
        p.label,
      ),
    ),
  )

  return file(
    [
      blockHeader(board),
      "",
      "/dts-v1/;",
      `#include <${soc.dtsi}>`,
      `#include "${board.name}-pinctrl.dtsi"`,
      ...(hasButtons
        ? ["#include <zephyr/dt-bindings/input/input-event-codes.h>"]
        : []),
    ],
    [
      root,
      ...(uicr.length > 0 ? [node("&uicr", uicr)] : []),
      ...soc.enable.map(n => node(`&${n}`, [`status = "okay"`])),
      ...(board.uart
        ? [
            node(`&${board.uart.node}`, [
              ...busProps(board.uart.node),
              `current-speed = <${soc.uartSpeed}>`,
            ]),
          ]
        : []),
      ...module.internal.map(i => internalNodes(soc, i)),
      ...spiBuses(board.spis).map(d => spiNode(soc, d)),
      node("&flash0", [], [partitions]),
      ...(board.usb
        ? [node(`&${soc.usb}`, [`status = "okay"`], [], "zephyr_udc0")]
        : []),
      node(`&${module.regulator.node}`, [
        `regulator-initial-mode = <${module.regulator.mode}>`,
      ]),
    ],
  )
}

const pinctrlDtsi = (board: Board) => {
  const { soc, module } = board

  return file(
    [blockHeader(board)],
    [
      node(
        "&pinctrl",
        [],
        [
          ...(board.uart
            ? pinctrl(soc, board.uart.node, uartPins(board.uart))
            : []),
          ...module.internal.flatMap(i =>
            pinctrl(soc, i.bus, i.pins, i.device?.pinctrl ?? []),
          ),
          ...spiBuses(board.spis).flatMap(([s]) =>
            pinctrl(soc, s.bus, pinsOf(s.pins)),
          ),
        ],
      ),
    ],
  )
}

export const sampleOverlayOf = (board: Board) =>
  board.sample
    ? file(
        [blockHeader(board)],
        [node("/", [], sampleNodes(board.soc, board.sample))],
      )
    : null

const INTERNAL_KINDS: Record<Internal["kind"], string> = {
  uwb: "UWB transceiver",
  accel: "Accelerometer",
}

const readmeOf = (board: Board) => {
  const { module, soc, uart } = board
  const hardware = [
    ...module.internal.map(
      i =>
        `${INTERNAL_KINDS[i.kind]}: ${i.part} on ${i.bus}, inside the module`,
    ),
    ...board.spis.map(
      s => `SPI device: ${s.part.value} (${s.part.ref}) on ${s.bus}`,
    ),
    ...(uart
      ? [`Console UART: ${uart.node}, TX ${uart.TX.pin}, RX ${uart.RX.pin}`]
      : []),
    ...board.leds.map(l => `LED ${l.alias}: ${l.pin} (${l.ref})`),
    ...board.buttons.map(b => `Button ${b.alias}: ${b.pin} (${b.ref})`),
    ...(board.usb ? [`USB device: ${soc.usb}`] : []),
    ...(board.reset ? [`Reset: ${soc.reset}`] : []),
  ]

  return [
    `# ${board.title}`,
    "",
    `\`${board.name}\` is a custom board built on the ${module.name} module (${soc.name}).`,
    "",
    ...hardware.map(h => `- ${h}`),
    "",
  ].join("\n")
}

const supportedOf = (board: Board) => {
  const buses = [
    ...board.module.internal.map(i => i.bus),
    ...board.spis.map(s => s.bus),
  ]

  return [
    ...new Set([
      ...board.soc.supported,
      ...(buses.some(b => b.startsWith("spi")) ? ["spi"] : []),
      ...(buses.some(b => b.startsWith("i2c")) ? ["i2c"] : []),
      ...(board.uart ? ["uart"] : []),
      ...(board.usb ? ["usb_device"] : []),
    ]),
  ].toSorted()
}

const yamlList = (items: string[]) => items.map(i => `  - ${i}`)

export const boardFiles = (board: Board): Record<string, string> => {
  const { soc, name } = board
  const symbol = `BOARD_${name.toUpperCase()}`
  const header = hashHeader(board)

  return {
    "board.yml": `${header}${[
      "board:",
      `  name: ${name}`,
      `  full_name: ${JSON.stringify(board.title)}`,
      `  vendor: ${board.vendor}`,
      "  socs:",
      `    - name: ${soc.name}`,
      "",
    ].join("\n")}`,
    [`${name}.yaml`]: `${header}${[
      `identifier: ${name}`,
      `name: ${JSON.stringify(board.title)}`,
      `vendor: ${board.vendor}`,
      "type: mcu",
      `arch: ${soc.arch}`,
      `ram: ${soc.ramKb}`,
      `flash: ${soc.flashKb}`,
      "toolchain:",
      ...yamlList(soc.toolchain),
      "supported:",
      ...yamlList(supportedOf(board)),
      "",
    ].join("\n")}`,
    [`${name}.dts`]: boardDts(board),
    [`${name}-pinctrl.dtsi`]: pinctrlDtsi(board),
    [`Kconfig.${name}`]: `${header}config ${symbol}\n\tselect ${soc.kconfig}\n`,
    "Kconfig.defconfig": `${header}${[
      `if ${symbol}`,
      ...Object.entries(board.module.kconfigDefaults).flatMap(
        ([key, value]) => ["", `config ${key}`, `\tdefault ${value}`],
      ),
      "",
      "endif",
      "",
    ].join("\n")}`,
    "board.cmake": `${header}${soc.boardCmake.join("\n")}\n`,
    "pre_dt_board.cmake": `${header}${soc.dtcFlags.map(f => `list(APPEND EXTRA_DTC_FLAGS "${f}")`).join("\n")}\n`,
    [`${name}_defconfig`]: `${header}${[...soc.defconfig, ...(board.uart ? soc.consoleConfig : [])].join("\n")}\n`,
    "README.md": readmeOf(board),
  }
}
