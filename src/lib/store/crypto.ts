export const randomBytes = (length: number) =>
  crypto.getRandomValues(new Uint8Array(length))

export const toBase64Url = (bytes: Uint8Array) =>
  bytes.toBase64({ alphabet: "base64url", omitPadding: true })
