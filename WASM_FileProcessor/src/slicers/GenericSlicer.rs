use crate::slicers::{SlicerBase, FeatureType, LayerInfo};
use crate::gcode_line::Color4;

/// Generic slicer implementation (fallback for unknown slicers)
pub struct GenericSlicer {
    name: String,
}

impl GenericSlicer {
    pub fn new() -> Self {
        Self {
            name: "Generic".to_string(),
        }
    }
}

impl SlicerBase for GenericSlicer {
    fn get_feature_color(&self, feature: &FeatureType) -> Color4 {
        match feature {
            FeatureType::Perimeter | FeatureType::ExternalPerimeter => Color4::new(1.0, 1.0, 1.0, 1.0),
            FeatureType::Infill => Color4::new(0.8, 0.8, 0.8, 1.0),
            FeatureType::Support => Color4::new(0.6, 0.6, 1.0, 1.0),
            _ => Color4::white(),
        }
    }
    
    fn parse_feature_from_comment(&self, _comment: &str) -> Option<FeatureType> {
        None // Generic slicer doesn't parse features
    }
    
    fn parse_layer_info(&self, _comment: &str) -> Option<LayerInfo> {
        None // Generic parsing doesn't extract layer info
    }
    
    fn is_perimeter_comment(&self, _comment: &str) -> bool {
        false
    }
    
    fn is_support_comment(&self, _comment: &str) -> bool {
        false
    }
    
    fn get_temperature_from_comment(&self, _comment: &str) -> Option<f64> {
        None
    }
    
    fn detect_slicer(_file_content: &str) -> bool where Self: Sized {
        // Generic slicer is always a fallback
        true
    }
    
    fn get_name(&self) -> &str {
        &self.name
    }
    
    fn get_version_info(&self, _file_content: &str) -> Option<String> {
        None
    }
}

impl Default for GenericSlicer {
    fn default() -> Self {
        Self::new()
    }
}