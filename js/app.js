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
var camSoft = null;
var CITY_MIN_DIST = 12;
var CITY_MAX_DIST = 1600;
var pointerDown = null, pointerMoved = false;
var currentTheme = 'day';

var PALETTES = {
  day: {
    _key: 'day',
    themeColor: '#e9eee6',
    skyTop: '#b7d4ce', skyBottom: '#f0ecd8',
    fog: '#cfdcc8', fogNear: 620, fogFar: 2600,
    hemiSky: '#c8e0d8', hemiGround: '#b8ad7c', hemiI: 0.38,
    sun: '#fff0cc', sunI: 0.92, amb: '#ffffff', ambI: 0.07,
    sunPos: [120, 180, 80]
  },
  sunset: {
    _key: 'sunset',
    themeColor: '#efd5b4',
    skyTop: '#e8b888', skyBottom: '#f7e0c0',
    fog: '#efd5b4', fogNear: 500, fogFar: 2300,
    hemiSky: '#f0d0ae', hemiGround: '#c2a678', hemiI: 0.48,
    sun: '#ff9d55', sunI: 1.05, amb: '#ffdfc0', ambI: 0.14,
    sunPos: [-170, 55, 95]
  },
  night: {
    _key: 'night',
    themeColor: '#0d1828',
    skyTop: '#08101f', skyBottom: '#1a2f4d',
    fog: '#0d1828', fogNear: 520, fogFar: 2400,
    hemiSky: '#3d5a82', hemiGround: '#243447', hemiI: 0.46,
    sun: '#c4d8ff', sunI: 0.62, amb: '#4a6a96', ambI: 0.16,
    sunPos: [-110, 175, -70]
  }
};

var hemiLight, sunLight, ambLight, skyMesh;
var themeAnim = null;
var orbitTimer = null;

function init() {
  try {
    var testCanvas = document.createElement('canvas');
    if (!(testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl'))) {
      throw new Error('no webgl');
    }
  } catch (err) {
    var intro = document.getElementById('intro');
    if (intro) {
      var tip = intro.querySelector('.intro-tip');
      if (tip) tip.textContent = '当前浏览器不支持 WebGL，请改用 Chrome / Edge 打开';
      var btn = document.getElementById('enter-btn');
      if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
    }
    return;
  }
  scene = new THREE.Scene();
  var pal = PALETTES.day;
  scene.fog = new THREE.Fog(pal.fog, pal.fogNear, pal.fogFar);

  camera = new THREE.PerspectiveCamera(42, window.innerWidth / Math.max(1, window.innerHeight), 1, 5000);

  // preserveDrawingBuffer 关闭以省带宽；拍照前手动 render 一帧即可导出
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('canvas-wrap').appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    fly = null;
    UI.toast('渲染中断，请刷新页面');
  });
  renderer.domElement.addEventListener('webglcontextrestored', function () {
    UI.toast('渲染已恢复');
  });

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 12;
  controls.maxDistance = 1600;
  controls.minPolarAngle = 0.1;
  controls.maxPolarAngle = 1.45;
  controls.autoRotateSpeed = 1.2;
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
  // 覆盖全域 + 周边空地阴影
  var s = 720, sh = sunLight.shadow.camera;
  sh.left = -s; sh.right = s; sh.top = s; sh.bottom = -s; sh.near = 20; sh.far = 900;
  sunLight.shadow.bias = -0.0008;
  scene.add(sunLight);
}

