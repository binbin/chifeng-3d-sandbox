/* ============================================================
 * 赤峰 · 地形高度场（区域地貌 + 噪声，艺术化）
 * ============================================================ */
'use strict';

var Terrain = (function () {
  function hash2(x, y) {
    var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }
  function smoothNoise(x, y) {
    var x0 = Math.floor(x), y0 = Math.floor(y);
    var fx = x - x0, fy = y - y0;
    var u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    var a = hash2(x0, y0), b = hash2(x0 + 1, y0);
    var c = hash2(x0, y0 + 1), d = hash2(x0 + 1, y0 + 1);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }
  function fbm(x, y, oct) {
    var v = 0, a = 0.5, f = 1;
    for (var i = 0; i < (oct || 4); i++) {
      v += a * smoothNoise(x * f, y * f);
      f *= 2;
      a *= 0.5;
    }
    return v;
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function smoothstep(e0, e1, x) {
    var t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  }
  /** 各向异性高斯丘（lon/lat 为峰位） */
  function bump(lon, lat, p, rx, rz) {
    var dl = (lon - p[0]) / rx;
    var dt = (lat - p[1]) / rz;
    return Math.exp(-(dl * dl + dt * dt));
  }
  function lineDistance(lon, lat, pts) {
    var min = 1e9;
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      var vx = b[0] - a[0], vy = b[1] - a[1];
      var wx = lon - a[0], wy = lat - a[1];
      var c1 = vx * wx + vy * wy;
      var c2 = vx * vx + vy * vy;
      var t = c2 > 0 ? clamp(c1 / c2, 0, 1) : 0;
      var px = a[0] + t * vx, py = a[1] + t * vy;
      var dx = lon - px, dy = (lat - py) * 1.35;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < min) min = d;
    }
    return min;
  }

  /** 真实海拔近似（米） */
  function elevationMeters(lon, lat) {
    // 基底：西北高、东南低
    var h = 380;
    h += smoothstep(42.8, 45.0, lat) * 620;
    h += smoothstep(119.4, 116.8, lon) * 340;
    h += smoothstep(43.8, 44.8, lat) * 220;

    // 大兴安岭南段山脊
    h += bump(lon, lat, [117.4, 43.8], 0.85, 0.95) * 980;
    h += bump(lon, lat, [117.55, 43.55], 0.35, 0.28) * 920; // 黄岗梁
    h += bump(lon, lat, [118.2, 44.0], 0.55, 0.45) * 560;
    h += bump(lon, lat, [117.3, 43.1], 0.4, 0.3) * 480;
    h += bump(lon, lat, [118.45, 43.55], 0.3, 0.25) * 620; // 北大山
    // 周边示意起伏（锡林郭勒 / 通辽 / 承德方向，无标注）
    h += bump(lon, lat, [116.2, 43.9], 0.7, 0.55) * 420;
    h += bump(lon, lat, [120.8, 43.6], 0.65, 0.5) * 280;
    h += bump(lon, lat, [119.2, 40.9], 0.55, 0.4) * 520;
    h += bump(lon, lat, [116.0, 42.4], 0.6, 0.45) * 360;

    // 七老图山 / 燕山北麓
    h += bump(lon, lat, [118.5, 41.85], 0.55, 0.4) * 780;
    h += bump(lon, lat, [118.9, 41.55], 0.4, 0.3) * 480;
    h += bump(lon, lat, [118.7, 42.0], 0.22, 0.18) * 340;

    // 红山小丘
    h += bump(lon, lat, [118.96, 42.28], 0.03, 0.02) * 140;

    // 浑善达克沙地：起伏沙丘
    var hunshandake = smoothstep(43.8, 42.9, lat) * smoothstep(118.8, 117.2, lon) * smoothstep(42.3, 42.9, lat);
    hunshandake = clamp(hunshandake, 0, 1);
    if (hunshandake > 0.02) {
      var dunes = (fbm(lon * 9, lat * 9, 3) - 0.5) * 70;
      h += hunshandake * (180 + dunes);
    }

    // 科尔沁沙地边缘
    var horqin = smoothstep(42.4, 43.6, lat) * smoothstep(119.2, 120.4, lon);
    if (horqin > 0.02) {
      h += horqin * (fbm(lon * 7 + 3, lat * 7, 3) - 0.45) * 55;
    }

    // 河谷下切
    for (var i = 0; i < RIVERS.length; i++) {
      var d = lineDistance(lon, lat, RIVERS[i].pts);
      var cut = Math.exp(-(d * d) / 0.012) * (RIVERS[i].width > 4 ? 120 : 70);
      h -= cut;
    }

    // 达里诺尔湖盆
    h -= bump(lon, lat, [116.62, 43.25], 0.32, 0.16) * 160;

    // 细节噪声
    h += (fbm(lon * 4.5, lat * 4.5, 4) - 0.5) * 95;

    // 市区台地压平
    var urban = bump(lon, lat, [118.96, 42.27], 0.06, 0.05);
    if (urban > 0.01) {
      var base = 560;
      h = h * (1 - urban * 0.85) + base * urban * 0.85;
    }

    return Math.max(180, h);
  }

  function elevationWorld(lon, lat) {
    return elevationMeters(lon, lat) * HEIGHT_SCALE;
  }

  /** 生成高度场网格 */
  function buildGrid(bound, segments) {
    var minLon = bound.minLon, minLat = bound.minLat;
    var dLon = bound.maxLon - minLon, dLat = bound.maxLat - minLat;
    var nx = segments, nz = segments;
    var count = (nx + 1) * (nz + 1);
    var positions = new Float32Array(count * 3);
    var colors = new Float32Array(count * 3);
    var heights = new Float32Array(count);
    var geo = new THREE.BufferGeometry();
    var col = new THREE.Color();
    var k = 0;

    for (var j = 0; j <= nz; j++) {
      for (var i = 0; i <= nx; i++) {
        var u = i / nx, v = j / nz;
        var lon = minLon + u * dLon;
        var lat = minLat + v * dLat;
        var y = elevationWorld(lon, lat);
        var x = (lon - ORIGIN[0]) * SCALE_LON;
        var z = -(lat - ORIGIN[1]) * SCALE_LAT;
        positions[k * 3] = x;
        positions[k * 3 + 1] = y;
        positions[k * 3 + 2] = z;
        heights[k] = y;
        colorForHeight(col, y / HEIGHT_SCALE, lon, lat);
        colors[k * 3] = col.r;
        colors[k * 3 + 1] = col.g;
        colors[k * 3 + 2] = col.b;
        k++;
      }
    }

    var indices = [];
    for (var j2 = 0; j2 < nz; j2++) {
      for (var i2 = 0; i2 < nx; i2++) {
        var a = j2 * (nx + 1) + i2;
        var b = a + 1;
        var c = a + (nx + 1);
        var d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return { geometry: geo, heights: heights, nx: nx, nz: nz };
  }

  var sandTint = null;
  var outsideTint = null;
  function colorForHeight(col, meters, lon, lat) {
    // 河谷 → 草甸 → 高原草场 → 山地 → 岩峰
    if (meters < 480) {
      col.setHex(0xb8a45e);
    } else if (meters < 650) {
      col.setHex(0x8fa84a);
    } else if (meters < 950) {
      col.setHex(0x5f9638);
    } else if (meters < 1300) {
      col.setHex(0x3f7a3c);
    } else if (meters < 1650) {
      col.setHex(0x2c5c38);
    } else if (meters < 1950) {
      col.setHex(0x5a6458);
    } else {
      col.setHex(0xe4e0d2);
    }
    // 等高线明暗带（沙盘分层感）
    var band = Math.floor(meters / 150) % 2;
    col.offsetHSL(0, 0.02, band ? 0.05 : -0.05);
    // 沙地染黄
    var sand = smoothstep(43.8, 42.9, lat) * smoothstep(118.8, 117.2, lon) * smoothstep(42.3, 42.9, lat);
    var sand2 = smoothstep(42.4, 43.5, lat) * smoothstep(119.3, 120.3, lon);
    var s = clamp(sand + sand2 * 0.7, 0, 1);
    if (s > 0.12) {
      if (!sandTint) sandTint = new THREE.Color(0xc9a85a);
      col.lerp(sandTint, s * 0.7);
    }
    var n = (hash2(lon * 22, lat * 22) - 0.5) * 0.06;
    col.offsetHSL(0, 0, n);
    // 市界外：降饱和作哑光周边，无标注内容
    if (typeof districtAt === 'function' && !districtAt(lon, lat)) {
      if (!outsideTint) outsideTint = new THREE.Color(0x9aa896);
      col.offsetHSL(0.02, -0.28, -0.07);
      col.lerp(outsideTint, 0.22);
    }
  }

  /** 在世界坐标处采样高度（用于建筑落位） */
  function heightAtWorld(x, z) {
    var lon = x / SCALE_LON + ORIGIN[0];
    var lat = ORIGIN[1] - z / SCALE_LAT;
    return elevationWorld(lon, lat);
  }

  function heightAtLonLat(lon, lat) {
    return elevationWorld(lon, lat);
  }

  return {
    elevationMeters: elevationMeters,
    elevationWorld: elevationWorld,
    buildGrid: buildGrid,
    heightAtWorld: heightAtWorld,
    heightAtLonLat: heightAtLonLat,
    fbm: fbm
  };
})();
