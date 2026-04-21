#version 300 es
precision highp float;

// Matrix digital rain — actual 0s and 1s falling down columns, with a
// bright head and fading trail. 3x5 bitmap glyphs rasterised per-pixel.

uniform float u_time;
uniform vec2 u_resolution;
out vec4 outColor;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float bit(int row, int col) {
    return float((row >> (2 - col)) & 1);
}

// 3x5 bitmap — rows stored as 3-bit masks (MSB = leftmost pixel).
// 0:  XXX / X.X / X.X / X.X / XXX
// 1:  .X. / XX. / .X. / .X. / XXX
float glyph(int d, int cx, int cy) {
    if (cx < 0 || cx > 2 || cy < 0 || cy > 4) return 0.0;
    int row;
    if (d == 0) {
        if (cy == 0 || cy == 4) row = 7;
        else row = 5;
    } else {
        if (cy == 0) row = 2;
        else if (cy == 1) row = 6;
        else if (cy == 4) row = 7;
        else row = 2;
    }
    return bit(row, cx);
}

void main() {
    // Flip Y so the rain falls downward visually.
    vec2 px = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);

    float colWidth = 12.0;
    float rowHeight = 18.0;
    float col = floor(px.x / colWidth);
    float cellRow = floor(px.y / rowHeight);
    float localX = mod(px.x, colWidth);
    float localY = mod(px.y, rowHeight);

    // Per-column speed + phase.
    float speed = 80.0 + hash(vec2(col, 1.0)) * 160.0;
    float phase = hash(vec2(col, 2.0)) * 1000.0;
    float dropY = mod(u_time * speed + phase, u_resolution.y + 400.0);
    float dropRow = dropY / rowHeight;

    // Trail extends upward (smaller cellRow) from the drop head.
    float dist = dropRow - cellRow;
    float trail = 0.0;
    if (dist >= 0.0 && dist < 32.0) {
        trail = exp(-dist * 0.13);
    }

    // Some cells in the trail stay dark — gaps give the authentic look.
    float alive = step(0.25, hash(vec2(col, cellRow + 99.0)));

    // Digit flickers over time.
    float flick = floor(u_time * 5.0 + hash(vec2(col, cellRow + 7.0)) * 6.0);
    int digit = (hash(vec2(col + flick * 1.13, cellRow)) > 0.5) ? 1 : 0;

    // Render the 3x5 glyph at 3x scale, centered in the cell.
    float scale = 3.0;
    float offX = (colWidth - 3.0 * scale) * 0.5;
    float offY = (rowHeight - 5.0 * scale) * 0.5;
    int gx = int(floor((localX - offX) / scale));
    int gy = int(floor((localY - offY) / scale));
    float on = glyph(digit, gx, gy);

    // Head near dist=0 is near-white; trail fades to green.
    float head = smoothstep(2.5, 0.0, dist);
    vec3 headCol = vec3(0.85, 1.00, 0.90);
    vec3 tailCol = vec3(0.10, 0.85, 0.30);
    vec3 ink = mix(tailCol, headCol, head);

    vec3 bg = vec3(0.01, 0.02, 0.015);
    outColor = vec4(bg + ink * on * trail * alive, 1.0);
}
