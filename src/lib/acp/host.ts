import { homeDir } from "@tauri-apps/api/path"
import { Knowledge } from "#lib/knowledge/service.ts"
import { native } from "#lib/native.ts"
import type {
  Handlers,
  HostCall,
  HostEvent,
  HostState,
} from "#lib/p2p/protocol.ts"
import { Bridge } from "./bridge.ts"
import { readConfig, removeSkill, writeDoc, writeSkill } from "./config.ts"
import {
  appsDesk,
  calendarDesk,
  channelDesk,
  Datasources,
  knowledgeDesk,
} from "./desks.ts"
import { Mailroom, type Network } from "./mailroom.ts"
import { ExternalSessions } from "./mirror.ts"
import { Harnesses } from "./registry.ts"
import { Sessions } from "./sessions.ts"
import { atrixTools } from "./tools.ts"

export type { Network, Remote } from "./mailroom.ts"

export class Host {
  network: Network | null = null

  #home = ""

  #ready: Promise<void> | null = null

  #listeners = new Set<(event: HostEvent) => void>()

  #external = new ExternalSessions(
    () => {
      this.#sessions.yieldToTerminals().catch(() => {})

      for (const s of this.#sessions.reachable()) {
        if (!s.running) {
          this.#mail.drain(s.id).catch(() => {})
        }
      }

      this.#changed()
    },
    view => {
      this.#emit({ type: "view", view: structuredClone(view) })
      this.#changed()
    },
  )

  #harnesses: Harnesses = new Harnesses({
    changed: () => this.#changed(),
    release: id => this.#sessions.release(id),
    log: (harness, line) => this.#emit({ type: "install", harness, line }),
  })

  #data = new Datasources(name => this.#emit({ type: "ds", name }))

  #knowledge = new Knowledge({
    emit: change => this.#emit({ type: "kg", change }),
    notify: (id, text) => {
      this.#mail.notice(id, text).catch(() => {})
    },
    changed: () => this.#changed(),
  })

  #bridge: Bridge = new Bridge(caller => {
    const actorOf = this.#sessions.actorOf

    return atrixTools(caller, {
      apps: appsDesk(this.#knowledge, actorOf),
      channels: channelDesk,
      calendar: calendarDesk(this.#data, actorOf),
      knowledge: knowledgeDesk(this.#knowledge, this.#data, actorOf),
      datasource: this.#data.desk,
      show: (id, blocks) => this.#sessions.show(id, blocks),
      sessions: id => this.#mail.everywhere(id),
      send: (id, message) => this.#mail.send(id, message),
      open: (id, args) => this.#mail.openWorker(id, args),
      close: (id, ref) => this.#mail.closeWorker(id, ref),
    })
  })

  #sessions: Sessions = new Sessions({
    harnesses: this.#harnesses,
    external: this.#external,
    bridge: this.#bridge,
    emit: event => this.#emit(event),
    changed: () => this.#changed(),
    drain: id => this.#mail.drain(id),
    closed: id => this.#mail.closed(id),
  })

  #mail: Mailroom = new Mailroom(
    this.#sessions,
    this.#harnesses,
    () => this.network,
  )

  start = () => {
    this.#ready ??= (async () => {
      this.#home = await homeDir()
      this.#external.start(this.#home)
      await this.#bridge.start().catch(() => {})
      this.#knowledge.start()
      await this.#harnesses.start(this.#home)
      this.#sessions.revive().catch(() => {})
    })()

    return this.#ready
  }

  subscribe = (listener: (event: HostEvent) => void) => {
    this.#listeners.add(listener)

    return () => {
      this.#listeners.delete(listener)
    }
  }

  #handlers: Handlers = {
    ...this.#knowledge.handlers,
    ...this.#data.handlers,
    "mail.sessions": async () => this.#sessions.reachable(),
    "mail.post": r => this.#mail.post(r.letter),
    "mail.notice": async r => {
      await this.#mail.notice(r.to, r.text, false)

      return null
    },
    "mail.open": r => this.#mail.openWorker(r.caller, r.args),
    "mail.close": r => this.#mail.closeWorker(r.caller, r.session),
    state: async () => this.#state(),
    "fs.browse": r => native("browse_dirs", { path: r.path }),
    list: r => this.#sessions.list(r.harness),
    new: r => this.#sessions.create(r.harness, r.cwd),
    load: r =>
      this.#sessions.load(r.harness, r.sessionId, r.cwd, r.title ?? ""),
    prompt: r => this.#sessions.prompt(r.sessionId, r.text, r.attachments),
    cancel: r => this.#sessions.cancel(r.sessionId),
    close: r => this.#sessions.close(r.sessionId),
    permit: async r => {
      this.#sessions.permit(r.sessionId, r.optionId)

      return null
    },
    option: r => this.#sessions.configure(r.sessionId, r.configId, r.value),
    "harness.toggle": r => this.#harnesses.toggle(r.harness, r.enabled),
    "harness.detect": async () => {
      await this.#harnesses.redetect()

      return null
    },
    "harness.install": r => this.#harnesses.install(r.harness, r.scope),
    "harness.uninstall": r => this.#harnesses.uninstall(r.harness),
    "harness.read": r => readConfig(this.#harnesses.target(r.harness)),
    "harness.write": async r => {
      await writeDoc(this.#harnesses.target(r.harness), r.doc, r.content)

      return null
    },
    "skill.write": async r => {
      await writeSkill(this.#harnesses.target(r.harness), r.name, r.content)

      return null
    },
    "skill.remove": async r => {
      await removeSkill(this.#harnesses.target(r.harness), r.name)

      return null
    },
    "profile.create": r =>
      this.#harnesses.createProfile(r.harness, r.name, r.fork),
    "profile.remove": r => this.#harnesses.removeProfile(r.harness),
  }

  handle: HostCall = async request => {
    await this.start()

    return this.#handlers[request.op](request)
  }

  #emit = (event: HostEvent) => {
    for (const listener of this.#listeners) {
      listener(event)
    }
  }

  #changed = () => {
    this.#emit({ type: "state", state: this.#state() })
  }

  #state = (): HostState => ({
    home: this.#home,
    harnesses: this.#harnesses.infos(),
    available: this.#harnesses.installable(),
    open: this.#sessions.open(),
    knowledge: this.#knowledge.status,
    external: [...this.#external.presence].map(([id, busy]) => ({
      id,
      busy,
    })),
  })
}
