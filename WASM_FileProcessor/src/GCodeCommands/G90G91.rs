use crate::gcode_line::{GCodeLine, CommandData};
use crate::processor_properties::ProcessorProperties;

/// Parse G90 (Absolute Positioning) command
/// G90: All coordinates are absolute
pub fn parse_g90_absolute(
    properties: &mut ProcessorProperties,
    line: &str,
    file_position: u32,
    line_number: u32,
) -> Result<GCodeLine, String> {
    
    // Set absolute positioning mode
    properties.absolute_positioning = true;
    
    // Create command data
    let cmd_data = CommandData::new(file_position, line_number, line.to_string(), "G90".to_string());
    Ok(GCodeLine::Command(cmd_data))
}

/// Parse G91 (Relative Positioning) command  
/// G91: All coordinates are relative to current position
pub fn parse_g91_relative(
    properties: &mut ProcessorProperties,
    line: &str,
    file_position: u32,
    line_number: u32,
) -> Result<GCodeLine, String> {
    
    // Set relative positioning mode
    properties.absolute_positioning = false;
    
    // Create command data
    let cmd_data = CommandData::new(file_position, line_number, line.to_string(), "G91".to_string());
    Ok(GCodeLine::Command(cmd_data))
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_parse_g90_absolute() {
        let mut props = ProcessorProperties::new();
        props.absolute_positioning = false; // Start in relative mode
        
        let result = parse_g90_absolute(&mut props, "G90", 100, 1);
        assert!(result.is_ok());
        assert!(props.absolute_positioning); // Should now be absolute
    }
    
    #[test]
    fn test_parse_g91_relative() {
        let mut props = ProcessorProperties::new();
        props.absolute_positioning = true; // Start in absolute mode
        
        let result = parse_g91_relative(&mut props, "G91", 200, 2);
        assert!(result.is_ok());
        assert!(!props.absolute_positioning); // Should now be relative
    }
}