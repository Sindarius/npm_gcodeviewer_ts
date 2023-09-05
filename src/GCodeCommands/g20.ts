import { Base, Command } from '../GCodeLines'
import Props, { Units } from '../processorproperties'

export default function (props: Props, line: string): Base {
   let command = new Command(line)
   props.units = Units.inches
   return command
}
