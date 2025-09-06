use crate::slicers::{SlicerBase, FeatureType, LayerInfo, detect_slicer};
use crate::gcode_line::{GCodeLine, CommentData, Color4};
use std::collections::HashMap;

/// Enhanced slicer detection with comprehensive parsing capabilities
pub struct EnhancedSlicerDetector {
    slicer: Box<dyn SlicerBase>,
    current_layer: Option<LayerInfo>,
    current_feature: Option<FeatureType>,
    feature_stack: Vec<FeatureType>, // Track nested features
    layer_heights: HashMap<u32, f64>, // Layer number -> Z height
    feature_colors: HashMap<FeatureType, Color4>,
    settings_cache: HashMap<String, String>, // Cache parsed settings
}

impl EnhancedSlicerDetector {
    pub fn new(file_content: &str) -> Self {
        let slicer = detect_slicer(file_content);
        let mut feature_colors = HashMap::new();
        
        // Initialize feature colors from slicer
        for feature in &[
            FeatureType::Perimeter,
            FeatureType::ExternalPerimeter,
            FeatureType::InternalPerimeter,
            FeatureType::Infill,
            FeatureType::SolidInfill,
            FeatureType::TopSolidInfill,
            FeatureType::Support,
            FeatureType::SupportInterface,
            FeatureType::BridgeInfill,
            FeatureType::GapFill,
            FeatureType::Skirt,
            FeatureType::Brim,
            FeatureType::WipeTower,
        ] {
            feature_colors.insert(feature.clone(), slicer.get_feature_color(feature));
        }
        
        Self {
            slicer,
            current_layer: None,
            current_feature: None,
            feature_stack: Vec::new(),
            layer_heights: HashMap::new(),
            feature_colors,
            settings_cache: HashMap::new(),
        }
    }
    
    /// Process a comment line and extract slicer-specific information
    pub fn process_comment(&mut self, comment: &CommentData) -> SlicerInfo {
        let comment_text = &comment.comment_text;
        
        // Check for layer information
        if let Some(layer_info) = self.slicer.parse_layer_info(comment_text) {
            self.layer_heights.insert(layer_info.layer_number, layer_info.z_position);
            self.current_layer = Some(layer_info.clone());
            
            return SlicerInfo {
                info_type: SlicerInfoType::LayerChange,
                layer_info: Some(layer_info),
                feature_type: None,
                temperature: None,
                setting: None,
            };
        }
        
        // Check for feature type changes
        if let Some(feature) = self.slicer.parse_feature_from_comment(comment_text) {
            // Handle feature stack for nested features
            if self.current_feature.is_some() && 
               !matches!(feature, FeatureType::Unknown) {
                self.feature_stack.push(self.current_feature.clone().unwrap());
            }
            
            self.current_feature = Some(feature.clone());
            
            return SlicerInfo {
                info_type: SlicerInfoType::FeatureChange,
                layer_info: self.current_layer.clone(),
                feature_type: Some(feature),
                temperature: None,
                setting: None,
            };
        }
        
        // Check for temperature information
        if let Some(temp) = self.slicer.get_temperature_from_comment(comment_text) {
            return SlicerInfo {
                info_type: SlicerInfoType::Temperature,
                layer_info: self.current_layer.clone(),
                feature_type: self.current_feature.clone(),
                temperature: Some(temp),
                setting: None,
            };
        }
        
        // Check for settings/metadata
        if let Some(setting) = self.parse_setting(comment_text) {
            self.settings_cache.insert(setting.key.clone(), setting.value.clone());
            
            return SlicerInfo {
                info_type: SlicerInfoType::Setting,
                layer_info: self.current_layer.clone(),
                feature_type: self.current_feature.clone(),
                temperature: None,
                setting: Some(setting),
            };
        }
        
        // Default: regular comment
        SlicerInfo {
            info_type: SlicerInfoType::Comment,
            layer_info: self.current_layer.clone(),
            feature_type: self.current_feature.clone(),
            temperature: None,
            setting: None,
        }
    }
    
    /// Parse settings from comments (e.g., "; layer_height = 0.2")
    fn parse_setting(&self, comment: &str) -> Option<SlicerSetting> {
        // Look for key = value patterns
        if let Some(eq_pos) = comment.find('=') {
            let key = comment[..eq_pos].trim().to_lowercase();
            let value = comment[eq_pos + 1..].trim().to_string();
            
            // Filter out common setting patterns
            let setting_keys = [
                "layer_height", "first_layer_height", "perimeter_width", "infill_percentage",
                "print_speed", "perimeter_speed", "infill_speed", "support_speed",
                "nozzle_diameter", "filament_diameter", "extrusion_multiplier",
                "bed_temperature", "hotend_temperature", "retraction_distance",
                "retraction_speed", "z_hop", "support_threshold", "bridge_speed"
            ];
            
            for &setting_key in &setting_keys {
                if key.contains(setting_key) {
                    return Some(SlicerSetting {
                        key: key.to_string(),
                        value,
                        category: self.categorize_setting(&key),
                    });
                }
            }
        }
        
        None
    }
    
