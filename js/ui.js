/* ============================================================
 * 赤峰 · 界面逻辑（列表 / 详情 / 分级 / 筛选）
 * ============================================================ */
'use strict';

var UI = (function () {
  var state = {
    level: 'city',       // city | district | spot
    adcode: null,
    spotId: null,
    cat: null,
    tab: 'districts'     // districts | spots
  };
  var handlers = {};
  var reduceMotion = false;

  function $(id) { return document.getElementById(id); }

  function on(event, fn) { handlers[event] = fn; }
  function emit(event, payload) {
    if (handlers[event]) handlers[event](payload);
  }

  function isMobile() {
    return window.innerWidth <= 768 || window.innerHeight <= 500;
  }

  function prefersReducedMotion() {
    return reduceMotion;
  }

  function detectMotionPref() {
    reduceMotion = !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function setLevel(level, opts) {
    opts = opts || {};
    state.level = level;
    if (opts.adcode !== undefined) state.adcode = opts.adcode;
    if (opts.spotId !== undefined) state.spotId = opts.spotId;
    renderLevelBar();
    renderTabs();
  }

  function renderLevelBar() {
    var bar = $('level-bar');
    var names = { city: '全市', district: '旗县', spot: '景点' };
    var mid = '';
    if (state.adcode) {
      var d = getDistrictByAdcode(state.adcode);
      mid += '<span class="sep">/</span><button type="button" data-act="district" class="active">' +
        (d ? d.name : '') + '</button>';
    }
    if (state.spotId) {
      var s = SPOTS.filter(function (x) { return x.id === state.spotId; })[0];
      mid += '<span class="sep">/</span><button type="button" data-act="spot" class="active">' +
        (s ? s.name : '') + '</button>';
    }
    bar.innerHTML =
      '<button type="button" data-act="city">赤峰市</button>' + mid +
      '<span id="level-badge">' + (names[state.level] || '') + '</span>';
    bar.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        var act = b.getAttribute('data-act');
        if (act === 'city') emit('gotoCity');
        else if (act === 'district' && state.adcode) emit('gotoDistrict', state.adcode);
        else if (act === 'spot' && state.spotId) emit('selectSpot', state.spotId);
      });
    });
  }

  function renderTabs() {
    var tD = $('tab-districts');
    var tS = $('tab-spots');
    if (state.tab === 'districts') {
      tD.classList.add('visible');
      tS.classList.remove('visible');
      renderDistrictList();
    } else {
      tD.classList.remove('visible');
      tS.classList.add('visible');
      renderSpotList();
    }
  }

  function renderDistrictList() {
    var box = $('tab-districts');
    var html = '<div class="sec-title">旗县分级</div>';
    CF_DISTRICTS.forEach(function (d) {
      var info = DISTRICT_INFO[d.adcode] || {};
      var n = spotsByAdcode(d.adcode).length;
      var color = '#' + (DISTRICT_COLORS[d.adcode] || 0x888888).toString(16).padStart(6, '0');
      html += '<button type="button" class="item' +
        (state.adcode === d.adcode ? ' active' : '') +
        '" data-adcode="' + d.adcode + '">' +
        '<span class="swatch" style="background:' + color + '"></span>' +
        '<div><div class="name">' + d.name + '</div>' +
        '<div class="meta">' + (info.short || '') + ' · ' + n + ' 处景点</div></div></button>';
    });
    box.innerHTML = html;
    box.querySelectorAll('.item').forEach(function (el) {
      el.addEventListener('click', function () {
        emit('selectDistrict', parseInt(el.getAttribute('data-adcode'), 10));
      });
    });
  }

  function renderSpotList() {
    var box = $('tab-spots');
    var filters = '<div class="filter-row">';
    filters += '<button type="button" class="chip' + (!state.cat ? ' active' : '') +
      '" data-cat="">全部</button>';
    Object.keys(SPOT_CATS).forEach(function (k) {
      filters += '<button type="button" class="chip' +
        (state.cat === k ? ' active' : '') +
        '" data-cat="' + k + '">' + SPOT_CATS[k].label + '</button>';
    });
    filters += '</div>';

    var inDistrict = !!state.adcode;
    var list;
    if (inDistrict) {
      list = SPOTS.filter(function (s) {
        if (state.cat && s.cat !== state.cat) return false;
        return s.adcode === state.adcode;
      });
      if (!list.length) {
        inDistrict = false;
        list = SPOTS.filter(function (s) { return !state.cat || s.cat === state.cat; });
      }
    } else {
      list = SPOTS.filter(function (s) {
        return !state.cat || s.cat === state.cat;
      });
    }

    var html = filters + '<div class="sec-title">' +
      (inDistrict ? '本旗县景点' : '全部景点') + ' · ' + list.length + '</div>';
    if (!list.length) {
      html += '<div class="empty-tip">该筛选下暂无景点</div>';
    }
    list.forEach(function (s, i) {
      var cat = SPOT_CATS[s.cat] || { label: '', color: '#888' };
      var d = getDistrictByAdcode(s.adcode);
      var no = inDistrict ? String(i + 1) : s.no;
      if (no.length < 2) no = '0' + no;
      html += '<button type="button" class="item' +
        (state.spotId === s.id ? ' active' : '') +
        '" data-id="' + s.id + '">' +
        '<span class="no">' + no + '</span>' +
        '<div><div class="name">' + s.name + '</div>' +
        '<div class="meta">' + (d ? d.name : '') + ' · ' + cat.label +
        '</div></div></button>';
    });
    box.innerHTML = html;
    box.querySelectorAll('.chip').forEach(function (ch) {
      ch.addEventListener('click', function () {
        state.cat = ch.getAttribute('data-cat') || null;
        renderSpotList();
      });
    });
    box.querySelectorAll('.item').forEach(function (el) {
      el.addEventListener('click', function () {
        emit('selectSpot', el.getAttribute('data-id'));
      });
    });
  }

  function showSpotCard(s) {
    var card = $('card');
    card.classList.remove('hidden', 'mode-district', 'compact');
    card.setAttribute('aria-hidden', 'false');
    var cat = SPOT_CATS[s.cat] || { label: '', color: '#888' };
    var hero = $('card-hero');
    hero.className = 'card-hero ' + s.cat;
    hero.textContent = s.tag || cat.label;
    $('card-no').textContent = s.no + ' / CHIFENG SPATIAL SANDBOX';
    $('card-name').textContent = s.name;
    $('card-en').textContent = s.en;
    $('card-desc').textContent = s.desc;
    $('card-chips').innerHTML = (s.chips || []).map(function (c) {
      return '<span>' + c + '</span>';
    }).join('');
    var d = getDistrictByAdcode(s.adcode);
    $('card-tag').textContent = (d ? d.name : '') + ' · ' + cat.label;
    $('card-actions').style.display = 'flex';
    if (isMobile()) {
      var sb = $('sidebar');
      sb.classList.remove('mobile-open');
      sb.classList.add('collapsed');
      syncListPressed(false);
    }
  }

  function showDistrictCard(adcode) {
    var d = getDistrictByAdcode(adcode);
    if (!d) return;
    var info = DISTRICT_INFO[adcode] || {};
    var card = $('card');
    card.classList.remove('hidden');
    card.classList.add('mode-district');
    card.setAttribute('aria-hidden', 'false');
    var hero = $('card-hero');
    hero.className = 'card-hero';
    hero.textContent = 'DISTRICT · ' + (info.short || d.name);
    $('card-no').textContent = 'DISTRICT / 赤峰市';
    $('card-name').textContent = d.name;
    $('card-en').textContent = info.en || '';
    $('card-desc').textContent = info.intro || '';
    var spots = spotsByAdcode(adcode);
    $('card-chips').innerHTML = spots.slice(0, 4).map(function (s) {
      return '<button type="button" data-spot="' + s.id + '">' + s.name + '</button>';
    }).join('');
    $('card-chips').querySelectorAll('button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        emit('selectSpot', btn.getAttribute('data-spot'));
      });
    });
    $('card-tag').textContent = spots.length + ' 处景点 · 旗县';
    $('card-actions').style.display = 'none';
    if (isMobile()) card.classList.add('compact');
    else card.classList.remove('compact');
  }

  function hideCard() {
    var card = $('card');
    card.classList.add('hidden');
    card.setAttribute('aria-hidden', 'true');
  }

  function syncListPressed(open) {
    var btn = $('tb-list');
    if (!btn) return;
    btn.setAttribute('aria-pressed', open ? 'true' : 'false');
    btn.classList.toggle('active', !!open);
    btn.setAttribute('aria-label', open ? '关闭列表' : '打开列表');
  }

  function isSidebarOpen() {
    var sb = $('sidebar');
    if (isMobile()) return sb.classList.contains('mobile-open');
    return !sb.classList.contains('collapsed');
  }

  function setSidebarOpen(open) {
    var sb = $('sidebar');
    if (isMobile()) {
      sb.classList.toggle('mobile-open', open);
      sb.classList.toggle('collapsed', !open);
    } else {
      sb.classList.toggle('collapsed', !open);
    }
    syncListPressed(open);
  }

  function toggleSidebar() {
    setSidebarOpen(!isSidebarOpen());
  }

  function bind() {
    $('enter-btn').addEventListener('click', function () {
      $('intro').classList.add('gone');
      emit('enter');
    });
    $('card-close').addEventListener('click', function () {
      hideCard();
      emit('closeCard');
    });
    $('card-closein').addEventListener('click', function () { emit('closeIn'); });
    $('card-orbit').addEventListener('click', function () { emit('orbit'); });

    document.querySelectorAll('.theme-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('.theme-btn').forEach(function (x) {
          x.classList.remove('active');
          x.setAttribute('aria-pressed', 'false');
        });
        b.classList.add('active');
        b.setAttribute('aria-pressed', 'true');
        emit('theme', b.getAttribute('data-theme'));
      });
    });

    $('tb-overview').addEventListener('click', function () { emit('gotoCity'); });
    $('tb-orbit').addEventListener('click', function () { emit('autoOrbit'); });
    $('tb-tour').addEventListener('click', function () { emit('tour'); });
    $('tb-top').addEventListener('click', function () { emit('topView'); });
    $('tb-list').addEventListener('click', toggleSidebar);
    $('tb-photo').addEventListener('click', function () { emit('photo'); });
    $('tb-full').addEventListener('click', function () { emit('fullscreen'); });

    $('zoom-in').addEventListener('click', function () { emit('zoom', -0.15); });
    $('zoom-out').addEventListener('click', function () { emit('zoom', 0.15); });

    var compass = $('compass');
    if (compass) {
      compass.addEventListener('click', function () { emit('resetNorth'); });
    }

    $('tab-switch').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      state.tab = b.getAttribute('data-tab');
      $('tab-switch').querySelectorAll('button').forEach(function (x) {
        var on = x === b;
        x.classList.toggle('active', on);
        x.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      renderTabs();
    });

    window.addEventListener('keydown', function (e) {
      if (e.key === 'h' || e.key === 'H') emit('gotoCity');
      if (e.key === 'u' || e.key === 'U') {
        $('ui-root').classList.toggle('hidden');
      }
      if (e.key === 'Escape') {
        if (isSidebarOpen()) {
          setSidebarOpen(false);
          return;
        }
        if (!$('card').classList.contains('hidden')) {
          hideCard();
          emit('closeCard');
        }
      }
      if (e.key === '1') {
        var day = $('theme-day');
        if (day) day.click();
      }
      if (e.key === '2') {
        var sunset = $('theme-sunset');
        if (sunset) sunset.click();
      }
      if (e.key === '3') {
        var night = $('theme-night');
        if (night) night.click();
      }
    });
  }

  function openSpotListTab() {
    state.tab = 'spots';
    $('tab-switch').querySelectorAll('button').forEach(function (x) {
      var on = x.getAttribute('data-tab') === 'spots';
      x.classList.toggle('active', on);
      x.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    renderTabs();
    setSidebarOpen(true);
  }

  function openDistrictListTab() {
    state.tab = 'districts';
    $('tab-switch').querySelectorAll('button').forEach(function (x) {
      var on = x.getAttribute('data-tab') === 'districts';
      x.classList.toggle('active', on);
      x.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    renderTabs();
    setSidebarOpen(true);
  }

  function setHintVisible(v) {
    $('hint').style.opacity = v ? '1' : '0';
  }

  function setToolbarActive(id, on) {
    var el = $(id);
    if (!el) return;
    el.classList.toggle('active', !!on);
    if (el.hasAttribute('aria-pressed')) {
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    var ms = prefersReducedMotion() ? 900 : 1800;
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, ms);
  }

  function init() {
    detectMotionPref();
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      var onChange = function () { detectMotionPref(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
    bind();
    renderLevelBar();
    renderTabs();
    $('card').setAttribute('aria-hidden', 'true');
  }

  return {
    init: init,
    on: on,
    emit: emit,
    setLevel: setLevel,
    showSpotCard: showSpotCard,
    showDistrictCard: showDistrictCard,
    hideCard: hideCard,
    openSpotListTab: openSpotListTab,
    openDistrictListTab: openDistrictListTab,
    setHintVisible: setHintVisible,
    setToolbarActive: setToolbarActive,
    setSidebarOpen: setSidebarOpen,
    toast: toast,
    prefersReducedMotion: prefersReducedMotion,
    getState: function () { return state; }
  };
})();
