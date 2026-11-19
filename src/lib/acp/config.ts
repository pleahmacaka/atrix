import { join } from "@tauri-apps/api/path"
import { z } from "zod"
import { native } from "#lib/native.ts"

const profilesSchema = z.array(
  z.object({ id: z.string(), base: z.string(), name: z.string() }),
)

export type Profile = z.infer<typeof profilesSchema>[number]

const PROFILES = "profiles"

export const profileHome = (id: string) => `${PROFILES}/${id}`

export const profileDir = (home: string, id: string) =>
  join(home, ".atrix", PROFILES, id)

const profilesFile = (home: string) => join(home, ".atrix", "profiles.json")

export const loadProfiles = async (home: string): Promise<Profile[]> => {
  const raw = await native<string | null>("read_text", {
    path: await profilesFile(home),
  })

  return raw ? (profilesSchema.safeParse(JSON.parse(raw)).data ?? []) : []
}

export const saveProfiles = async (home: string, profiles: Profile[]) =>
  native("write_text", {
    path: await profilesFile(home),
    content: JSON.stringify(profiles, null, 2),
  })
