use crate::gcode_line::{ArcMove, GCodeLine, MoveData, Vector3};
use crate::processor_properties::{ArcPlane, ProcessorProperties};
use std::f64::consts::PI;

struct ArcComputation {
    final_position: Vector3,
    points: Vec<Vector3>,
    center: Vector3,
    radius: f64,
}

pub fn parse_arc_move(
    props: &mut ProcessorProperties,
    line: &str,
    is_clockwise: bool,
    file_position: u32,
    line_number: u32,
) -> Result<GCodeLine, String> {
    let tokens = tokenize_line(line);

    let current_viewer = props.current_position.clone();
    let relative_move = !props.absolute_positioning;
    let workplace_offset = props.current_workplace().clone();

    let arc_result = do_arc(
        &tokens,
        &current_viewer,
        relative_move,
        0.5,
        props.fix_radius,
        props.arc_plane.clone(),
        &workplace_offset,
        is_clockwise,
    );

    let extruding = line
        .find(|c: char| c == 'E' || c == 'e')
        .map(|idx| idx > 0)
        .unwrap_or(false)
        || props.cnc_mode;

    let mut segments: Vec<MoveData> = Vec::with_capacity(arc_result.points.len());
    let mut current_point = current_viewer.clone();

    for point in &arc_result.points {
        let mut segment = MoveData::new(file_position, line_number, String::new());
        segment.tool = props.current_tool.tool_number;
        segment.start = current_point.clone();
        segment.end = point.clone();
        segment.extruding = extruding;
        segment.color = props.current_feature_color.clone();
        segment.feed_rate = props.current_feed_rate;
        segment.is_perimeter = props.current_is_perimeter;
        segment.is_support = props.current_is_support;
        segment.color_id = [
            ((line_number >> 16) & 0xFF) as u8,
            ((line_number >> 8) & 0xFF) as u8,
            (line_number & 0xFF) as u8,
        ];
        segments.push(segment);
        current_point = point.clone();
    }

    props.current_position = arc_result.final_position.clone();
    props.total_rendered_segments += segments.len() as u32;

    let arc_move = ArcMove {
        file_position,
        line_number,
        original_line: line.to_string(),
        tool: props.current_tool.tool_number,
        start: current_viewer,
        end: arc_result.final_position,
        center: arc_result.center,
        radius: arc_result.radius,
        clockwise: is_clockwise,
        extruding,
        color: props.current_feature_color.clone(),
        feed_rate: props.current_feed_rate,
        segments,
    };

    Ok(GCodeLine::Arc(arc_move))
}

fn tokenize_line(line: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();

    for ch in line.chars() {
        if ch.is_whitespace() {
            if !current.is_empty() {
                tokens.push(current.clone());
                current.clear();
            }
            continue;
        }

        let upper = ch.to_ascii_uppercase();
        if matches!(upper, 'G' | 'X' | 'Y' | 'Z' | 'I' | 'J' | 'K' | 'F' | 'R' | 'E') {
            if !current.is_empty() {
                tokens.push(current.clone());
                current.clear();
            }
        }

        current.push(ch);
    }

    if !current.is_empty() {
        tokens.push(current);
    }

    tokens
}

