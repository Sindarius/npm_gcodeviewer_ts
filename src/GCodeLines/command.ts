import Base from './base'
//This is used for non-move gcodes
export default class Command extends Base {
   constructor(line: string) {
      super(line)
   }
}