function buildSky() {
  var geo = new THREE.SphereGeometry(2800, 24, 16);
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

function captureThemeState() {
  return {
    fog: scene.fog.color.getHex(),
    fogNear: scene.fog.near,
    fogFar: scene.fog.far,
    hemiSky: hemiLight.color.getHex(),
    hemiGround: hemiLight.groundColor.getHex(),
    hemiI: hemiLight.intensity,
    sun: sunLight.color.getHex(),
    sunI: sunLight.intensity,
    sunPos: [sunLight.position.x, sunLight.position.y, sunLight.position.z],
    amb: ambLight.color.getHex(),
    ambI: ambLight.intensity
  };
}

function syncThemeColor(pal) {
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', pal.themeColor || pal.skyBottom);
}

function setTheme(name) {
  var pal = PALETTES[name] || PALETTES.day;
  currentTheme = name;
  // 天空贴图先切，避免开场动画期间无贴图；灯光再插值过渡
  paintSky(pal);
  var dur = UI.prefersReducedMotion() ? 0.05 : 0.55;
  themeAnim = { t: 0, dur: dur, from: captureThemeState(), pal: pal };
  World.setTheme(pal);
  document.body.style.background = pal.skyBottom;
  syncThemeColor(pal);
}

function updateThemeAnim(dt) {
  if (!themeAnim) return;
  themeAnim.t += dt / themeAnim.dur;
  var t = Math.min(1, themeAnim.t);
  var e = t * t * (3 - 2 * t);
  var from = themeAnim.from, pal = themeAnim.pal;
  scene.fog.color.lerpColors(new THREE.Color(from.fog), new THREE.Color(pal.fog), e);
  scene.fog.near = from.fogNear + (pal.fogNear - from.fogNear) * e;
  scene.fog.far = from.fogFar + (pal.fogFar - from.fogFar) * e;
  hemiLight.color.lerpColors(new THREE.Color(from.hemiSky), new THREE.Color(pal.hemiSky), e);
  hemiLight.groundColor.lerpColors(new THREE.Color(from.hemiGround), new THREE.Color(pal.hemiGround), e);
  hemiLight.intensity = from.hemiI + (pal.hemiI - from.hemiI) * e;
  sunLight.color.lerpColors(new THREE.Color(from.sun), new THREE.Color(pal.sun), e);
  sunLight.intensity = from.sunI + (pal.sunI - from.sunI) * e;
  sunLight.position.set(
    from.sunPos[0] + (pal.sunPos[0] - from.sunPos[0]) * e,
    from.sunPos[1] + (pal.sunPos[1] - from.sunPos[1]) * e,
    from.sunPos[2] + (pal.sunPos[2] - from.sunPos[2]) * e
  );
  ambLight.color.lerpColors(new THREE.Color(from.amb), new THREE.Color(pal.amb), e);
  ambLight.intensity = from.ambI + (pal.ambI - from.ambI) * e;
  if (t >= 1) {
    paintSky(pal);
    themeAnim = null;
  }
}

function clearOrbitTimer() {
  if (orbitTimer) {
    clearTimeout(orbitTimer);
    orbitTimer = null;
  }
}

function applyCamSoft(focus) {
  if (!focus || !focus.bounds) {
    camSoft = null;
    controls.minDistance = CITY_MIN_DIST;
    controls.maxDistance = CITY_MAX_DIST;
    return;
  }
  camSoft = focus.bounds;
  controls.minDistance = focus.minDist != null ? focus.minDist : 16;
  controls.maxDistance = focus.maxDist != null ? focus.maxDist : 320;
}

function clampCamSoft() {
  if (!camSoft || fly) return;
  var target = controls.target;
  var cx = Math.max(camSoft.minX, Math.min(camSoft.maxX, target.x));
  var cz = Math.max(camSoft.minZ, Math.min(camSoft.maxZ, target.z));
  if (cx !== target.x || cz !== target.z) {
    target.x = cx;
    target.z = cz;
  }
  // 相机相对 target 的水平距不超过 maxDistance，避免阻尼把机位甩出界
  var offset = camera.position.clone().sub(target);
  var horiz = Math.sqrt(offset.x * offset.x + offset.z * offset.z);
  var maxH = controls.maxDistance * 0.98;
  if (horiz > maxH && horiz > 0.01) {
    var scale = maxH / horiz;
    camera.position.x = target.x + offset.x * scale;
    camera.position.z = target.z + offset.z * scale;
  }
}

function flyTo(pos, target, duration, arc) {
  clearOrbitTimer();
  if (UI.prefersReducedMotion()) {
    camera.position.copy(pos);
    controls.target.copy(target);
    fly = null;
    controls.autoRotate = false;
    autoOrbit = false;
    UI.setToolbarActive('tb-orbit', false);
    return;
  }
  var dist = camera.position.distanceTo(pos);
  var base = duration || 1.4;
  // 时长随距离伸缩：短跳利落、长距从容
  var dur = Math.max(0.55, Math.min(2.4, base * (0.55 + Math.min(1.5, dist / 220))));
  fly = {
    t: 0,
    dur: dur,
    fromPos: camera.position.clone(),
    toPos: pos.clone(),
    fromT: controls.target.clone(),
    toT: target.clone(),
    arc: arc === undefined ? 0.18 : arc
  };
  controls.autoRotate = false;
  autoOrbit = false;
  UI.setToolbarActive('tb-orbit', false);
}

function resetNorth() {
  var target = controls.target.clone();
  var dist = camera.position.distanceTo(target);
  var elev = camera.position.y - target.y;
  var ground = Math.sqrt(Math.max(1, dist * dist - elev * elev));
  var to = new THREE.Vector3(target.x, target.y + elev, target.z + ground);
  flyTo(to, target, 0.85, 0);
  UI.toast('已归北');
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
  World.selectSpot(null);
  applyCamSoft(null);
  flyTo(overviewCam.pos, overviewCam.target, 1.6, 0.1);
  tourOn = false;
  UI.setToolbarActive('tb-tour', false);
}

function gotoDistrict(adcode) {
  var f = World.focusDistrict(adcode);
  if (!f) return;
  UI.setLevel('district', { adcode: adcode, spotId: null });
  UI.showDistrictCard(adcode);
  World.highlightDistrict(adcode);
  World.selectSpot(null);
  applyCamSoft(f);
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
  World.selectSpot(id);
  applyCamSoft(f);
  flyTo(f.pos, f.target, 1.5, 0.2);
}

function bindUI() {
  UI.on('enter', function () {
    // 开场：先退到高远处，再俯冲到全景，避免「点进入无变化」
    var start = new THREE.Vector3(
      overviewCam.pos.x + 80,
      overviewCam.pos.y + 120,
      overviewCam.pos.z + 140
    );
    camera.position.copy(start);
    controls.target.copy(overviewCam.target);
    flyTo(overviewCam.pos, overviewCam.target, 2.2, 0.06);
    setTimeout(function () { UI.setHintVisible(true); }, 700);
    setTimeout(function () { UI.setHintVisible(false); }, 6500);
    if (World.isMobile()) UI.openDistrictListTab();
  });
  UI.on('selectDistrict', gotoDistrict);
  UI.on('selectSpot', gotoSpot);
  UI.on('gotoCity', gotoCity);
  UI.on('gotoDistrict', gotoDistrict);
  UI.on('theme', function (name) {
    setTheme(name);
    var labels = { day: '晴昼', sunset: '日落', night: '夜游' };
    UI.toast(labels[name] || '主题已切换');
  });
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
    if (f) {
      flyTo(f.close, f.target, 1.1, 0.05);
      UI.toast('近景');
    }
  });
  UI.on('orbit', function () {
    var id = UI.getState().spotId;
    if (!id) return;
    var n = World.getSpotNode(id);
    if (!n) return;
    controls.target.copy(n.anchor);
    var d = 22;
    var ang = Math.atan2(camera.position.z - n.anchor.z, camera.position.x - n.anchor.x);
    flyTo(
      new THREE.Vector3(n.anchor.x + Math.cos(ang) * d, n.anchor.y + 11, n.anchor.z + Math.sin(ang) * d),
      n.anchor, 1.0, 0
    );
    clearOrbitTimer();
    var delay = UI.prefersReducedMotion() ? 50 : 1100;
    orbitTimer = setTimeout(function () {
      orbitTimer = null;
      controls.autoRotate = true;
      autoOrbit = true;
      UI.setToolbarActive('tb-orbit', true);
      UI.toast('环绕中');
    }, delay);
  });
  UI.on('autoOrbit', function () {
    autoOrbit = !autoOrbit;
    controls.autoRotate = autoOrbit;
    UI.setToolbarActive('tb-orbit', autoOrbit);
    UI.toast(autoOrbit ? '自动环绕开启' : '已停止环绕');
  });
  UI.on('tour', function () {
    tourOn = !tourOn;
    tourTimer = 0;
    tourIdx = 0;
    UI.setToolbarActive('tb-tour', tourOn);
    if (!tourOn) {
      controls.autoRotate = false;
      autoOrbit = false;
      UI.setToolbarActive('tb-orbit', false);
      UI.toast('漫游已结束');
    } else {
      UI.toast('景点漫游开始');
      if (!fly) {
        var list = SPOTS;
        if (UI.getState().adcode) {
          list = spotsByAdcode(UI.getState().adcode);
          if (!list.length) list = SPOTS;
        }
        if (list.length) {
          gotoSpot(list[0].id);
          tourIdx = 1 % list.length;
        }
      }
    }
  });
  UI.on('topView', function () {
    flyTo(overviewCam.top, overviewCam.target, 1.5, 0.05);
    UI.toast('俯视');
  });
  UI.on('resetNorth', resetNorth);
  UI.on('zoom', function (delta) {
    var dir = camera.position.clone().sub(controls.target);
    var len = dir.length() * (1 + delta);
    len = Math.max(controls.minDistance, Math.min(controls.maxDistance, len));
    dir.setLength(len);
    flyTo(controls.target.clone().add(dir), controls.target.clone(), 0.35, 0);
  });
  UI.on('photo', function () {
    try {
      renderer.render(scene, camera);
      var url = renderer.domElement.toDataURL('image/png');
      var a = document.createElement('a');
      a.href = url;
      a.download = 'chifeng-sandbox.png';
      a.click();
      UI.toast('照片已导出');
    } catch (e) {
      console.warn('photo failed', e);
      UI.toast('导出失败，请重试');
    }
  });
  UI.on('fullscreen', function () {
    try {
      if (document.fullscreenElement) {
        if (document.exitFullscreen) document.exitFullscreen();
        return;
      }
      var el = document.documentElement;
      var req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (!req) {
        UI.toast('当前浏览器不支持全屏');
        return;
      }
      var p = req.call(el);
      if (p && p.catch) p.catch(function () { UI.toast('全屏不可用'); });
    } catch (e) {
      UI.toast('全屏不可用');
    }
  });
}

