use crate::gcode_line::{GCodeLine, GCodeLineBase};
use crate::processor_properties::ProcessorProperties;
use crate::GCodeCommands::ProcessLine::process_line;
use crate::slicers::detect_slicer;
use crate::{PositionData, ProgressCallback};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

// Console logging for WASM
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

/// High-performance file processor optimized for WASM
pub struct FileProcessor {
    properties: ProcessorProperties,
}

impl FileProcessor {
    pub fn new() -> Self {
        Self {
            properties: ProcessorProperties::new(),
        }
    }
    
    /// Process G-code file content and return parsed lines and position data
    /// Returns (gcode_lines, positions) where positions is Vec<(file_position, PositionData)>
    pub fn process_file_content(
        &mut self,
        file_content: &str,
        progress_callback: Option<ProgressCallback>,
    ) -> Result<(Vec<GCodeLine>, Vec<(u32, PositionData)>), String> {
        
        // Reset processor state for new file
        self.properties.reset();
        
        // Detect slicer type and initialize colors
        let slicer = detect_slicer(file_content);
        self.properties.slicer_name = slicer.get_name().to_string();
        
        // Initialize default feature color from slicer
        self.properties.current_feature_color = slicer.get_feature_color(&crate::slicers::slicer_base::FeatureType::Perimeter);
        
        // Estimate processing parameters
        let file_length = file_content.len();
        let estimated_lines = file_length / 40; // Average ~40 chars per line
        let chunk_size = 100000.min(estimated_lines / 10); // Process in chunks : Changed from 10000
        
        console_log!("Processing {} bytes, estimated {} lines in chunks of {}", 
                    file_length, estimated_lines, chunk_size);
        
        // Heuristic: for very large files, avoid retaining every parsed line to cut memory pressure.
        // We still track positions for rendering, but skip building the heavy GCodeLine vector.
        let store_lines = estimated_lines <= 1_000_000; // ~1M lines threshold (~40MB raw text)

        // Result containers
        let mut gcode_lines = if store_lines {
            Vec::with_capacity((estimated_lines + estimated_lines / 5).min(2_000_000)) // cap capacity
        } else {
            Vec::new()
        };
        // Collect positions in order instead of using a HashMap to avoid massive hash table growth in WASM
        let mut positions: Vec<(u32, PositionData)> = Vec::with_capacity(((estimated_lines * 7) / 10).min(5_000_000));
        
        // Stream through file line by line for optimal memory usage
        let mut file_position = 0u32;
        let mut line_number = 1u32;
        let mut lines_processed = 0usize;
        let mut last_report_time_ms = js_sys::Date::now();
        
        // Process lines in chunks to avoid blocking
        for line in file_content.lines() {
            // Update position tracking
            self.properties.file_position = file_position;
            self.properties.line_number = line_number;
            
            // Process slicer comments for feature detection (before G-code processing)
            if line.trim().starts_with(";TYPE:") {
                // Pass trimmed comment to slicer to ensure consistent matching
                self.process_feature_comment(&slicer, line.trim());
            }
            
            // Process the line2
            match process_line(&mut self.properties, line, file_position, line_number) {
                Ok(gcode_line) => {
                    // Store position data for both extruding and travel moves
                    if let Some(move_data) = gcode_line.as_move() {
                        if move_data.end.x.is_finite() && 
                           move_data.end.y.is_finite() && move_data.end.z.is_finite() &&
                           move_data.start.x.is_finite() && move_data.start.y.is_finite() && move_data.start.z.is_finite() {
                            
                            let pos_data = PositionData::new_with_color(
                                move_data.start.x, move_data.start.y, move_data.start.z,
                                move_data.end.x, move_data.end.y, move_data.end.z,
                                move_data.feed_rate,
                                move_data.extruding,
                                move_data.layer_height,
                                move_data.is_perimeter,
                                move_data.color.clone(),
                                line_number,
                                file_position,
                                (file_position + line.len() as u32),
                                move_data.tool as u32,
                                move_data.is_support,
                            );
                            
                            positions.push((file_position, pos_data));
                        }
                    } else if let Some(arc) = gcode_line.as_arc() {
                        // Tessellate arcs into line segments for rendering when extruding
                        if arc.extruding {
                            // Compute center offsets relative to start
                            let i_off = arc.center.x - arc.start.x;
                            let j_off = arc.center.y - arc.start.y;
                            let k_off = arc.center.z - arc.start.z;

                            // Use current properties for tessellation settings
                            let arc_plane_pp = self.properties.arc_plane.clone();
                            let fix_radius = self.properties.fix_radius;
                            let relative_move = !self.properties.absolute_positioning;
                            let workplace = self.properties.current_workplace().clone();

                            // Arc segment length similar to TS (0.5mm)
                            let arc_seg_len = 0.5f64;

                            // Map processor_properties::ArcPlane -> utils::ArcPlane
                            let utils_plane = match arc_plane_pp {
                                crate::processor_properties::ArcPlane::XY => crate::utils::ArcPlane::XY,
                                crate::processor_properties::ArcPlane::XZ => crate::utils::ArcPlane::XZ,
                                crate::processor_properties::ArcPlane::YZ => crate::utils::ArcPlane::YZ,
                            };

                            if let Ok(arc_result) = crate::utils::tessellate_arc(
                                arc.start.clone(),
                                arc.end.clone(),
                                i_off,
                                j_off,
                                Some(k_off),
                                Some(arc.radius),
                                arc.clockwise,
                                utils_plane,
                                arc_seg_len,
                                fix_radius,
                                relative_move,
                                workplace,
                            ) {
                                // Build segments between points
                                let mut seg_start = arc.start.clone();
                                let mut seg_index = 0u32;
                                for p in arc_result.intermediate_points {
                                    let pos_key = file_position + seg_index; // keep ordering within line
                                    let pd = PositionData::new_with_color(
                                        seg_start.x, seg_start.y, seg_start.z,
                                        p.x, p.y, p.z,
                                        arc.feed_rate,
                                        true,
                                        0.2,
                                        self.properties.current_is_perimeter,
                                        // color from slicer feature
                                        self.properties.current_feature_color.clone(),
                                        line_number,
                                        file_position,
                                        (file_position + line.len() as u32),
                                        self.properties.current_tool.tool_number as u32,
                                        self.properties.current_is_support,
                                    );
                                    positions.push((pos_key, pd));
                                    seg_start = p;
                                    seg_index += 1;
                                }
                            }
                        }
                    }
                    
                    if store_lines {
                        gcode_lines.push(gcode_line);
                    }
                }
                Err(error) => {
                    console_log!("Warning: Failed to parse line {}: {} ({})", line_number, error, line);
                    // Create a comment for unparseable lines
                    if store_lines {
                        gcode_lines.push(GCodeLine::new_comment(file_position, line_number, line.to_string()));
                    }
                }
            }
            
            // Update position for next line (account for stripped newline)
            file_position += line.len() as u32 + 1;
            line_number += 1;
            lines_processed += 1;
            
            // Report progress strictly by time (~75ms cadence) to keep UI responsive
            if lines_processed % 1000 == 0 || lines_processed % chunk_size == 0 {
                let now_ms = js_sys::Date::now();
                if now_ms - last_report_time_ms >= 75.0 {
                    let progress = lines_processed as f64 / estimated_lines as f64;
                    if let Some(ref callback) = progress_callback {
                        callback.call(progress.min(1.0), "Processing G-code");
                    }
                    last_report_time_ms = now_ms;
                }
            }
        }
        
        // Final progress report
        if let Some(ref callback) = progress_callback {
            callback.call(1.0, "Processing complete");
        }
        
        // Update final statistics
        self.properties.line_count = line_number - 1;
        
        // Use tracked statistics for robust logging regardless of whether we retained lines
        let stats = self.get_statistics();
        let comment_count = if store_lines {
            gcode_lines
                .iter()
                .filter(|l| matches!(l, GCodeLine::Comment(_)))
                .count()
        } else {
            0
        };
        console_log!(
            "Processing complete: {} lines, {} moves, {} comments", 
            stats.line_count,
            positions.len(),
            comment_count
        );

        Ok((gcode_lines, positions))
    }
    
