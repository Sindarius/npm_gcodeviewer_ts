use crate::gcode_line::{GCodeLine, CommandData};
use crate::processor_properties::ProcessorProperties;
use crate::utils::{parse_number_fast, skip_whitespace};

/// Parse G28 (Auto Home) command
/// G28: Home all axes, or specific axes if parameters provided
/// Format: G28 [X] [Y] [Z] [E]
pub fn parse_g28_home(
    properties: &mut ProcessorProperties,
    line: &str,
    file_position: u32,
    line_number: u32,
) -> Result<GCodeLine, String> {
    
    let line_bytes = line.as_bytes();
    let mut pos = 0;
    
    // Skip G28 command
    while pos < line_bytes.len() && line_bytes[pos] != b' ' && line_bytes[pos] != b'\t' {
        pos += 1;
    }
    
    let mut home_x = false;
    let mut home_y = false;
    let mut home_z = false;
    let mut home_e = false;
    let mut parameters = Vec::new();
    
    // If no parameters specified, home all axes
    let mut has_parameters = false;
    
    // Parse parameters to determine which axes to home
    while pos < line_bytes.len() {
        pos = skip_whitespace(line_bytes, pos);
        
        if pos >= line_bytes.len() {
            break;
        }
        
        let param_char = line_bytes[pos] as char;
        pos += 1;
        has_parameters = true;
        
        match param_char {
            'X' | 'x' => {
                home_x = true;
                parameters.push(("X".to_string(), 0.0));
            }
            'Y' | 'y' => {
                home_y = true;
                parameters.push(("Y".to_string(), 0.0));
            }
            'Z' | 'z' => {
                home_z = true;
                parameters.push(("Z".to_string(), 0.0));
            }
            'E' | 'e' => {
                home_e = true;
                parameters.push(("E".to_string(), 0.0));
            }
            ';' => break, // Comment start
            _ => {
                // Skip unknown parameters
                while pos < line_bytes.len() && !line_bytes[pos].is_ascii_whitespace() {
                    pos += 1;
                }
            }
        }
    }
    
    // If no specific axes mentioned, home all axes
    if !has_parameters {
        home_x = true;
        home_y = true;  
        home_z = true;
        home_e = true;
        parameters.push(("X".to_string(), 0.0));
        parameters.push(("Y".to_string(), 0.0));
        parameters.push(("Z".to_string(), 0.0));
        parameters.push(("E".to_string(), 0.0));
    }
    
    // Update processor state - homing resets positions to 0
    if home_x {
        properties.current_position.x = 0.0;
    }
    if home_y {
        properties.current_position.y = 0.0;
    }
    if home_z {
        properties.current_position.z = 0.0;
    }
    if home_e {
        properties.current_e = 0.0;
    }
    
    // Create command data
    let mut cmd_data = CommandData::new(file_position, line_number, line.to_string(), "G28".to_string());
    cmd_data.parameters = parameters;
    
    Ok(GCodeLine::Command(cmd_data))
}

/// Parse G29 (Bed Leveling) command
pub fn parse_g29_bed_leveling(
    _properties: &mut ProcessorProperties,
    line: &str,
    file_position: u32,
    line_number: u32,
) -> Result<GCodeLine, String> {
    
    // G29 just triggers bed leveling - no state changes needed
    let cmd_data = CommandData::new(file_position, line_number, line.to_string(), "G29".to_string());
    Ok(GCodeLine::Command(cmd_data))
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_parse_g28_home_all() {
        let mut props = ProcessorProperties::new();
        props.current_position.x = 100.0;
        props.current_position.y = 50.0;
        props.current_position.z = 10.0;
        props.current_e = 5.0;
        
        let result = parse_g28_home(&mut props, "G28", 100, 1);
        assert!(result.is_ok());
        
        // All positions should be reset to 0
        assert_eq!(props.current_position.x, 0.0);
        assert_eq!(props.current_position.y, 0.0);
        assert_eq!(props.current_position.z, 0.0);
        assert_eq!(props.current_e, 0.0);
    }
    
    #[test]
    fn test_parse_g28_home_specific() {
        let mut props = ProcessorProperties::new();
        props.current_position.x = 100.0;
        props.current_position.y = 50.0;
        props.current_position.z = 10.0;
        
        let result = parse_g28_home(&mut props, "G28 X Z", 200, 2);
        assert!(result.is_ok());
        
        // Only X and Z should be homed
        assert_eq!(props.current_position.x, 0.0);
        assert_eq!(props.current_position.y, 50.0); // Unchanged
        assert_eq!(props.current_position.z, 0.0);
    }
}