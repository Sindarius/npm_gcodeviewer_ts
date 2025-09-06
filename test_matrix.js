// Test matrix calculation
import init, { test_matrix_calculation } from './WASM_FileProcessor/pkg/gcode_file_processor.js';

async function testMatrix() {
    await init();
    
    console.log("Testing WASM matrix calculation:");
    console.log(test_matrix_calculation());
}

testMatrix();