function bindPointer() {
  var el = renderer.domElement;
  var activePointers = 0;
  el.addEventListener('pointerdown', function (e) {
    fly = null; // 用户接管相机，中断飞行
    activePointers++;
    pointerDown = { x: e.clientX, y: e.clientY };
    pointerMoved = false;
    if (activePointers > 1) pointerMoved = true;
  });
  el.addEventListener('wheel', function () { fly = null; }, { passive: true });
  el.addEventListener('pointermove', function (e) {
    if (pointerDown) {
      var dx = e.clientX - pointerDown.x, dy = e.clientY - pointerDown.y;
      if (dx * dx + dy * dy > 36) pointerMoved = true;
    }
  });
  el.addEventListener('pointerup', function (e) {
    activePointers = Math.max(0, activePointers - 1);
    if (pointerMoved || activePointers > 0) { pointerDown = null; return; }
    pointerDown = null;
    pick(e.clientX, e.clientY);
  });
  el.addEventListener('pointercancel', function () {
    activePointers = Math.max(0, activePointers - 1);
    pointerDown = null;
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
  if (fly) return;
  tourTimer += dt;
  if (tourTimer < 3.8) return;
  tourTimer = 0;
  var list = SPOTS;
  if (UI.getState().adcode) {
    list = spotsByAdcode(UI.getState().adcode);
    if (!list.length) list = SPOTS;
  }
  if (!list.length) {
    tourOn = false;
    UI.setToolbarActive('tb-tour', false);
    return;
  }
  gotoSpot(list[tourIdx % list.length].id);
  tourIdx = (tourIdx + 1) % list.length;
}

var resizeTimer = null;
function onResize() {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(function () {
    var w = window.innerWidth || 1;
    var h = window.innerHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }, 80);
}

function animate() {
  requestAnimationFrame(animate);
  var dt = Math.min(0.05, clock.getDelta());
  updateFly(dt);
  updateThemeAnim(dt);
  updateTour(dt);
  controls.update();
  clampCamSoft();
  // 天空球跟随相机，拉远不穿帮
  if (skyMesh) skyMesh.position.copy(camera.position);
  var lvl = UI.getState().level;
  World.updateLabels(camera, lvl, UI.getState().adcode);
  // 指北针
  var needle = document.getElementById('compass-needle');
  if (needle) {
    var ang = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
    needle.style.transform = 'rotate(' + (-ang) + 'rad)';
  }
  renderer.render(scene, camera);
}

document.addEventListener('DOMContentLoaded', init);
