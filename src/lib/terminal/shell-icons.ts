const SERIAL = "serial:"

const DISTROS: [string, string][] = [
  ["ubuntu", "logos:ubuntu"],
  ["debian", "logos:debian"],
  ["arch", "logos:archlinux"],
  ["fedora", "logos:fedora"],
  ["centos", "logos:centos-icon"],
  ["rhel", "logos:redhat-icon"],
  ["redhat", "logos:redhat-icon"],
  ["oracle", "logos:oracle"],
  ["manjaro", "logos:manjaro"],
  ["mint", "logos:linux-mint"],
  ["rocky", "logos:rocky-linux-icon"],
  ["void", "logos:void"],
  ["nixos", "material-icon-theme:nix"],
  ["podman", "thesvg:podman"],
  ["docker", "logos:docker-icon"],
]

const SHELLS: Record<string, string> = {
  pwsh: "material-icon-theme:powershell",
  powershell: "material-icon-theme:powershell",
  cmd: "material-icon-theme:console",
  "git-bash": "logos:git-icon",
  bash: "logos:bash-icon",
}

export const serialTarget = (id: string) =>
  id.startsWith(SERIAL) ? id.slice(SERIAL.length).split("@")[0] : null

export const shellIcon = (id: string) => {
  if (id.startsWith(SERIAL)) {
    return "lucide:usb"
  }

  if (id.startsWith("wsl:")) {
    const distro = id.slice(4).toLowerCase()

    return (
      DISTROS.find(([name]) => distro.includes(name))?.[1] ?? "logos:linux-tux"
    )
  }

  return SHELLS[id] ?? "lucide:square-terminal"
}
