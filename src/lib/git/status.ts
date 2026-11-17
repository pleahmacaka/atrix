export type Change = { path: string; index: string; worktree: string }

export type Status = { branch: string; files: Change[] }

const branchOf = (line: string) =>
  line.slice(3).replace("No commits yet on ", "").split("...")[0].split(" [")[0]

export const parseStatus = (text: string): Status => {
  const parts = text.split("\0")
  const files: Change[] = []
  let branch = ""

  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i]

    if (entry.startsWith("## ")) {
      branch = branchOf(entry)
      continue
    }

    if (entry.length < 4) {
      continue
    }

    files.push({ path: entry.slice(3), index: entry[0], worktree: entry[1] })

    if (entry[0] === "R" || entry[0] === "C") {
      i++
    }
  }

  return { branch, files }
}

export const isStaged = (c: Change) => c.index !== " " && c.index !== "?"

export const isUnstaged = (c: Change) => c.worktree !== " "
