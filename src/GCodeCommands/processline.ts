import ProcessorProperties from '../processorProperties'
import * as GCodeCommands from '.'
import { Base, Comment, Move } from '../GCodeLines'

// Pre-compiled regex patterns for better performance (case insensitive)
const commandRegex = /[GMT]+[0-9.]+/gi
const fastGCodeRegex = /^([GMT])(\d{1,3})/i

// Command type detection for fast parsing
const GCODE_COMMANDS = new Set(['G0', 'G00', 'G1', 'G01', 'G2', 'G02', 'G3', 'G03', 'G90', 'G91'])
const MCODE_COMMANDS = new Set(['M3', 'M4', 'M5', 'M104', 'M109', 'M140', 'M190', 'M600'])

// Ultra-fast parser for the most common G0/G1 patterns
function parseG0G1Fast(props: ProcessorProperties, line: string): Base | null {
   // Pattern: G0/G1 X123.45 Y67.89 Z1.23 E4.56 F1500
   // Skip if line has special characters that need complex parsing
   if (line.includes(';') || line.includes('G53') || line.includes('(')) return null
   
   let x: number | null = null
   let y: number | null = null  
   let z: number | null = null
   let e: number | null = null
   let f: number | null = null
   let isG1 = false
   
   // Character-by-character parsing for maximum speed
   let i = 0
   while (i < line.length) {
      const char = line[i]
      if (char === 'G' || char === 'g') {
         i++
         if (line[i] === '1' || (line[i] === '0' && line[i+1] === '1')) {
            isG1 = true
         }
         // Skip to next space or letter
         while (i < line.length && line[i] !== ' ' && !/[XYZEF]/i.test(line[i])) i++
         continue
      } else if (char === 'X' || char === 'x') {
         i++
         const [value, newIndex] = parseNumberFast(line, i)
         x = value
         i = newIndex
         continue
      } else if (char === 'Y' || char === 'y') {
         i++
         const [value, newIndex] = parseNumberFast(line, i)
         y = value
         i = newIndex
         continue
      } else if (char === 'Z' || char === 'z') {
         i++
         const [value, newIndex] = parseNumberFast(line, i)
         z = value
         i = newIndex
         continue
      } else if (char === 'E' || char === 'e') {
         i++
         const [value, newIndex] = parseNumberFast(line, i)
         e = value
         i = newIndex
         continue
      } else if (char === 'F' || char === 'f') {
         i++
         const [value, newIndex] = parseNumberFast(line, i)
         f = value
         i = newIndex
         continue
      } else {
         i++
      }
   }
   
   // Only create Move object if we found coordinates
   if (x === null && y === null && z === null) return null
   
   const move = new Move(props, line)
   move.tool = props.currentTool.toolNumber
   props.currentPosition.toArray(move.start)
   
   // Update positions
   if (x !== null) {
      props.currentPosition.x = props.absolute ? x + props.currentWorkplace.x : props.currentPosition.x + x
   }
   if (y !== null) {
      props.currentPosition.z = props.absolute ? y + props.currentWorkplace.y : props.currentPosition.z + y
   }
   if (z !== null) {
      props.currentPosition.y = props.absolute ? z + props.currentWorkplace.z : props.currentPosition.y + z
   }
   
   if (isG1) {
      props.currentTool.color.toArray(move.color)
      move.extruding = props.cncMode
   }
   
   if (e !== null && e > 0) {
      move.extruding = true
   }
   
   if (!move.extruding) {
      move.lineType = 'T'
      move.tool = 255
   }
   
   if (f !== null && move.extruding) {
      props.CurrentFeedRate = f
   }
   
   move.feedRate = props.CurrentFeedRate
   props.currentPosition.toArray(move.end)
   
   return move
}

// Fast number parsing without string operations - returns [value, newIndex]
function parseNumberFast(line: string, startIndex: number): [number, number] {
   let i = startIndex
   while (i < line.length && line[i] === ' ') i++ // Skip spaces
   
   if (i >= line.length) return [0, i]
   
   let result = 0
   let decimal = 0
   let decimalPlaces = 0
   let negative = false
   let hasDecimal = false
   
   if (line[i] === '-') {
      negative = true
      i++
   } else if (line[i] === '+') {
      i++
   }
   
   while (i < line.length) {
      const char = line[i]
      if (char >= '0' && char <= '9') {
         if (hasDecimal) {
            decimal = decimal * 10 + (char.charCodeAt(0) - 48)
            decimalPlaces++
         } else {
            result = result * 10 + (char.charCodeAt(0) - 48)
         }
      } else if (char === '.' && !hasDecimal) {
         hasDecimal = true
         decimal = 0
         decimalPlaces = 0
      } else {
         break
      }
      i++
   }
   
   // Fixed decimal calculation using proper place counting
   if (hasDecimal && decimalPlaces > 0) {
      const divisor = Math.pow(10, decimalPlaces)
      result = result + decimal / divisor
   }
   
   return [negative ? -result : result, i]
}

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
   
   // Ultra-fast path for common G0/G1 moves (80%+ of lines)
   if ((workingLine[0] === 'G' || workingLine[0] === 'g') && 
       (workingLine[1] === '0' || workingLine[1] === '1') &&
       (workingLine[2] === ' ' || workingLine[2] === '0')) {
      const fastResult = parseG0G1Fast(props, line)
      if (fastResult) {
         // Apply firstGCodeByte/lastGCodeByte logic
         if (props.firstGCodeByte == 0 && fastResult.lineType == 'L') {
            props.firstGCodeByte = fastResult.filePosition
         }
         if (fastResult.lineType == 'L') {
            props.lastGCodeByte = fastResult.filePosition
         }
         return fastResult
      }
   }

   // Try fast regex first for common commands
   const fastMatch = workingLine.match(fastGCodeRegex)
   if (fastMatch) {
      const commandType = fastMatch[1].toUpperCase()
      const commandNum = fastMatch[2]
      const command = commandType + commandNum
      
      // Use fast lookup for common commands
      if (commandType === 'G') {
         let result: Base | null = null
         switch (command) {
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
         }
         
         // Apply firstGCodeByte/lastGCodeByte logic for fast path too
         if (result) {
            if (props.firstGCodeByte == 0 && result.lineType == 'L') {
               props.firstGCodeByte = result.filePosition
            }
            if (result.lineType == 'L') {
               props.lastGCodeByte = result.filePosition
            }
            return result
         }
      }
   }

   // Fallback to original regex for complex cases
   const commands = line.match(commandRegex)
   if (commands === null || commands.length === 0) {
      return new Comment(props, line)
   }

   let result
   const lastCommand = commands[commands.length - 1].toUpperCase()
   switch (lastCommand) {
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
