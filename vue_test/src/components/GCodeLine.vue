<template>
   <div :style="{ backgroundColor: background }" class="gcode-line">
      <span class="line-number">{{ lineNumber }}</span>
      <span class="line-content">{{ line }}</span>
   </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
   lineNumber?: number
   line?: string
   lineType?: string
   focus?: boolean
}

const props = withDefaults(defineProps<Props>(), {
   lineNumber: 0,
   line: '',
   lineType: '',
   focus: false,
})

const background = computed(() => {
   if (props.focus) return '#228822aa'
   switch (props.lineType) {
      case 'G':
         return '#00ff00aa'
      case 'M':
         return '#ff0000aa'
      case 'T':
         return '#0000ffaa'
      case 'C': {
         return '#ffa500aa'
      }
      default:
         return '#000000'
   }
})
</script>

<style scoped>
.gcode-line {
   border: 1px solid #888888;
   width: 400px;
   font-size: 16px;
}
.line-number {
   padding-right: 30px;
}

.line-content {
}
</style>