fn do_arc(
    tokens: &[String],
    current_position_viewer: &Vector3,
    relative_move: bool,
    arc_seg_length: f64,
    fix_radius: bool,
    arc_plane: ArcPlane,
    offset: &Vector3,
    is_clockwise: bool,
) -> ArcComputation {
    let current_temp = to_temp_space(current_position_viewer);
    let mut move_temp = current_temp.clone();

    let mut i = 0.0;
    let mut j = 0.0;
    let mut r = 0.0;

    for token in tokens {
        if token.is_empty() {
            continue;
        }

        let upper = token.chars().next().unwrap_or(' ').to_ascii_uppercase();
        match upper {
            'X' => {
                move_temp.x = get_number(token, move_temp.x, relative_move, offset.x);
            }
            'Y' => {
                move_temp.y = get_number(token, move_temp.y, relative_move, offset.y);
            }
            'Z' => {
                move_temp.z = get_number(token, move_temp.z, relative_move, offset.z);
            }
            'I' => {
                i = get_number(token, i, false, 0.0);
            }
            'J' => {
                j = get_number(token, j, false, 0.0);
            }
            'K' => {
                // Match TypeScript behaviour of treating K the same as J
                j = get_number(token, j, false, 0.0);
            }
            'R' => {
                r = get_number(token, r, false, 0.0);
            }
            _ => {}
        }
    }

    let (mut axis0, mut axis1, mut axis2) = match arc_plane {
        ArcPlane::XY => ('x', 'y', 'z'),
        ArcPlane::XZ => ('z', 'x', 'y'),
        ArcPlane::YZ => ('y', 'z', 'x'),
    };

    if matches!(arc_plane, ArcPlane::XZ) {
        std::mem::swap(&mut i, &mut j);
    }


    if r != 0.0 {
        let delta0 = get_axis(&move_temp, axis0) - get_axis(&current_temp, axis0);
        let delta1 = get_axis(&move_temp, axis1) - get_axis(&current_temp, axis1);

        let d_squared = delta0 * delta0 + delta1 * delta1;
        if d_squared == 0.0 {
            return ArcComputation {
                final_position: from_temp_space(&move_temp),
                points: Vec::new(),
                center: from_temp_space(&current_temp),
                radius: 0.0,
            };
        }

        let mut h_squared = r * r - d_squared / 4.0;
        let mut h_div_d = 0.0;

        if h_squared >= 0.0 {
            h_div_d = (h_squared / d_squared).sqrt();
        } else if h_squared < -0.02 * r * r {
            if fix_radius {
                let min_r = ((delta0 / 2.0).powi(2) + (delta1 / 2.0).powi(2)).sqrt();
                h_squared = min_r * min_r - d_squared / 4.0;
                h_div_d = (h_squared / d_squared).sqrt();
            } else {
                return ArcComputation {
                    final_position: from_temp_space(&move_temp),
                    points: Vec::new(),
                    center: from_temp_space(&move_temp),
                    radius: 0.0,
                };
            }
        }

        if (is_clockwise && r < 0.0) || (!is_clockwise && r > 0.0) {
            h_div_d = -h_div_d;
        }

        i = delta0 / 2.0 + delta1 * h_div_d;
        j = delta1 / 2.0 - delta0 * h_div_d;
    } else if i == 0.0 && j == 0.0 {
        return ArcComputation {
            final_position: from_temp_space(&current_temp),
            points: Vec::new(),
            center: from_temp_space(&current_temp),
            radius: 0.0,
        };
    }

    let whole_circle = get_axis(&current_temp, axis0) == get_axis(&move_temp, axis0)
        && get_axis(&current_temp, axis1) == get_axis(&move_temp, axis1);

    let center0 = get_axis(&current_temp, axis0) + i;
    let center1 = get_axis(&current_temp, axis1) + j;

    let arc_radius = (i * i + j * j).sqrt();
    let arc_current_angle = (-j).atan2(-i);
    let final_theta = (get_axis(&move_temp, axis1) - center1)
        .atan2(get_axis(&move_temp, axis0) - center0);

    let mut total_arc = if whole_circle {
        2.0 * PI
    } else {
        let mut arc = if is_clockwise {
            arc_current_angle - final_theta
        } else {
            final_theta - arc_current_angle
        };
        if arc < 0.0 {
            arc += 2.0 * PI;
        }
        arc
    };

    if total_arc == 0.0 {
        total_arc = 2.0 * PI;
    }

    let mut total_segments = (arc_radius * total_arc) / arc_seg_length;
    if total_segments < 1.0 {
        total_segments = 1.0;
    }

    let intermediate_segments = if total_segments <= 1.0 {
        0
    } else {
        (total_segments - 1.0).ceil() as usize
    };

    let mut arc_angle_increment = total_arc / total_segments;
    if is_clockwise {
        arc_angle_increment *= -1.0;
    }

    let axis2_dist = get_axis(&move_temp, axis2) - get_axis(&current_temp, axis2);
    let axis2_step = axis2_dist / total_segments;

    let mut points = Vec::with_capacity(intermediate_segments + 1);
    let mut current_angle = arc_current_angle;
    let mut p2 = get_axis(&current_temp, axis2);

    for _ in 0..intermediate_segments {
        current_angle += arc_angle_increment;
        let p0 = center0 + arc_radius * current_angle.cos();
        let p1 = center1 + arc_radius * current_angle.sin();
        p2 += axis2_step;

        let mut output_temp = Vector3::zero();
        set_axis(&mut output_temp, axis0, p0);
        set_axis(&mut output_temp, axis1, p1);
        set_axis(&mut output_temp, axis2, p2);

        points.push(from_temp_space(&output_temp));
    }

    points.push(from_temp_space(&move_temp));

    let mut center_temp = Vector3::zero();
    set_axis(&mut center_temp, axis0, center0);
    set_axis(&mut center_temp, axis1, center1);
    set_axis(&mut center_temp, axis2, get_axis(&current_temp, axis2));

    ArcComputation {
        final_position: from_temp_space(&move_temp),
        points,
        center: from_temp_space(&center_temp),
        radius: arc_radius,
    }
}

fn get_number(token: &str, current_value: f64, relative_move: bool, offset: f64) -> f64 {
    let value = token
        .chars()
        .skip(1)
        .collect::<String>()
        .trim()
        .parse::<f64>()
        .unwrap_or(0.0);

    if relative_move {
        value + current_value
    } else {
        value + offset
    }
}

fn to_temp_space(viewer: &Vector3) -> Vector3 {
    Vector3 {
        x: viewer.x,
        y: viewer.z,
        z: viewer.y,
    }
}

fn from_temp_space(temp: &Vector3) -> Vector3 {
    Vector3 {
        x: temp.x,
        y: temp.z,
        z: temp.y,
    }
}

fn get_axis(vec: &Vector3, axis: char) -> f64 {
    match axis {
        'x' => vec.x,
        'y' => vec.y,
        'z' => vec.z,
        _ => 0.0,
    }
}

fn set_axis(vec: &mut Vector3, axis: char, value: f64) {
    match axis {
        'x' => vec.x = value,
        'y' => vec.y = value,
        'z' => vec.z = value,
        _ => {}
    }
}
