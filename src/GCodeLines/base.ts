import ProcessorProperties from '../processorProperties'

export default abstract class Base {
  line: string = ''
  lineNumber: number = 0
  filePosition: number = 0

  constructor(line: string) {
    this.line = line
  }
}
