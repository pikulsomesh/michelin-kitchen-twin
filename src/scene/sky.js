// A gradient sky dome with a sun glow. Colours are linear HDR so the dusk
// sits naturally under ACES tone mapping; setLook() can retint it.
import * as THREE from 'three';

export function buildSky() {
  const uniforms = {
    top: { value: new THREE.Color(0.06, 0.1, 0.22) },
    horizon: { value: new THREE.Color(0.95, 0.55, 0.32) },
    ground: { value: new THREE.Color(0.05, 0.05, 0.05) },
    sunDir: { value: new THREE.Vector3(0.5, 0.25, 0.8).normalize() },
    sunColor: { value: new THREE.Color(4, 2.4, 1.2) },
    haze: { value: 0.5 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
        vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 top, horizon, ground, sunDir, sunColor;
      uniform float haze;
      varying vec3 vDir;
      #include <common>
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.45));
        // the Mayacamas: two bands of low hills, hazed by distance
        float az = atan(d.z, d.x);
        float far = 0.035 + 0.025 * sin(az * 3.0 + 1.3) + 0.012 * sin(az * 11.0) + 0.006 * sin(az * 27.0 + 2.0);
        float near = 0.018 + 0.014 * sin(az * 5.0 + 0.4) + 0.006 * sin(az * 17.0 + 1.0);
        if (h < far) col = mix(col, mix(horizon, vec3(0.16, 0.18, 0.22), 0.55), 0.85);
        if (h < near) col = mix(col, vec3(0.07, 0.09, 0.07), 0.8);
        col = mix(col, ground, smoothstep(0.0, -0.08, h));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += sunColor * (pow(s, 900.0) * 6.0 + pow(s, 24.0) * 0.25 * haze + pow(s, 4.0) * 0.08 * haze);
        // subtle dither against banding
        col += (rand(gl_FragCoord.xy) - 0.5) / 255.0;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), mat);
  mesh.name = 'Sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  mesh.userData.dynamic = true;
  return { mesh, uniforms };
}
