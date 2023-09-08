<script setup lang="ts">
import { vModelSelect } from 'vue'
import HelloWorld from './components/HelloWorld.vue'
import TheWelcome from './components/TheWelcome.vue'
import GCodeLine from './components/GCodeLine.vue'
import Viewer_Proxy from 'test'
import { ref, onMounted, onUnmounted, reactive, watch } from 'vue'
import debounce from 'lodash.debounce'

let viewer: Viewer | null = null
const viewercanvas = ref(null)
const gcodeLine = ref({ line: '' })
const filePos = ref(0)
const renderMode = ref(0)
const playing = ref('mdi-play')
const start = ref(0)
const end = ref(0)
const lines = ref<string[]>([])

const renderModes = [
   { label: 'Default', value: 0 },
   { label: 'Tool', value: 1 },
   { label: 'Feed Rate', value: 2 },
   { label: 'Color Index', value: 5 },
]

onMounted(() => {
   if (viewercanvas.value != null) {
      viewer = new Viewer_Proxy(viewercanvas.value)
      viewer.init()
      viewer.passThru = (e) => {
         switch (e.type) {
            case 'currentline':
               gcodeLine.value.line = e
               break
            case 'fileloaded':
               start.value = e.start
               end.value = e.end
               break
            case 'positionupdate':
               filePos.value = e.position
               break
            case 'getgcodes':
               lines.value.length = 0
               lines.value.push(...e.lines)
               lineNumber = lines.value.filter((l) => l.focus)[0].lineNumber
               break
         }
      }
   }
})

onUnmounted(() => {})

async function openLocalFile(file: File): Promise<void> {
   if (!file) return
   const reader = new FileReader()
   reader.addEventListener('load', async (event) => {
      const blob = event?.target?.result
      viewer.loadFile(blob)
   })
   reader.readAsText(file)
}

function dragOver(event: DragEvent): void {
   if ((event.dataTransfer?.files.length ?? -1) > 0) {
      //const  file = event.dataTransfer?.files[0]
   }
}

function dragLeave(event: DragEvent): void {
   //Do nothing at the moment
}

async function drop(event: DragEvent): Promise<void> {
   if ((event.dataTransfer?.files.length ?? -1) > 0) {
      const file = event.dataTransfer?.files[0]
      if (file) {
         await openLocalFile(file)
      }
   }
}

watch(renderMode, (newVal, oldVal) => {
   viewer.setRenderMode(newVal)
})

watch(filePos, (newVal, oldVal) => {
   viewer.updateFilePosition(newVal)
})

watch(
   filePos,
   debounce((newVal) => {
      viewer.getGCodes(filePos.value, 21)
   }, 10),
)

function reset() {
   viewer.reset()
   viewer.updateColorTest()
}

function colortest() {
   viewer.updateColorTest()
}

function filePosInput() {
   viewer.updateFilePosition(filePos.value)
}

let timeOutId = -1
let lineNumber = 0
function toggleIncrement() {
   if (timeOutId > 0) {
      window.clearInterval(timeOutId)
      timeOutId = -1
      playing.value = 'mdi-play'
   } else {
      playing.value = 'mdi-stop'
      timeOutId = window.setInterval(() => {
         //viewer.goToLineNumber(lineNumber++)
         filePos.value = Number(filePos.value) + 200
      }, 20)
   }
}
function lineClicked(props: any[]) {
   filePos.value = props[0]
}
</script>

<template>
   <header>
      <div class="gcodeline">{{ gcodeLine.line }}</div>
      <canvas
         class="canvasFull"
         tabindex="1"
         ref="viewercanvas"
         @dragover.prevent="dragOver"
         @dragleave="dragLeave"
         @drop.prevent="drop"
      />
      <v-select
         item-title="label"
         item-value="value"
         class="reset"
         label="Render Mode"
         v-model="renderMode"
         :items="renderModes"
      ></v-select>
      <form @submit.prevent="filePosInput">
         <v-text-field density="compact" variant="outlined" class="filePosInput" v-model="filePos" />
      </form>
      <v-btn class="filePlay" size="large" type="button" @click="toggleIncrement"
         ><v-icon :icon="playing"></v-icon
      ></v-btn>
      <div class="lines">
         <GCodeLine
            v-for="l in lines"
            :key="l"
            :line="l.line"
            :line-number="l.lineNumber"
            :line-type="l.lineType"
            :focus="l.focus"
            :file-position="l.filePosition"
            @selected="lineClicked"
         ></GCodeLine>
      </div>
      <v-slider v-model="filePos" class="slider-pos" :min="start" :max="end" :step="1"></v-slider>
   </header>

   <main></main>
</template>

<style scoped>
header {
   line-height: 1.5;
}

.logo {
   display: block;
   margin: 0 auto 2rem;
}

@media (min-width: 1024px) {
   header {
      display: flex;
      place-items: center;
      padding-right: calc(var(--section-gap) / 2);
   }

   .logo {
      margin: 0 2rem 0 0;
   }

   header .wrapper {
      display: flex;
      place-items: flex-start;
      flex-wrap: wrap;
   }
}

.canvasFull {
   width: 100%;
   height: 100%;
   position: absolute;
   top: 0;
   left: 0;
   z-index: 10;
}
.gcodeline {
   position: absolute;
   top: 5px;
   left: 5px;
   z-index: 11;
}

.reset {
   position: absolute;
   top: 10px;
   right: 10px;
   z-index: 11;
   width: 300px;
}

.colortest {
   position: absolute;
   top: 30px;
   right: 5px;
   z-index: 11;
}

.filePosInput {
   position: absolute;
   top: 30px;
   left: 5px;
   z-index: 11;
   width: 200px;
}

.filePlay {
   position: absolute;
   top: 30px;
   left: 210px;
   z-index: 11;
}

.slider-pos {
   position: absolute;
   bottom: 30px;
   z-index: 11;
   left: 100px;
   right: 100px;
}
.lines {
   position: absolute;
   top: 100px;
   bottom: 30px;
   left: 10px;
   overflow: none;
   z-index: 11;
}
</style>
