/* ============================================================
   10. 探す画面
   ============================================================ */
let Q      = { genres:[], kw:'', openOnly:false, radius:0, rate:0 };
let POS    = null;            // 検索の起点 { lat, lng, acc, label }
let GEO    = 'idle';          // idle | loading | ok | deny | fail
let GEOERR = '';
let PICK   = null;            // ルーレットで選ばれた店
let ORIGIN_BUSY = false;      // 駅名などの検索中か
/* 起点（POS）をどの方法で決めたか。'geo'=現在地 / 'place'=登録地点・前回の位置 /
   'search'=駅名やエリア名の検索。POS.label の文字列比較で判定すると、
   登録地点の名前と検索した駅名がたまたま同じ場合に誤判定するため、
   ここで明示的に区別する */
let ORIGIN_SOURCE = null;

/* 歩いて行ける範囲（時速5kmで換算。5分≒420m）。0 は絞らない */
const RADIUS_OPTS = [
  [420,  '徒歩5分以内'],
  [840,  '徒歩10分以内'],
  [1680, '徒歩20分以内'],
  [0,    '30分以上もOK（すべて）'],
];
/* My評価（★の数）での絞り込み */
const RATE_OPTS = [[0,'すべて'],[3,'★3以上'],[4,'★4以上'],[5,'★5']];

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
      /* GPSの応答には数秒かかることがある。その間に駅名検索や登録地点の選択で
         起点が既に確定していたら、あとから届いたこの結果で上書きしない
         （「駅名で探す」を選んでも現在地が優先されてしまう不具合の原因だった） */
      if(GEO !== 'loading') return;
      POS = { lat:p.coords.latitude, lng:p.coords.longitude,
              acc:Math.round(p.coords.accuracy||0), label:'現在地' };
      GEO = 'ok'; ORIGIN_SOURCE = 'geo';
      DB.settings.lastPos = { lat:POS.lat, lng:POS.lng, at:today() };
      save(); renderKeepingOriginInput();
    },
    e => {
      if(GEO !== 'loading') return;   // 同様に、その間に起点が決まっていれば無視する
      GEO = (e && e.code === 1) ? 'deny' : 'fail';
      GEOERR = (e && e.code === 1)
        ? '位置情報の利用が許可されていません'
        : '現在地を取得できませんでした';
      renderKeepingOriginInput();
    },
    { enableHighAccuracy:true, timeout:10000, maximumAge:60000 }
  );
}

/** GPSの応答は非同期で、ユーザーが駅名欄（#origin-q）に入力している最中に
    届くことがある。ふつうの render() は #view の中身を丸ごと作り直すため、
    入力中の文字がその瞬間に消えてしまい、消えたことに気づかないまま
    Enterを押すと空文字で検索され、現在地のまま取り残されたように見えていた。
    ここだけは値をいったん保存し、再描画のあとに書き戻す */
function renderKeepingOriginInput(){
  const el = $('#origin-q');
  const hadFocus = el && document.activeElement === el;
  const v = el ? el.value : '';
  render();
  if(v){
    const el2 = $('#origin-q');
    if(el2){
      el2.value = v;
      if(hadFocus) el2.focus();
    }
  }
}

/** 登録しておいた地点を起点にする */
function usePlace(id){
  if(!id){ POS = null; GEO = 'idle'; ORIGIN_SOURCE = null; render(); return; }
  if(id === '__last'){
    const p = DB.settings.lastPos;
    if(p){ POS = { lat:p.lat, lng:p.lng, acc:0, label:`前回の位置（${p.at}）` }; GEO = 'ok'; ORIGIN_SOURCE = 'place'; }
    render(); return;
  }
  const p = (DB.settings.places||[]).find(x => x.id === id);
  if(p){ POS = { lat:p.lat, lng:p.lng, acc:0, label:p.label }; GEO = 'ok'; ORIGIN_SOURCE = 'place'; }
  render();
}

/** 駅名やエリア名で地点を検索し、そのまま検索の起点にする（Places APIを1回だけ使う）。
    店の位置取得と同じ 07-places.js の searchPlace() を呼ぶだけで、
    ここから直接 fetch はしない（API を叩く箇所を1つに保つため）。
    見つかったら、ボタンを押さず結果一覧まで直行する（駅名入力が主な使い方のため） */
