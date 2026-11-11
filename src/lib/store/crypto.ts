const encoder = new TextEncoder()

export const randomBytes = (length: number) =>
  crypto.getRandomValues(new Uint8Array(length))

export const toBase64Url = (bytes: Uint8Array) =>
  bytes.toBase64({ alphabet: "base64url", omitPadding: true })

export const toHex = (bytes: ArrayBuffer | Uint8Array) =>
  new Uint8Array(bytes).toHex()

export const sha256Hex = async (text: string) =>
  toHex(await crypto.subtle.digest("SHA-256", encoder.encode(text)))

export const sign = async (secret: string, message: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )

  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)))
}
