/* ============================================================
   10. 探す画面
   ============================================================ */
let Q      = { genres:[], kw:'', openOnly:false, radius:0, rate:0 };
let POS    = null;            // 検索の起点 { lat, lng, acc, label }
let GEO    = 'idle';          // idle | loading | ok | deny | fail
let GEOERR = '';
let PICK   = null;            // ルーレットで選ばれた店

/* 歩いて行ける範囲（時速5kmで換算。5分≒420m）。0 は絞らない */
const RADIUS_OPTS = [
  [420,  '徒歩5分以内'],
  [840,  '徒歩10分以内'],
  [1680, '徒歩20分以内'],
  [0,    '30分以上もOK（すべて）'],
];
/* My評価（★の数）での絞り込み */
const RATE_OPTS = [[0,'指定なし'],[3,'★3以上'],[4,'★4以上'],[5,'★5のみ']];

/** いまの条件で該当する店（近い順） */
const currentRows = () => searchShops(Q, POS, null);

/* ------------------------------------------------------------
   現在地
   ------------------------------------------------------------ */
function locate(){
  if(typeof navigator === 'undefined' || !navigator.geolocation){
    GEO = 'fail'; GEOERR = 'この端末は位置情報に対応していません';
    render(); return;
  }
  GEO = 'loading'; render();
  navigator.geolocation.getCurrentPosition(
    p => {
      POS = { lat:p.coords.latitude, lng:p.coords.longitude,
              acc:Math.round(p.coords.accuracy||0), label:'現在地' };
      GEO = 'ok';
      DB.settings.lastPos = { lat:POS.lat, lng:POS.lng, at:today() };
      save(); render();
    },
    e => {
      GEO = (e && e.code === 1) ? 'deny' : 'fail';
      GEOERR = (e && e.code === 1)
        ? '位置情報の利用が許可されていません'
        : '現在地を取得できませんでした';
      render();
    },
    { enableHighAccuracy:true, timeout:10000, maximumAge:60000 }
  );
}

/** 登録しておいた地点を起点にする */
function usePlace(id){
  if(!id){ POS = null; GEO = 'idle'; render(); return; }
  if(id === '__last'){
    const p = DB.settings.lastPos;
    if(p){ POS = { lat:p.lat, lng:p.lng, acc:0, label:`前回の位置（${p.at}）` }; GEO = 'ok'; }
    render(); return;
  }
  const p = (DB.settings.places||[]).find(x => x.id === id);
  if(p){ POS = { lat:p.lat, lng:p.lng, acc:0, label:p.label }; GEO = 'ok'; }
  render();
}

/** 探す画面を開いたら一度だけ位置を取りにいく */
AFTER.find = () => { if(GEO === 'idle' && !POS) locate(); };

/* ------------------------------------------------------------
   画面
   ------------------------------------------------------------ */
VIEWS.find = () => {
  const n = currentRows().length;
  return `
  <div class="pad">
    ${posCardHTML()}

    <label class="lbl">何が食べたい？<span class="mini">（複数選べます。選ばなければ全部）</span></label>
    <div id="f-genres" class="chips">${findGenreChips()}</div>

    <label class="lbl">キーワード<span class="mini">（店名・メモ・タグから探します）</span></label>
    <input id="f-kw" class="fld" type="search" placeholder="例: つけ麺　一人向き"
           value="${esc(Q.kw)}" oninput="onFindKw(this.value)">

    <div class="row gap mt cond-row">
      <label class="sw"><input type="checkbox" ${Q.openOnly?'checked':''}
        onchange="Q.openOnly=this.checked; updateHits()"><span>今やってる店だけ</span></label>
      <select class="fld sm grow" onchange="Q.rate=num(this.value); updateHits()">
        ${RATE_OPTS.map(([v,l]) =>
          `<option value="${v}" ${num(Q.rate)===v?'selected':''}>My評価 ${l}</option>`).join('')}
      </select>
    </div>

    <div class="hit" id="hit">${hitLabel(n)}</div>

    <div class="row gap">
      <button class="pri grow" onclick="doSearch()">この条件で探す</button>
      <button class="grow" onclick="doRoulette()">🎲 おまかせ1軒</button>
    </div>

    <label class="lbl mt2">歩いて行ける範囲<span class="mini">（時速5kmで計算）</span></label>
    <select class="fld" onchange="Q.radius=num(this.value); updateHits()">
      ${RADIUS_OPTS.map(([v,l]) =>
        `<option value="${v}" ${num(Q.radius)===v?'selected':''}>${l}</option>`).join('')}
    </select>
    ${(Q.radius && !POS) ? '<p class="mini">※ 起点が決まっていないため範囲は使われません</p>' : ''}

    ${DB.shops.length ? '' : `<div class="note mt">
      まだ店が登録されていません。<a onclick="go('shops')">お店タブ</a>で追加するか、
      <a onclick="go('data')">取込タブ</a>から Google マップの CSV を読み込んでください。</div>`}
  </div>`;
};

