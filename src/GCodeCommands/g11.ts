import { Base, Command } from '../GCodeLines'
import Props from '../processorProperties'

export default function (props: Props, line: string): Base {
  let command = new Command(line)
  props.firmwareRetraction = false
  return command
}
