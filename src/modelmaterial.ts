import { Scene } from '@babylonjs/core/scene'
import { CustomMaterial } from '@babylonjs/materials/custom/customMaterial'
import { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer'
import { Color3 } from '@babylonjs/core/Maths/math.color'

export default class ModelMaterial {
   material: CustomMaterial
   toolBuffer: UniformBuffer
   renderMode = 0

   constructor(public scene: Scene) {
      this.buildMaterial()
   }

   buildMaterial() {
      this.material = new CustomMaterial('processor_mat', this.scene)
      this.material.specularColor = new Color3(0, 0, 0)
      //this.material.alpha = 0.9

      this.material.AddAttribute('filePosition')
      this.material.AddAttribute('pickColor')
      this.material.AddAttribute('tool')
      this.material.AddAttribute('feedRate')

      this.material.AddUniform('animationLength', 'float', 5000)
      this.material.AddUniform('currentPosition', 'float', 0)
      this.material.AddUniform('renderMode', 'int', 0)
      this.material.AddUniform('toolColors', 'vec4 [20]', new Float32Array(80))
      this.material.AddUniform('focusedPickColor', 'vec3', [0, 0, 0])
      this.material.AddUniform('minFeedRate', 'float', 0)
      this.material.AddUniform('maxFeedRate', 'float', 0)

      this.material.Vertex_Definitions(`
      attribute float filePosition;
      attribute vec3 pickColor;
      attribute float tool;
      attribute float feedRate;

      
      flat out float fShow;
      flat out vec3 vPickColor;
      flat out float fTool;
      flat out vec3 vFocusedPickColor;
      flat out float fFeedRate;

      `)
      this.material.Vertex_MainBegin(`
      fShow = currentPosition - filePosition;
      vPickColor = pickColor;
      fTool = floor(tool);
      vFocusedPickColor = focusedPickColor;
      fFeedRate = feedRate;
      `)

      this.material.Fragment_Definitions(`
      flat in float fShow;
      flat in vec3 vPickColor;
      flat in float fTool;
      flat in vec3 vFocusedPickColor;
      flat in float fFeedRate;
      `)

      this.material.Fragment_Custom_Diffuse(`

         switch(renderMode){
            case 0: break; // use default diffuse color;
            case 1:                
               diffuseColor = toolColors[int(fTool)].rgb;
             break;
            case 2:
               float m = (fFeedRate - minFeedRate) / (maxFeedRate - minFeedRate);
               diffuseColor = mix(vec3(0,0,1), vec3(1,0,0), m); 
               break;
            case 5:
               diffuseColor = vPickColor.rgb;
               break;
         }

         if(focusedPickColor == vPickColor) {
            diffuseColor = vec3(1, 1, 1) - diffuseColor.rgb;
         }
         else
         {
            if (fShow >= 0.0f && fShow < animationLength) 
            { 
               diffuseColor = mix(vec3(1, 1, 1) - diffuseColor.rgb, diffuseColor.rgb, fShow / animationLength);
            }
            else if (fShow < 0.0f)
            {
               discard;
            }
         }
      `)
   }

   updateRenderMode(mode: number) {
      this.renderMode = mode
      this.material.onBindObservable.addOnce(() => {
         this.material.getEffect()?.setInt('renderMode', mode)
      })
   }

   updateCurrentFilePosition(position: number) {
      this.material.onBindObservable.addOnce(() => {
         this.material.getEffect()?.setFloat('currentPosition', position)
      })
   }

   getMaterial() {
      if (this.material == null) {
         this.buildMaterial()
      }
      return this.material
   }

   async updateToolColors(toolColors: number[]) {
      this.material.onBindObservable.addOnce(() => {
         this.material.getEffect()?.setFloatArray4('toolColors', toolColors)
      })
   }

   setPickColor(color: number[]) {
      this.material.onBindObservable.addOnce(() => {
         this.material.getEffect()?.setFloat3('focusedPickColor', color[0] / 255, color[1] / 255, color[2] / 255)
      })
   }

   setMaxFeedRate(feedRate: number) {
      console.log(`max ${feedRate}`)
      this.material.onBindObservable.addOnce(() => {
         this.material.getEffect()?.setFloat('maxFeedRate', feedRate)
      })
   }

   setMinFeedRate(feedRate: number) {
      console.log(`min ${feedRate}`)
      this.material.onBindObservable.addOnce(() => {
         this.material.getEffect()?.setFloat('minFeedRate', feedRate)
      })
   }

   dispose() {
      if (this.material != null) {
         this.material.dispose()
         this.material = null
      }
   }
}
