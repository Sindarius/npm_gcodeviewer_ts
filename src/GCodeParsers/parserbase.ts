import ProcessorProperties from '../processorproperties'
export default abstract class ParserBase {
   feature = ''
   perimeter = false
   support = false
   missingFeatures = []

   constructor() {}

   processHeader(file: string[], props: ProcessorProperties) {}
}
