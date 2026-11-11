export const rem = (pixels: number) =>
  `${pixels / Number.parseFloat(getComputedStyle(document.documentElement).fontSize)}rem`
