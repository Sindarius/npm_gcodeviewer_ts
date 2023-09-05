//This deals with G54-G59.2

import { Base, Command } from '../GCodeLines'
import Props from '../processorproperties'

export default function (props: Props, line: string): Base {
   return new Command(props, line)
}
