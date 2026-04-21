#version 300 es
precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
out vec4 outColor;

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 p = uv * 2.0 - 1.0;
    p.x *= u_resolution.x / u_resolution.y;

    float t = u_time * 0.4;
    float v = 0.0;
    v += sin(p.x * 3.0 + t);
    v += sin((p.y * 3.0 + t) * 0.5);
    v += sin((p.x * 3.0 + p.y * 3.0 + t) * 0.5);
    v += sin(length(p) * 6.0 - t * 2.0);
    v = v * 0.25;

    vec3 col = 0.5 + 0.5 * cos(6.2831 * (v + vec3(0.0, 0.33, 0.67)));
    col *= 0.35;
    outColor = vec4(col, 1.0);
}
