export const volumeIcon = (level: number, muted: boolean) => {
  if (muted) {
    return "lucide:volume-x"
  }

  if (level <= 0) {
    return "lucide:volume"
  }

  return level < 0.5 ? "lucide:volume-1" : "lucide:volume-2"
}
