use crate::gcode_line::Color4;
use std::hash::Hash;

/// Feature types that slicers can identify
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum FeatureType {
    Perimeter,
    ExternalPerimeter,
    InternalPerimeter,
    Infill,
    SolidInfill,
    TopSolidInfill,
    Support,
    SupportInterface,
    BridgeInfill,
    GapFill,
    Skirt,
    Brim,
    WipeTower,
    Unknown,
}

/// Layer information
#[derive(Debug, Clone)]
pub struct LayerInfo {
    pub layer_number: u32,
    pub layer_height: f64,
    pub z_position: f64,
}

/// Base trait for slicer-specific behavior
pub trait SlicerBase {
    fn get_feature_color(&self, feature: &FeatureType) -> Color4;
    fn parse_feature_from_comment(&self, comment: &str) -> Option<FeatureType>;
    fn parse_layer_info(&self, comment: &str) -> Option<LayerInfo>;
    fn is_perimeter_comment(&self, comment: &str) -> bool;
    fn is_support_comment(&self, comment: &str) -> bool;
    fn get_temperature_from_comment(&self, comment: &str) -> Option<f64>;
    fn detect_slicer(file_content: &str) -> bool where Self: Sized;
    fn get_name(&self) -> &str;
    fn get_version_info(&self, file_content: &str) -> Option<String>;
}

/// Detect slicer type from file content
pub fn detect_slicer(file_content: &str) -> Box<dyn SlicerBase> {
    use crate::slicers::PrusaSlicer::PrusaSlicer;
    use crate::slicers::CuraSlicer::CuraSlicer;
    use crate::slicers::SuperSlicer::SuperSlicer;
    use crate::slicers::OrcaSlicer::OrcaSlicer;
    use crate::slicers::GenericSlicer::GenericSlicer;
    
    // Check first few KB for slicer signatures
    let header = if file_content.len() > 10000 {
        &file_content[..10000]
    } else {
        file_content
    };
    
    // PrusaSlicer detection
    if PrusaSlicer::detect_slicer(header) {
        return Box::new(PrusaSlicer::new());
    }
    
    // Cura detection
    if CuraSlicer::detect_slicer(header) {
        return Box::new(CuraSlicer::new());
    }
    
    // SuperSlicer detection
    if SuperSlicer::detect_slicer(header) {
        return Box::new(SuperSlicer::new());
    }
    
    // OrcaSlicer detection
    if OrcaSlicer::detect_slicer(header) {
        return Box::new(OrcaSlicer::new());
    }
    
    // Default to generic slicer
    Box::new(GenericSlicer::new())
}