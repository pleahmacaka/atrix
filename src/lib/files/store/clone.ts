import { toast } from "#lib/files/store/toast.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { isVirtual, sameLocation } from "../locations"
import { gitClone } from "../native"
import type { Remote } from "../remote"
import { fail } from "./command-errors"
import type { Tab } from "./tab.svelte"
import { trustRepo } from "./trust"

export const cloneInto = async (tab: Tab, remote: Remote) => {
  const parent = tab.location

  if (isVirtual(parent)) {
    toast(m.files_git_need_folder(), "error")

    return
  }

  toast(m.files_git_cloning({ name: remote.name }))

  try {
    const path = await gitClone(parent, remote.url, remote.name, remote.flags)

    trustRepo(path)
    toast(m.files_git_cloned({ name: remote.name }), "success")

    if (sameLocation(tab.location, parent)) {
      await tab.open(parent, { select: path })
    }
  } catch (reason) {
    fail(reason)
  }
}
