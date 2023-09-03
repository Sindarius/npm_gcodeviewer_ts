import { Move, Base } from '../GCodeLines'
import Props from '../processorProperties'

//Reminder Add G53 check

const tokenList = /(?=[GXYZEFUVAB])/

export default function (props: Props, line: string): Base {
   let move = new Move(line)
   move.tool = props.currentTool.toolNumber
   move.lineNumber = props.lineNumber
   move.filePosition = props.filePosition
   props.currentPosition.toArray(move.start)

   const tokens = line.split(tokenList)

   let forceAbsolute = false

   if (props.zBelt) tokens.reverse()

   for (let idx = 0; idx < tokens.length; idx++) {
      let token = tokens[idx]
      switch (token[0]) {
         case 'G':
            if (token == 'G53') forceAbsolute = truelet
            if (token == 'G1' || token == 'G01') {
               //move.extruding = true
               props.currentTool.color.toArray(move.color)
            }
            break
         case 'X':
            if (props.zBelt) {
               props.currentPosition.x = Number(token.substring(1))
            } else {
               props.currentPosition.x =
                  props.absolute || forceAbsolute
                     ? Number(token.substring(1)) + props.currentWorkplace.x
                     : props.currentPosition.x + Number(token.substring(1))
            }
            break
         case 'Y':
            if (props.zBelt) {
               props.currentPosition.y = Number(token.substring(1)) * props.hyp
               props.currentPosition.z = props.currentZ + props.currentPosition.y * props.adj
            } else {
               props.currentPosition.z =
                  props.absolute || forceAbsolute
                     ? Number(token.substring(1)) + props.currentWorkplace.y
                     : props.currentPosition.z + Number(token.substring(1))
            }
            break
         case 'Z':
            if (props.zBelt) {
               props.currentZ = -Number(token.substring(1))
               props.currentPosition.z = props.currentZ + props.currentPosition.y * props.adj
            } else {
               props.currentPosition.y =
                  props.absolute || forceAbsolute
                     ? Number(token.substring(1)) + props.currentWorkplace.z
                     : props.currentPosition.y + Number(token.substring(1))
            }
            break
         case 'E':
            if (Number(token.substring(1)) > 0) {
               move.extruding = true
            }
            break
         case 'F':
            props.currentFeedRate = Number(token.substring(1))
            break
      }
   }

   props.currentPosition.toArray(move.end)

   return move
}
