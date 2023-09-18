import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial'
import { Scene } from '@babylonjs/core/scene'
import { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer'
import { Vector4, Vector3 } from '@babylonjs/core/Maths/math.vector'
import '@babylonjs/core/Materials/standardMaterial'

export default class LineShaderMaterial {
   scene: Scene
   material: ShaderMaterial
   toolBuffer: UniformBuffer
   renderMode = 0

   static readonly vertexShader = `
   #define THIN_INSTANCES
   precision highp float;
   

   attribute vec3 position;
   attribute vec3 normal;

   attribute float filePosition;
   attribute vec3 pickColor;
   attribute float tool;
   attribute float feedRate;
   attribute float filePositionEnd;
   attribute float isPerimeter;
   attribute vec3 baseColor;

   uniform mat4 viewProjection;
   uniform mat4 worldView;
   uniform mat4 view;

   uniform float animationLength;
   uniform float currentPosition;
   uniform vec4 toolColors[20];
   uniform vec3 focusedPickColor;
   uniform float maxFeedRate;
   uniform float minFeedRate;
   uniform bool progressMode;
   uniform vec4 progressColor;
   uniform bool showSupports;
   uniform float utime;
   uniform int renderMode;

   uniform bool alphaMode;
   uniform bool lineMesh;

   varying vec3 eye_normal;
   flat out vec3 vDiffColor;
   flat out float fIsPerimeter;
   flat out float bDiscard;
   flat out float fShow;
   flat out float focused;

// #include<instancesDeclaration>

   void main()
   {
     #include<instancesVertex>
  
      fIsPerimeter = isPerimeter;

      switch(renderMode){
            case 0: 
               vDiffColor = baseColor.rgb; 
            break; // use default diffuse color;
            case 1:
               if(tool < 255.0)
               {
                  vDiffColor = toolColors[int(tool)].rgb;
               }
               else
               {
                  vDiffColor = vec3(1,0,0); //Travel Color Make Configurable at some point
               }
            break;
            case 2:
               float m = (feedRate - minFeedRate) / (maxFeedRate - minFeedRate);
               vDiffColor = mix(vec3(0,0,1), vec3(1,0,0), m); 
               break;
            case 5:
               vDiffColor = pickColor.rgb;
               break;
         }

         fShow = currentPosition - filePosition;
         focused = 0.;

         if(focusedPickColor == pickColor && !(currentPosition >= filePosition && currentPosition <= filePositionEnd)) 
         {
            vDiffColor = vec3(1, 1, 1) - vDiffColor.rgb;
            focused = 1.;
         }
         else if (tool >= 254.0)  //Travel
         {
            if(fShow >= 0.0 && fShow < animationLength / 8.0) 
            {
                  vDiffColor = mix(vec3(1.0, 0.0, 0.0), vec3(0.5,0.0,0.0), fShow / animationLength / 2.0);
            }
            else
            {
               bDiscard = 1.;
            }
         }
         else //Extrusion
         {
            if (fShow >= 0.0  && fShow < animationLength) 
            { 
               if(currentPosition < filePositionEnd){
                  // float animation = smoothstep(0.0, 1.0, fract(utime / 50.0));
                  float animation = sin(2.0 * 3.1415 * utime / 1000.0) * 0.5 + 0.5;
                  vDiffColor = mix(vec3(0, 0, 1), vec3(0,1,0), animation);
               }
               else 
               {
                  vDiffColor = mix(vec3(1, 1, 1) - vDiffColor.rgb, vDiffColor.rgb, fShow / animationLength);
               }
            }
            else if (fShow >= 0.0 && progressMode) 
            {
               vDiffColor = progressColor.rgb;
            }
            else if(fShow < 0.0 && !alphaMode && !progressMode)
            {
               bDiscard = 1.;
            }
         }

         //Final Results
         gl_Position = viewProjection * finalWorld *  vec4(position, 1.0);
         mat4 n =transpose(inverse(worldView * finalWorld));
         eye_normal = (n * (vec4(normal , 1.0) * vec4(position,1.)) ).xyz;
   }`

   static readonly fragmentShader = `
   precision highp float;
   #include<helperFunctions>

   const vec3 LIGHT_TOP_DIR = vec3(-0.4574957, 0.4574957, 0.7624929);
   const vec3 LIGHT_FRONT_DIR = vec3(0.0, 0.0, 1.0);
   
   // x = ambient, y = top diffuse, z = front diffuse, w = global
   const vec4 light_intensity = vec4(0.45, 0.7, 0.75, 0.75);
   varying vec3 eye_normal;

   uniform bool lineMesh;
   uniform bool alphaMode;
   uniform bool progressMode;

   flat in vec3 vDiffColor;
   flat in float fIsPerimeter;
   flat in float bDiscard;
   flat in float fShow;
   flat in float focused;
   const vec3 lowerBound = vec3(0.3,0.3,0.3);

   void main(){

         if( bDiscard > 0.0) {
            discard;
         }

         vec4 diffuseColor = vec4(vDiffColor, 1);

         if(focused > 0.) 
         {
            diffuseColor.a = 1.0;
         }
         else
         {
            diffuseColor.a = fShow >= 0.0 || !alphaMode ? 0.99 : 0.05; 
         }
         
        if(lineMesh) {
            if(fIsPerimeter < 1.0)
            {
               if(all(lessThan(diffuseColor.rgb,lowerBound.rgb))) {
                  diffuseColor = vec4(diffuseColor.rgb + lowerBound, diffuseColor.a);
               }
               else {
                  diffuseColor = vec4(diffuseColor.rgb - lowerBound, diffuseColor.a);
               }
            }
            else
            {
            diffuseColor = vec4(diffuseColor.rgb, diffuseColor.a);
            }
            gl_FragColor = diffuseColor;
         }
         else
         {
            vec3 normal = normalize(eye_normal);
            float NdotL = abs(dot(normal, LIGHT_TOP_DIR));
            float intensity = light_intensity.x + NdotL * light_intensity.y;
            NdotL = abs(dot(normal, LIGHT_FRONT_DIR));
            intensity += NdotL * light_intensity.z;
            gl_FragColor = vec4(diffuseColor.rgb * light_intensity.w * intensity, diffuseColor.a);
         }
   }`

   constructor(scene: Scene) {
      this.scene = scene
      this.buildMaterial()
   }

   buildMaterial() {
      this.material = new ShaderMaterial(
         `line_shader`,
         this.scene,
         {
            vertexSource: LineShaderMaterial.vertexShader,
            fragmentSource: LineShaderMaterial.fragmentShader,
         },
         {
            attributes: [
               'position',
               'normal',
               'baseColor',
               'filePosition',
               'filePositionEnd',
               'pickColor',
               'tool',
               'feedRate',
               'isPerimeter',
            ],
            uniforms: [
               'world',
               'worldView',
               'worldViewProjection',
               'view',
               'projection',
               'viewProjection',
               'animationLength',
               'currentPosition',
               'renderMode',
               'toolColors',
               'focusedPickColor',
               'maxFeedRate',
               'minFeedRate',
               'alphaMode',
               'progressMode',
               'progressColor',
               'lineMesh',
               'showSupports',
               'utime',
            ],
         },
      )

      this.material.alpha = 0.99
      this.material.forceDepthWrite = true
      this.material.backFaceCulling = true

      //Set defaults
      this.material.onBindObservable.addOnce(() => {
         this.material
            .getEffect()
            ?.setFloat('animationLength', 5000)
            .setVector4('progressColor', new Vector4(0, 1, 0, 1))
      })

      //Per loop
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

   showSupports(show: boolean) {
      // this.material.onBindObservable.addOnce(() => {
      //    this.material.getEffect()?.setBool('showSupports', show)
      // })
   }

   dispose() {
      if (this.material != null) {
         this.material.dispose()
         this.material = null
      }
   }
}
