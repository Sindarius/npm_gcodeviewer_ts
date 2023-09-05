import { Base } from '../../dist/src/GCodeLines'

export default class ArcMove extends Base {
   type = 'A'
   constructor(line: string) {
      super(line)
   }
}
