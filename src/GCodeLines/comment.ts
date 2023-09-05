import Base from './base'
import ProcessorProperties from '../processorproperties'

export default class Comment extends Base {
   constructor(props: ProcessorProperties, line: string) {
      super(props, line)
   }
}