async function searchOriginByName(q){
  const query = String(q||'').trim();
  if(!query) return;
  if(!DB.settings.apiKey){
    alert('駅名やエリア名での検索には設定タブでAPIキーを入れる必要があります。\n'
        + 'キーが無い場合は設定タブから緯度経度で地点を登録することもできます。');
    return;
  }
  if(quotaLeft() <= 0){ alert('本日のAPI利用上限に達しています。日付が変わるとまた使えます。'); return; }

  ORIGIN_BUSY = true; render();
  let found = false;
  try{
    const places = await searchPlace(query, '', POS || DB.settings.lastPos);
    const np = places.length ? normPlace(places[0]) : null;
    if(!np || np.lat == null){ toast('見つかりませんでした'); return; }
    POS = { lat:np.lat, lng:np.lng, acc:0, label: np.name || query };
    GEO = 'ok'; ORIGIN_SOURCE = 'search';
    DB.settings.lastPos = { lat:POS.lat, lng:POS.lng, at:today() };
    /* 範囲が「すべて」のままだと、登録済みの店が全国に散らばっている場合、
       結果の地図が全国表示になってしまう。駅名検索は「その駅の周辺」が
       目的のはずなので、まだ絞っていなければ徒歩20分を既定にする
       （すでに自分で範囲を選んでいた場合は、その選択を尊重して変えない） */
    if(!Q.radius) Q.radius = 1680;
    found = true;
  }catch(e){
    alert(typeof apiErrorHint === 'function' ? apiErrorHint(e) : ('検索に失敗しました: ' + e.message));
  }finally{
    ORIGIN_BUSY = false; save();
    if(found) doSearch();        // そのまま結果一覧へ（内部で render 相当の go() を呼ぶ）
    else render();
  }
}
/** 検索欄（#origin-q）の値を読んで searchOriginByName に渡す */
function doOriginSearch(){
  return searchOriginByName((($('#origin-q')||{}).value) || '');
}

/** 探す画面を開いたら一度だけ位置を取りにいく */
AFTER.find = () => { if(GEO === 'idle' && !POS) locate(); };

/* ------------------------------------------------------------
   画面
   ------------------------------------------------------------ */
VIEWS.find = () => {
  const n = currentRows().length;
  return `
  <div class="pad find">
    ${posCardHTML()}

    <section class="fsec">
      <h3 class="flbl">何が食べたい？</h3>
      <div id="f-genres" class="chips">${findGenreChips()}</div>
    </section>

    <section class="fsec">
      <h3 class="flbl">キーワード</h3>
      <div class="search">
        <span class="ico">🔍</span>
        <input id="f-kw" class="fld" type="search" placeholder="つけ麺、一人向き、新宿 …"
               value="${esc(Q.kw)}" oninput="onFindKw(this.value)">
      </div>
    </section>

    <section class="fsec">
      <div class="fsub">
        <span class="flbl inline">徒歩</span>
        <div id="f-radius" class="seg">${radiusSegHTML()}</div>
      </div>
      <p id="f-radius-note" class="mini">${radiusNoteHTML()}</p>
    </section>

    <section class="fsec cond-row">
      <label class="toggle">
        <input type="checkbox" ${Q.openOnly?'checked':''}
          onchange="Q.openOnly=this.checked; updateHits()">
        <span class="track"></span><span>営業中</span>
      </label>
      <div class="fsub">
        <span class="flbl inline">My評価</span>
        <select id="f-rate" class="fld sm" onchange="setRate(this.value)">${rateOptionsHTML()}</select>
      </div>
    </section>

    <div class="cta">
      <button class="pri big" onclick="doSearch()">この条件で探す<span id="hit" class="cnt">${hitLabel(n)}</span></button>
      <button class="big outline" onclick="doRoulette()">🎲 おまかせガチャ</button>
    </div>

    ${DB.shops.length ? '' : `<div class="note mt">
      まだ店が登録されていません。<a onclick="go('shops')">お店タブ</a>で追加するか、
      <a onclick="go('data')">取込タブ</a>から Google マップの CSV を読み込んでください。</div>`}
  </div>`;
};

