#version 300 es
precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
out vec4 outColor;

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5);
    float b = fract(sin(dot(i + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5);
    float c = fract(sin(dot(i + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5);
    float d = fract(sin(dot(i + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5);
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float t = u_time * 0.15;

    float band = 0.0;
    for (float i = 1.0; i <= 4.0; i++) {
        float y = 0.5 + 0.25 * sin(uv.x * (2.0 + i) + t * (0.5 + i * 0.2) + i);
        float d = abs(uv.y - y);
        band += 0.02 / max(d, 0.01);
    }
    band *= 0.2;

    float n = noise(uv * 4.0 + t);
    band *= mix(0.4, 1.0, n);

    vec3 col = mix(
        vec3(0.04, 0.08, 0.2),
        vec3(0.2, 0.9, 0.6),
        clamp(band, 0.0, 1.0)
    );
    col += vec3(0.3, 0.2, 0.8) * band * 0.6;
    col *= 0.5;

    outColor = vec4(col, 1.0);
}
