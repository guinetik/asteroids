// corona.vert.glsl — billboard a plane toward the camera at the mesh's position.
// The plane's local XY is used as screen-space offset around the object's center.

varying vec2 vUv;

void main() {
    vUv = uv;

    // Extract world-space scale from the model matrix columns.
    vec3 scale = vec3(
        length(modelMatrix[0].xyz),
        length(modelMatrix[1].xyz),
        length(modelMatrix[2].xyz)
    );

    // View-space center of the billboard's origin.
    vec4 center = viewMatrix * vec4(modelMatrix[3].xyz, 1.0);

    // Offset by local XY times scale — keeps the quad facing the camera.
    center.xy += position.xy * scale.xy;

    gl_Position = projectionMatrix * center;
}
