/* ============================================================
 * 赤峰 · 地理与内容数据（艺术化示意，非测绘级）
 * ============================================================ */
'use strict';

var SCALE_LON = 170;
var SCALE_LAT = 230;
var ORIGIN = [118.68, 43.20];
var HEIGHT_SCALE = 0.062;

/** 经纬度 → 世界坐标 [x,y,z] */
function P(lon, lat, y) {
  return [
    (lon - ORIGIN[0]) * SCALE_LON,
    y || 0,
    -(lat - ORIGIN[1]) * SCALE_LAT
  ];
}
/** 经纬度 → 平面 [x,z] */
function XY(lon, lat) {
  return [(lon - ORIGIN[0]) * SCALE_LON, -(lat - ORIGIN[1]) * SCALE_LAT];
}

var DISTRICT_COLORS = {
  150402: 0xc9a227, // 红山区
  150403: 0xb86b3d, // 元宝山区
  150404: 0x8fad5c, // 松山区
  150421: 0x6a9e6b, // 阿鲁科尔沁旗
  150422: 0x5f9e88, // 巴林左旗
  150423: 0x4f8fad, // 巴林右旗
  150424: 0x7a9e4f, // 林西县
  150425: 0x3f8f7a, // 克什克腾旗
  150426: 0xc4a35a, // 翁牛特旗
  150428: 0xa0784a, // 喀喇沁旗
  150429: 0x8b6f4a, // 宁城县
  150430: 0xb08950  // 敖汉旗
};

var DISTRICT_INFO = {
  150402: { short: '红山', en: 'HONGSHAN', intro: '赤峰中心城区，红山文化命名地。英金河南岸的红山如一簇赤色火焰，是城市文脉的原点。' },
  150403: { short: '元宝山', en: 'YUANBAOSHAN', intro: '东部工贸新城，平庄城区与元宝山露天矿并称，西拉木伦河支流穿境。' },
  150404: { short: '松山', en: 'SONGSHAN', intro: '环绕中心城区的农业与生态大区，地势由西北山地向东南河谷缓降。' },
  150421: { short: '阿旗', en: 'ARUKHORCHIN', intro: '科尔沁草原腹地，畜牧业兴旺，乌力吉木伦河滋养辽阔草场。' },
  150422: { short: '左旗', en: 'BALIN LEFT', intro: '辽文化故都，辽上京城垣与召庙石窟见证契丹旧都气象。' },
  150423: { short: '右旗', en: 'BALIN RIGHT', intro: '巴林石之乡，叶形印章石与草原湖泊相映。' },
  150424: { short: '林西', en: 'LINXI', intro: '大兴安岭南麓门户，农牧交错带上的县城，远眺高原雪岭。' },
  150425: { short: '克旗', en: 'KESHIGTEN', intro: '克什克腾世界地质公园所在地：石林、湖泊、草原、沙地与冰臼集于一旗。' },
  150426: { short: '翁旗', en: 'WENGNIUTE', intro: '玉龙沙湖与浑善达克沙地交界，沙漠、湖泊与沙柳构成独特风光。' },
  150428: { short: '喀旗', en: 'KALAQIN', intro: '清代蒙古王府与燕山余脉山林，人文与自然并胜。' },
  150429: { short: '宁城', en: 'NINGCHENG', intro: '辽中京故地，大明塔巍然；道须沟与黑里河山水清幽。' },
  150430: { short: '敖汉', en: 'AOHAN', intro: '华夏第一村与赵宝沟文化发祥地，旱作农业文明源远流长。' }
};

/* ---------------- 主要水系（示意折线） ---------------- */
var RIVERS = [
  {
    name: '西拉木伦河', width: 5.2,
    pts: [[117.20, 43.55], [117.55, 43.42], [118.05, 43.28], [118.45, 43.18],
          [118.85, 43.12], [119.25, 43.10], [119.70, 43.18], [120.15, 43.35]]
  },
  {
    name: '老哈河', width: 4.4,
    pts: [[118.75, 41.45], [118.90, 41.75], [119.00, 42.05], [119.05, 42.35],
          [119.15, 42.65], [119.35, 42.95]]
  },
  {
    name: '英金河', width: 3.0,
    pts: [[118.35, 42.55], [118.55, 42.45], [118.75, 42.35], [118.95, 42.30]]
  },
  {
    name: '教来河', width: 2.8,
    pts: [[120.05, 43.85], [120.00, 43.45], [119.85, 43.15], [119.70, 42.95]]
  },
  {
    name: '乌力吉木伦河', width: 3.2,
    pts: [[119.20, 44.55], [119.55, 44.25], [119.90, 43.95], [120.20, 43.75]]
  }
];

