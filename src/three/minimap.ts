import * as THREE from 'three';

export type Minimap = {
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  playerDot: THREE.Mesh;
};

export function createMinimap(renderer: THREE.WebGLRenderer, roadMesh: THREE.Mesh): Minimap {
  const size = 160;
  const mmRenderer = renderer;
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-2000, 2000, 2000, -2000, 0.1, 5000);
  cam.position.set(0, 3000, 0);
  cam.lookAt(0, 0, 0);

  const trackOutline = new THREE.Mesh(
    (roadMesh.geometry as THREE.BufferGeometry).clone(),
    new THREE.MeshBasicMaterial({ color: 0x707070, wireframe: true })
  );
  trackOutline.rotation.copy(roadMesh.rotation);
  trackOutline.position.copy(roadMesh.position);
  scene.add(trackOutline);

  const dot = new THREE.Mesh(new THREE.CircleGeometry(30, 16), new THREE.MeshBasicMaterial({ color: 0xff4081 }));
  dot.rotation.x = -Math.PI / 2;
  scene.add(dot);

  return { camera: cam, renderer: mmRenderer, scene, playerDot: dot };
}

export function renderMinimap(mm: Minimap, playerPosition: THREE.Vector3): void {
  mm.playerDot.position.set(playerPosition.x, 0, playerPosition.z);
  const size = 160;
  const prevViewport = new THREE.Vector4();
  const prevScissor = new THREE.Vector4();
  // Save
  mm.renderer.getViewport(prevViewport);
  mm.renderer.getScissor(prevScissor);
  // Render into a corner
  mm.renderer.setViewport(window.innerWidth - size - 16, window.innerHeight - size - 16, size, size);
  mm.renderer.setScissor(window.innerWidth - size - 16, window.innerHeight - size - 16, size, size);
  mm.renderer.setScissorTest(true);
  mm.renderer.render(mm.scene, mm.camera);
  // Restore
  mm.renderer.setScissorTest(false);
  mm.renderer.setViewport(prevViewport);
  mm.renderer.setScissor(prevScissor);
}


