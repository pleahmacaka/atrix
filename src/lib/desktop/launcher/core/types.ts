export type ResultKind =
  | "app"
  | "window"
  | "command"
  | "calc"
  | "unit"
  | "todo"
  | "timer"
  | "emoji"
  | "web"
  | "run"
  | "setting"
  | "clip"
  | "atrix"
  | "conversation"
  | "doc"

export type ActionId = "admin" | "location" | "cancel"

export type SecondaryAction = {
  id?: ActionId
  label: string
  icon?: string
  run: () => void | Promise<void>
  stay?: boolean
}

export type Result = {
  id: string
  kind: ResultKind
  title: string
  subtitle: string
  icon: string
  iconPath?: string
  chips?: string[]
  keywords?: string[]
  running?: boolean
  action: () => void | Promise<void>
  secondaryActions: SecondaryAction[]
  stay?: boolean
  score: number
}

export type ResultGroup = {
  kind: ResultKind
  label: string
  start: number
  items: Result[]
}

export type TimerKind = "timer" | "alarm"
