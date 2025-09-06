use crate::slicers::{SlicerBase, FeatureType, LayerInfo};
use crate::gcode_line::Color4;

pub struct OrcaSlicer {
    name: String,
}

impl OrcaSlicer {
    pub fn new() -> Self {
        Self {
            name: "OrcaSlicer".to_string(),
        }
    }
}

impl SlicerBase for OrcaSlicer {
    fn get_feature_color(&self, feature: &FeatureType) -> Color4 {
        match feature {
            FeatureType::ExternalPerimeter => Color4::new(1.0, 0.0, 0.6, 1.0), // Deep magenta
            FeatureType::Perimeter | FeatureType::InternalPerimeter => Color4::new(1.0, 0.0, 0.8, 1.0), // Magenta
            FeatureType::Infill => Color4::new(0.8, 0.0, 1.0, 1.0), // Purple
            FeatureType::SolidInfill | FeatureType::TopSolidInfill => Color4::new(0.6, 0.0, 1.0, 1.0), // Blue-purple
            FeatureType::Support => Color4::new(1.0, 0.4, 0.0, 1.0), // Orange
            FeatureType::SupportInterface => Color4::new(1.0, 0.6, 0.4, 1.0), // Light orange
            FeatureType::BridgeInfill => Color4::new(0.0, 1.0, 1.0, 1.0), // Cyan
            FeatureType::GapFill => Color4::new(1.0, 1.0, 0.0, 1.0), // Yellow
            _ => Color4::new(1.0, 1.0, 1.0, 1.0), // White
        }
    }
    
    fn parse_feature_from_comment(&self, comment: &str) -> Option<FeatureType> {
        // OrcaSlicer uses enhanced PrusaSlicer-like comments
        let comment_lower = comment.to_lowercase();
        
        if comment_lower.contains("outer wall") || comment_lower.contains("external perimeter") {
            Some(FeatureType::ExternalPerimeter)
        } else if comment_lower.contains("inner wall") || comment_lower.contains("perimeter") {
            Some(FeatureType::InternalPerimeter)
        } else if comment_lower.contains("top surface") || comment_lower.contains("top solid infill") {
            Some(FeatureType::TopSolidInfill)
        } else if comment_lower.contains("bottom surface") || comment_lower.contains("solid infill") {
            Some(FeatureType::SolidInfill)
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
        } else {
            None
        }
    }
    
    fn parse_layer_info(&self, comment: &str) -> Option<LayerInfo> {
        // OrcaSlicer has enhanced layer info
        if comment.contains("LAYER_CHANGE") || comment.starts_with("; Z:") {
            if let Some(z_start) = comment.find("; Z:") {
                let z_line = &comment[z_start + 4..];
                if let Some(z_end) = z_line.find('\n').or_else(|| Some(z_line.len())) {
                    let z_str = z_line[..z_end].trim();
                    if let Ok(z_pos) = z_str.parse::<f64>() {
                        // Look for layer number in OrcaSlicer format
                        let layer_num = if comment.contains("LAYER:") {
                            if let Some(layer_start) = comment.find("LAYER:") {
                                let layer_line = &comment[layer_start + 6..];
                                if let Some(layer_end) = layer_line.find(&['\n', ' ', ';'][..]) {
                                    layer_line[..layer_end].trim().parse::<u32>().unwrap_or(0)
                                } else {
                                    0
                                }
                            } else {
                                0
                            }
                        } else {
                            0
                        };
                        
                        return Some(LayerInfo {
                            layer_number: layer_num,
                            layer_height: 0.2,
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
        comment_lower.contains("wall") || comment_lower.contains("perimeter")
    }
    
    fn is_support_comment(&self, comment: &str) -> bool {
        comment.to_lowercase().contains("support")
    }
    
    fn get_temperature_from_comment(&self, comment: &str) -> Option<f64> {
        if comment.contains("temperature") || comment.contains("nozzle_temperature") {
            for word in comment.split_whitespace() {
                if let Ok(temp) = word.trim_matches(&[';', '°', 'C', '=', ':'][..]).parse::<f64>() {
                    if temp > 0.0 && temp < 500.0 {
                        return Some(temp);
                    }
                }
            }
        }
        None
    }
    
    fn detect_slicer(file_content: &str) -> bool where Self: Sized {
        file_content.contains("generated by OrcaSlicer") ||
        file_content.contains("; OrcaSlicer")
    }
    
    fn get_name(&self) -> &str {
        &self.name
    }
    
    fn get_version_info(&self, file_content: &str) -> Option<String> {
        if let Some(start) = file_content.find("generated by OrcaSlicer ") {
            let version_line = &file_content[start + 24..];
            if let Some(end) = version_line.find(' ').or_else(|| version_line.find('\n')) {
                return Some(version_line[..end].trim().to_string());
            }
        }
        None
    }
}

impl Default for OrcaSlicer {
    fn default() -> Self {
        Self::new()
    }
}