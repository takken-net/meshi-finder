/* ============================================================
   12. 地図（Leaflet + OpenStreetMap）

   地図の描画は無料の OpenStreetMap を使います。Google Maps の
   JavaScript API は使いません（APIキーの露出と課金を増やさないため）。

   Leaflet は CDN ではなく vendor/ に同梱しています。
   CDN にすると電波の悪い場所で地図だけでなくアプリごと開けなくなるためです。

   ■ 地図インスタンスの扱い（重要）
     render() の冒頭で MAP.remove() し、AFTER[TAB] で作り直します。
     残したまま innerHTML を書き換えると、イベントが宙に浮いて後で落ちます。
   ============================================================ */
const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

/** 検索結果を地図に出す。座標のある店だけが対象 */
function drawMap(rows){
  const el = $('#map');
  if(!el) return;
  if(typeof L === 'undefined'){
    el.innerHTML = '<div class="empty">地図を読み込めませんでした</div>';
    return;
  }

  const pts = (rows || []).filter(r => r.s && r.s.lat != null);
  if(!pts.length && !POS){
    el.innerHTML = '<div class="empty"><p>地図に出せる店がありません</p>'
                 + '<p class="mini">位置が未取得の店は、取込タブでまとめて取得できます</p></div>';
    return;
  }

  MAP = L.map(el, { zoomControl: true, attributionControl: true });
  L.tileLayer(OSM_URL, { maxZoom: 19, attribution: OSM_ATTR }).addTo(MAP);

  const bounds = [];

  /* 現在地（または選んだ起点） */
  if(POS){
    L.marker([POS.lat, POS.lng], { icon: pinHere(), zIndexOffset: 1000, title: POS.label })
      .addTo(MAP).bindPopup(`<b>${esc(POS.label)}</b>`);
    bounds.push([POS.lat, POS.lng]);
  }

  /* 店。営業状態で色を変える */
  for(const r of pts){
    const s = r.s;
    L.marker([s.lat, s.lng], { icon: pinShop(s), title: s.name })
      .addTo(MAP)
      .bindPopup(popupHTML(r));
    bounds.push([s.lat, s.lng]);
  }

  if(bounds.length === 1) MAP.setView(bounds[0], 16);
  else MAP.fitBounds(bounds, { padding: [28, 28], maxZoom: 17 });

  /* タブを切り替えた直後は入れ物の大きさが確定していないことがあるため、
     一拍おいてから測り直します（地図が灰色のままになるのを防ぐ） */
  setTimeout(() => { if(MAP) MAP.invalidateSize(); }, 60);
}

/* 画像を使わず CSS だけでピンを作ります（読み込みが速く、色を変えやすい） */
function pinShop(s){
  const o = isOpen(s);
  const cls = o === true ? 'open' : o === false ? 'closed' : 'unknown';
  const g = (s.genres || [])[0];
  return L.divIcon({
    className: '',
    html: `<div class="pin ${cls}">${g ? genreOf(g).icon : '🍴'}</div>`,
    iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -14],
  });
}
function pinHere(){
  return L.divIcon({
    className: '',
    html: '<div class="pin here"></div>',
    iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -10],
  });
}

function popupHTML(r){
  const s = r.s;
  return `
    <div class="pop">
      <b>${esc(s.name)}</b>
      <div class="mini">${genreLabels(s.genres).join('・')}
        ${r.dist != null ? ` ・ ${fmtDist(r.dist)}` : ''}</div>
      <div class="mini">${openBadge(s)}</div>
      <div class="poprow">
        <a onclick="openFromResult('${s.id}')">くわしく</a>
        <a href="${esc(routeUrl(s))}" target="_blank" rel="noopener">経路</a>
      </div>
    </div>`;
}
