// sphere.vert.glsl — shared vertex shader for all celestial bodies

varying vec3 vModelNormal;
varying vec3 vModelPosition;
varying vec3 vViewNormal;
varying vec3 vViewPosition;

void main() {
    vModelNormal   = normal;
    vModelPosition = position;
    vViewNormal    = normalize(normalMatrix * normal);
    vec4 mvPos     = modelViewMatrix * vec4(position, 1.0);
    vViewPosition  = mvPos.xyz;
    gl_Position    = projectionMatrix * mvPos;
}
