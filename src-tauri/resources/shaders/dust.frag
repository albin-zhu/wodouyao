#version 300 es
precision highp float;

// Slow-drifting pale dust specks. Replicates the original "dust" particle
// preset. No explicit particle buffer — we rasterise hashed points into
// each screen pixel.

uniform float u_time;
uniform vec2 u_resolution;
out vec4 outColor;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
    vec2 px = gl_FragCoord.xy;
    vec3 bg = vec3(0.075, 0.078, 0.106); // #13141b

    float accum = 0.0;
    // 6 layered passes give ~140 specks total.
    for (float i = 0.0; i < 6.0; i++) {
        float seed = i * 17.0;
        // Grid the plane; jitter each cell center.
        vec2 cell = floor(px / 90.0 + vec2(seed));
        vec2 cellPx = (cell - vec2(seed)) * 90.0;
        float h1 = hash(cell + seed);
        float h2 = hash(cell + seed + 5.0);
        float h3 = hash(cell + seed + 9.0);

        // Drift vector per speck.
        vec2 vel = (vec2(h1, h2) - 0.5) * 0.25 * 60.0;
        vec2 spot = cellPx + vec2(h1, h2) * 90.0 + vel * u_time;
        // Wrap around the screen.
        spot = mod(spot, u_resolution);

        float d = distance(px, spot);
        float size = 0.5 + h3 * 1.4;
        float alpha = 0.2 + h3 * 0.35;
        accum += alpha * smoothstep(size + 0.5, 0.0, d);
    }

    vec3 dustCol = vec3(0.753, 0.792, 0.961); // #c0caf5
    outColor = vec4(bg + dustCol * accum, 1.0);
}
