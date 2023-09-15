import { Scene } from '@babylonjs/core/scene'
import { CustomMaterial } from '@babylonjs/materials/custom/customMaterial'
import { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { Vector4, Vector3 } from '@babylonjs/core/Maths/math.vector'

export default class ModelMaterial {
   material: CustomMaterial
   toolBuffer: UniformBuffer
   renderMode = 0

   constructor(public scene: Scene) {
      this.buildMaterial()
   }

   buildMaterial() {
      this.material = new CustomMaterial('processor_mat', this.scene)

      this.material.specularColor = new Color3(0.25, 0.25, 0.25)

      //Alpha
      this.material.alpha = 1 // 0.99
      this.material.forceDepthWrite = true

      this.material.AddAttribute('filePosition')
      this.material.AddAttribute('filePositionEnd')
      this.material.AddAttribute('pickColor')
      this.material.AddAttribute('tool')
      this.material.AddAttribute('feedRate')
      this.material.AddAttribute('isPerimeter')
      this.material.AddAttribute('baseColor')

      this.material
         .AddUniform('animationLength', 'float', 5000)
         .AddUniform('currentPosition', 'float', 0)
         .AddUniform('renderMode', 'int', 0)
         .AddUniform('toolColors', 'vec4 [20]', new Float32Array(80))
         .AddUniform('focusedPickColor', 'vec3', new Vector3(0, 0, 0))
         .AddUniform('minFeedRate', 'float', 0)
         .AddUniform('maxFeedRate', 'float', 0)
         .AddUniform('utime', 'float', 0)
         .AddUniform('alphaMode', 'bool', 0)
         .AddUniform('progressMode', 'bool', 0)
         .AddUniform('progressColor', 'vec4', new Vector4(0, 1, 0, 1))
         .AddUniform('lineMesh', 'bool', 0)

      this.material.Vertex_Definitions(`
      attribute float filePosition;
      attribute vec3 pickColor;
      attribute float tool;
      attribute float feedRate;
      attribute float filePositionEnd;
      attribute float isPerimeter;
      attribute vec4 baseColor;
      
      flat out float fFilePosition;
      flat out float fFilePositionEnd;
      flat out vec3 vPickColor;
      flat out float fTool;
      flat out vec3 vFocusedPickColor;
      flat out float fFeedRate;
      flat out float fIsPerimeter;
      flat out vec4 vBaseColor;
      `)

      this.material.Vertex_MainBegin(`
      fFilePosition = filePosition;
      fFilePositionEnd = filePositionEnd;
      vPickColor = pickColor;
      fTool = floor(tool);
      vFocusedPickColor = focusedPickColor;
      fFeedRate = feedRate;
      fIsPerimeter = isPerimeter;
      vBaseColor = baseColor;
      `)

      this.material.Vertex_MainEnd(`
         //vColor = vec4(1.); //prevent color from being applied against our diffuse
      `)

      this.material.Fragment_Definitions(`
      flat in float fFilePosition;
      flat in float fFilePositionEnd;
      flat in vec3 vPickColor;
      flat in float fTool;
      flat in vec3 vFocusedPickColor;
      flat in float fFeedRate;
      flat in float fIsPerimeter;
      flat in vec4 vBaseColor;
      const vec3 lowerBound = vec3(0.3,0.3,0.3);
      `)

      this.material.Fragment_Custom_Diffuse(`

      
         switch(renderMode){
            case 0: 
               diffuseColor = vBaseColor.rgb; 
            break; // use default diffuse color;
            case 1:
               if(fTool < 255.0) {                
                  diffuseColor = toolColors[int(fTool)].rgb;
               }
               else{
                  diffuseColor = vec3(1,0,0); //Travel Color Make Configurable at some point
               }
             break;
            case 2:
               float m = (fFeedRate - minFeedRate) / (maxFeedRate - minFeedRate);
               diffuseColor = mix(vec3(0,0,1), vec3(1,0,0), m); 
               break;
            case 5:
               diffuseColor = vPickColor.rgb;
               break;
         }

         float fShow = currentPosition - fFilePosition;
         bool focused = false;

         if(focusedPickColor == vPickColor && !(currentPosition >= fFilePosition && currentPosition <= fFilePositionEnd)) 
         {
            diffuseColor = vec3(1, 1, 1) - diffuseColor.rgb;
            focused = true;
         }
         else if (fTool >= 254.0)  //Travel
         {
            if(fShow >= 0.0 && fShow < animationLength / 8.0) 
            {
                  diffuseColor = mix(vec3(1.0, 0.0, 0.0), vec3(0.5,0.0,0.0), fShow / animationLength / 2.0);
            }
            else
            {
               discard;
            }
         }
         else //Extrusion
         {
            if (fShow >= 0.0  && fShow < animationLength) 
            { 
               if(currentPosition < fFilePositionEnd){
                  // float animation = smoothstep(0.0, 1.0, fract(utime / 50.0));
                  float animation = sin(2.0 * 3.1415 * utime / 1000.0) * 0.5 + 0.5;
                  diffuseColor = mix(vec3(0, 0, 1), vec3(0,1,0), animation);
               }
               else 
               {
                  diffuseColor = mix(vec3(1, 1, 1) - diffuseColor.rgb, diffuseColor.rgb, fShow / animationLength);
               }
            }
            else if (fShow >= 0.0 && progressMode) 
            {
               diffuseColor = progressColor.rgb;
            }
            else if(fShow < 0.0 && !alphaMode && !progressMode)
            {
               discard;
            }
         }
      `)

      this.material.Fragment_Before_FragColor(`
         if(lineMesh) {
            if(fIsPerimeter < 1.0){
               if(all(lessThan(diffuseColor.rgb,lowerBound.rgb))) {
                  color = vec4(diffuseColor.rgb + lowerBound, color.a);
               }
               else {
                  color = vec4(diffuseColor.rgb - lowerBound, color.a);
               }

            }
            else {
            color = vec4(diffuseColor.rgb, color.a);
            }
         }      

         if(focused) 
         {
            color.a = 1.0;
         }
         else
         {
            color.a = fShow >= 0.0 || !alphaMode ? 0.99 : 0.05; 
         }
      `)

      // this.material.Fragment_MainEnd(`
      // gl_FragColor = vec4(diffuseColor.xyz, color.a);
      // `)

      //Defaults
      this.material.onBindObservable.addOnce(() => {
         this.material.getEffect()?.setBool('lineMesh', false)
         //Set default bools here... does not appear to work on setuniform
         //this.material.getEffect()?.setBool('progressMode', true).setBool('alphaMode', true)
      })

      var time = 0
      this.material.onBindObservable.add(() => {
         time += this.scene.getEngine().getDeltaTime()
         this.material.getEffect()?.setFloat('utime', time)

         //this.material.getEffect()?.setFloat4('progresscolor', 0, 1, 0, 1.0)
      })
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

   updateToolColors(toolColors: number[]) {
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
      this.material.onBindObservable.addOnce(() => {
         this.material.getEffect()?.setFloat('maxFeedRate', feedRate)
      })
   }

   setMinFeedRate(feedRate: number) {
      this.material.onBindObservable.addOnce(() => {
         this.material.getEffect()?.setFloat('minFeedRate', feedRate)
      })
   }

   setAlphaMode(mode: boolean) {
      this.material.onBindObservable.addOnce(() => {
         this.material.getEffect()?.setBool('alphaMode', mode)
      })
   }

   setProgressMode(mode: boolean) {
      this.material.onBindObservable.addOnce(() => {
         this.material.getEffect()?.setBool('progressMode', mode)
      })
   }

   setProgressColor(color: number[]) {
      this.material.onBindObservable.addOnce(() => {
         this.material
            .getEffect()
            ?.setFloat4('progressColor', color[0] / 255, color[1] / 255, color[2] / 255, color[3] / 255)
      })
   }

   setLineMesh(mode: boolean) {
      this.material.onBindObservable.addOnce(() => {
         this.material.getEffect()?.setBool('lineMesh', mode)
      })
   }

   dispose() {
      if (this.material != null) {
         this.material.dispose()
         this.material = null
      }
   }
}
