/* ============================================================
   6. 画面ルーター・共通パーツ

   描画の作法（既存の受発注システムからの拡張）:

     render()        … タブを切り替えたとき。画面全体を組み直す
     renderResults() … 絞り込み条件が変わったとき。結果の箱だけ差し替える

   キーワード入力のたびに render() を呼ぶと、日本語変換の途中で
   入力欄が作り直されて確定できなくなります。入力中は必ず
   renderResults() のほうを使ってください。
   ============================================================ */
let TAB = 'find';
let SEL = { shop:null, sub:'', edit:false };
let MAP = null;                       // Leaflet の地図インスタンス（12-map.js が使う）

const VIEWS = {};                     // タブ → HTML文字列を返す関数
const AFTER = {};                     // タブ → 描画後フック（地図の生成などDOM操作が要る処理）

function go(t, opt){
  TAB = t;
  SEL.sub = (opt && opt.sub) || '';
  if(!opt || !opt.keepShop) SEL.shop = null;
  SEL.edit = false;
  render();
  if(typeof window !== 'undefined' && window.scrollTo) window.scrollTo(0, 0);
}

function render(){
  /* 地図は DOM を差し替える前に必ず破棄する。
     残したまま innerHTML を書き換えるとイベントが宙に浮いて後で落ちる */
  if(MAP){ try{ MAP.remove(); }catch(e){} MAP = null; }

  $('#nav').innerHTML = TABS.map(([k,l,ic]) =>
    `<button class="${k===TAB?'on':''}" onclick="go('${k}')">
       <i>${ic}</i><span>${l}</span></button>`).join('');

  $('#view').innerHTML = (VIEWS[TAB] || (()=>emptyBox('準備中です')))();

  if(AFTER[TAB]) AFTER[TAB]();
}

/** 結果の一覧だけを差し替える（入力欄のフォーカスと日本語変換を壊さない） */
function renderResults(){
  const el = $('#results');
  if(el && typeof resultListHTML === 'function') el.innerHTML = resultListHTML();
}

/* ------------------------------------------------------------
   共通パーツ
   ------------------------------------------------------------ */
const emptyBox = (msg, sub) =>
  `<div class="empty"><p>${esc(msg)}</p>${sub?`<p class="mini">${sub}</p>`:''}</div>`;

/** ★の表示（0〜5）。n=0 は「未評価」 */
function stars(n){
  const v = Math.max(0, Math.min(5, Math.round(num(n))));
  return v ? `<span class="stars">${'★'.repeat(v)}<span class="off">${'★'.repeat(5-v)}</span></span>`
           : `<span class="stars off">${'★'.repeat(5)}</span>`;
}
/** タップで選べる★（onpick には 0〜5 を受ける関数名を渡す） */
function starPicker(n, onpick){
  const v = Math.max(0, Math.min(5, Math.round(num(n))));
  return `<span class="stars pick">${[1,2,3,4,5].map(i =>
    `<b class="${i<=v?'':'off'}" onclick="${onpick}(${i===v?0:i})">★</b>`).join('')}</span>`;
}

/** ジャンルのタグ列 */
const genreTags = ids => (ids||[]).map(id => {
  const g = genreOf(id);
  return `<span class="tag">${g.icon} ${esc(g.label)}</span>`;
}).join('');

/** Google マップで開くリンク（座標があれば座標、無ければ店名で検索） */
function mapsUrl(sh){
  if(sh.mapsUri) return sh.mapsUri;
  if(sh.placeId) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(sh.name)}&query_place_id=${encodeURIComponent(sh.placeId)}`;
  if(sh.lat != null) return `https://www.google.com/maps/search/?api=1&query=${sh.lat},${sh.lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(sh.name)}`;
}
/** 経路案内のリンク */
const routeUrl = sh => sh.lat != null
  ? `https://www.google.com/maps/dir/?api=1&destination=${sh.lat},${sh.lng}`
  : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(sh.name)}`;

/** 食べログのリンク。店ページのURLが登録してあれば直接、
    無ければ 店名＋エリア（住所から抽出）で食べログ内を検索する */
function tabelogUrl(sh){
  if(sh.tabelog) return sh.tabelog;
  /* Google の住所は「日本、〒160-0023 東京都新宿区西新宿…」の形で来る。
     郵便番号などを外してから「〜市／区／町／村」までをエリア語として使う */
  const addr = String(sh.addr || '').replace(/日本[、,]?/,'').replace(/〒[\d-]+\s*/,'');
  const m = /(?:都|道|府|県)(.+?[市区町村])/.exec(addr) || /^(.+?[市区町村])/.exec(addr);
  const area = m ? m[1] : '';
  return `https://tabelog.com/rst/rstsearch/?sk=${encodeURIComponent(sh.name)}`
       + (area ? `&sa=${encodeURIComponent(area)}` : '');
}

/** 位置情報が未取得の店の数 */
const pendingCount = () => DB.shops.filter(s => s.lat == null).length;
