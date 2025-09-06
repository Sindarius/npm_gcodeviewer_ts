use crate::slicers::{SlicerBase, FeatureType, LayerInfo};
use crate::gcode_line::Color4;

pub struct CuraSlicer {
    name: String,
}

impl CuraSlicer {
    pub fn new() -> Self {
        Self {
            name: "Cura".to_string(),
        }
    }
}

impl SlicerBase for CuraSlicer {
    fn get_feature_color(&self, feature: &FeatureType) -> Color4 {
        match feature {
            FeatureType::ExternalPerimeter => Color4::new(0.0, 0.6, 1.0, 1.0), // Cyan
            FeatureType::Perimeter | FeatureType::InternalPerimeter => Color4::new(0.0, 0.8, 1.0, 1.0), // Light cyan
            FeatureType::Infill => Color4::new(0.8, 0.4, 0.0, 1.0), // Orange
            FeatureType::SolidInfill | FeatureType::TopSolidInfill => Color4::new(1.0, 0.6, 0.0, 1.0), // Bright orange
            FeatureType::Support => Color4::new(1.0, 0.0, 0.8, 1.0), // Magenta
            FeatureType::SupportInterface => Color4::new(1.0, 0.4, 1.0, 1.0), // Light magenta
            FeatureType::Skirt | FeatureType::Brim => Color4::new(0.6, 0.6, 0.6, 1.0), // Gray
            _ => Color4::new(1.0, 1.0, 1.0, 1.0), // White
        }
    }
    
    fn parse_feature_from_comment(&self, comment: &str) -> Option<FeatureType> {
        // Cura uses different comment formats: ";TYPE:WALL-OUTER", ";TYPE:FILL", etc.
        if comment.starts_with(";TYPE:") {
            let type_str = comment[6..].trim().to_lowercase();
            match type_str.as_str() {
                "wall-outer" => Some(FeatureType::ExternalPerimeter),
                "wall-inner" => Some(FeatureType::InternalPerimeter), 
                "fill" => Some(FeatureType::Infill),
                "skin" => Some(FeatureType::SolidInfill),
                "support" => Some(FeatureType::Support),
                "support-interface" => Some(FeatureType::SupportInterface),
                "skirt" => Some(FeatureType::Skirt),
                "prime-tower" => Some(FeatureType::WipeTower),
                _ => None,
            }
        } else {
            None
        }
    }
    
    fn parse_layer_info(&self, comment: &str) -> Option<LayerInfo> {
        // Cura format: ";LAYER:0", ";LAYER_COUNT:245"
        if comment.starts_with(";LAYER:") {
            let layer_str = comment[7..].trim();
            if let Ok(layer_num) = layer_str.parse::<u32>() {
                return Some(LayerInfo {
                    layer_number: layer_num,
                    layer_height: 0.2, // Default, could be parsed from header
                    z_position: layer_num as f64 * 0.2, // Estimate
                });
            }
        }
        None
    }
    
    fn is_perimeter_comment(&self, comment: &str) -> bool {
        comment.contains("WALL") || comment.contains("wall")
    }
    
    fn is_support_comment(&self, comment: &str) -> bool {
        comment.contains("SUPPORT") || comment.contains("support")
    }
    
    fn get_temperature_from_comment(&self, comment: &str) -> Option<f64> {
        // Look for Cura temperature comments
        if comment.contains("temperature") || comment.contains("M104") || comment.contains("M109") {
            for part in comment.split_whitespace() {
                if part.starts_with('S') {
                    if let Ok(temp) = part[1..].parse::<f64>() {
                        if temp > 0.0 && temp < 500.0 {
                            return Some(temp);
                        }
                    }
                }
            }
        }
        None
    }
    
    fn detect_slicer(file_content: &str) -> bool where Self: Sized {
        file_content.contains(";Generated with Cura_SteamEngine") || 
        file_content.contains(";FLAVOR:")
    }
    
    fn get_name(&self) -> &str {
        &self.name
    }
    
    fn get_version_info(&self, file_content: &str) -> Option<String> {
        // Extract Cura version from comment lines
        for line in file_content.lines().take(50) {
            if line.contains("Cura_SteamEngine") {
                if let Some(start) = line.find("Cura_SteamEngine ") {
                    let version_part = &line[start + 17..];
                    if let Some(end) = version_part.find(' ').or_else(|| Some(version_part.len())) {
                        return Some(version_part[..end].trim().to_string());
                    }
                }
            }
        }
        None
    }
}

impl Default for CuraSlicer {
    fn default() -> Self {
        Self::new()
    }
}