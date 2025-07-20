import ProcessorProperties from '../processorProperties'
import * as GCodeCommands from '.'
import { Base, Comment } from '../GCodeLines'

// Pre-compiled regex patterns for better performance
const commandRegex = /[GMT]+[0-9.]+/g
const fastGCodeRegex = /^([GMT])(\d{1,3})/

// Command type detection for fast parsing
const GCODE_COMMANDS = new Set(['G0', 'G00', 'G1', 'G01', 'G2', 'G02', 'G3', 'G03', 'G90', 'G91'])
const MCODE_COMMANDS = new Set(['M3', 'M4', 'M5', 'M104', 'M109', 'M140', 'M190', 'M600'])

export function ProcessLine(props: ProcessorProperties, line: string): Base {
   let lineLength = line.length
   let workingLine = line.trim()
   
   // Fast path for comments and empty lines
   if (workingLine.length === 0 || workingLine.startsWith(';')) {
      return new Comment(props, line)
   }

   // Fast path for common tool changes
   if (workingLine.startsWith('T')) {
      return GCodeCommands.t(props, line)
   }

   // Try fast regex first for common commands
   const fastMatch = workingLine.match(fastGCodeRegex)
   if (fastMatch) {
      const commandType = fastMatch[1]
      const commandNum = fastMatch[2]
      const command = commandType + commandNum
      
      // Use fast lookup for common commands
      if (commandType === 'G') {
         switch (command) {
            case 'G0':
            case 'G00':
            case 'G1':
            case 'G01':
               return GCodeCommands.g0g1(props, line)
            case 'G2':
            case 'G02':
            case 'G3':
            case 'G03':
               return GCodeCommands.g2g3(props, line)
            case 'G90':
               return GCodeCommands.g90(props, line)
            case 'G91':
               return GCodeCommands.g91(props, line)
         }
      }
   }

   // Fallback to original regex for complex cases
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
         result = GCodeCommands.g91(props, line)
         break
      default:
         result = new Comment(props, line)
         break
   }

   if (result && props.firstGCodeByte == 0 && result.lineType == 'L') {
      props.firstGCodeByte = result.filePosition
   }
   if (result && result.lineType == 'L') {
      props.lastGCodeByte = result.filePosition
   }

   return result
}