    /// Categorize settings for better organization
    fn categorize_setting(&self, key: &str) -> String {
        if key.contains("layer") || key.contains("height") {
            "Layer Settings".to_string()
        } else if key.contains("speed") || key.contains("feed") {
            "Speed Settings".to_string()
        } else if key.contains("temperature") || key.contains("temp") {
            "Temperature Settings".to_string()
        } else if key.contains("retraction") || key.contains("z_hop") {
            "Retraction Settings".to_string()
        } else if key.contains("support") {
            "Support Settings".to_string()
        } else if key.contains("infill") || key.contains("perimeter") {
            "Print Settings".to_string()
        } else {
            "General Settings".to_string()
        }
    }
    
    /// Get color for current feature
    pub fn get_current_feature_color(&self) -> Color4 {
        if let Some(ref feature) = self.current_feature {
            self.feature_colors.get(feature).cloned().unwrap_or_else(Color4::white)
        } else {
            Color4::white()
        }
    }
    
    /// Get current layer information
    pub fn get_current_layer(&self) -> Option<&LayerInfo> {
        self.current_layer.as_ref()
    }
    
    /// Get slicer name and version
    pub fn get_slicer_info(&self) -> &str {
        self.slicer.get_name()
    }
    
    /// Get all parsed settings
    pub fn get_settings(&self) -> &HashMap<String, String> {
        &self.settings_cache
    }
    
    /// Get layer statistics
    pub fn get_layer_stats(&self) -> LayerStatistics {
        if self.layer_heights.is_empty() {
            return LayerStatistics::default();
        }
        
        let mut heights: Vec<f64> = self.layer_heights.values().cloned().collect();
        heights.sort_by(|a, b| a.partial_cmp(b).unwrap());
        
        let total_layers = self.layer_heights.len();
        let min_height = *heights.first().unwrap_or(&0.0);
        let max_height = *heights.last().unwrap_or(&0.0);
        let total_height = max_height - min_height;
        
        // Calculate average layer height
        let mut layer_thicknesses = Vec::new();
        for i in 1..heights.len() {
            layer_thicknesses.push(heights[i] - heights[i-1]);
        }
        
        let average_layer_height = if !layer_thicknesses.is_empty() {
            layer_thicknesses.iter().sum::<f64>() / layer_thicknesses.len() as f64
        } else {
            0.2 // Default assumption
        };
        
        LayerStatistics {
            total_layers: total_layers as u32,
            min_height,
            max_height,
            total_height,
            average_layer_height,
            first_layer_height: heights.get(1).copied().unwrap_or(0.0) - min_height,
        }
    }
}

/// Information extracted from slicer comments
#[derive(Debug, Clone)]
pub struct SlicerInfo {
    pub info_type: SlicerInfoType,
    pub layer_info: Option<LayerInfo>,
    pub feature_type: Option<FeatureType>,
    pub temperature: Option<f64>,
    pub setting: Option<SlicerSetting>,
}

#[derive(Debug, Clone)]
pub enum SlicerInfoType {
    LayerChange,
    FeatureChange,
    Temperature,
    Setting,
    Comment,
}

#[derive(Debug, Clone)]
pub struct SlicerSetting {
    pub key: String,
    pub value: String,
    pub category: String,
}

#[derive(Debug, Clone)]
pub struct LayerStatistics {
    pub total_layers: u32,
    pub min_height: f64,
    pub max_height: f64,
    pub total_height: f64,
    pub average_layer_height: f64,
    pub first_layer_height: f64,
}

impl Default for LayerStatistics {
    fn default() -> Self {
        Self {
            total_layers: 0,
            min_height: 0.0,
            max_height: 0.0,
            total_height: 0.0,
            average_layer_height: 0.2,
            first_layer_height: 0.2,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_prusaslicer_detection() {
        let content = "; generated by PrusaSlicer 2.6.0+win64\n; LAYER_CHANGE\n; Z:0.3\n; external perimeter";
        let mut detector = EnhancedSlicerDetector::new(content);
        
        let comment = CommentData::new(0, 1, "; LAYER_CHANGE".to_string());
        let info = detector.process_comment(&comment);
        
        assert!(matches!(info.info_type, SlicerInfoType::LayerChange));
        assert!(info.layer_info.is_some());
    }
    
    #[test]
    fn test_cura_feature_detection() {
        let content = ";Generated with Cura_SteamEngine 5.4.0\n;TYPE:WALL-OUTER";
        let mut detector = EnhancedSlicerDetector::new(content);
        
        let comment = CommentData::new(0, 1, ";TYPE:WALL-OUTER".to_string());
        let info = detector.process_comment(&comment);
        
        assert!(matches!(info.info_type, SlicerInfoType::FeatureChange));
        assert!(matches!(info.feature_type, Some(FeatureType::ExternalPerimeter)));
    }
    
    #[test] 
    fn test_setting_parsing() {
        let content = "; layer_height = 0.2\n; print_speed = 60";
        let mut detector = EnhancedSlicerDetector::new(content);
        
        let comment = CommentData::new(0, 1, "; layer_height = 0.2".to_string());
        let info = detector.process_comment(&comment);
        
        assert!(matches!(info.info_type, SlicerInfoType::Setting));
        if let Some(setting) = info.setting {
            assert_eq!(setting.key, "layer_height");
            assert_eq!(setting.value, "0.2");
            assert_eq!(setting.category, "Layer Settings");
        }
    }
}