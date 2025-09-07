import { Base, Comment } from '../GCodeLines'
import Props from '../processorproperties'

// Match tool change anywhere in the line (e.g., "T1" or "T-1"), not only at start
const toolRegex = /T\-?\d+/i

export default function (props: Props, line: string): Base {
   const m = line.match(toolRegex)
   if (!m) {
      // Not a valid tool change token; treat as comment
      return new Comment(props, line)
   }

   let toolIdx = Number(m[0].substring(1).trim())
   if (isNaN(toolIdx) || toolIdx < 0) {
      toolIdx = 0
   }

   // Clamp to available tool range
   if (toolIdx >= props.tools.length) {
      toolIdx = props.tools.length - 1
   }

   if (toolIdx < 0) toolIdx = 0

   props.currentTool = props.tools[toolIdx] || props.currentTool
   return new Comment(props, line)
}
