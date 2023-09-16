import ProcessorProperties from '../processorproperties'
export default abstract class SlicerBase {
   feature = ''
   currentFeatureColor = [1, 1, 1, 1]
   currentIsPerimeter = true
   currentIsSupport = false
   perimeter = false
   support = false
   missingFeatures = []

   constructor() {}

   processComment(comment: string) {}

   isPerimeter(): boolean {
      return this.perimeter
   }

   isSupport(): boolean {
      return this.support
   }

   getFeatureColor() {
      return [1, 1, 1, 1]
   }

   reportMissingFeature(featureName) {
      if (!this.missingFeatures.includes(featureName)) {
         console.error(`Missing feature ${featureName}`)
         this.missingFeatures.push(featureName)
      }
   }

   processComments(file: string[], props: ProcessorProperties) {}
}
