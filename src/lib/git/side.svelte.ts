export type SideTool = "git" | "terminal"

export const side = $state<{ tool: SideTool | null; terminal: boolean }>({
  tool: null,
  terminal: false,
})

export const toggleSide = (tool: SideTool) => {
  side.tool = side.tool === tool ? null : tool

  if (side.tool === "terminal") {
    side.terminal = true
  }
}
