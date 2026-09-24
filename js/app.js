/* ============================================================
 * 赤峰 · 应用入口（主题 / 飞行 / 交互 / 主循环）
 * ============================================================ */
'use strict';

var scene, camera, renderer, controls, raycaster, clock;
var worldRoot;
var fly = null;
var autoOrbit = false;
var tourTimer = 0;
var tourOn = false;
var tourIdx = 0;
var overviewCam = null;
var pointerDown = null, pointerMoved = false;
var currentTheme = 'day';

var PALETTES = {
  day: {
    _key: 'day',
    skyTop: '#cfe4e0', skyBottom: '#f3f1e4',
    fog: '#dfe8dc', fogNear: 420, fogFar: 1600,
    hemiSky: '#dcece8', hemiGround: '#cfc79e', hemiI: 0.75,
    sun: '#fff4dd', sunI: 1.0, amb: '#ffffff', ambI: 0.28,
    sunPos: [120, 180, 80]
  },
  sunset: {
    _key: 'sunset',
    skyTop: '#e9c7a6', skyBottom: '#f7e3c6',
    fog: '#f1ddc4', fogNear: 400, fogFar: 1500,
    hemiSky: '#f3d9bd', hemiGround: '#c9b385', hemiI: 0.7,
    sun: '#ffb977', sunI: 1.1, amb: '#ffe6cc', ambI: 0.32,
    sunPos: [-160, 60, 100]
  },
  night: {
    _key: 'night',
    skyTop: '#0b1526', skyBottom: '#1c2f49',
    fog: '#101d30', fogNear: 380, fogFar: 1400,
    hemiSky: '#2a4060', hemiGround: '#1a2a26', hemiI: 0.5,
    sun: '#9fc0ff', sunI: 0.45, amb: '#33507a', ambI: 0.4,
    sunPos: [-100, 160, -80]
  }
};

var hemiLight, sunLight, ambLight, skyMesh;

function init() {
  scene = new THREE.Scene();
  var pal = PALETTES.day;
  scene.fog = new THREE.Fog(pal.fog, pal.fogNear, pal.fogFar);

  camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 1, 3000);

  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (renderer.outputEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;
  document.getElementById('canvas-wrap').appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 12;
  controls.maxDistance = 900;
  controls.minPolarAngle = 0.1;
  controls.maxPolarAngle = 1.45;
  controls.autoRotateSpeed = 0.55;
  controls.screenSpacePanning = true;

  raycaster = new THREE.Raycaster();
  clock = new THREE.Clock();
  worldRoot = new THREE.Group();
  scene.add(worldRoot);

  buildLights();
  buildSky();

  var info = World.init(scene, worldRoot);
  overviewCam = info.overview;
  camera.position.copy(overviewCam.pos);
  controls.target.copy(overviewCam.target);

  UI.init();
  bindUI();
  bindPointer();
  window.addEventListener('resize', onResize);

  setTheme('day');
  animate();
}

function buildLights() {
  ambLight = new THREE.AmbientLight(0xffffff, 0.14);
  scene.add(ambLight);
  hemiLight = new THREE.HemisphereLight(0xdcece8, 0xcfc79e, 0.55);
  scene.add(hemiLight);
  sunLight = new THREE.DirectionalLight(0xfff4dd, 1.45);
  sunLight.position.set(120, 180, 80);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  var s = 280, sh = sunLight.shadow.camera;
  sh.left = -s; sh.right = s; sh.top = s; sh.bottom = -s; sh.near = 20; sh.far = 700;
  sunLight.shadow.bias = -0.0008;
  scene.add(sunLight);
}

function buildSky() {
  var geo = new THREE.SphereGeometry(1400, 24, 16);
  var mat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false });
  skyMesh = new THREE.Mesh(geo, mat);
  scene.add(skyMesh);
}

