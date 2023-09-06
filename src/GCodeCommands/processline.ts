import ProcessorProperties from '../processorproperties'
import * as GCodeCommands from '.'
import { Base, Comment } from '../GCodeLines'

const commandRegex = /[GMT]+[0-9.]+/g

export function ProcessLine(props: ProcessorProperties, line: string): Base {
   let lineLength = line.length
   let workingLine = line.trim()
   //We'll capture the line for the sake of completion
   if (workingLine.length === 0 || workingLine.startsWith(';')) {
      return new Comment(props, line)
   }

   const commands = line.match(commandRegex)

   if (commands === null || commands.length === 0) {
      return new Comment(props, line)
   }

   let result
   switch (commands[commands.length - 1]) {
      case 'G0':
      case 'G00':
      case 'G1':
      case 'G01':
         result = GCodeCommands.g0g1(props, line)
         break
      case 'G2':
      case 'G02':
      case 'G3':
      case 'G03':
         result = GCodeCommands.g2g3(props, line)
         break
      case 'G90':
         result = GCodeCommands.g90(props, line)
         break
      case 'G91':
         break
      default:
         if (line.startsWith('T')) {
            //toolRegex.test(line)) {
            result = GCodeCommands.t(props, line)
         } else {
            result = new Comment(props, line)
         }
         break
   }

   if (result && props.firstGCodeByte == 0 && result.type == 'L') {
      props.firstGCodeByte = result.filePosition
   }
   if (result && result.type == 'L') {
      props.lastGCodeByte = result.filePosition
   }

   return result
}
