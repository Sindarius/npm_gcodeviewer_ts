use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// Import our modules
mod gcode_line;
mod processor_properties;
mod processor;
mod GCodeCommands;
mod slicers;
mod utils;

// Re-export key types
pub use gcode_line::*;
pub use processor_properties::*;
pub use processor::*;

// Set up panic hook and allocator for WASM
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen(start)]
pub fn main() {
    console_error_panic_hook::set_once();
    web_sys::console::log_1(&"G-code WASM processor initialized".into());
}

// JavaScript-friendly progress callback
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
    
    // Progress callback function type
    #[wasm_bindgen]
    pub type ProgressCallback;
    
    #[wasm_bindgen(method, js_name = call)]
    pub fn call(this: &ProgressCallback, progress: f64, label: &str);
}

// Macro for easier console logging
macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

// Main processing result structure
#[wasm_bindgen]
#[derive(Clone, Serialize, Deserialize)]
pub struct ProcessingResult {
    success: bool,
    error_message: String,
    line_count: usize,
    move_count: usize,
    processing_time_ms: f64,
}

#[wasm_bindgen]
impl ProcessingResult {
    #[wasm_bindgen(getter)]
    pub fn success(&self) -> bool {
        self.success
    }
    
    #[wasm_bindgen(getter)]
    pub fn error_message(&self) -> String {
        self.error_message.clone()
    }
    
    #[wasm_bindgen]
    pub fn has_error(&self) -> bool {
        !self.error_message.is_empty()
    }
    
    #[wasm_bindgen(constructor)]
    pub fn new(success: bool, error_message: String, line_count: usize, move_count: usize, processing_time_ms: f64) -> ProcessingResult {
        ProcessingResult {
            success,
            error_message,
            line_count,
            move_count,
            processing_time_ms,
        }
    }
    
    #[wasm_bindgen(getter)]
    pub fn line_count(&self) -> usize {
        self.line_count
    }
    
    #[wasm_bindgen(getter)]
    pub fn move_count(&self) -> usize {
        self.move_count
    }
    
    #[wasm_bindgen(getter)]
    pub fn processing_time_ms(&self) -> f64 {
        self.processing_time_ms
    }
}

// Position data for nozzle animation (matches TypeScript interface)
#[wasm_bindgen]
#[derive(Clone, Serialize, Deserialize)]
pub struct PositionData {
    x: f64,
    y: f64,
    z: f64,
    feed_rate: f64,
    extruding: bool,
}

#[wasm_bindgen]
impl PositionData {
    #[wasm_bindgen(constructor)]
    pub fn new(x: f64, y: f64, z: f64, feed_rate: f64, extruding: bool) -> PositionData {
        PositionData { x, y, z, feed_rate, extruding }
    }
    
    #[wasm_bindgen(getter)]
    pub fn x(&self) -> f64 { self.x }
    
    #[wasm_bindgen(getter)]
    pub fn y(&self) -> f64 { self.y }
    
    #[wasm_bindgen(getter)]
    pub fn z(&self) -> f64 { self.z }
    
    #[wasm_bindgen(getter)]
    pub fn feed_rate(&self) -> f64 { self.feed_rate }
    
    #[wasm_bindgen(getter)]
    pub fn extruding(&self) -> bool { self.extruding }
}

// Main G-code processor class
#[wasm_bindgen]
pub struct GCodeProcessor {
    processor: FileProcessor,
    position_tracker: HashMap<u32, PositionData>,
    sorted_positions: Vec<u32>,
}

#[wasm_bindgen]
impl GCodeProcessor {
    #[wasm_bindgen(constructor)]
    pub fn new() -> GCodeProcessor {
        console_log!("Creating new GCodeProcessor");
        
        GCodeProcessor {
            processor: FileProcessor::new(),
            position_tracker: HashMap::new(),
            sorted_positions: Vec::new(),
        }
    }
    
    /// Process G-code file and return results
    #[wasm_bindgen]
    pub fn process_file(&mut self, 
                       file_content: &str, 
                       progress_callback: Option<ProgressCallback>) -> ProcessingResult {
        let start_time = js_sys::Date::now();
        
        console_log!("Starting to process file with {} bytes", file_content.len());
        
        // Clear previous data
        self.position_tracker.clear();
        self.sorted_positions.clear();
        
        // Process the file
        match self.processor.process_file_content(file_content, progress_callback) {
            Ok((gcode_lines, positions)) => {
                // Store position data
                self.position_tracker = positions.into_iter()
                    .map(|(pos, data)| (pos, data))
                    .collect();
                
                // Sort positions for animation
                self.sorted_positions = self.position_tracker.keys().cloned().collect();
                self.sorted_positions.sort();
                
                let processing_time = js_sys::Date::now() - start_time;
                
                console_log!("File processing completed: {} lines, {} positions, {:.2}ms", 
                           gcode_lines.len(), self.position_tracker.len(), processing_time);
                
                ProcessingResult {
                    success: true,
                    error_message: String::new(),
                    line_count: gcode_lines.len(),
                    move_count: self.position_tracker.len(),
                    processing_time_ms: processing_time,
                }
            }
            Err(error) => {
                console_log!("File processing failed: {}", error);
                
                ProcessingResult {
                    success: false,
                    error_message: error,
                    line_count: 0,
                    move_count: 0,
                    processing_time_ms: js_sys::Date::now() - start_time,
                }
            }
        }
    }
    
    /// Get position data for a specific file position
    #[wasm_bindgen]
    pub fn get_position_data(&self, file_position: u32) -> Option<PositionData> {
        self.position_tracker.get(&file_position).cloned()
    }
    
    /// Get all sorted positions (for animation)
    #[wasm_bindgen]
    pub fn get_sorted_positions(&self) -> Vec<u32> {
        self.sorted_positions.clone()
    }
    
    /// Get position count
    #[wasm_bindgen]
    pub fn get_position_count(&self) -> usize {
        self.position_tracker.len()
    }
    
    /// Find closest position to a target file position
    #[wasm_bindgen]
    pub fn find_closest_position(&self, target_position: u32) -> Option<u32> {
        if self.sorted_positions.is_empty() {
            return None;
        }
        
        // Binary search for closest position
        match self.sorted_positions.binary_search(&target_position) {
            Ok(index) => Some(self.sorted_positions[index]),
            Err(index) => {
                if index == 0 {
                    Some(self.sorted_positions[0])
                } else if index >= self.sorted_positions.len() {
                    Some(self.sorted_positions[self.sorted_positions.len() - 1])
                } else {
                    // Find closest between index-1 and index
                    let left = self.sorted_positions[index - 1];
                    let right = self.sorted_positions[index];
                    
                    if target_position - left <= right - target_position {
                        Some(left)
                    } else {
                        Some(right)
                    }
                }
            }
        }
    }
}

// Utility function for performance testing
#[wasm_bindgen]
pub fn benchmark_parsing(file_content: &str, iterations: usize) -> f64 {
    let mut total_time = 0.0;
    
    for _ in 0..iterations {
        let start = js_sys::Date::now();
        let mut processor = FileProcessor::new();
        let _ = processor.process_file_content(file_content, None);
        total_time += js_sys::Date::now() - start;
    }
    
    total_time / iterations as f64
}

// Export version information
#[wasm_bindgen]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}