    /// Get processing statistics
    pub fn get_statistics(&self) -> ProcessorStatistics {
        ProcessorStatistics {
            line_count: self.properties.line_count,
            max_height: self.properties.max_height,
            min_height: self.properties.min_height,
            max_feed_rate: self.properties.max_feed_rate,
            min_feed_rate: self.properties.min_feed_rate,
            total_segments: self.properties.total_rendered_segments,
            slicer_name: self.properties.slicer_name.clone(),
            first_gcode_byte: self.properties.first_gcode_byte,
            last_gcode_byte: self.properties.last_gcode_byte,
        }
    }
    
    /// Process file in streaming chunks (alternative approach for very large files)
    pub fn process_file_streaming(
        &mut self,
        file_content: &str,
        chunk_size: usize,
        progress_callback: Option<ProgressCallback>,
    ) -> Result<(Vec<GCodeLine>, Vec<(u32, PositionData)>), String> {
        
        self.properties.reset();
        let slicer = detect_slicer(file_content);
        self.properties.slicer_name = slicer.get_name().to_string();
        
        let total_length = file_content.len();
        let mut gcode_lines = Vec::new();
        let mut positions: Vec<(u32, PositionData)> = Vec::new();
        
        let mut file_position = 0u32;
        let mut line_number = 1u32;
        let mut processed_bytes = 0usize;
        
        // Process in streaming chunks
        for line_chunk in file_content.lines().collect::<Vec<_>>().chunks(chunk_size) {
            let mut last_report_time_ms = js_sys::Date::now();
            
            for line in line_chunk {
                self.properties.file_position = file_position;
                self.properties.line_number = line_number;
                if line.trim().starts_with(";TYPE:") {
                    self.process_feature_comment(&slicer, line.trim());
                }
                
                match process_line(&mut self.properties, line, file_position, line_number) {
                    Ok(gcode_line) => {
                        // Store position data for moves (both extruding and travel)
                        if let Some(move_data) = gcode_line.as_move() {
                            if move_data.end.x.is_finite() && 
                               move_data.end.y.is_finite() && move_data.end.z.is_finite() &&
                               move_data.start.x.is_finite() && move_data.start.y.is_finite() && move_data.start.z.is_finite() {
                                
                                let pos_data = PositionData::new_with_color(
                                    move_data.start.x, move_data.start.y, move_data.start.z,
                                    move_data.end.x, move_data.end.y, move_data.end.z,
                                    move_data.feed_rate,
                                    move_data.extruding,
                                    move_data.layer_height,
                                    move_data.is_perimeter,
                                    move_data.color.clone(),
                                    line_number,
                                    file_position,
                                    (file_position + line.len() as u32),
                                    move_data.tool as u32,
                                    move_data.is_support,
                                );
                                positions.push((file_position, pos_data));
                            }
                        }
                        
                        gcode_lines.push(gcode_line);
                    }
                    Err(_) => {
                        // Create comment for unparseable lines
                        gcode_lines.push(GCodeLine::new_comment(file_position, line_number, line.to_string()));
                    }
                }
                
                file_position += line.len() as u32 + 1;
                line_number += 1;
                processed_bytes += line.len() + 1; // +1 for newline
            }
            
            // Report progress after each chunk, throttled by time to prevent spamming UI
            let progress = processed_bytes as f64 / total_length as f64;
            let now_ms = js_sys::Date::now();
            if now_ms - last_report_time_ms >= 75.0 {
                if let Some(ref callback) = progress_callback {
                    callback.call(progress.min(1.0), "Processing G-code");
                }
                last_report_time_ms = now_ms;
            }
        }
        
        Ok((gcode_lines, positions))
    }
    
