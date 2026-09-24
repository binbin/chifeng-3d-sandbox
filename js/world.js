/* ============================================================
 * 赤峰 · 三维世界构建
 * ============================================================ */
'use strict';

var World = (function () {
  var scene, world;
  var themedMats = [];
  var districtGroups = {};
  var districtMeshes = [];
  var spotNodes = {};
  var clickable = [];
  var labels = [];
  var waterMeshes = [];
  var cityGroup, treeGroup;

  function reg(mat, day, sunset, night) {
    themedMats.push({ mat: mat, day: day, sunset: sunset, night: night });
    return mat;
  }

  function setTheme(pal, palSunset, palNight) {
    themedMats.forEach(function (t) {
      var c = t.day;
      if (pal._key === 'sunset') c = t.sunset;
      if (pal._key === 'night') c = t.night;
      if (typeof c === 'number') t.mat.color.setHex(c);
    });
    waterMeshes.forEach(function (m) {
      if (pal._key === 'night') {
        m.material.color.setHex(0x123a5e);
        m.material.emissive.setHex(0x1d4d7a);
        m.material.emissiveIntensity = 0.15;
      } else if (pal._key === 'sunset') {
        m.material.color.setHex(0x4a7eb8);
        m.material.emissive.setHex(0xa06a3e);
        m.material.emissiveIntensity = 0.12;
      } else {
        m.material.color.setHex(0x3b8ac9);
        m.material.emissive.setHex(0x246096);
        m.material.emissiveIntensity = 0.08;
      }
    });
  }

  function makeLabel(text, opts) {
    opts = opts || {};
    var div = document.createElement('div');
    div.className = 'w-label ' + (opts.className || '');
    div.textContent = text;
    if (opts.size) div.style.fontSize = opts.size;
    if (opts.clickable) {
      div.classList.add('clickable');
      div.setAttribute('role', 'button');
      div.tabIndex = 0;
      div.setAttribute('aria-label', '前往' + text);
      var fire = function () {
        if (opts.onClick) opts.onClick();
      };
      div.addEventListener('click', function (e) {
        e.stopPropagation();
        fire();
      });
      div.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fire();
        }
      });
    }
    document.getElementById('label-layer').appendChild(div);
    var item = {
      el: div,
      pos: opts.pos.clone ? opts.pos.clone() : new THREE.Vector3(opts.pos[0], opts.pos[1], opts.pos[2]),
      minDist: opts.minDist || 0,
      maxDist: opts.maxDist || 1e9,
      level: opts.level || 0,
      adcode: opts.adcode || 0,
      spotId: opts.spotId || null
    };
    labels.push(item);
    return item;
  }

  var CORE_PAD_DEG = 0.06;
  // 市界外扩一圈空白地貌，边缘旗县朝外不再「出界见空」
  var TERRAIN_MARGIN_DEG = 1.21;

  function computeDistrictLonLatExtent() {
    var minLon = 180, minLat = 90, maxLon = -180, maxLat = -90;
    CF_DISTRICTS.forEach(function (d) {
      d.rings.forEach(function (ring) {
        ring.forEach(function (p) {
          if (p[0] < minLon) minLon = p[0];
          if (p[0] > maxLon) maxLon = p[0];
          if (p[1] < minLat) minLat = p[1];
          if (p[1] > maxLat) maxLat = p[1];
        });
      });
    });
    return { minLon: minLon, maxLon: maxLon, minLat: minLat, maxLat: maxLat };
  }

  /** 赤峰核心范围：全景机位仍对准市域，不因外扩地形拉开 */
  function buildCoreBounds() {
    var extent = computeDistrictLonLatExtent();
    return {
      minLon: extent.minLon - CORE_PAD_DEG,
      maxLon: extent.maxLon + CORE_PAD_DEG,
      minLat: extent.minLat - CORE_PAD_DEG,
      maxLat: extent.maxLat + CORE_PAD_DEG
    };
  }

  /** 地形网格范围：含周边空地 */
  function buildTerrainBounds() {
    var extent = computeDistrictLonLatExtent();
    return {
      minLon: extent.minLon - TERRAIN_MARGIN_DEG,
      maxLon: extent.maxLon + TERRAIN_MARGIN_DEG,
      minLat: extent.minLat - TERRAIN_MARGIN_DEG,
      maxLat: extent.maxLat + TERRAIN_MARGIN_DEG
    };
  }

  function buildBounds() {
    return buildCoreBounds();
  }

  function buildTerrain() {
    var bound = buildTerrainBounds();
    var segs = isMobile() ? 160 : 230;
    var grid = Terrain.buildGrid(bound, segs);
    var mat = reg(new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.95, flatShading: true
    }), 0xffffff, 0xe8dcc4, 0x2e3a44);
    var mesh = new THREE.Mesh(grid.geometry, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    world.add(mesh);
    clickable.push(mesh);
    return { mesh: mesh, bound: bound, core: buildCoreBounds() };
  }

  function isMobile() {
    return window.innerWidth <= 768 || window.innerHeight <= 500;
  }

  function ringToWorldXZ(ring) {
    return ring.map(function (p) {
      var xz = XY(p[0], p[1]);
      return new THREE.Vector2(xz[0], xz[1]);
    });
  }

  function buildDistricts() {
    var borderMat = reg(new THREE.LineBasicMaterial({ color: 0xf5f1e4, transparent: true, opacity: 0.85 }),
      0xf5f1e4, 0xf3e2c4, 0xa8c4d8);
    var fillMats = {};

    CF_DISTRICTS.forEach(function (d) {
      var g = new THREE.Group();
      g.name = 'district-' + d.adcode;
      g.userData = { type: 'district', adcode: d.adcode, name: d.name };
      districtGroups[d.adcode] = g;

      var color = DISTRICT_COLORS[d.adcode] || 0x888888;
      var fill = new THREE.MeshStandardMaterial({
        color: color,
        transparent: true,
        opacity: 0.08,
        roughness: 0.9,
        depthWrite: false,
        flatShading: true
      });
      fillMats[d.adcode] = fill;
      reg(fill, color, color, 0x334455);

      d.rings.forEach(function (ring) {
        // 边界线
        var pts3 = [];
        for (var i = 0; i < ring.length; i++) {
          var xz = XY(ring[i][0], ring[i][1]);
          var y = Terrain.heightAtWorld(xz[0], xz[1]) + 0.35;
          pts3.push(new THREE.Vector3(xz[0], y, xz[1]));
        }
        var lineGeo = new THREE.BufferGeometry().setFromPoints(pts3);
        var line = new THREE.Line(lineGeo, borderMat);
        line.userData = { type: 'district', adcode: d.adcode, name: d.name };
        g.add(line);
        clickable.push(line);

        // 旗县色板：顶点贴合地形，略微抬升，沙盘浮色
        var shape = new THREE.Shape();
        var flat = ring.map(function (p) {
          var xz = XY(p[0], p[1]);
          return [xz[0], xz[1]];
        });
        if (flat.length < 3) return;
        shape.moveTo(flat[0][0], flat[0][1]);
        for (var k = 1; k < flat.length; k++) shape.lineTo(flat[k][0], flat[k][1]);
        var shapeGeo = new THREE.ShapeGeometry(shape);
        shapeGeo.rotateX(-Math.PI / 2);
        var posAttr = shapeGeo.getAttribute('position');
        for (var vi = 0; vi < posAttr.count; vi++) {
          var vx = posAttr.getX(vi);
          var vz = posAttr.getZ(vi);
          posAttr.setY(vi, Terrain.heightAtWorld(vx, vz) + 0.45);
        }
        posAttr.needsUpdate = true;
        shapeGeo.computeVertexNormals();
        var plate = new THREE.Mesh(shapeGeo, fill);
        plate.renderOrder = 2;
        plate.userData = { type: 'district', adcode: d.adcode, name: d.name, plate: true };
        g.add(plate);
        clickable.push(plate);
        districtMeshes.push(plate);
      });

      var info = DISTRICT_INFO[d.adcode] || {};
      var cxz = XY(d.centroid[0], d.centroid[1]);
      var cy = Terrain.heightAtWorld(cxz[0], cxz[1]) + 8;
      makeLabel(d.name, {
        pos: new THREE.Vector3(cxz[0], cy, cxz[1]),
        className: 'lbl-district',
        maxDist: 1200,
        minDist: 0,
        adcode: d.adcode,
        clickable: true,
        onClick: function () {
          if (typeof UI !== 'undefined') UI.emit('selectDistrict', d.adcode);
        }
      });
      g.userData.labelPos = new THREE.Vector3(cxz[0], cy, cxz[1]);
      world.add(g);
    });
  }

  function buildWater() {
    var waterMat = new THREE.MeshStandardMaterial({
      color: 0x3b8ac9,
      roughness: 0.45,
      metalness: 0.05,
      transparent: true,
      opacity: 0.88,
      emissive: 0x246096,
      emissiveIntensity: 0.08,
      flatShading: true
    });

    // 河流
    RIVERS.forEach(function (r) {
      if (!r.pts || r.pts.length < 2) return;
      var pts = r.pts.map(function (p) {
        var xz = XY(p[0], p[1]);
        return new THREE.Vector3(xz[0], Terrain.heightAtWorld(xz[0], xz[1]) + 0.15, xz[1]);
      });
      var curve = new THREE.CatmullRomCurve3(pts);
      var tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 80, r.width * 0.16, 5, false),
        waterMat
      );
      tube.name = 'river-' + r.name;
      world.add(tube);
      waterMeshes.push(tube);
      var mid = pts[Math.floor(pts.length / 2)];
      if (mid) {
        makeLabel(r.name, {
          pos: new THREE.Vector3(mid.x, mid.y + 2, mid.z),
          className: 'lbl-river',
          maxDist: 700
        });
      }
    });

    // 湖泊
    LAKES.forEach(function (lk) {
      if (!lk.pts || lk.pts.length < 3) return;
      var shape = new THREE.Shape();
      var flat = lk.pts.map(function (p) {
        var xz = XY(p[0], p[1]);
        return [xz[0], xz[1]];
      });
      shape.moveTo(flat[0][0], flat[0][1]);
      for (var i = 1; i < flat.length; i++) shape.lineTo(flat[i][0], flat[i][1]);
      var geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      var mesh = new THREE.Mesh(geo, waterMat.clone());
      var xz = XY(lk.pts[0][0], lk.pts[0][1]);
      mesh.position.y = Terrain.heightAtWorld(
        (flat[0][0] + flat[2][0]) / 2,
        (flat[0][1] + flat[2][1]) / 2
      ) + 0.35;
      mesh.name = 'lake-' + lk.name;
      world.add(mesh);
      waterMeshes.push(mesh);
      makeLabel(lk.name, {
        pos: new THREE.Vector3(xz[0], mesh.position.y + 3, xz[1]),
        className: 'lbl-lake',
        maxDist: 800
      });
    });
  }

  function buildCities() {
    cityGroup = new THREE.Group();
    world.add(cityGroup);
    var mats = [
      reg(new THREE.MeshStandardMaterial({ color: 0xf2f1e9, roughness: 0.8, flatShading: true }), 0xf2f1e9, 0xf0e6d4, 0x3a4450),
      reg(new THREE.MeshStandardMaterial({ color: 0xdde3d8, roughness: 0.8, flatShading: true }), 0xdde3d8, 0xdcd4c0, 0x353f4c),
      reg(new THREE.MeshStandardMaterial({ color: 0xc5cfc6, roughness: 0.8, flatShading: true }), 0xc5cfc6, 0xd0c8b4, 0x2f3a44)
    ];

    CITIES.forEach(function (c) {
      var g = new THREE.Group();
      var xz = XY(c.lon, c.lat);
      var n = Math.floor(8 + c.size * 14);
      var spread = c.size * (c.seats ? 7 : 5);
      for (var i = 0; i < n; i++) {
        var ang = Math.random() * Math.PI * 2;
        var rad = Math.sqrt(Math.random()) * spread;
        var bx = xz[0] + Math.cos(ang) * rad;
        var bz = xz[1] + Math.sin(ang) * rad;
        var h = (0.8 + Math.random() * 2.4) * c.size * (c.seats ? 1.35 : 1);
        var w = 0.5 + Math.random() * 0.9;
        var d = 0.5 + Math.random() * 0.9;
        var by = Terrain.heightAtWorld(bx, bz);
        var box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[i % 3]);
        box.position.set(bx, by + h / 2, bz);
        box.rotation.y = Math.random() * 0.4;
        box.castShadow = true;
        box.receiveShadow = true;
        g.add(box);
      }
      if (c.seats) {
        // 市中心地标塔
        var th = 6.5;
        var ty = Terrain.heightAtWorld(xz[0], xz[1]);
        var tower = new THREE.Mesh(
          new THREE.BoxGeometry(1.4, th, 1.4),
          reg(new THREE.MeshStandardMaterial({ color: 0x9c4a38, roughness: 0.7, flatShading: true }), 0x9c4a38, 0xa4553d, 0x572d25)
        );
        tower.position.set(xz[0], ty + th / 2, xz[1]);
        tower.castShadow = true;
        g.add(tower);
      }
      cityGroup.add(g);
      makeLabel(c.name, {
        pos: new THREE.Vector3(xz[0], Terrain.heightAtWorld(xz[0], xz[1]) + (c.seats ? 9 : 4), xz[1]),
        className: 'lbl-city' + (c.seats ? ' lbl-city-main' : ''),
        maxDist: c.seats ? 1400 : 650
      });
    });
  }

  function buildPeaks() {
    PEAKS.forEach(function (pk) {
      var xz = XY(pk.lon, pk.lat);
      var y = Terrain.heightAtWorld(xz[0], xz[1]);
      makeLabel(pk.name + ' ' + pk.elev + 'm', {
        pos: new THREE.Vector3(xz[0], y + 5, xz[1]),
        className: 'lbl-peak',
        maxDist: 900
      });
    });
  }

  function buildTrees() {
    treeGroup = new THREE.Group();
    world.add(treeGroup);
    var geo = new THREE.ConeGeometry(0.5, 1.4, 5);
    var mat = reg(new THREE.MeshStandardMaterial({ color: 0x3d6b46, roughness: 1, flatShading: true }),
      0x3d6b46, 0x4a6b3a, 0x1e3324);
    var count = isMobile() ? 280 : 520;
    var mesh = new THREE.InstancedMesh(geo, mat, count);
    var dummy = new THREE.Object3D();
    var n = 0;
    for (var i = 0; i < count * 3 && n < count; i++) {
      var lon = 116.6 + Math.random() * 3.8;
      var lat = 41.4 + Math.random() * 3.5;
      if (!districtAt(lon, lat)) continue;
      var elev = Terrain.elevationMeters(lon, lat);
      // 多集中在山地
      if (elev < 900 || elev > 1850) continue;
      if (Math.random() > 0.55) continue;
      var xz = XY(lon, lat);
      var y = Terrain.heightAtWorld(xz[0], xz[1]);
      dummy.position.set(xz[0], y + 0.7, xz[1]);
      var s = 0.6 + Math.random() * 1.1;
      dummy.scale.set(s, s * (0.8 + Math.random() * 0.6), s);
      dummy.rotation.y = Math.random() * Math.PI;
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      n++;
    }
    mesh.count = n;
    mesh.castShadow = true;
    treeGroup.add(mesh);
  }

  var landmarkMats = null;
  function getLandmarkMats() {
    if (landmarkMats) return landmarkMats;
    landmarkMats = {
      stone: reg(new THREE.MeshStandardMaterial({ color: 0xcfc7b0, roughness: 0.9, flatShading: true }), 0xcfc7b0, 0xd8c8a8, 0x6e7280),
      stoneDark: reg(new THREE.MeshStandardMaterial({ color: 0x9a927c, roughness: 0.9, flatShading: true }), 0x9a927c, 0xa89470, 0x4a4e58),
      red: reg(new THREE.MeshStandardMaterial({ color: 0x9c4a38, roughness: 0.7, flatShading: true }), 0x9c4a38, 0xb05538, 0x572d25),
      gold: reg(new THREE.MeshStandardMaterial({ color: 0xd9b04f, roughness: 0.35, metalness: 0.5, flatShading: true }), 0xd9b04f, 0xe0b858, 0x8a7440),
      roof: reg(new THREE.MeshStandardMaterial({ color: 0x314039, roughness: 0.65, flatShading: true }), 0x314039, 0x3a4538, 0x1a2220),
      wall: reg(new THREE.MeshStandardMaterial({ color: 0xf0e4cd, roughness: 0.85, flatShading: true }), 0xf0e4cd, 0xf0e0c0, 0x5a6270),
      sand: reg(new THREE.MeshStandardMaterial({ color: 0xd2c08a, roughness: 1, flatShading: true }), 0xd2c08a, 0xd8c488, 0x4a5060),
      water: reg(new THREE.MeshStandardMaterial({ color: 0x3b8ac9, transparent: true, opacity: 0.85, roughness: 0.4 }), 0x3b8ac9, 0x4a7eb8, 0x123a5e),
      grass: reg(new THREE.MeshStandardMaterial({ color: 0x8fad5c, flatShading: true }), 0x8fad5c, 0x9a9a50, 0x2e4030),
      forest: reg(new THREE.MeshStandardMaterial({ color: 0x3d6b46, flatShading: true }), 0x3d6b46, 0x4a6b3a, 0x1e3324),
      spring: reg(new THREE.MeshStandardMaterial({ color: 0x6ec4d8, flatShading: true }), 0x6ec4d8, 0x70b8c8, 0x2a5a78)
    };
    return landmarkMats;
  }

  /** 简易地标造型 */
  function makeLandmarkModel(kind) {
    var g = new THREE.Group();
    var M = getLandmarkMats();
    var stone = M.stone, stoneDark = M.stoneDark, red = M.red, gold = M.gold;
    var roof = M.roof, wall = M.wall, sand = M.sand;

    function add(mesh, x, y, z) {
      mesh.position.set(x || 0, y || 0, z || 0);
      mesh.castShadow = true;
      g.add(mesh);
      return mesh;
    }

    switch (kind) {
      case 'stone': {
        for (var i = 0; i < 7; i++) {
          var h = 1.2 + Math.random() * 2.2;
          var r = 0.25 + Math.random() * 0.25;
          add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r, h, 5), i % 2 ? stone : stoneDark),
            (Math.random() - 0.5) * 2, h / 2, (Math.random() - 0.5) * 2);
        }
        break;
      }
      case 'pagoda': {
        add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 1.4), stone), 0, 0.15, 0);
        for (var l = 0; l < 5; l++) {
          var s = 1.1 - l * 0.15;
          add(new THREE.Mesh(new THREE.BoxGeometry(s, 0.45, s), red), 0, 0.45 + l * 0.5, 0);
          add(new THREE.Mesh(new THREE.ConeGeometry(s * 0.75, 0.28, 4), roof), 0, 0.85 + l * 0.5, 0);
        }
        add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), gold), 0, 3.3, 0);
        break;
      }
      case 'temple':
      case 'palace': {
        add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1.4), wall), 0, 0.45, 0);
        add(new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.55, 4), roof), 0, 1.15, 0);
        add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 1.0), wall), 0, 0.35, 1.2);
        add(new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.4, 4), roof), 0, 0.9, 1.2);
        break;
      }
      case 'ruins': {
        add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 1.8), stoneDark), 0, 0.18, 0);
        add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, 0.4), stone), -0.8, 0.55, -0.5);
        add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 0.4), stone), 0.8, 0.4, 0.5);
        add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 0.3), stoneDark), 0, 0.7, -0.7);
        break;
      }
      case 'museum': {
        add(new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 1.3), wall), 0, 0.4, 0);
        add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 1.5), stone), 0, 0.95, 0);
        add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.5), red), 0.7, 0.7, 0.5);
        break;
      }
      case 'desert': {
        add(new THREE.Mesh(new THREE.SphereGeometry(1.1, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), sand), -0.4, 0, 0.2);
        add(new THREE.Mesh(new THREE.SphereGeometry(0.8, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), sand), 0.6, 0, -0.3);
        add(new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.5, 5), roof), 0.3, 0.2, 0.4);
        break;
      }
      case 'lake': {
        add(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.12, 16), M.water), 0, 0.06, 0);
        add(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.8, 5), stoneDark), 0.7, 0.4, 0.2);
        break;
      }
      case 'grass': {
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.25, 10), M.grass), 0, 0.12, 0);
        add(new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 6), roof), 0, 0.5, 0);
        break;
      }
      case 'mountain': {
        add(new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.2, 5), stoneDark), 0, 1.1, 0);
        add(new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.4, 5), stone), 0.7, 0.7, 0.3);
        break;
      }
      case 'forest': {
        for (var t = 0; t < 6; t++) {
          add(new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.0, 5), M.forest),
            (Math.random() - 0.5) * 1.6, 0.5, (Math.random() - 0.5) * 1.6);
        }
        break;
      }
      case 'spring': {
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.2, 12), stone), 0, 0.1, 0);
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 12), M.spring), 0, 0.22, 0);
        add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.6), wall), 0.9, 0.25, 0.2);
        break;
      }
      case 'landmark':
      default: {
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.8, 6), red), 0, 0.9, 0);
        add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), gold), 0, 1.9, 0);
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.2, 8), stone), 0, 0.1, 0);
        break;
      }
    }
    return g;
  }

  // 按类别色缓存，避免所有针共用第一支颜色
  var pinMats = {};
  function makePin(color) {
    var g = new THREE.Group();
    var key = String(color);
    var mat = pinMats[key];
    if (!mat) {
      var hex = new THREE.Color(color).getHex();
      mat = reg(
        new THREE.MeshStandardMaterial({
          color: color, roughness: 0.4, flatShading: true,
          emissive: color, emissiveIntensity: 0.15
        }),
        hex, hex, hex
      );
      pinMats[key] = mat;
    }
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 10), mat);
    head.position.y = 2.4;
    var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.6, 6), mat);
    stem.position.y = 1.2;
    var base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.15, 8), mat);
    base.position.y = 0.08;
    g.add(head, stem, base);
    g.userData.pinHead = head;
    return g;
  }

  function buildSpots() {
    SPOTS.forEach(function (s) {
      var xz = XY(s.lon, s.lat);
      var y = Terrain.heightAtWorld(xz[0], xz[1]);
      var g = new THREE.Group();
      g.position.set(xz[0], y, xz[1]);
      g.name = 'spot-' + s.id;
      g.userData = { type: 'spot', id: s.id, spot: s };

      var model = makeLandmarkModel(s.kind);
      model.userData = { type: 'spot', id: s.id, spot: s };
      g.add(model);
      model.scale.setScalar(3.2);

      var catColor = (SPOT_CATS[s.cat] && SPOT_CATS[s.cat].color) || '#3f8f7a';
      var pin = makePin(catColor);
      pin.position.set(2.8, 0, 1.6);
      pin.scale.setScalar(1.35);
      pin.userData = { type: 'spot', id: s.id, spot: s };
      g.add(pin);

      // 命中扩展
      var hit = new THREE.Mesh(
        new THREE.SphereGeometry(3.2, 6, 6),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hit.position.y = 1;
      hit.userData = { type: 'spot', id: s.id, spot: s };
      g.add(hit);

      world.add(g);
      spotNodes[s.id] = { group: g, model: model, pin: pin, anchor: new THREE.Vector3(xz[0], y + 1.2, xz[1]), spot: s };
      clickable.push(hit);

      model.traverse(function (o) {
        o.userData = { type: 'spot', id: s.id, spot: s };
        if (o.isMesh) clickable.push(o);
      });

      makeLabel(s.name, {
        pos: new THREE.Vector3(xz[0], y + 7.5, xz[1]),
        className: 'lbl-spot',
        maxDist: 520,
        adcode: s.adcode,
        spotId: s.id,
        clickable: true,
        onClick: function () {
          if (typeof UI !== 'undefined') UI.emit('selectSpot', s.id);
        }
      });
    });
  }

  var selectedSpotId = null;
  function selectSpot(id) {
    selectedSpotId = id || null;
    labels.forEach(function (L) {
      if (!L.spotId) return;
      L.el.classList.toggle('selected', L.spotId === selectedSpotId);
    });
    Object.keys(spotNodes).forEach(function (sid) {
      var n = spotNodes[sid];
      var on = sid === selectedSpotId;
      if (n.pin && n.pin.userData.pinHead) {
        n.pin.scale.setScalar(on ? 1.7 : 1.35);
      } else if (n.pin) {
        n.pin.scale.setScalar(on ? 1.7 : 1.35);
      }
    });
  }

  function updateLabels(camera, level, focusAdcode) {
    var cam = camera.position;
    var v = new THREE.Vector3();
    for (var i = 0; i < labels.length; i++) {
      var L = labels[i];
      var dist = cam.distanceTo(L.pos);
      var show = dist >= L.minDist && dist <= L.maxDist;
      if (L.el.classList.contains('lbl-spot')) {
        if (level === 'city') {
          show = show && dist < 380;
        } else if (focusAdcode && L.adcode && L.adcode !== focusAdcode) {
          show = false; // 旗县/景点级只保留本旗县标签
        }
      }
      if (L.el.classList.contains('lbl-district')) {
        show = show && (level !== 'spot' || dist < 500);
      }
      if (!show) {
        if (L._vis !== 0) {
          L.el.style.opacity = '0';
          L.el.style.visibility = 'hidden';
          L._vis = 0;
        }
        continue;
      }
      v.copy(L.pos).project(camera);
      if (v.z > 1) {
        if (L._vis !== 0) {
          L.el.style.visibility = 'hidden';
          L._vis = 0;
        }
        continue;
      }
      var x = (v.x * 0.5 + 0.5) * window.innerWidth;
      var y = (-v.y * 0.5 + 0.5) * window.innerHeight;
      var tx = 'translate(-50%,-100%) translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
      if (L._tx !== tx) {
        L.el.style.transform = tx;
        L._tx = tx;
      }
      if (L._vis !== 1) {
        L.el.style.visibility = 'visible';
        L._vis = 1;
      }
      var op = 1;
      if (dist > (L.maxDist * 0.7)) op = 1 - (dist - L.maxDist * 0.7) / (L.maxDist * 0.3);
      op = Math.max(0, Math.min(1, op));
      if (L._op !== op) {
        L.el.style.opacity = String(op);
        L._op = op;
      }
    }
  }

  function highlightDistrict(adcode) {
    districtMeshes.forEach(function (m) {
      var on = !adcode || m.userData.adcode === adcode;
      m.material.opacity = adcode ? (on ? 0.4 : 0.06) : 0.22;
    });
    Object.keys(spotNodes).forEach(function (id) {
      var n = spotNodes[id];
      var on = !adcode || n.spot.adcode === adcode;
      n.group.visible = true;
      n.group.traverse(function (o) {
        if (o.material && o.material.opacity !== undefined && o.userData.type === 'spot') {
          o.material.transparent = true;
          o.material.opacity = on ? 1 : 0.25;
        }
      });
    });
  }

  // 旗县世界包围盒：取景距离与软约束共用
  var DISTRICT_PAD = 28;
  var DISTRICT_FIT_MIN = 52;
  var DISTRICT_FIT_MAX = 260;
  var DISTRICT_HEIGHT_RATIO = 0.62;
  var cityCenterXZ = null;

  function ensureCityCenter() {
    if (cityCenterXZ) return cityCenterXZ;
    var ov = getOverview();
    cityCenterXZ = { x: ov.target.x, z: ov.target.z };
    return cityCenterXZ;
  }

  function districtWorldBounds(d) {
    var minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (var ri = 0; ri < d.rings.length; ri++) {
      var ring = d.rings[ri];
      for (var pi = 0; pi < ring.length; pi++) {
        var xz = XY(ring[pi][0], ring[pi][1]);
        if (xz[0] < minX) minX = xz[0];
        if (xz[0] > maxX) maxX = xz[0];
        if (xz[1] < minZ) minZ = xz[1];
        if (xz[1] > maxZ) maxZ = xz[1];
      }
    }
    var cx = (minX + maxX) * 0.5;
    var cz = (minZ + maxZ) * 0.5;
    var width = Math.max(8, maxX - minX);
    var depth = Math.max(8, maxZ - minZ);
    var span = Math.max(width, depth);
    return {
      minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ,
      cx: cx, cz: cz, width: width, depth: depth, span: span
    };
  }

  function softBoundsFromDistrict(bb) {
    return {
      minX: bb.minX - DISTRICT_PAD,
      maxX: bb.maxX + DISTRICT_PAD,
      minZ: bb.minZ - DISTRICT_PAD,
      maxZ: bb.maxZ + DISTRICT_PAD
    };
  }

  /** 从市中心外侧取景，朝内看旗县，避免边缘朝外看空地 */
  function cameraFromInward(targetX, targetY, targetZ, distance) {
    var city = ensureCityCenter();
    var dx = targetX - city.x;
    var dz = targetZ - city.z;
    var len = Math.sqrt(dx * dx + dz * dz);
    if (len < 1) {
      dx = 0.55;
      dz = 0.84;
      len = 1;
    }
    dx /= len;
    dz /= len;
    var elev = distance * DISTRICT_HEIGHT_RATIO;
    return new THREE.Vector3(
      targetX + dx * distance * 0.72,
      targetY + elev,
      targetZ + dz * distance * 0.72
    );
  }

  function focusDistrict(adcode) {
    var d = getDistrictByAdcode(adcode);
    if (!d) return null;
    var bb = districtWorldBounds(d);
    // 质心优先，避免凹形旗县 bbox 中心落在界外
    var cxz = XY(d.centroid[0], d.centroid[1]);
    var tx = cxz[0];
    var tz = cxz[1];
    var y = Terrain.heightAtWorld(tx, tz);
    var fit = bb.span * 0.95;
    var dist = Math.max(DISTRICT_FIT_MIN, Math.min(DISTRICT_FIT_MAX, fit));
    var target = new THREE.Vector3(tx, y + 4, tz);
    var pos = cameraFromInward(tx, y, tz, dist);
    return {
      target: target,
      pos: pos,
      name: d.name,
      adcode: adcode,
      bounds: softBoundsFromDistrict(bb),
      minDist: Math.max(16, dist * 0.22),
      maxDist: Math.min(420, dist * 1.85)
    };
  }

  function getDistrictSoftBounds(adcode) {
    var d = getDistrictByAdcode(adcode);
    if (!d) return null;
    return softBoundsFromDistrict(districtWorldBounds(d));
  }

  function focusSpot(id) {
    var n = spotNodes[id];
    if (!n) return null;
    var a = n.anchor;
    var mid = cameraFromInward(a.x, a.y, a.z, 42);
    var close = cameraFromInward(a.x, a.y, a.z, 22);
    var soft = getDistrictSoftBounds(n.spot.adcode);
    return {
      target: a.clone(),
      pos: mid,
      close: close,
      name: n.spot.name,
      id: id,
      adcode: n.spot.adcode,
      bounds: soft,
      minDist: 10,
      maxDist: soft ? 160 : 220
    };
  }

  function getOverview() {
    var bound = buildCoreBounds();
    var c0 = XY((bound.minLon + bound.maxLon) / 2, (bound.minLat + bound.maxLat) / 2);
    var y = Terrain.heightAtWorld(c0[0], c0[1]);
    return {
      target: new THREE.Vector3(c0[0], y + 8, c0[1]),
      pos: new THREE.Vector3(c0[0] + 165, y + 430, c0[1] + 500),
      top: new THREE.Vector3(c0[0] + 4, y + 1080, c0[1] + 30)
    };
  }

  function init(sceneRef, root) {
    scene = sceneRef;
    world = root;
    var t = buildTerrain();
    buildDistricts();
    buildWater();
    buildCities();
    buildPeaks();
    buildTrees();
    buildSpots();
    return { bound: t.bound, overview: getOverview() };
  }

  return {
    init: init,
    setTheme: setTheme,
    updateLabels: updateLabels,
    highlightDistrict: highlightDistrict,
    selectSpot: selectSpot,
    focusDistrict: focusDistrict,
    focusSpot: focusSpot,
    getDistrictSoftBounds: getDistrictSoftBounds,
    getOverview: getOverview,
    getSpotNode: function (id) { return spotNodes[id]; },
    getClickable: function () { return clickable; },
    isMobile: isMobile
  };
})();
