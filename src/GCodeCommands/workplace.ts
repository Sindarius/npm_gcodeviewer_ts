//This deals with G54-G59.3

import { Base, Command } from '../GCodeLines'
import Props from '../processorproperties'

export default function (props: Props, line: string): Base {
   // Parse workplace coordinate system command
   const match = line.match(/G(5[4-9](?:\.[1-3])?)/i)
   if (match) {
      const workspace = match[1].toUpperCase()
      
      // Map workplace coordinate systems
      const workspaceMap: { [key: string]: number } = {
         '54': 1,  // G54 - Work Coordinate System 1
         '55': 2,  // G55 - Work Coordinate System 2  
         '56': 3,  // G56 - Work Coordinate System 3
         '57': 4,  // G57 - Work Coordinate System 4
         '58': 5,  // G58 - Work Coordinate System 5
         '59': 6,  // G59 - Work Coordinate System 6
         '59.1': 7, // G59.1 - Work Coordinate System 7
         '59.2': 8, // G59.2 - Work Coordinate System 8
         '59.3': 9  // G59.3 - Work Coordinate System 9
      }
      
      const workspaceNum = workspaceMap[workspace]
      if (workspaceNum && workspaceNum !== props.currentWorkspaceSystem) {
         props.currentWorkspaceSystem = workspaceNum
         
         // Update current workplace offset if we have one defined
         const workplaceKey = `workspace${workspaceNum}`
         if (props.workplaceOffsets && props.workplaceOffsets[workplaceKey]) {
            const offset = props.workplaceOffsets[workplaceKey]
            props.currentWorkplace.x = offset.x || 0
            props.currentWorkplace.y = offset.y || 0
            props.currentWorkplace.z = offset.z || 0
         }
      }
   }
   
   return new Command(props, line)
}
