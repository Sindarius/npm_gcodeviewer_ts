import { Move, Base } from '../GCodeLines'
import Props from '../processorproperties'
import { doArc } from '../util'

const tokenList = /(?=[GXYZIJKFRE])/

//Reminder Add G53 check

export default function (props: Props, line: string): Base {
   let move = new Move(props, line)

   let tokens = line.split(tokenList)
   let extruding = line.indexOf('E') > 0 //|| this.g1AsExtrusion //Treat as an extrusion in cnc mode
   let cw = tokens.filter((t) => t === 'G2' || t === 'G02')
   let arcResult = { position: this.currentPosition.clone(), points: [] }
   try {
      arcResult = doArc(
         tokens,
         this.currentPosition,
         !this.absolute,
         0.1,
         this.fixRadius,
         this.arcPlane,
         this.workplaceOffsets[this.currentWorkplace],
      )
   } catch (ex) {
      console.error(`Arc Error`, ex)
   }
   let curPt = this.currentPosition.clone()
   arcResult.points.forEach((point, idx) => {
      const line = new gcodeLine()
      line.tool = this.currentTool
      line.gcodeLineNumber = lineNumber
      line.gcodeFilePosition = filePosition
      line.feedRate = this.currentFeedRate
      line.isPerimeter = this.slicer.isPerimeter()
      if (this.g1AsExtrusion) {
         line.layerHeight = 1 // this.tools[this.currentTool].diameter;
      } else {
         line.layerHeight = this.currentLayerHeight - this.previousLayerHeight
      }

      line.start = curPt.clone()
      line.end = new Vector3(point.x, point.y, point.z)

      line.extruding = extruding

      if (extruding) {
         line.color = this.currentColor.clone()
      } else {
         line.color = new Color4(1, 0, 0, 1)
      }

      if (this.debug) {
         line.color = cw ? new Color4(0, 1, 1, 1) : new Color4(1, 1, 0, 1)
         if (idx === 0) {
            line.color = new Color4(0, 1, 0, 1)
         }
      }
      curPt = line.end.clone()

      if (this.debug) {
         console.log(line)
      }

      if (!renderLine) {
         return
      }

      this.renderedLines.push(line)
      if (line.extruding) {
         this.lines[this.linesIndex++] = line
      } else {
         this.travels.push(line)
      }
   })

   //Last point to currentposition
   this.currentPosition = new Vector3(curPt.x, curPt.y, curPt.z)

   if (this.currentPosition.y > this.currentLayerHeight && !this.isSupport) {
      this.previousLayerHeight = this.currentLayerHeight
      this.currentLayerHeight = this.currentPosition.y
   }

   return move
}
