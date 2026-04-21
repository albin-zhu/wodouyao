#version 300 es
precision highp float;

// Synthwave grid — vertical column lines + sine-warped horizontal bands.
// Replicates the original wave particle preset with shader-native math.

uniform float u_time;
uniform vec2 u_resolution;
out vec4 outColor;

void main() {
    vec2 px = gl_FragCoord.xy;
    vec3 bg = vec3(0.047, 0.055, 0.109);  // #0c0e1c

    // Vertical columns every 80 px, soft cyan-blue.
    float colSpacing = 80.0;
    float colDist = min(mod(px.x, colSpacing), colSpacing - mod(px.x, colSpacing));
    float col = smoothstep(1.5, 0.0, colDist);
    vec3 colColor = vec3(0.478, 0.635, 0.969) * 0.12 * col; // #7aa2f7 @ 0.12

    // Horizontal sine bands — each row has a sin-displaced baseline.
    float bandSpacing = 28.0;
    float t = u_time * 2.0;
    float bandSum = 0.0;
    for (float i = -1.0; i <= 1.0; i += 1.0) {
        float baseY = floor(px.y / bandSpacing) * bandSpacing + i * bandSpacing;
        float wave = sin(px.x / 90.0 + t + baseY / 140.0) * 10.0;
        float dy = abs(px.y - (baseY + wave));
        bandSum += smoothstep(1.5, 0.0, dy);
    }
    vec3 bandColor = vec3(0.733, 0.604, 0.969) * 0.35 * bandSum; // #bb9af7 @ 0.35

    outColor = vec4(bg + colColor + bandColor, 1.0);
}
