import ProcessorProperties from '../processorProperties'

export let colorMap: any = {}

export default abstract class Base {
  line: string = ''
  lineNumber: number = 0
  filePosition: number = 0
  isMove: boolean = false

  constructor(line: string) {
    this.line = line
  }
}
