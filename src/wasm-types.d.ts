// Type declarations for WASM G-code processor
declare module '../WASM_FileProcessor/pkg/gcode_file_processor' {
  export default function init(): Promise<any>;
  
  export function get_version(): string;
  export function benchmark_parsing(file_content: string, iterations: number): number;
  
  export class GCodeProcessor {
    constructor();
    free(): void;
    process_file(file_content: string, progress_callback?: any | null): ProcessingResult;
    get_position_data(file_position: number): PositionData | undefined;
    get_sorted_positions(): Uint32Array;
    get_position_count(): number;
    find_closest_position(target_position: number): number | undefined;
    generate_render_buffers(nozzle_size: number, padding: number, progress_callback?: any | null): RenderBuffers;
  }
  
  export class ProcessingResult {
    constructor(success: boolean, error_message: string, line_count: number, move_count: number, processing_time_ms: number);
    free(): void;
    has_error(): boolean;
    readonly success: boolean;
    readonly error_message: string;
    readonly line_count: number;
    readonly move_count: number;
    readonly processing_time_ms: number;
  }
  
  export class RenderBuffers {
    free(): void;
    readonly segment_count: number;
    readonly matrix_data: Float32Array;
    readonly color_data: Float32Array;
    readonly pick_data: Float32Array;
    readonly file_position_data: Float32Array;
    readonly file_end_position_data: Float32Array;
    readonly tool_data: Float32Array;
    readonly feed_rate_data: Float32Array;
    readonly is_perimeter_data: Float32Array;
  }

  export class PositionData {
    constructor(x: number, y: number, z: number, feed_rate: number, extruding: boolean);
    free(): void;
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly feed_rate: number;
    readonly extruding: boolean;
  }
}