import GCodeLineBase from './GCodeLines/base'
import ProcessorProperties from './processorProperties'
import * as Commands from './GCodeCommands'

export default class Processor {
  gCodeLines: GCodeLineBase[] = []
  ProcessorProperties: ProcessorProperties = new ProcessorProperties()

  constructor() {}

  loadFile(file) {}
}
