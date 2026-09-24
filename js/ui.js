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

  function $(id) { return document.getElementById(id); }

  function on(event, fn) { handlers[event] = fn; }
  function emit(event, payload) {
    if (handlers[event]) handlers[event](payload);
  }

  function isMobile() {
    return window.innerWidth <= 768;
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
      mid += '<span class="sep">/</span><button data-act="district" class="active">' + (d ? d.name : '') + '</button>';
    }
    if (state.spotId) {
      var s = SPOTS.filter(function (x) { return x.id === state.spotId; })[0];
      mid += '<span class="sep">/</span><button data-act="spot" class="active">' + (s ? s.name : '') + '</button>';
    }
    bar.innerHTML =
      '<button data-act="city">赤峰市</button>' + mid +
      '<span id="level-badge">' + (names[state.level] || '') + '</span>';
    bar.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        var act = b.getAttribute('data-act');
        if (act === 'city') emit('gotoCity');
        else if (act === 'district' && state.adcode) emit('gotoDistrict', state.adcode);
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
    var html = '<div class="sec-title">旗县区分级</div>';
    CF_DISTRICTS.forEach(function (d) {
      var info = DISTRICT_INFO[d.adcode] || {};
      var n = spotsByAdcode(d.adcode).length;
      var color = '#' + (DISTRICT_COLORS[d.adcode] || 0x888888).toString(16).padStart(6, '0');
      html += '<div class="item' + (state.adcode === d.adcode ? ' active' : '') + '" data-adcode="' + d.adcode + '">' +
        '<span class="swatch" style="background:' + color + '"></span>' +
        '<div><div class="name">' + d.name + '</div>' +
        '<div class="meta">' + (info.short || '') + ' · ' + n + ' 处景点</div></div></div>';
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
    filters += '<button class="chip' + (!state.cat ? ' active' : '') + '" data-cat="">全部</button>';
    Object.keys(SPOT_CATS).forEach(function (k) {
      filters += '<button class="chip' + (state.cat === k ? ' active' : '') + '" data-cat="' + k + '">' + SPOT_CATS[k].label + '</button>';
    });
    filters += '</div>';

    var list = SPOTS.filter(function (s) {
      if (state.cat && s.cat !== state.cat) return false;
      if (state.adcode && state.tabFilterDistrict) return s.adcode === state.adcode;
      return true;
    });

    // 若当前在某旗县，优先显示该旗县景点
    if (state.adcode) {
      list = SPOTS.filter(function (s) {
        if (state.cat && s.cat !== state.cat) return false;
        return s.adcode === state.adcode;
      });
      if (!list.length) {
        list = SPOTS.filter(function (s) { return !state.cat || s.cat === state.cat; });
      }
    }

    var html = filters + '<div class="sec-title">' + (state.adcode ? '本旗县景点' : '全部景点') + ' · ' + list.length + '</div>';
    list.forEach(function (s) {
      var cat = SPOT_CATS[s.cat] || { label: '', color: '#888' };
      var d = getDistrictByAdcode(s.adcode);
      html += '<div class="item' + (state.spotId === s.id ? ' active' : '') + '" data-id="' + s.id + '">' +
        '<span class="no">' + s.no + '</span>' +
        '<div><div class="name">' + s.name + '</div>' +
        '<div class="meta">' + (d ? d.name : '') + ' · ' + cat.label + '</div></div></div>';
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
    card.classList.remove('hidden', 'mode-district');
    var cat = SPOT_CATS[s.cat] || { label: '', color: '#888' };
    var hero = $('card-hero');
    hero.className = 'card-hero ' + s.cat;
    hero.textContent = cat.label + ' · ' + (s.tag || '');
    $('card-no').textContent = s.no + ' / CHIFENG SPATIAL SANDBOX';
    $('card-name').textContent = s.name;
    $('card-en').textContent = s.en;
    $('card-desc').textContent = s.desc;
    $('card-chips').innerHTML = (s.chips || []).map(function (c) {
      return '<span>' + c + '</span>';
    }).join('');
    var d = getDistrictByAdcode(s.adcode);
    $('card-tag').textContent = (d ? d.name : '') + ' · ' + (s.tag || '');
    $('card-actions').style.display = 'flex';
  }

  function showDistrictCard(adcode) {
    var d = getDistrictByAdcode(adcode);
    if (!d) return;
    var info = DISTRICT_INFO[adcode] || {};
    var card = $('card');
    card.classList.remove('hidden');
    card.classList.add('mode-district');
    var hero = $('card-hero');
    hero.className = 'card-hero';
    hero.textContent = info.en || 'DISTRICT';
    $('card-no').textContent = 'DISTRICT / 赤峰市';
    $('card-name').textContent = d.name;
    $('card-en').textContent = info.short || '';
    $('card-desc').textContent = info.intro || '';
    var spots = spotsByAdcode(adcode);
    $('card-chips').innerHTML = spots.slice(0, 4).map(function (s) {
      return '<span>' + s.name + '</span>';
    }).join('');
    $('card-tag').textContent = spots.length + ' 处景点 · 旗县区';
    $('card-actions').style.display = 'none';
    // 移动端：旗县卡保持短，避免挡住下方列表
    if (isMobile()) card.classList.add('compact');
    else card.classList.remove('compact');
  }

  function hideCard() {
    $('card').classList.add('hidden');
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
        document.querySelectorAll('.theme-btn').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        emit('theme', b.getAttribute('data-theme'));
      });
    });

    $('tb-overview').addEventListener('click', function () { emit('gotoCity'); });
    $('tb-orbit').addEventListener('click', function () { emit('autoOrbit'); });
    $('tb-tour').addEventListener('click', function () { emit('tour'); });
    $('tb-top').addEventListener('click', function () { emit('topView'); });
    $('tb-list').addEventListener('click', function () {
      var sb = $('sidebar');
      if (isMobile()) {
        var open = !sb.classList.contains('mobile-open');
        sb.classList.toggle('mobile-open', open);
        sb.classList.toggle('collapsed', !open);
      } else {
        sb.classList.toggle('collapsed');
      }
    });
    $('tb-photo').addEventListener('click', function () { emit('photo'); });
    $('tb-full').addEventListener('click', function () { emit('fullscreen'); });

    $('zoom-in').addEventListener('click', function () { emit('zoom', -0.15); });
    $('zoom-out').addEventListener('click', function () { emit('zoom', 0.15); });

    // 顶部页签：地区 / 景点
    $('tab-switch').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      state.tab = b.getAttribute('data-tab');
      $('tab-switch').querySelectorAll('button').forEach(function (x) {
        x.classList.toggle('active', x === b);
      });
      renderTabs();
    });

    window.addEventListener('keydown', function (e) {
      if (e.key === 'h' || e.key === 'H') emit('gotoCity');
      if (e.key === 'u' || e.key === 'U') {
        $('ui-root').classList.toggle('hidden');
      }
      if (e.key === 'Escape') {
        hideCard();
        emit('closeCard');
      }
    });
  }

  function openSpotListTab() {
    state.tab = 'spots';
    $('tab-switch').querySelectorAll('button').forEach(function (x) {
      x.classList.toggle('active', x.getAttribute('data-tab') === 'spots');
    });
    renderTabs();
    if (isMobile()) {
      $('sidebar').classList.add('mobile-open');
      $('sidebar').classList.remove('collapsed');
    } else {
      $('sidebar').classList.remove('collapsed');
    }
  }

  function openDistrictListTab() {
    state.tab = 'districts';
    $('tab-switch').querySelectorAll('button').forEach(function (x) {
      x.classList.toggle('active', x.getAttribute('data-tab') === 'districts');
    });
    renderTabs();
    if (isMobile()) {
      $('sidebar').classList.add('mobile-open');
      $('sidebar').classList.remove('collapsed');
    } else {
      $('sidebar').classList.remove('collapsed');
    }
  }

  function setHintVisible(v) {
    $('hint').style.opacity = v ? '1' : '0';
  }

  function init() {
    bind();
    renderLevelBar();
    renderTabs();
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
    getState: function () { return state; }
  };
})();
