import { Base, MCode } from '../GCodeLines'
import Props from '../processorProperties'

export default function (props: Props, line: string): MCode {
   return new MCode(line)
}
