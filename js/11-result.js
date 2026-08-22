/* ============================================================
   11. 結果画面（リスト／地図の切替）
   ============================================================ */
VIEWS.result = () => {
  if(SEL.sub === 'pick' && PICK) return pickHTML();

  const rows = currentRows();
  const hidden = (Q.radius && POS)
    ? DB.shops.filter(s => s.lat == null).length : 0;

  return `
  <div class="pad">
    <div class="row between mb">
      <h2>結果 <span class="mini">${fmt(rows.length)} 軒</span></h2>
      <button class="ghost" onclick="go('find')">条件を変える</button>
    </div>

    <div class="cond">${condHTML()}</div>
    ${hidden ? `<p class="mini">位置が未取得の ${fmt(hidden)} 軒は距離で絞ったため除いています</p>` : ''}

    <div class="subtabs mt">
      <button class="${SEL.sub!=='map'?'on':''}" onclick="go('result',{sub:''})">リスト</button>
      <button class="${SEL.sub==='map'?'on':''}" onclick="go('result',{sub:'map'})">地図</button>
    </div>

    ${SEL.sub === 'map'
      ? `<div id="map" class="map"></div>`
      : `<div id="results" class="mt">${resultListHTML()}</div>`}
  </div>`;
};

/** いまの検索条件を文章で表す */
function condHTML(){
  const p = [];
  p.push(POS ? `📍 ${esc(POS.label)}から近い順` : '📍 起点なし（評価順）');
  if(Q.genres.length) p.push(genreLabels(Q.genres).join('・'));
  if(Q.kw)            p.push(`「${esc(Q.kw)}」`);
  if(Q.openOnly)      p.push('今やってる店');
  if(Q.rate)          p.push(`★${num(Q.rate)}以上`);
  if(Q.radius && POS) p.push((RADIUS_OPTS.find(([v]) => v === num(Q.radius))||[,''])[1]);
  return p.map(x => `<span class="tag alt">${x}</span>`).join('');
}

/** 結果の一覧だけを組み立てる（renderResults() から差し替えられる） */
function resultListHTML(){
  const rows = currentRows();
  if(!rows.length) return emptyBox('条件に合う店がありません',
    'ジャンルを減らすか、キーワードを短くしてみてください');
  return `<div class="cards">${rows.map(r => shopCardHTML(r)).join('')}</div>`;
}

function shopCardHTML(r){
  const s = r.s;
  return `
  <div class="card" onclick="openFromResult('${s.id}')">
    <div class="row between">
      <b>${s.fav?'📌 ':''}${esc(s.name)}</b>
      <span class="dist">${distLabel(r.dist)}</span>
    </div>
    <div class="tags">
      ${openBadge(s)}
      ${genreTags(s.genres)}
      ${s.myRate ? `<span class="tag alt">${'★'.repeat(s.myRate)}</span>` : ''}
    </div>
    ${s.memo ? `<p class="mini clip">${esc(s.memo)}</p>` : ''}
  </div>`;
}

/** 結果から店の詳細を開く */
function openFromResult(id){
  TAB = 'shops';
  SEL.shop = id; SEL.sub = ''; SEL.edit = false;
  EDIT = null;
  render();
  if(typeof window !== 'undefined' && window.scrollTo) window.scrollTo(0, 0);
}

/* ------------------------------------------------------------
   ルーレットの結果
   ------------------------------------------------------------ */
function pickHTML(){
  const s = PICK.s;
  return `
  <div class="pad">
    <div class="row between mb">
      <h2>🎲 今日はここ</h2>
      <button class="ghost" onclick="go('find')">条件を変える</button>
    </div>

    <div class="pick">
      <b>${esc(s.name)}</b>
      <div class="tags">
        ${openBadge(s)}
        ${genreTags(s.genres)}
        ${PICK.dist != null ? `<span class="tag alt">${distLabel(PICK.dist)}</span>` : ''}
      </div>
      ${s.memo ? `<p class="mini">${esc(s.memo)}</p>` : ''}
    </div>

    <div class="row gap mt">
      <a class="btn pri grow" href="${esc(routeUrl(s))}" target="_blank" rel="noopener">ここへ行く</a>
      <button class="grow" onclick="doRoulette()">🎲 もう一度</button>
    </div>
    <div class="mt right">
      <button class="ghost" onclick="go('result',{sub:''})">ほかの候補を見る</button>
    </div>
  </div>`;
}

/* 地図は Phase 4 で作ります。それまでは案内だけ出します */
AFTER.result = () => {
  if(SEL.sub !== 'map') return;
  const el = $('#map');
  if(el && typeof drawMap === 'function') drawMap(currentRows());
  else if(el) el.innerHTML = '<div class="empty">地図はこれから作ります</div>';
};