function paintSky(pal) {
  // 简单渐变：用 canvas 贴图
  var c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  var g = c.getContext('2d');
  var grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, pal.skyTop);
  grad.addColorStop(1, pal.skyBottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  if (skyMesh.material.map) skyMesh.material.map.dispose();
  skyMesh.material.map = new THREE.CanvasTexture(c);
  skyMesh.material.needsUpdate = true;
}

function setTheme(name) {
  var pal = PALETTES[name] || PALETTES.day;
  currentTheme = name;
  scene.fog.color.set(pal.fog);
  scene.fog.near = pal.fogNear;
  scene.fog.far = pal.fogFar;
  hemiLight.color.set(pal.hemiSky);
  hemiLight.groundColor.set(pal.hemiGround);
  hemiLight.intensity = pal.hemiI;
  sunLight.color.set(pal.sun);
  sunLight.intensity = pal.sunI;
  sunLight.position.set(pal.sunPos[0], pal.sunPos[1], pal.sunPos[2]);
  ambLight.color.set(pal.amb);
  ambLight.intensity = pal.ambI;
  paintSky(pal);
  World.setTheme(pal);
  document.body.style.background = pal.skyBottom;
}

function flyTo(pos, target, duration, arc) {
  fly = {
    t: 0,
    dur: duration || 1.4,
    fromPos: camera.position.clone(),
    toPos: pos.clone(),
    fromT: controls.target.clone(),
    toT: target.clone(),
    arc: arc === undefined ? 0.18 : arc
  };
  controls.autoRotate = false;
  autoOrbit = false;
}

function updateFly(dt) {
  if (!fly) return;
  fly.t += dt / fly.dur;
  var t = Math.min(1, fly.t);
  var e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  camera.position.lerpVectors(fly.fromPos, fly.toPos, e);
  // 弧线
  var lift = Math.sin(e * Math.PI) * fly.fromPos.distanceTo(fly.toPos) * fly.arc;
  camera.position.y += lift;
  controls.target.lerpVectors(fly.fromT, fly.toT, e);
  if (fly.t >= 1) fly = null;
}

function gotoCity() {
  UI.setLevel('city', { adcode: null, spotId: null });
  UI.hideCard();
  World.highlightDistrict(null);
  flyTo(overviewCam.pos, overviewCam.target, 1.6, 0.1);
  tourOn = false;
}

function gotoDistrict(adcode) {
  var f = World.focusDistrict(adcode);
  if (!f) return;
  UI.setLevel('district', { adcode: adcode, spotId: null });
  UI.showDistrictCard(adcode);
  World.highlightDistrict(adcode);
  flyTo(f.pos, f.target, 1.4, 0.12);
  UI.openSpotListTab();
}

function gotoSpot(id) {
  var f = World.focusSpot(id);
  if (!f) return;
  var s = SPOTS.filter(function (x) { return x.id === id; })[0];
  UI.setLevel('spot', { adcode: f.adcode, spotId: id });
  if (s) UI.showSpotCard(s);
  World.highlightDistrict(f.adcode);
  flyTo(f.pos, f.target, 1.5, 0.2);
}

