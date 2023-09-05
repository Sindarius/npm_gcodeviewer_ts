import { Base, Command } from '../GCodeLines'
import Props from '../processorproperties'

export default function (props: Props, line: string): Base {
   let command = new Command(props, line)
   props.firmwareRetraction = false
   return command
}