function posCardHTML(){
  const places = DB.settings.places || [];
  const hasLast = !!DB.settings.lastPos;

  if(GEO === 'loading')
    return `<div class="note">現在地を確認しています…</div>`;

  if(GEO === 'ok' && POS)
    return `<div class="note ok row between">
      <span>📍 ${esc(POS.label)}${POS.acc ? `<span class="mini">（誤差およそ ±${fmt(POS.acc)}m）</span>` : ''}</span>
      <button class="ghost sm" onclick="locate()">取り直す</button>
    </div>`;

  if(GEO === 'deny' || GEO === 'fail')
    return `<div class="note warn">
      <div class="row between"><span>${esc(GEOERR)}</span>
        <button class="ghost sm" onclick="locate()">再試行</button></div>
      ${(places.length || hasLast) ? `
        <select class="fld sm mt" onchange="usePlace(this.value)">
          <option value="">起点を選ぶ…</option>
          ${hasLast ? `<option value="__last">前回の位置（${esc(DB.settings.lastPos.at)}）</option>` : ''}
          ${places.map(p => `<option value="${esc(p.id)}">${esc(p.label)}</option>`).join('')}
        </select>`
      : `<p class="mini">起点が無くても検索できます（距離順には並びません）。
           よく行く場所は<a onclick="go('set')">設定</a>から登録できます。</p>`}
    </div>`;

  return `<div class="note row between">
    <span class="mini">現在地はまだ取得していません</span>
    <button class="sm" onclick="locate()">現在地を使う</button>
  </div>`;
}

function findGenreChips(){
  const on = new Set(Q.genres);
  return DB.genres.map(g => {
    const n = DB.shops.filter(s => (s.genres||[]).includes(g.id)).length;
    return `<button class="chip ${on.has(g.id)?'on':''} ${n?'':'dim'}" onclick="toggleGenre('${g.id}')">
      ${g.icon} ${esc(g.label)}${n?`<b>${n}</b>`:''}</button>`;
  }).join('');
}

/* 入力欄を作り直さずに済むよう、変わった部分だけ差し替えます
   （render() を呼ぶと日本語変換の途中で入力欄が消えてしまうため） */
function onFindKw(v){ Q.kw = v; updateHits(); }
function toggleGenre(id){
  const i = Q.genres.indexOf(id);
  if(i >= 0) Q.genres.splice(i,1); else Q.genres.push(id);
  const el = $('#f-genres'); if(el) el.innerHTML = findGenreChips();
  updateHits();
}
function updateHits(){
  const el = $('#hit'); if(el) el.innerHTML = hitLabel(currentRows().length);
}
const hitLabel = n => n
  ? `該当 <b>${fmt(n)}</b> 軒`
  : `<span class="na">該当する店がありません</span>`;

function doSearch(){
  PICK = null;
  go('result');
}
function doRoulette(){
  const rows = currentRows();
  PICK = roulette(rows);
  if(!PICK){ toast('条件に合う店がありません'); return; }
  save();
  go('result', { sub:'pick' });
}
