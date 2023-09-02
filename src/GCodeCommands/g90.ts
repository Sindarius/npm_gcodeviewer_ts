import { Base, Command } from '../GCodeLines'
import Props from '../processorProperties'

export default function (props: Props, line: string): Base {
  let command = new Command(line)
  command.filePosition = props.filePosition
  command.lineNumber = props.lineNumber
  props.absolute = true

  return command
}
