import { Base, Command } from '../GCodeLines'
import Props from '../processorProperties'

export default function (props: Props, line: string): Base {
  var command = new Command(line)
  command.line = line
  return command
}
