type Check =
  | { state: "idle" }
  | { state: "busy"; for: string }
  | { state: "ok"; for: string; models: string[] }
  | { state: "failed"; for: string; reason: string }

type Probe = () => Promise<string[]>

const reasonOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

export class ProbeState {
  #check = $state<Check>({ state: "idle" })

  current = $derived.by((): Check => {
    const check = this.#check

    return check.state === "idle" || check.for !== this.signature()
      ? { state: "idle" }
      : check
  })

  constructor(private readonly signature: () => string) {}

  verify = async (probe: Probe) => {
    const forSignature = this.signature()

    this.#check = { state: "busy", for: forSignature }

    try {
      this.#check = { state: "ok", for: forSignature, models: await probe() }
    } catch (e) {
      this.#check = { state: "failed", for: forSignature, reason: reasonOf(e) }
    }
  }
}
