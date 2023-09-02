import Base from './base'
import ProcessorProperties from '../processorProperties'

export default class Comment extends Base {
  constructor(props: ProcessorProperties, line: string) {
    super(line)
    this.lineNumber = props.lineNumber
    this.filePosition = props.filePosition
  }
}
