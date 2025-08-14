import * as THREE from 'three';

export async function startGame3D(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) throw new Error('#app not found');

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1020);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);
  camera.position.set(0, 120, 220);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 0.8);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(200, 300, 200);
  dir.castShadow = true;
  scene.add(dir);

  // Flat ground placeholder (terrain generated later after height() is defined)

  // Procedural twisty track on XZ plane that never self-overlaps
  const laneWidth = 60;
  const roadWidth = laneWidth * 3; // three lanes
  const curbWidth = 14;
  const centerLineWidth = 2.4;
  const trackSegments = 360;
  const baseR = 900; // base radius
  const amp1 = 120; // small radial variations to create turns
  const amp2 = 60;
  const k1 = 3;
  const k2 = 5;

  const radial = (theta: number) => baseR + amp1 * Math.sin(k1 * theta) + amp2 * Math.sin(k2 * theta + 1.2);
  const heightAmp = 80;
  const height = (theta: number) => heightAmp * Math.sin(2.0 * theta) + (heightAmp * 0.5) * Math.sin(3.0 * theta + 0.8);

  const centerline: THREE.Vector3[] = [];
  for (let i = 0; i <= trackSegments; i += 1) {
    const theta = (i / trackSegments) * Math.PI * 2;
    const r = radial(theta);
    centerline.push(new THREE.Vector3(r * Math.cos(theta), height(theta), r * Math.sin(theta)));
  }

  // Build tangents from finite differences
  const tangents: THREE.Vector3[] = [];
  for (let i = 0; i <= trackSegments; i += 1) {
    const prev = centerline[(i - 1 + centerline.length) % centerline.length]!;
    const next = centerline[(i + 1) % centerline.length]!;
    tangents[i] = new THREE.Vector3().subVectors(next, prev).normalize();
  }

  // Bank angles based on curvature (signed), capped
  const maxBank = THREE.MathUtils.degToRad(16);
  const bankFactor = 0.9;
  const bankAngles: number[] = [];
  for (let i = 0; i <= trackSegments; i += 1) {
    const tPrev = tangents[(i - 1 + tangents.length) % tangents.length]!;
    const tNext = tangents[(i + 1) % tangents.length]!;
    const a = new THREE.Vector2(tPrev.x, tPrev.z).normalize();
    const b = new THREE.Vector2(tNext.x, tNext.z).normalize();
    const cross = a.x * b.y - a.y * b.x;
    const dot = a.x * b.x + a.y * b.y;
    const signedAngle = Math.atan2(cross, dot);
    bankAngles[i] = THREE.MathUtils.clamp(signedAngle * bankFactor, -maxBank, maxBank);
  }

  // Precompute local frames along the track
  const frames: { p: THREE.Vector3; t: THREE.Vector3; left: THREE.Vector3; normal: THREE.Vector3 }[] = [];
  for (let i = 0; i <= trackSegments; i += 1) {
    const p = centerline[i]!;
    const t = tangents[i]!;
    const up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion().setFromAxisAngle(t, bankAngles[i] ?? 0);
    const upBanked = up.clone().applyQuaternion(q);
    const left = new THREE.Vector3().crossVectors(upBanked, t).normalize();
    const normal = new THREE.Vector3().crossVectors(t, left).normalize();
    frames[i] = { p, t, left, normal };
  }

  // Remove terrain: floating track in space

  // Road ribbon geometry
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < frames.length; i += 1) {
    const { p, t, left: leftDir } = frames[i]!;
    const left = p.clone().add(leftDir.clone().multiplyScalar(roadWidth / 2));
    const right = p.clone().add(leftDir.clone().multiplyScalar(-roadWidth / 2));
    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    uvs.push(0, i, 1, i);
  }
  for (let i = 0; i < frames.length - 1; i += 1) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, d, a, d, c);
  }
  // Close the loop
  indices.push((frames.length - 1) * 2, (frames.length - 1) * 2 + 1, 1);
  indices.push((frames.length - 1) * 2, 1, 0);

  const roadGeometry = new THREE.BufferGeometry();
  roadGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  roadGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  roadGeometry.setIndex(indices);
  roadGeometry.computeVertexNormals();
  const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.96, metalness: 0.0, side: THREE.DoubleSide });
  const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial);
  roadMesh.receiveShadow = true;
  scene.add(roadMesh);
  // Minimap (static import)
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const mmMod = await Promise.resolve().then(() => require('./minimap'));
  const mm = mmMod.createMinimap(renderer, roadMesh);

  // Curbs: alternating red/white segments on both sides
  const curbHeight = 1.5;
  const curbSegmentCount = frames.length - 1;
  const curbBoxGeo = new THREE.BoxGeometry(1, curbHeight, 1);
  const curbMatRed = new THREE.MeshStandardMaterial({ color: 0xff3b3b, roughness: 0.8 });
  const curbMatWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  const leftCurbs: THREE.Mesh[] = [];
  const rightCurbs: THREE.Mesh[] = [];
  for (let i = 0; i < curbSegmentCount; i += 1) {
    const p0 = frames[i]!.p;
    const t0 = frames[i]!.t;
    const p1 = frames[i + 1]!.p;
    const t1 = frames[i + 1]!.t;
    const bank0 = bankAngles[i] ?? 0;
    const bank1 = bankAngles[i + 1] ?? 0;
    const up = new THREE.Vector3(0, 1, 0);
    const leftDir0 = new THREE.Vector3().crossVectors(up.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(t0, bank0)), t0).normalize();
    const leftDir1 = new THREE.Vector3().crossVectors(up.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(t1, bank1)), t1).normalize();
    const left0 = p0.clone().add(leftDir0.clone().multiplyScalar(roadWidth / 2 + curbWidth / 2));
    const right0 = p0.clone().add(leftDir0.clone().multiplyScalar(-roadWidth / 2 - curbWidth / 2));
    const left1 = p1.clone().add(leftDir1.clone().multiplyScalar(roadWidth / 2 + curbWidth / 2));
    const right1 = p1.clone().add(leftDir1.clone().multiplyScalar(-roadWidth / 2 - curbWidth / 2));

    const segLenLeft = left0.distanceTo(left1);
    const segLenRight = right0.distanceTo(right1);
    const angleLeft = Math.atan2(left1.x - left0.x, left1.z - left0.z);
    const angleRight = Math.atan2(right1.x - right0.x, right1.z - right0.z);
    const bankMid = (bank0 + bank1) / 2;

    const leftMesh = new THREE.Mesh(curbBoxGeo, i % 2 === 0 ? curbMatRed : curbMatWhite);
    leftMesh.scale.set(curbWidth, 1, segLenLeft);
    leftMesh.position.set((left0.x + left1.x) / 2, (left0.y + left1.y) / 2 + 0.8, (left0.z + left1.z) / 2);
    leftMesh.rotation.y = angleLeft;
    leftMesh.rotation.z = bankMid;
    leftMesh.castShadow = true;
    scene.add(leftMesh);
    leftCurbs.push(leftMesh);

    const rightMesh = new THREE.Mesh(curbBoxGeo, i % 2 === 0 ? curbMatWhite : curbMatRed);
    rightMesh.scale.set(curbWidth, 1, segLenRight);
    rightMesh.position.set((right0.x + right1.x) / 2, (right0.y + right1.y) / 2 + 0.8, (right0.z + right1.z) / 2);
    rightMesh.rotation.y = angleRight;
    rightMesh.rotation.z = bankMid;
    rightMesh.castShadow = true;
    scene.add(rightMesh);
    rightCurbs.push(rightMesh);
  }

  // Dotted center line segments
  const centerSegments: THREE.Mesh[] = [];
  const centerMat = new THREE.MeshStandardMaterial({ color: 0xffff99, roughness: 0.7 });
  const centerBox = new THREE.BoxGeometry(1, 0.5, 1);
  for (let i = 0; i < curbSegmentCount; i += 1) {
    if (i % 2 === 0) {
      const a = frames[i]!.p;
      const b = frames[i + 1]!.p;
      const segLen = a.distanceTo(b) * 0.5;
      const angle = Math.atan2(b.x - a.x, b.z - a.z);
      const mid = new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.9, (a.z + b.z) / 2);
      const m = new THREE.Mesh(centerBox, centerMat);
      m.scale.set(centerLineWidth, 1, segLen);
      m.position.copy(mid);
      m.rotation.y = angle;
      m.rotation.z = (((bankAngles[i] ?? 0) + (bankAngles[i + 1] ?? 0)) / 2);
      m.receiveShadow = true;
      scene.add(m);
      centerSegments.push(m);
    }
  }

  // Finish line banner/arch at start frame
  function createCheckeredTexture(size = 256, squares = 12): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const sq = size / squares;
    for (let y = 0; y < squares; y += 1) {
      for (let x = 0; x < squares; x += 1) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#ffffff' : '#000000';
        ctx.fillRect(x * sq, y * sq, sq, sq);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 1);
    tex.anisotropy = 8;
    return tex;
  }

  const finishHeight = 100;
  const finishClearWidth = roadWidth + curbWidth * 2 + 40;
  const finishThickness = 6;
  const f0 = frames[0]!;
  const leftDirF = f0.left.clone().normalize();
  const across = leftDirF.clone();
  const yawAcross = Math.atan2(across.x, across.z);
  const leftBase = f0.p.clone().add(across.clone().multiplyScalar(roadWidth / 2 + curbWidth + 10));
  const rightBase = f0.p.clone().add(across.clone().multiplyScalar(-roadWidth / 2 - curbWidth - 10));

  const postGeo = new THREE.BoxGeometry(8, finishHeight, 8);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.1, roughness: 0.8 });
  const postL = new THREE.Mesh(postGeo, postMat);
  const postR = new THREE.Mesh(postGeo, postMat);
  postL.position.set(leftBase.x, leftBase.y + finishHeight / 2, leftBase.z);
  postR.position.set(rightBase.x, rightBase.y + finishHeight / 2, rightBase.z);
  scene.add(postL); scene.add(postR);

  const bannerGeo = new THREE.BoxGeometry(finishClearWidth, 24, finishThickness);
  const bannerTex = createCheckeredTexture();
  const bannerMat = new THREE.MeshBasicMaterial({ map: bannerTex });
  const banner = new THREE.Mesh(bannerGeo, bannerMat);
  const mid = f0.p.clone();
  banner.position.set(mid.x, mid.y + finishHeight - 12, mid.z);
  banner.rotation.y = yawAcross + Math.PI / 2; // align across the track
  scene.add(banner);

  // Coins scattered around near the track
  const coinGroup = new THREE.Group();
  scene.add(coinGroup);
  const coinGeometry = new THREE.TorusGeometry(6, 2, 12, 20);
  const coinMaterial = new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0x332200, roughness: 0.4, metalness: 0.6 });
  const coins: THREE.Mesh[] = [];
  for (let i = 0; i < frames.length; i += Math.max(1, Math.floor(frames.length / 24))) {
    const { p, t } = frames[i]!;
    const bank = bankAngles[i] ?? 0;
    const up = new THREE.Vector3(0, 1, 0);
    const leftDir = new THREE.Vector3().crossVectors(up.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(t, bank)), t).normalize();
    const side = i % 2 === 0 ? 1 : -1;
    const offset = roadWidth * 0.35;
    const pos = p.clone().add(leftDir.clone().multiplyScalar(side * offset));
    const coin = new THREE.Mesh(coinGeometry, coinMaterial);
    coin.position.set(pos.x, pos.y + 6, pos.z);
    coin.castShadow = true;
    coinGroup.add(coin);
    coins.push(coin);
  }

  // Rocket powerups removed: using rechargeable boost meter instead

  // Kart (simple box + wheels)
  const kartGroup = new THREE.Group();
  scene.add(kartGroup);
  const body = new THREE.Mesh(new THREE.BoxGeometry(28, 10, 48), new THREE.MeshStandardMaterial({ color: 0xd946ef }));
  body.castShadow = true;
  body.position.y = 8;
  kartGroup.add(body);
  const wheelGeo = new THREE.CylinderGeometry(6, 6, 6, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1f1f1f });
  const addWheel = (x: number, z: number) => {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(x, 3, z);
    w.castShadow = true;
    kartGroup.add(w);
  };
  addWheel(-10, -16);
  addWheel(10, -16);
  addWheel(-10, 16);
  addWheel(10, 16);

  // Start position aligned to track
  const startF = frames[0]!;
  kartGroup.position.set(startF.p.x, startF.p.y, startF.p.z);
  let yaw = Math.atan2(startF.t.x, startF.t.z);

  // Lap tracking and boost meter state
  let lap = 1;
  let prevNearestIndex = 0;
  let lastLapMs = performance.now();
  let lastFrameMs = performance.now();
  let boost = 0.5; // 0..1
  const boostRechargePerSec = 0.25; // 25% per second
  const boostDrainPerSec = 0.6; // 60% per second while boosting
  const boostAccelBonus = 0.7; // extra accel while boosting
  const boostMaxSpeedFactor = 1.5; // higher cap while boosting

  // Movement state
  const velocity = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const input = { up: false, down: false, left: false, right: false, boost: false };

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') input.up = true;
    if (e.key === 'ArrowDown') input.down = true;
    if (e.key === 'ArrowLeft') input.left = true;
    if (e.key === 'ArrowRight') input.right = true;
    if (e.key === 'Shift') input.boost = true;
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowUp') input.up = false;
    if (e.key === 'ArrowDown') input.down = false;
    if (e.key === 'ArrowLeft') input.left = false;
    if (e.key === 'ArrowRight') input.right = false;
    if (e.key === 'Shift') input.boost = false;
  });

  // HUD
  const hud = document.createElement('div');
  hud.style.position = 'fixed';
  hud.style.left = '16px';
  hud.style.top = '16px';
  hud.style.color = 'white';
  hud.style.fontFamily = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial';
  hud.style.fontSize = '14px';
  hud.style.pointerEvents = 'none';
  document.body.appendChild(hud);

  // Camera follow (Mario Kart-style chase cam)
  const camHeight = 70;
  const camDistance = 160;
  const camLateral = 0; // slight side offset if desired
  const camLookAhead = 40;
  const camLerp = 0.12;

  function updateCamera() {
    const speed = velocity.length();
    const dist = camDistance + speed * 20;
    const height = camHeight + speed * 10;

    const behind = forward.clone().multiplyScalar(-dist);
    const side = right.clone().multiplyScalar(camLateral);
    const desired = new THREE.Vector3().copy(kartGroup.position).add(behind).add(side);
    desired.y += height;

    camera.position.lerp(desired, camLerp);

    const lookTarget = new THREE.Vector3().copy(kartGroup.position).add(forward.clone().multiplyScalar(camLookAhead));
    lookTarget.y += 8;
    camera.lookAt(lookTarget);
  }

  // Resize
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  // Movement constants
  const accel = 0.26; // a bit more authority
  const maxSpeed = 4.4; // a bit faster
  const steerMax = 0.07; // higher steering authority
  const grip = 0.92; // more tire grip, less auto-correction drift
  const bounds = 1200; // world bounds (grass plane)
  const trackAttract = 0.0; // no auto-binding to centerline
  const offRoadDrag = 0.999; // minimal penalty off the ideal line

  function animate(now: number) {
    requestAnimationFrame(animate);
    // Time step and HUD (lap, speed, boost meter)
    const dt = Math.max(0, (now - lastFrameMs) / 1000);
    lastFrameMs = now;
    const speed = velocity.length();
    const boostPct = Math.round(boost * 100);
    hud.innerText = `Lap: ${lap}  Speed: ${speed.toFixed(2)}  Boost: ${boostPct}%`;

    // Heading from yaw
    forward.set(Math.sin(yaw), 0, Math.cos(yaw));
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));

    // Steering (stronger at low speed)
    const steer = THREE.MathUtils.lerp(0.02, steerMax, THREE.MathUtils.clamp(speed / maxSpeed, 0, 1));
    const turnInput = input.left ? -1 : input.right ? 1 : 0;
    yaw += -turnInput * steer;

    // Throttle/brake
    let throttle = 0;
    if (input.up) throttle += 1;
    if (input.down) throttle -= 0.6;
    velocity.add(forward.clone().multiplyScalar(throttle * accel));
    const boosting = input.boost && boost > 0.05;
    if (boosting) {
      velocity.add(forward.clone().multiplyScalar(accel * boostAccelBonus));
      boost = Math.max(0, boost - boostDrainPerSec * dt);
    } else {
      boost = Math.min(1, boost + boostRechargePerSec * dt);
    }
    // Slight fishtail: inject small lateral impulse opposite turn direction, scales with speed
    if (turnInput !== 0) {
      const maxSNow = input.boost && boost > 0 ? maxSpeed * boostMaxSpeedFactor : maxSpeed;
      const slip = THREE.MathUtils.clamp(speed / Math.max(maxSNow, 0.001), 0, 1) * 0.05;
      velocity.add(right.clone().multiplyScalar(-turnInput * slip));
    }

    // Cap speed and apply lateral grip
    // Lateral damping with slight drift: retain a small fraction of lateral velocity
    const lateralMag = right.dot(velocity);
    const lateralKeep = 0.12; // keep 12% of lateral velocity for drift feel
    const damping = (1 - grip) * (1 - lateralKeep);
    velocity.add(right.clone().multiplyScalar(-lateralMag * damping));
    const maxS = input.boost && boost > 0 ? maxSpeed * boostMaxSpeedFactor : maxSpeed;
    if (velocity.length() > maxS) velocity.setLength(maxS);

    // Attraction to nearest point on track centerline, and extra drag off-road
    let nearestIndex = 0;
    let nearestDistSq = Number.POSITIVE_INFINITY;
    for (let i = 0; i < frames.length; i += 1) {
      const sp = frames[i]!.p;
      const dx = sp.x - kartGroup.position.x;
      const dz = sp.z - kartGroup.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < nearestDistSq) {
        nearestDistSq = d2;
        nearestIndex = i;
      }
    }
    // Lap detection on wrap-around
    const len = frames.length;
    if (prevNearestIndex > len * 0.8 && nearestIndex < len * 0.2 && now - lastLapMs > 2000) {
      lap += 1;
      lastLapMs = now;
    }
    prevNearestIndex = nearestIndex;
    const nearest = frames[nearestIndex]!;
    const toCenter = new THREE.Vector3(nearest.p.x - kartGroup.position.x, 0, nearest.p.z - kartGroup.position.z);
    velocity.add(toCenter.multiplyScalar(trackAttract));
    const distFromCenter = Math.sqrt(nearestDistSq);
    if (distFromCenter > roadWidth * 0.6) {
      velocity.multiplyScalar(offRoadDrag);
    }

    // Project kart onto road surface: find nearest frame index and snap to its surface plane
    let nearestI = 0;
    let nearestD2 = Number.POSITIVE_INFINITY;
    for (let i = 0; i < frames.length; i += 1) {
      const fp = frames[i]!.p;
      const dx = fp.x - kartGroup.position.x;
      const dy = fp.y - kartGroup.position.y;
      const dz = fp.z - kartGroup.position.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < nearestD2) { nearestD2 = d2; nearestI = i; }
    }
    const f = frames[nearestI]!;
    const leftDir = f.left;
    const tDir = f.t;
    const normal = f.normal;

    // Integrate in 3D and then project onto the road plane at that frame
    kartGroup.position.add(velocity);
    const toPoint = new THREE.Vector3().subVectors(kartGroup.position, f.p);
    const heightOffset = toPoint.dot(normal);
    kartGroup.position.addScaledVector(normal, -heightOffset);

    // Soft edge behavior: if beyond road edges, apply gentle inward impulse and friction,
    // do not hard-clamp position to centerline
    const lateral = toPoint.dot(leftDir);
    const half = roadWidth * 0.5;
    const margin = 6;
    const over = Math.abs(lateral) - (half + margin);
    if (over > 0) {
      const sign = Math.sign(lateral);
      velocity.addScaledVector(leftDir, -sign * over * 0.02);
      velocity.multiplyScalar(0.985);
    }

    // Align kart orientation so all four wheels are planted, but blend lightly to preserve drift feel
    // Build a quaternion from the surface axes: forward along tDir, right along leftDir x -1, up = normal
    const forwardAxis = tDir.clone().normalize();
    const rightAxis = new THREE.Vector3().crossVectors(normal, forwardAxis).normalize();
    const upAxis = new THREE.Vector3().crossVectors(forwardAxis, rightAxis).normalize();
    const mat = new THREE.Matrix4().makeBasis(rightAxis, upAxis, forwardAxis);
    const surfQuat = new THREE.Quaternion().setFromRotationMatrix(mat);
    kartGroup.quaternion.slerp(surfQuat, 0.06);
    // Keep some steering feel by blending yaw-driven target with surface orientation
    const lookYaw = Math.atan2(tDir.x, tDir.z);
    yaw = lookYaw * 0.2 + yaw * 0.8;
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    kartGroup.quaternion.slerp(yawQuat, 0.12);
    body.position.set(0, 8, 0);

    // Keep within world bounds
    if (kartGroup.position.x > bounds) { kartGroup.position.x = bounds; velocity.x = 0; }
    if (kartGroup.position.x < -bounds) { kartGroup.position.x = -bounds; velocity.x = 0; }
    if (kartGroup.position.z > bounds) { kartGroup.position.z = bounds; velocity.z = 0; }
    if (kartGroup.position.z < -bounds) { kartGroup.position.z = -bounds; velocity.z = 0; }

    // Coins: spin and collect
    for (const coin of coins) {
      if (!coin.visible) continue;
      coin.rotation.y += 0.06;
      const dx = coin.position.x - kartGroup.position.x;
      const dz = coin.position.z - kartGroup.position.z;
      if (dx * dx + dz * dz < 24 * 24) {
        coin.visible = false;
      }
    }

    // No track powerup logic: boost is rechargeable now

    updateCamera();
    // Render minimap
    if (mm) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      mmMod.renderMinimap(mm, kartGroup.position);
    }
    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);
}