function bindUI() {
  UI.on('enter', function () {
    flyTo(overviewCam.pos, overviewCam.target, 2.0, 0.05);
    setTimeout(function () { UI.setHintVisible(true); }, 500);
    setTimeout(function () { UI.setHintVisible(false); }, 6000);
    if (World.isMobile()) UI.openDistrictListTab();
  });
  UI.on('selectDistrict', gotoDistrict);
  UI.on('selectSpot', gotoSpot);
  UI.on('gotoCity', gotoCity);
  UI.on('gotoDistrict', gotoDistrict);
  UI.on('theme', setTheme);
  UI.on('closeCard', function () {
    if (UI.getState().level === 'spot') {
      var ad = UI.getState().adcode;
      if (ad) gotoDistrict(ad);
    }
  });
  UI.on('closeIn', function () {
    var id = UI.getState().spotId;
    if (!id) return;
    var f = World.focusSpot(id);
    if (f) flyTo(f.close, f.target, 1.1, 0.05);
  });
  UI.on('orbit', function () {
    var id = UI.getState().spotId;
    if (!id) return;
    var n = World.getSpotNode(id);
    if (!n) return;
    controls.target.copy(n.anchor);
    var d = 14;
    var ang = Math.atan2(camera.position.z - n.anchor.z, camera.position.x - n.anchor.x);
    flyTo(
      new THREE.Vector3(n.anchor.x + Math.cos(ang) * d, n.anchor.y + 8, n.anchor.z + Math.sin(ang) * d),
      n.anchor, 1.0, 0
    );
    setTimeout(function () { controls.autoRotate = true; autoOrbit = true; }, 1100);
  });
  UI.on('autoOrbit', function () {
    autoOrbit = !autoOrbit;
    controls.autoRotate = autoOrbit;
  });
  UI.on('tour', function () {
    tourOn = !tourOn;
    tourTimer = 0;
    tourIdx = 0;
    if (!tourOn) controls.autoRotate = false;
  });
  UI.on('topView', function () {
    flyTo(overviewCam.top, overviewCam.target, 1.5, 0.05);
  });
  UI.on('zoom', function (delta) {
    var dir = camera.position.clone().sub(controls.target);
    var len = dir.length() * (1 + delta);
    len = Math.max(controls.minDistance, Math.min(controls.maxDistance, len));
    dir.setLength(len);
    camera.position.copy(controls.target).add(dir);
  });
  UI.on('photo', function () {
    try {
      var url = renderer.domElement.toDataURL('image/png');
      var a = document.createElement('a');
      a.href = url;
      a.download = 'chifeng-sandbox.png';
      a.click();
    } catch (e) {
      console.warn('photo failed', e);
    }
  });
  UI.on('fullscreen', function () {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  });
}

function bindPointer() {
  var el = renderer.domElement;
  el.addEventListener('pointerdown', function (e) {
    pointerDown = { x: e.clientX, y: e.clientY };
    pointerMoved = false;
  });
  el.addEventListener('pointermove', function (e) {
    if (pointerDown) {
      var dx = e.clientX - pointerDown.x, dy = e.clientY - pointerDown.y;
      if (dx * dx + dy * dy > 36) pointerMoved = true;
    }
  });
  el.addEventListener('pointerup', function (e) {
    if (pointerMoved) { pointerDown = null; return; }
    pointerDown = null;
    pick(e.clientX, e.clientY);
  });
}

function pick(cx, cy) {
  var mouse = new THREE.Vector2(
    (cx / window.innerWidth) * 2 - 1,
    -(cy / window.innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(mouse, camera);
  var targets = World.getClickable();
  var hits = raycaster.intersectObjects(targets, true);
  for (var i = 0; i < hits.length; i++) {
    var u = hits[i].object.userData || {};
    if (u.type === 'spot' && u.id) {
      gotoSpot(u.id);
      return;
    }
    if (u.type === 'district' && u.adcode) {
      gotoDistrict(u.adcode);
      return;
    }
  }
}

function updateTour(dt) {
  if (!tourOn) return;
  tourTimer += dt;
  if (fly) return;
  if (tourTimer < 3.5) return;
  tourTimer = 0;
  var list = SPOTS;
  if (UI.getState().adcode) {
    list = spotsByAdcode(UI.getState().adcode);
    if (!list.length) list = SPOTS;
  }
  tourIdx = (tourIdx + 1) % list.length;
  gotoSpot(list[tourIdx].id);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);
  var dt = Math.min(0.05, clock.getDelta());
  updateFly(dt);
  updateTour(dt);
  controls.update();
  var lvl = UI.getState().level;
  World.updateLabels(camera, lvl);
  // 指北针
  var needle = document.getElementById('compass-needle');
  if (needle) {
    var ang = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
    needle.style.transform = 'rotate(' + (-ang) + 'rad)';
  }
  renderer.render(scene, camera);
}

document.addEventListener('DOMContentLoaded', init);