    /// Validate file content before processing
    pub fn validate_file_content(file_content: &str) -> Result<(), String> {
        if file_content.is_empty() {
            return Err("File is empty".to_string());
        }
        
        if file_content.len() > 500_000_000 { // 500MB limit
            return Err("File too large (>500MB)".to_string());
        }
        
        // Check if it looks like G-code
        let lines: Vec<&str> = file_content.lines().take(100).collect();
        let mut gcode_lines = 0;
        let mut comment_lines = 0;
        
        for line in &lines {
            let trimmed = line.trim();
            if trimmed.starts_with(';') || trimmed.is_empty() {
                comment_lines += 1;
            } else if trimmed.starts_with('G') || trimmed.starts_with('M') || trimmed.starts_with('T') {
                gcode_lines += 1;
            }
        }
        
        if gcode_lines == 0 && comment_lines < lines.len() / 2 {
            return Err("File does not appear to contain valid G-code".to_string());
        }
        
        Ok(())
    }
    
    /// Process slicer feature comments to update coloring state
    fn process_feature_comment(&mut self, slicer: &Box<dyn crate::slicers::slicer_base::SlicerBase>, line: &str) {
        if let Some(feature) = slicer.parse_feature_from_comment(line) {
            // Update current feature color based on detected feature
            self.properties.current_feature_color = slicer.get_feature_color(&feature);
            self.properties.current_is_perimeter = slicer.is_perimeter_comment(line);
            self.properties.current_is_support = slicer.is_support_comment(line);
        }
    }
}

/// Processing statistics
#[derive(Debug, Clone)]
pub struct ProcessorStatistics {
    pub line_count: u32,
    pub max_height: f64,
    pub min_height: f64,
    pub max_feed_rate: f64,
    pub min_feed_rate: f64,
    pub total_segments: u32,
    pub slicer_name: String,
    pub first_gcode_byte: u32,
    pub last_gcode_byte: u32,
}


impl Default for FileProcessor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_validate_file_content() {
        // Valid G-code
        let valid_gcode = "; Test G-code\nG28 ; Home\nG0 X10 Y20\nG1 X15 Y25 E0.1\nM104 S200";
        assert!(FileProcessor::validate_file_content(valid_gcode).is_ok());
        
        // Empty file
        assert!(FileProcessor::validate_file_content("").is_err());
        
        // Not G-code
        let not_gcode = "This is just text\nwith some lines\nbut no G-code commands";
        assert!(FileProcessor::validate_file_content(not_gcode).is_err());
    }
    
    #[test]
    fn test_process_simple_file() {
        let mut processor = FileProcessor::new();
        
        let simple_gcode = concat!(
            "; Test file\n",
            "G28 ; Home all axes\n", 
            "G0 X10 Y20 Z5\n",
            "G1 X15 Y25 E0.1 F1500\n",
            "M104 S200\n"
        );
        
        let result = processor.process_file_content(simple_gcode, None);
        assert!(result.is_ok());
        
        let (gcode_lines, position_tracker) = result.unwrap();
        assert!(gcode_lines.len() >= 4); // At least the lines we specified
        assert!(!position_tracker.is_empty()); // Should have at least one extruding move
    }
}
