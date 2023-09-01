import { Base, Command } from '../GCodeLines'
import Props, { Units } from '../processorProperties'

export default function (props: Props, line: string): Base {
  var command = new Command(line)
  props.units = Units.inches
  return command
}