/* ---------------- 湖泊 ---------------- */
var LAKES = [
  {
    name: '达里诺尔', lon: 116.62, lat: 43.25, rx: 13, rz: 7, level: 1226,
    pts: (function () {
      var c = [116.62, 43.25], a = [];
      for (var i = 0; i < 14; i++) {
        var t = i / 14 * Math.PI * 2;
        var rr = 1 + 0.12 * Math.sin(t * 3);
        a.push([c[0] + Math.cos(t) * 0.28 * rr, c[1] + Math.sin(t) * 0.14 * rr]);
      }
      return a;
    })()
  },
  {
    name: '打虎石水库', lon: 118.72, lat: 41.72, rx: 5, rz: 3, level: 700,
    pts: [[118.62, 41.70], [118.72, 41.66], [118.82, 41.70], [118.80, 41.78], [118.68, 41.80], [118.62, 41.76]]
  },
  {
    name: '红山水库', lon: 119.35, lat: 42.55, rx: 6, rz: 3.5, level: 480,
    pts: [[119.22, 42.55], [119.35, 42.48], [119.50, 42.55], [119.48, 42.66], [119.32, 42.70], [119.22, 42.64]]
  }
];

/* ---------------- 山峰 / 山脉示意 ---------------- */
var PEAKS = [
  { name: '黄岗梁', lon: 117.55, lat: 43.55, elev: 2029, rx: 18, rz: 12 },
  { name: '大光顶子', lon: 117.35, lat: 43.20, elev: 1780, rx: 14, rz: 10 },
  { name: '巴彦查干', lon: 118.05, lat: 44.25, elev: 1550, rx: 16, rz: 11 },
  { name: '七老图山', lon: 118.55, lat: 41.85, elev: 1450, rx: 20, rz: 12 },
  { name: '马鞍山', lon: 118.75, lat: 41.95, elev: 1100, rx: 10, rz: 8 },
  { name: '红山', lon: 118.96, lat: 42.28, elev: 680, rx: 4, rz: 3 },
  { name: '北大山', lon: 118.45, lat: 43.55, elev: 1680, rx: 14, rz: 10 }
];

/* ---------------- 城镇聚落（体量示意） ---------------- */
var CITIES = [
  { name: '赤峰市区', lon: 118.96, lat: 42.27, size: 3.2, seats: true },
  { name: '平庄', lon: 119.25, lat: 42.10, size: 1.6 },
  { name: '林西镇', lon: 118.06, lat: 43.61, size: 1.2 },
  { name: '经棚镇', lon: 117.54, lat: 43.26, size: 1.25 },
  { name: '天山镇', lon: 120.09, lat: 43.88, size: 1.1 },
  { name: '林东镇', lon: 119.39, lat: 43.98, size: 1.15 },
  { name: '大板镇', lon: 118.68, lat: 43.53, size: 1.1 },
  { name: '乌丹镇', lon: 119.02, lat: 42.94, size: 1.1 },
  { name: '锦山镇', lon: 118.71, lat: 41.93, size: 1.0 },
  { name: '天义镇', lon: 119.34, lat: 41.60, size: 1.15 },
  { name: '新惠镇', lon: 119.91, lat: 42.29, size: 1.1 }
];

/* ---------------- 景点 ---------------- */
var SPOT_CATS = {
  nature: { label: '自然风光', color: '#3f8f7a' },
  geo: { label: '地质奇观', color: '#8a6a3a' },
  history: { label: '历史文化', color: '#a05a3a' },
  grass: { label: '草原沙漠', color: '#b08930' },
  leisure: { label: '休闲度假', color: '#4a7aaa' }
};

