import { Base, MCode } from '../GCodeLines'
import Props from '../processorProperties'

export default function (props: Props, line: string): Base {
  return new MCode(line)
}
