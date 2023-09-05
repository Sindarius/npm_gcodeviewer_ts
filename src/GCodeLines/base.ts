import ProcessorProperties from '../processorProperties'

//C = Comment M=Move A=Arc

export default abstract class Base {
   line: string = ''
   lineNumber: number = 0
   filePosition: number = 0
   type: string = 'C'

   constructor(line: string) {
      this.line = line
   }
}
