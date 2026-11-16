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

  /* 現在地（または選んだ起点） */
  if(POS){
    L.marker([POS.lat, POS.lng], { icon: pinHere(), zIndexOffset: 1000, title: POS.label })
      .addTo(MAP).bindPopup(`<b>${esc(POS.label)}</b>`);
  }

  /* 店。営業状態で色を変える */
  for(const r of pts){
    const s = r.s;
    L.marker([s.lat, s.lng], { icon: pinShop(s), title: s.name })
      .addTo(MAP)
      .bindPopup(popupHTML(r));
  }

  const bounds = mapFitPoints(pts, POS);
  if(bounds.length === 1) MAP.setView(bounds[0], 16);
  else MAP.fitBounds(bounds, { padding: [28, 28], maxZoom: 17 });

  /* タブを切り替えた直後は入れ物の大きさが確定していないことがあるため、
     一拍おいてから測り直します（地図が灰色のままになるのを防ぐ） */
  setTimeout(() => { if(MAP) MAP.invalidateSize(); }, 60);
}

/* 地図に収める点を決める。
   店があれば店を収め、起点（現在地や検索した駅）は店の近く（最も遠い店まで10km以内）に
   あるときだけ一緒に収める。遠いときは収めない。
   ―― キーワードで遠くの街の店を探したとき（例: 大阪にいて「小川町」を検索）、
   起点まで収めようとすると地図が日本全図のようにズームアウトしてしまうため。
   起点のピン自体は出しておく（画面外にあるだけで、動かせば見える）。 */
const MAP_FIT_ORIGIN_M = 10000;
function mapFitPoints(pts, pos){
  const b = (pts || []).map(r => [r.s.lat, r.s.lng]);
  if(pos && pos.lat != null){
    const far = (pts || []).reduce((m, r) => Math.max(m, haversine(pos, r.s) ?? 0), 0);
    if(!b.length || far <= MAP_FIT_ORIGIN_M) b.push([pos.lat, pos.lng]);
  }
  return b;
}

/* 画像を使わず CSS だけでピンを作ります（読み込みが速く、色を変えやすい）。
   外側のしずく形は営業状態の色、中の白い円バッジにジャンルの絵文字を乗せる */
function pinShop(s){
  const o = isOpen(s);
  const cls = o === true ? 'open' : o === false ? 'closed' : 'unknown';
  const g = (s.genres || [])[0];
  return L.divIcon({
    className: '',
    html: `<div class="pin ${cls}"><span class="pin-dot">${g ? genreOf(g).icon : '🍴'}</span></div>`,
    iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -18],
  });
}
function pinHere(){
  return L.divIcon({
    className: '',
    html: '<div class="pin here"></div>',
    iconSize: [20, 20], iconAnchor: [10, 10], popupAnchor: [0, -12],
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