/* My評価はリストから選ぶ（選択肢が増えても横に溢れないよう select にしている） */
function rateOptionsHTML(){
  return RATE_OPTS.map(([v,l]) =>
    `<option value="${v}" ${num(Q.rate)===v?'selected':''}>${l}</option>`).join('');
}
/* 区切りボタン（セグメント）。選び直したときは、その箱の中身だけ差し替える */
function radiusSegHTML(){
  return RADIUS_OPTS.map(([v]) =>
    `<button type="button" class="${num(Q.radius)===v?'on':''}" onclick="setRadius(${v})">${v ? walkMin(v)+'分' : 'すべて'}</button>`).join('');
}
const radiusNoteHTML = () => (Q.radius && !POS) ? '起点が決まると、この範囲で絞られます' : '';
function setRate(v){
  Q.rate = num(v);
  updateHits();
}
function setRadius(v){
  Q.radius = num(v);
  const el = $('#f-radius'); if(el) el.innerHTML = radiusSegHTML();
  const nt = $('#f-radius-note'); if(nt) nt.textContent = radiusNoteHTML();
  updateHits();
}

function posCardHTML(){
  return originPickerHTML();
}

/** 起点の切替。開閉せず常に表示し、2行にまとめる：
    1行目＝現在地ボタン（いまの起点が現在地かどうかもここで表す）＋登録済みの地点、
    2行目＝駅名やエリア名の検索。
    かつては上に状態だけのバッジを別枠で出していたが、ボタンと表示が
    二重になっていたため、現在地ボタン自身に状態を持たせて一本化した。

    駅名検索は「Enterキーで送信」だけに頼っていたが、機種やソフトウェア
    キーボードによっては送信されず、現在地のままになっているように
    見える不具合が繰り返し起きていた。確実性を上げるため、
    ①押せばすぐ分かる「検索」ボタンを常設し、
    ②駅名・エリア名で検索中（または検索結果が起点になっている）あいだは
      入力欄とボタンの背景を赤くして、今はそちらが優先されていることを
      ひと目でわかるようにしている */
function originPickerHTML(){
  const places = DB.settings.places || [];
  const hasLast = !!DB.settings.lastPos;
  const usingHere = GEO === 'ok' && POS && ORIGIN_SOURCE === 'geo';
  const usingPlaceSearch = GEO === 'ok' && POS && ORIGIN_SOURCE === 'search';
  const hereLabel = GEO === 'loading' ? '📍 現在地を確認中…'
                   : usingHere          ? '📍 現在地（選択中）'
                   :                      '📍 現在地を使う';
  const lastLabel = hasLast ? `前回の位置（${esc(DB.settings.lastPos.at)}）` : '';
  return `
    <div class="note origin-pick mt">
      <div class="row">
        <button class="sm ${usingHere?'on':''}" onclick="locate()">${hereLabel}</button>
        ${(places.length || hasLast) ? `
          <select class="fld sm" onchange="usePlace(this.value)">
            <option value="">登録地点から選ぶ</option>
            ${hasLast ? `<option value="__last" ${POS && POS.label===lastLabel?'selected':''}>${lastLabel}</option>` : ''}
            ${places.map(p => `<option value="${esc(p.id)}" ${POS && POS.label===p.label?'selected':''}>${esc(p.label)}</option>`).join('')}
          </select>` : ''}
      </div>
      ${(GEO === 'deny' || GEO === 'fail') ? `<p class="mini warnmsg">${esc(GEOERR)}</p>` : ''}
      <form class="search mt ${usingPlaceSearch?'on':''}" onsubmit="event.preventDefault(); doOriginSearch();">
        <span class="ico">🔍</span>
        <input id="origin-q" class="fld" type="search" enterkeyhint="search"
               value="${usingPlaceSearch ? esc(POS.label) : ''}"
               placeholder="駅名やエリア名で探す（例: 渋谷駅）" ${ORIGIN_BUSY?'disabled':''}>
        <button type="submit" class="sm" ${ORIGIN_BUSY?'disabled':''}>検索</button>
      </form>
      ${ORIGIN_BUSY ? '<p class="mini">検索中…</p>' : ''}
      ${usingPlaceSearch ? `<p class="mini warnmsg">📍 「${esc(POS.label)}」を起点にしています</p>` : ''}
      ${DB.settings.apiKey ? ''
        : `<p class="mini">駅名検索にはAPIキーの設定が必要です（<a onclick="go('set')">設定</a>）。
             キーが無い場合は<a onclick="go('set')">設定</a>から緯度経度で地点を登録することもできます。</p>`}
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
const hitLabel = n => `${fmt(n)}軒`;

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
