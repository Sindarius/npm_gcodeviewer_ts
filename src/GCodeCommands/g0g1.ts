import { Move, Base } from '../GCodeLines'
import Props from '../processorProperties'

//Reminder Add G53 check

export default function (props: Props, line: string): Base {
  var move = new Move(line)

  return move
}
