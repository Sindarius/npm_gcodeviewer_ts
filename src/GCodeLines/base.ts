import ProcessorProperties from '../processorproperties'

//C = Comment M=Move A=Arc

export default abstract class Base {
   line: string = ''
   lineNumber: number = 0
   filePosition: number = 0
   type: string = 'C'

   constructor(props: ProcessorProperties, line: string) {
      this.line = line
      this.lineNumber = props.lineNumber
      this.filePosition = props.filePosition
   }
}
