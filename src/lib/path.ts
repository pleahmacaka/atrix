export const baseName = (path: string) =>
  path.replaceAll("\\", "/").split("/").filter(Boolean).at(-1) ?? path
