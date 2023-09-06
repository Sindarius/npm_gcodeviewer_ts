import Base from './base'
import ProcessorProperties from '../processorproperties'

export default class Comment extends Base {
   type = 'C'
   constructor(props: ProcessorProperties, line: string) {
      super(props, line)
   }
}
