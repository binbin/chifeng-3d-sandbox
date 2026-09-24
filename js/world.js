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
    document.getElementById('label-layer').appendChild(div);
    var item = { el: div, pos: opts.pos.clone ? opts.pos.clone() : new THREE.Vector3(opts.pos[0], opts.pos[1], opts.pos[2]), minDist: opts.minDist || 0, maxDist: opts.maxDist || 1e9, level: opts.level || 0 };
    labels.push(item);
    return item;
  }

  function buildBounds() {
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
    return { minLon: minLon - 0.05, maxLon: maxLon + 0.05, minLat: minLat - 0.05, maxLat: maxLat + 0.05 };
  }

  function buildTerrain() {
    var bound = buildBounds();
    var segs = isMobile() ? 140 : 200;
    var grid = Terrain.buildGrid(bound, segs);
    var mat = reg(new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.95, flatShading: true
    }), 0xffffff, 0xe8dcc4, 0x5a6560);
    var mesh = new THREE.Mesh(grid.geometry, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    world.add(mesh);
    clickable.push(mesh);
    return { mesh: mesh, bound: bound };
  }

  function isMobile() {
    return window.innerWidth < 768 || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
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
        minDist: 0
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
      makeLabel(r.name, {
        pos: new THREE.Vector3(mid.x, mid.y + 2, mid.z),
        className: 'lbl-river',
        maxDist: 700
      });
    });

    // 湖泊
    LAKES.forEach(function (lk) {
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

  /** 简易地标造型 */
  function makeLandmarkModel(kind) {
    var g = new THREE.Group();
    var stone = new THREE.MeshStandardMaterial({ color: 0xcfc7b0, roughness: 0.9, flatShading: true });
    var stoneDark = new THREE.MeshStandardMaterial({ color: 0x9a927c, roughness: 0.9, flatShading: true });
    var red = new THREE.MeshStandardMaterial({ color: 0x9c4a38, roughness: 0.7, flatShading: true });
    var gold = new THREE.MeshStandardMaterial({ color: 0xd9b04f, roughness: 0.35, metalness: 0.5, flatShading: true });
    var roof = new THREE.MeshStandardMaterial({ color: 0x314039, roughness: 0.65, flatShading: true });
    var wall = new THREE.MeshStandardMaterial({ color: 0xf0e4cd, roughness: 0.85, flatShading: true });
    var sand = new THREE.MeshStandardMaterial({ color: 0xd2c08a, roughness: 1, flatShading: true });

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
        var water = new THREE.MeshStandardMaterial({ color: 0x3b8ac9, transparent: true, opacity: 0.85, roughness: 0.4 });
        add(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.12, 16), water), 0, 0.06, 0);
        add(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.8, 5), stoneDark), 0.7, 0.4, 0.2);
        break;
      }
      case 'grass': {
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.25, 10), new THREE.MeshStandardMaterial({ color: 0x8fad5c, flatShading: true })), 0, 0.12, 0);
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
          add(new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.0, 5), new THREE.MeshStandardMaterial({ color: 0x3d6b46, flatShading: true })),
            (Math.random() - 0.5) * 1.6, 0.5, (Math.random() - 0.5) * 1.6);
        }
        break;
      }
      case 'spring': {
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.2, 12), stone), 0, 0.1, 0);
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 12), new THREE.MeshStandardMaterial({ color: 0x6ec4d8, flatShading: true })), 0, 0.22, 0);
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

  function makePin(color) {
    var g = new THREE.Group();
    var mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.4, flatShading: true, emissive: color, emissiveIntensity: 0.15 });
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
      clickable.push(hit, model);

      model.traverse(function (o) {
        o.userData = { type: 'spot', id: s.id, spot: s };
        if (o.isMesh) clickable.push(o);
      });

      makeLabel(s.name, {
        pos: new THREE.Vector3(xz[0], y + 7.5, xz[1]),
        className: 'lbl-spot',
        maxDist: 520
      });
    });
  }

  function updateLabels(camera, level) {
    var cam = camera.position;
    var v = new THREE.Vector3();
    for (var i = 0; i < labels.length; i++) {
      var L = labels[i];
      var dist = cam.distanceTo(L.pos);
      var show = dist >= L.minDist && dist <= L.maxDist;
      if (L.el.classList.contains('lbl-spot')) {
        show = show && (level === 'spot' || level === 'district' || dist < 380);
      }
      if (L.el.classList.contains('lbl-district')) {
        show = show && (level !== 'spot' || dist < 500);
      }
      if (!show) {
        L.el.style.opacity = '0';
        L.el.style.visibility = 'hidden';
        continue;
      }
      v.copy(L.pos).project(camera);
      if (v.z > 1) {
        L.el.style.visibility = 'hidden';
        continue;
      }
      var x = (v.x * 0.5 + 0.5) * window.innerWidth;
      var y = (-v.y * 0.5 + 0.5) * window.innerHeight;
      L.el.style.transform = 'translate(-50%,-100%) translate(' + x + 'px,' + y + 'px)';
      L.el.style.visibility = 'visible';
      var op = 1;
      if (dist > (L.maxDist * 0.7)) op = 1 - (dist - L.maxDist * 0.7) / (L.maxDist * 0.3);
      L.el.style.opacity = String(Math.max(0, Math.min(1, op)));
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

  function focusDistrict(adcode) {
    var d = getDistrictByAdcode(adcode);
    if (!d) return null;
    var cxz = XY(d.centroid[0], d.centroid[1]);
    return {
      target: new THREE.Vector3(cxz[0], Terrain.heightAtWorld(cxz[0], cxz[1]) + 4, cxz[1]),
      pos: new THREE.Vector3(cxz[0] + 55, Terrain.heightAtWorld(cxz[0], cxz[1]) + 70, cxz[1] + 75),
      name: d.name,
      adcode: adcode
    };
  }

  function focusSpot(id) {
    var n = spotNodes[id];
    if (!n) return null;
    var a = n.anchor;
    return {
      target: a.clone(),
      pos: new THREE.Vector3(a.x + 18, a.y + 14, a.z + 22),
      close: new THREE.Vector3(a.x + 8, a.y + 7, a.z + 10),
      name: n.spot.name,
      id: id,
      adcode: n.spot.adcode
    };
  }

  function getOverview() {
    var bound = buildBounds();
    var c0 = XY((bound.minLon + bound.maxLon) / 2, (bound.minLat + bound.maxLat) / 2);
    var y = Terrain.heightAtWorld(c0[0], c0[1]);
    return {
      target: new THREE.Vector3(c0[0], y + 10, c0[1] - 40),
      pos: new THREE.Vector3(c0[0] + 110, y + 145, c0[1] + 255),
      top: new THREE.Vector3(c0[0], y + 460, c0[1] + 10)
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
    focusDistrict: focusDistrict,
    focusSpot: focusSpot,
    getOverview: getOverview,
    getSpotNode: function (id) { return spotNodes[id]; },
    getClickable: function () { return clickable; },
    isMobile: isMobile
  };
})();
