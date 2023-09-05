import { Base, MCode } from '../GCodeLines'
import Props from '../processorproperties'

export default function (props: Props, line: string): MCode {
   return new MCode(props, line)
}
