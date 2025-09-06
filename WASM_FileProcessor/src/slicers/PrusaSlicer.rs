use crate::slicers::{SlicerBase, FeatureType, LayerInfo};
use crate::gcode_line::Color4;

pub struct PrusaSlicer {
    name: String,
}

impl PrusaSlicer {
    pub fn new() -> Self {
        Self {
            name: "PrusaSlicer".to_string(),
        }
    }
}

impl SlicerBase for PrusaSlicer {
    fn get_feature_color(&self, feature: &FeatureType) -> Color4 {
        match feature {
            FeatureType::ExternalPerimeter => Color4::new(1.0, 0.4, 0.0, 1.0), // Orange
            FeatureType::Perimeter | FeatureType::InternalPerimeter => Color4::new(1.0, 0.8, 0.0, 1.0), // Yellow-orange
            FeatureType::Infill => Color4::new(0.0, 1.0, 0.0, 1.0), // Green
            FeatureType::SolidInfill | FeatureType::TopSolidInfill => Color4::new(0.0, 0.8, 0.0, 1.0), // Dark green
            FeatureType::Support => Color4::new(0.0, 0.4, 1.0, 1.0), // Blue
            FeatureType::SupportInterface => Color4::new(0.4, 0.8, 1.0, 1.0), // Light blue
            FeatureType::BridgeInfill => Color4::new(1.0, 0.0, 1.0, 1.0), // Magenta
            FeatureType::GapFill => Color4::new(0.8, 0.8, 0.0, 1.0), // Yellow
            FeatureType::Skirt | FeatureType::Brim => Color4::new(0.5, 0.5, 0.5, 1.0), // Gray
            _ => Color4::new(1.0, 1.0, 1.0, 1.0), // White for unknown
        }
    }
    
    fn parse_feature_from_comment(&self, comment: &str) -> Option<FeatureType> {
        let comment_lower = comment.to_lowercase();
        
        if comment_lower.contains("external perimeter") {
            Some(FeatureType::ExternalPerimeter)
        } else if comment_lower.contains("perimeter") {
            Some(FeatureType::Perimeter)
        } else if comment_lower.contains("solid infill") {
            Some(FeatureType::SolidInfill)
        } else if comment_lower.contains("top solid infill") {
            Some(FeatureType::TopSolidInfill)
        } else if comment_lower.contains("infill") {
            Some(FeatureType::Infill)
        } else if comment_lower.contains("support interface") {
            Some(FeatureType::SupportInterface)
        } else if comment_lower.contains("support") {
            Some(FeatureType::Support)
        } else if comment_lower.contains("bridge") {
            Some(FeatureType::BridgeInfill)
        } else if comment_lower.contains("gap fill") {
            Some(FeatureType::GapFill)
        } else if comment_lower.contains("skirt") {
            Some(FeatureType::Skirt)
        } else if comment_lower.contains("brim") {
            Some(FeatureType::Brim)
        } else {
            None
        }
    }
    
    fn parse_layer_info(&self, comment: &str) -> Option<LayerInfo> {
        // PrusaSlicer format: "; LAYER_CHANGE\n; Z:0.3\n; layer num/total_layer_count: 1/245"
        if comment.contains("LAYER_CHANGE") || comment.starts_with("; Z:") {
            if let Some(z_start) = comment.find("; Z:") {
                let z_line = &comment[z_start + 4..];
                if let Some(z_end) = z_line.find('\n').or_else(|| Some(z_line.len())) {
                    let z_str = z_line[..z_end].trim();
                    if let Ok(z_pos) = z_str.parse::<f64>() {
                        // Try to find layer number
                        let layer_num = if let Some(layer_start) = comment.find("layer num/total_layer_count: ") {
                            let layer_line = &comment[layer_start + 29..];
                            if let Some(slash_pos) = layer_line.find('/') {
                                layer_line[..slash_pos].trim().parse::<u32>().unwrap_or(0)
                            } else {
                                0
                            }
                        } else {
                            0
                        };
                        
                        return Some(LayerInfo {
                            layer_number: layer_num,
                            layer_height: 0.2, // Default, could parse from settings
                            z_position: z_pos,
                        });
                    }
                }
            }
        }
        None
    }
    
    fn is_perimeter_comment(&self, comment: &str) -> bool {
        let comment_lower = comment.to_lowercase();
        comment_lower.contains("perimeter")
    }
    
    fn is_support_comment(&self, comment: &str) -> bool {
        let comment_lower = comment.to_lowercase();
        comment_lower.contains("support")
    }
    
    fn get_temperature_from_comment(&self, comment: &str) -> Option<f64> {
        // Look for temperature settings in comments
        if comment.contains("temperature") {
            // Extract numeric value after "temperature"
            if let Some(temp_start) = comment.find("temperature") {
                let temp_substr = &comment[temp_start..]; 
                for word in temp_substr.split_whitespace() {
                    if let Ok(temp) = word.trim_matches(&[';', '°', 'C', '=', ':'][..]).parse::<f64>() {
                        if temp > 0.0 && temp < 500.0 { // Reasonable temperature range
                            return Some(temp);
                        }
                    }
                }
            }
        }
        None
    }
    
    fn detect_slicer(file_content: &str) -> bool where Self: Sized {
        file_content.contains("; generated by PrusaSlicer")
    }
    
    fn get_name(&self) -> &str {
        &self.name
    }
    
    fn get_version_info(&self, file_content: &str) -> Option<String> {
        // Extract PrusaSlicer version: "; generated by PrusaSlicer 2.6.0+win64 on 2023-04-15 at 14:30:25 UTC"
        if let Some(start) = file_content.find("; generated by PrusaSlicer ") {
            let version_line = &file_content[start + 27..];
            if let Some(end) = version_line.find(" on ").or_else(|| version_line.find('\n')) {
                return Some(version_line[..end].trim().to_string());
            }
        }
        None
    }
}

impl Default for PrusaSlicer {
    fn default() -> Self {
        Self::new()
    }
}