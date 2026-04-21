#version 300 es
precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
out vec4 outColor;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 p = uv * 2.0 - 1.0;
    p.x *= u_resolution.x / u_resolution.y;

    vec3 col = vec3(0.02, 0.02, 0.05);

    for (float i = 0.0; i < 3.0; i++) {
        float scale = pow(2.0, i);
        vec2 grid = floor(p * scale * 40.0 + vec2(u_time * 0.1 * (i + 1.0), 0.0));
        float h = hash(grid);
        if (h > 0.98) {
            vec2 cell = fract(p * scale * 40.0 + vec2(u_time * 0.1 * (i + 1.0), 0.0)) - 0.5;
            float d = length(cell);
            float twinkle = 0.5 + 0.5 * sin(u_time * 2.0 + h * 20.0);
            col += vec3(0.9, 0.95, 1.0) * twinkle * smoothstep(0.1, 0.0, d) / (scale * 1.5);
        }
    }

    outColor = vec4(col, 1.0);
}