var SPOTS = [
  {
    id: 'ashihaty', no: '01', name: '阿斯哈图石林', en: 'ASHIHATU STONE FOREST',
    lon: 117.32, lat: 43.92, kind: 'stone', cat: 'geo', adcode: 150425, tag: '世界地质公园',
    desc: '克什克腾旗北部花岗岩石林，冰川与风化共同雕琢的“石柱森林”。柱体如城堡、如蘑菇、如书页，云雾中若仙山楼阁。',
    chips: ['花岗岩地貌', '冰缘石林', '摄影圣地']
  },
  {
    id: 'dalinuoer', no: '02', name: '达里诺尔湖', en: 'DALINUOER LAKE',
    lon: 116.62, lat: 43.25, kind: 'lake', cat: 'nature', adcode: 150425, tag: '草原明珠',
    desc: '内蒙古第三大湖，半咸水湖。碧波映着贡格尔草原与砧子山，春秋候鸟迁徙，湖面如镜，日落时金鳞万点。',
    chips: ['候鸟驿站', '华子鱼', '砧子山']
  },
  {
    id: 'gongger', no: '03', name: '贡格尔草原', en: 'GONGGER GRASSLAND',
    lon: 116.85, lat: 43.15, kind: 'grass', cat: 'grass', adcode: 150425, tag: '草原风情',
    desc: '达里诺尔南岸的天然草场，夏末野花铺地，牛羊如云。白音敖包的沙地云杉林更添一层荒原上的苍翠。',
    chips: ['沙地云杉', '那达慕', '星空露营']
  },
  {
    id: 'huanggang', no: '04', name: '黄岗梁', en: 'HUANGGANGLIANG PEAK',
    lon: 117.55, lat: 43.55, kind: 'mountain', cat: 'nature', adcode: 150425, tag: '兴安主峰',
    desc: '大兴安岭南段最高峰，海拔约 2029 米。山势巍峨，森林与高山草甸垂直分布，是登高远眺克旗全境的绝佳处。',
    chips: ['2029米', '原始林', '越野']
  },
  {
    id: 'ulanbutong', no: '05', name: '乌兰布统', en: 'ULAN BUTONG',
    lon: 117.25, lat: 42.55, kind: 'grass', cat: 'grass', adcode: 150425, tag: '影视草原',
    desc: '浑善达克沙地与草原过渡带，欧式疏林草原闻名中外。秋日白桦与红叶，冬日雾凇，是无数影视剧的取景地。',
    chips: ['疏林草原', '影视基地', '秋色']
  },
  {
    id: 'yulong', no: '06', name: '玉龙沙湖', en: 'YULONG SAND LAKE',
    lon: 118.90, lat: 43.05, kind: 'desert', cat: 'grass', adcode: 150426, tag: '沙漠湖泊',
    desc: '翁牛特旗科尔沁沙地中的沙湖，新月形沙丘环抱一泓碧水。可徒步沙脊、越野冲沙，夜宿星空下的沙海营地。',
    chips: ['沙漠越野', '星空营地', '沙湖日出']
  },
  {
    id: 'bolongke', no: '07', name: '勃隆克沙漠', en: 'BOLONGKE DESERT',
    lon: 119.25, lat: 42.85, kind: 'desert', cat: 'grass', adcode: 150426, tag: '大漠风光',
    desc: '连绵沙丘与沙湖、疏林交织，保留着更原始的沙海轮廓。驼队行走在沙脊线上，是塞外大漠的经典意象。',
    chips: ['骆驼骑行', '沙丘滑沙', '大漠落日']
  },
  {
    id: 'hongshan', no: '08', name: '红山', en: 'HONGSHAN RED HILL',
    lon: 118.96, lat: 42.28, kind: 'landmark', cat: 'history', adcode: 150402, tag: '城市标志',
    desc: '英金河畔赭红色山体，赤峰市名由来。山势如火焰升腾，自古是北方游牧与农耕文明交汇的地理坐标。',
    chips: ['市名由来', '红山文化', '城市阳台']
  },
  {
    id: 'hongshan_mus', no: '09', name: '红山文化遗址', en: 'HONGSHAN CULTURE SITE',
    lon: 118.98, lat: 42.25, kind: 'ruins', cat: 'history', adcode: 150402, tag: '五千年文明',
    desc: '新石器时代红山文化命名地，出土玉猪龙、C 形玉龙等重器，把中华文明史的实证向北、向前延伸。',
    chips: ['玉猪龙', '坛庙冢', '中华文明']
  },
  {
    id: 'shangjing', no: '10', name: '辽上京遗址', en: 'LIAO SHANGJING RUINS',
    lon: 119.35, lat: 44.02, kind: 'ruins', cat: 'history', adcode: 150422, tag: '契丹故都',
    desc: '辽代五京之首，城墙与宫殿基址犹存。公元 918 年耶律阿保机营建的上京城，曾是草原帝国的心脏。',
    chips: ['辽代五京', '城垣遗址', '考古']
  },
  {
    id: 'zhaomiao', no: '11', name: '真寂之寺召庙', en: 'ZHAOMIAO CAVE TEMPLE',
    lon: 119.28, lat: 44.10, kind: 'temple', cat: 'history', adcode: 150422, tag: '石窟古刹',
    desc: '巴林左旗召庙石窟与藏传佛教寺院，开凿于桃石山崖壁。窟寺合一，香火与岩画并存，是辽地佛教遗珍。',
    chips: ['石窟', '藏传佛教', '桃石山']
  },
  {
    id: 'damingta', no: '12', name: '辽中京大明塔', en: 'DAMING PAGODA',
    lon: 119.36, lat: 41.58, kind: 'pagoda', cat: 'history', adcode: 150429, tag: '辽塔之最',
    desc: '辽中京城内的八角十三层密檐砖塔，高约 80 米，是我国现存辽塔中体量最大者。塔身浮雕庄严，登临可览老哈河平原。',
    chips: ['80米辽塔', '辽中京', '砖雕']
  },
  {
    id: 'kalaqin_wf', no: '13', name: '喀喇沁王府', en: 'KALAQIN PRINCE MANSION',
    lon: 118.70, lat: 41.92, kind: 'palace', cat: 'history', adcode: 150428, tag: '清代王府',
    desc: '蒙古喀喇沁旗王府建筑群，汉式府邸规制与草原王府气度交融。院落层层，是研究清代蒙汉文化互鉴的活标本。',
    chips: ['清代王府', '贡桑诺尔布', '古建']
  },
  {
    id: 'maanshan', no: '14', name: '马鞍山国家森林公园', en: "MA'ANSHAN FOREST PARK",
    lon: 118.75, lat: 41.95, kind: 'mountain', cat: 'nature', adcode: 150428, tag: '燕山林海',
    desc: '燕山余脉中的天然次生林区，山形如马鞍。夏可避暑，秋赏层林尽染，溪谷与奇石遍布步道两侧。',
    chips: ['森林氧吧', '红叶', '徒步']
  },
  {
    id: 'balinstone', no: '15', name: '巴林石博物馆', en: 'BALIN STONE MUSEUM',
    lon: 118.68, lat: 43.53, kind: 'museum', cat: 'leisure', adcode: 150423, tag: '印石之乡',
    desc: '巴林右旗以鸡血石、福黄石闻名，与寿山、青田、昌化并称四大印石。博物馆陈列原石与雕刻，可亲手感触石中天地。',
    chips: ['鸡血石', '篆刻', '文创']
  },
  {
    id: 'bingshuijiu', no: '16', name: '青山冰臼地质公园', en: 'QINGSHAN ICE-POTHOLE PARK',
    lon: 117.75, lat: 43.35, kind: 'stone', cat: 'geo', adcode: 150425, tag: '古冰川遗迹',
    desc: '花岗岩山体上密布第四纪古冰川研磨而成的冰臼、冰坎与擦痕，是研究古气候的珍贵地质遗迹。',
    chips: ['冰臼群', '古冰川', '地质研学']
  },
  {
    id: 'resuitang', no: '17', name: '热水塘温泉', en: 'RESHUITANG HOT SPRING',
    lon: 117.72, lat: 43.38, kind: 'spring', cat: 'leisure', adcode: 150425, tag: '温泉小镇',
    desc: '克旗热水塘镇天然温泉，出水温度高、矿物质丰富。旅途之后泡汤看星，是草原线路上最松弛的一站。',
    chips: ['天然温泉', '康养', '草原夜色']
  },
  {
    id: 'daoxugou', no: '18', name: '道须沟', en: 'DAOXUGOU VALLEY',
    lon: 118.55, lat: 41.48, kind: 'forest', cat: 'nature', adcode: 150429, tag: '黑里河山水',
    desc: '宁城黑里河源头的原始林区峡谷，清溪叠瀑、巨木蔽日。秋日层林如染，是燕山北麓最清幽的深谷之一。',
    chips: ['峡谷瀑布', '原始林', '避暑']
  },
  {
    id: 'zhaobaogou', no: '19', name: '赵宝沟遗址', en: 'ZHAOBAOGOU SITE',
    lon: 119.95, lat: 42.35, kind: 'ruins', cat: 'history', adcode: 150430, tag: '史前聚落',
    desc: '敖汉旗赵宝沟文化命名地，距今约 7000 年。陶尊上的灵物纹样，与红山玉器共同勾勒西辽河上游的史前曙光。',
    chips: ['赵宝沟文化', '史前陶器', '考古']
  },
  {
    id: 'denglonghe', no: '20', name: '灯笼河草原', en: 'DENGLONGHE MEADOW',
    lon: 118.55, lat: 42.75, kind: 'grass', cat: 'grass', adcode: 150426, tag: '近郊草原',
    desc: '距市区不远的丘陵草甸，起伏缓和、视野开阔。夏秋之际适合自驾与露营，是“城市边缘的草原课”。',
    chips: ['自驾', '露营', '日落']
  },
  {
    id: 'chifeng_mus', no: '21', name: '赤峰博物馆', en: 'CHIFENG MUSEUM',
    lon: 118.93, lat: 42.30, kind: 'museum', cat: 'history', adcode: 150402, tag: '城市客厅',
    desc: '系统展陈红山文化、草原青铜、辽文化与民俗艺术。一次看懂赤峰八千年文明序列，适合作为行程第一站。',
    chips: ['红山玉器', '辽文化', '免费参观']
  },
  {
    id: 'wangfu_yunshan', no: '22', name: '白音敖包沙地云杉', en: 'BAIYIN ABAO SPRUCE FOREST',
    lon: 116.95, lat: 43.45, kind: 'forest', cat: 'nature', adcode: 150425, tag: '沙地神树',
    desc: '生长在沙地上的云杉林群落，被称作“沙漠绿珍珠”。根系锁住流沙，树形苍古，是荒原生态的奇迹样本。',
    chips: ['沙地云杉', '生态奇观', '摄影']
  }
];

