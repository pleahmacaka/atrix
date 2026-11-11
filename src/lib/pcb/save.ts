export const saveFile = (data: BlobPart, filename: string) => {
  const url = URL.createObjectURL(new Blob([data]))
  const link = document.createElement("a")

  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
