import { Scene } from '@babylonjs/core/scene'
import { CustomMaterial } from '@babylonjs/materials/custom/customMaterial'
import { Effect } from '@babylonjs/core/Materials/effect'
import { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer'

export default class ModelMaterial {
   material: CustomMaterial
   showPick: boolean = false
   toolBuffer: UniformBuffer

   constructor(public scene: Scene) {
      this.buildMaterial()
   }

   buildMaterial() {
      this.material = new CustomMaterial('processor_mat', this.scene)
      //this.material.alpha = 0.9

      this.material.AddAttribute('filePosition')
      this.material.AddAttribute('pickColor')
      this.material.AddAttribute('tool')

      this.material.AddUniform('currentPosition', 'float', 0)
      this.material.AddUniform('showPickColor', 'bool', false)
      this.material.AddUniform('renderMode', 'int', 1)
      this.material.AddUniform('toolColors', 'vec4 [20]', new Float32Array(80))
      this.material.AddUniform('focusedPickColor', 'vec3', [0, 0, 0])

      this.material.Vertex_Definitions(`
      attribute float filePosition;
      attribute vec3 pickColor;
      attribute float tool;

      
      flat out float fShow;
      flat out vec3 vPickColor;
      flat out float fTool;
      flat out vec3 vFocusedPickColor;

      `)
      this.material.Vertex_MainBegin(`
      fShow = currentPosition - filePosition;
      vPickColor = pickColor;
      fTool = floor(tool);
      vFocusedPickColor = focusedPickColor;
      `)
      this.material.Fragment_Definitions(`
      flat in float fShow;
      flat in vec3 vPickColor;
      flat in float fTool;
      flat in vec3 vFocusedPickColor;
      `)

      this.material.Fragment_Custom_Diffuse(`

         switch(renderMode){
            case 0: break; // use default diffuse color;
            case 1:                
               diffuseColor.rgb *= toolColors[int(fTool)].rgb;
             break;
         }

         if(focusedPickColor == vPickColor) {
            diffuseColor.rgb = vec3(1,0,0);
         }
         else if(showPickColor)
         {
            diffuseColor.rgb = vPickColor;
         }
         else
         {
            if (fShow > 0.0f && fShow < 5000.0f) 
            { 
               diffuseColor.rgb *= mix(vec3(0,1,0), diffuseColor.rgb, fShow / 5000.0f);
            }
            else if(fShow > 5000.0f)
            {
            }
            else
            {
               discard;
            }
         }
      `)

      this.material.onBindObservable.addOnce(() => {
         this.material.getEffect()?.setInt('renderMode', 1)
      })
   }

   get getEffect(): Effect | null {
      if (this.material && this.material.getEffect && this.material.getEffect()) {
         return this.material.getEffect()
      }
      return null
   }

   updateRenderMode(mode: number) {
      this.material.onBindObservable.addOnce(() => {
         this.material.getEffect()?.setInt('renderMode', mode)
      })
   }

   updateCurrentFilePosition(position: number) {
      this.material.onBindObservable.addOnce(() => {
         this.material.getEffect()?.setFloat('currentPosition', position)
      })
   }

   showPickColor(show: boolean) {
      this.material.onBindObservable.addOnce(() => {
         this.material.getEffect()?.setBool('showPickColor', show)
      })
   }

   getMaterial() {
      if (this.material == null) {
         this.buildMaterial()
      }
      return this.material
   }

   //https://playground.babylonjs.com/#MQG92I#29 UniformBuffer sample
   async updateToolColors(toolColors: number[]) {
      this.material.onBindObservable.addOnce(() => {
         this.material.getEffect()?.setFloatArray4('toolColors', toolColors)
      })
   }

   setPickColor(color: number[]) {
      console.log(color)
      this.material.onBindObservable.addOnce(() => {
         this.material.getEffect()?.setFloat3('focusedPickColor', color[0] / 255, color[1] / 255, color[2] / 255)
      })
   }

   dispose() {
      if (this.material != null) {
         this.material.dispose()
         this.material = null
      }
   }
}