/** 按类别 / 旗县过滤景点 */
function filterSpots(opts) {
  opts = opts || {};
  return SPOTS.filter(function (s) {
    if (opts.adcode && s.adcode !== opts.adcode) return false;
    if (opts.cat && s.cat !== opts.cat) return false;
    return true;
  });
}

function spotsByAdcode(adcode) {
  return SPOTS.filter(function (s) { return s.adcode === adcode; });
}

function getDistrictByAdcode(adcode) {
  for (var i = 0; i < CF_DISTRICTS.length; i++) {
    if (CF_DISTRICTS[i].adcode === adcode) return CF_DISTRICTS[i];
  }
  return null;
}

/** 射线法判断经纬点是否在多边形环内 */
function pointInRing(lon, lat, ring) {
  var inside = false;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    var xi = ring[i][0], yi = ring[i][1];
    var xj = ring[j][0], yj = ring[j][1];
    var hit = ((yi > lat) !== (yj > lat)) &&
      (lon < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}

/** 返回点所在旗县 adcode，否则 null */
function districtAt(lon, lat) {
  for (var i = 0; i < CF_DISTRICTS.length; i++) {
    var d = CF_DISTRICTS[i];
    for (var r = 0; r < d.rings.length; r++) {
      if (pointInRing(lon, lat, d.rings[r])) return d.adcode;
    }
  }
  return null;
}
