import { Base } from '../../dist/src/GCodeLines'
import ProcessorProperties from '../processorproperties'

export default class ArcMove extends Base {
   type = 'A'
   constructor(props: ProcessorProperties, line: string) {
      super(props, line)
   }
}
