<script lang="ts">
  import Icon from "@iconify/svelte"
  import AddButton from "#lib/components/settings/AddButton.svelte"
  import ConfirmButton from "#lib/components/ui/ConfirmButton.svelte"
  import Section from "#lib/components/ui/Section.svelte"
  import { m } from "#lib/paraglide/messages.js"
  import { imageIcon } from "../../image-icon"
  import { type GitHost, prefs } from "../../store/prefs.svelte"

  const LOGO_SIZE = 64

  const domainOf = (input: string) => {
    const text = input.trim()

    if (!text) {
      return ""
    }

    try {
      return new URL(text.includes("://") ? text : `https://${text}`).hostname
    } catch {
      return text.toLowerCase()
    }
  }

  const readLogo = async (file: File) => {
    const source = URL.createObjectURL(file)
    const image = new Image()

    try {
      image.src = source
      await image.decode()

      const canvas = document.createElement("canvas")
      const scale =
        LOGO_SIZE / Math.max(image.naturalWidth, image.naturalHeight, 1)
      const width = image.naturalWidth * scale
      const height = image.naturalHeight * scale

      canvas.width = LOGO_SIZE
      canvas.height = LOGO_SIZE
      canvas
        .getContext("2d")
        ?.drawImage(
          image,
          (LOGO_SIZE - width) / 2,
          (LOGO_SIZE - height) / 2,
          width,
          height,
        )

      return canvas.toDataURL("image/png")
    } finally {
      URL.revokeObjectURL(source)
    }
  }

  const update = (index: number, patch: Partial<GitHost>) => {
    prefs.gitHosts = prefs.gitHosts.map((host, at) =>
      at === index ? { ...host, ...patch } : host,
    )
  }

  const pickLogo = async (index: number, input: HTMLInputElement) => {
    const file = input.files?.[0]

    input.value = ""

    if (file) {
      update(index, { logo: await readLogo(file).catch(() => null) })
    }
  }

  const add = () => {
    prefs.gitHosts = [...prefs.gitHosts, { domain: "", name: "", logo: null }]
  }

  const remove = (index: number) => {
    prefs.gitHosts = prefs.gitHosts.filter((_, at) => at !== index)
  }
</script>

<Section title={m.files_settings_git_hosts_title()}>
  <div class="flex flex-col gap-2 py-3">
    {#each prefs.gitHosts as host, index (index)}
      <div class="flex min-w-0 items-center gap-2">
        <label
          class={[
            "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-field",
            "bg-base-content/6 transition-colors duration-140 hover:bg-base-content/10",
          ]}
          title={m.files_settings_git_hosts_logo()}
        >
          <Icon
            icon={host.logo ? imageIcon(host.logo) : "lucide:image-plus"}
            class={["size-4", !host.logo && "text-base-content/50"]}
          />

          <input
            type="file"
            accept="image/*"
            class="hidden"
            aria-label={m.files_settings_git_hosts_logo()}
            onchange={e => pickLogo(index, e.currentTarget)}
          />
        </label>

        <input
          class="input input-sm min-w-0 flex-1"
          placeholder="git.example.com"
          aria-label={m.files_settings_git_hosts_domain()}
          value={host.domain}
          onchange={e =>
            update(index, { domain: domainOf(e.currentTarget.value) })}
        />

        <input
          class="input input-sm w-36 min-w-0"
          placeholder={m.files_settings_git_hosts_name()}
          aria-label={m.files_settings_git_hosts_name()}
          value={host.name}
          onchange={e => update(index, { name: e.currentTarget.value.trim() })}
        />

        <ConfirmButton
          label={m.files_settings_git_hosts_remove()}
          onconfirm={() => remove(index)}
        />
      </div>
    {/each}

    <AddButton label={m.files_settings_git_hosts_add()} onclick={add} />
  </div>
</Section>
