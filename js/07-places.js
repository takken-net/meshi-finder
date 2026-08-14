/* ============================================================
   7. Google Places API (New) 連携

   店名から座標・カテゴリ・営業時間を取ってきます。

   ※ 番号が 07 なのは、05-search.js の normHours / guessGenres を
     使うためです（読み込み順とファイル番号は必ず一致させています）。

   ■ 課金事故を防ぐための決まり（勝手に緩めないこと）
     1. API を叩くのはこのファイルの中だけ
     2. 1店につき1回だけ。placeId が入った店は二度と叩かない
     3. 逐次実行。並列にしない
     4. 自動リトライのループを作らない。失敗は記録して人が再開する
     5. 日次上限に達したら止める。キューは残るので翌日そのまま続けられる
     6. フィールドマスクを増やすときは SKU 帯が上がらないか必ず確認する

   ■ 料金の帯（2026年8月時点）
     Pro        … 座標・住所・カテゴリまで        無料枠 月5,000回ほど
     Enterprise … 上記＋営業時間・評価・価格帯    無料枠 月1,000回ほど
     settings.fetchHours を false にすると Pro 帯に落とせます
   ============================================================ */
const PLACES_SEARCH = 'https://places.googleapis.com/v1/places:searchText';
const PLACES_DETAIL = 'https://places.googleapis.com/v1/places/';

/* 取得する項目。増やすと料金の帯が上がることがあります */
const MASK_PRO = [
  'places.id','places.displayName','places.formattedAddress','places.location',
  'places.types','places.primaryType','places.primaryTypeDisplayName',
  'places.googleMapsUri','places.businessStatus','places.utcOffsetMinutes',
].join(',');
const MASK_HOURS = [
  'places.regularOpeningHours','places.rating','places.userRatingCount','places.priceLevel',
].join(',');

/** いま使うフィールドマスク */
const fieldMask = () => DB.settings.fetchHours ? (MASK_PRO + ',' + MASK_HOURS) : MASK_PRO;
/** 詳細取得のマスクは places. の接頭辞が付きません（ここを間違えると 400 になります） */
const detailMask = () => fieldMask().split(',').map(s => s.replace(/^places\./, '')).join(',');

let API_GAP = 250;          // 1件ごとの間隔（ミリ秒）。テストでは 0 にする
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ------------------------------------------------------------
   使用回数の管理
   ------------------------------------------------------------ */
function bumpUsage(){
  const s = DB.settings;
  if(s.usage.date !== today()) s.usage = { date: today(), n: 0 };
  s.usage.n = num(s.usage.n) + 1;
}
/** 本日あと何回叩けるか */
function quotaLeft(){
  const s = DB.settings;
  if(s.usage.date !== today()) return num(s.dailyLimit);
  return Math.max(0, num(s.dailyLimit) - num(s.usage.n));
}

/* ------------------------------------------------------------
   通信

   レスポンスを店の形に直す normPlace は副作用のない関数にしてあります
   （テストでモックを流し込めるようにするため）。
   ------------------------------------------------------------ */
async function callPlaces(url, init){
  const res = await fetch(url, init);
  if(!res.ok){
    let detail = '';
    try{ const j = await res.json(); detail = (j && j.error && j.error.message) || ''; }catch(e){}
    const err = new Error(detail || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function needKey(){
  if(DB.settings.apiKey) return null;
  const e = new Error('APIキーが設定されていません');
  e.status = 0;
  return e;
}

/** 店名で検索する。候補を最大5件返す */
async function searchPlace(name, hint, pos){
  const e = needKey(); if(e) throw e;
  const body = {
    textQuery: [name, hint].filter(Boolean).join(' '),
    languageCode: 'ja', regionCode: 'JP', maxResultCount: 5,
  };
  /* 起点があれば近くを優先する。同名のチェーン店を取り違えにくくなる */
  if(pos && pos.lat != null)
    body.locationBias = { circle: { center: { latitude: num(pos.lat), longitude: num(pos.lng) },
                                    radius: 50000 } };
  bumpUsage();
  const j = await callPlaces(PLACES_SEARCH, {
    method: 'POST',
    headers: { 'Content-Type':'application/json',
               'X-Goog-Api-Key': DB.settings.apiKey,
               'X-Goog-FieldMask': fieldMask() },
    body: JSON.stringify(body),
  });
  return (j && j.places) || [];
}

/** place_id が分かっている店。候補が出ないので確実 */
async function getPlaceDetails(placeId){
  const e = needKey(); if(e) throw e;
  bumpUsage();
  return callPlaces(PLACES_DETAIL + encodeURIComponent(placeId) + '?languageCode=ja&regionCode=JP', {
    headers: { 'X-Goog-Api-Key': DB.settings.apiKey,
               'X-Goog-FieldMask': detailMask() },
  });
}

/** API のレスポンス1件 → 店のフィールド */
function normPlace(p){
  if(!p) return null;
  const loc = p.location || {};
  return {
    placeId:     p.id || '',
    name:        (p.displayName && p.displayName.text) || '',
    lat:         loc.latitude  != null ? Number(loc.latitude)  : null,
    lng:         loc.longitude != null ? Number(loc.longitude) : null,
    addr:        p.formattedAddress || '',
    types:       Array.isArray(p.types) ? p.types.slice() : [],
    primaryType: p.primaryType || '',
    typeJa:      (p.primaryTypeDisplayName && p.primaryTypeDisplayName.text) || '',
    hours:       normHours(p.regularOpeningHours),
    utcOffset:   p.utcOffsetMinutes != null ? Number(p.utcOffsetMinutes) : 540,
    bizStatus:   p.businessStatus || '',
    gRating:     num(p.rating), gCount: num(p.userRatingCount),
    priceLevel:  p.priceLevel || '',
    mapsUri:     p.googleMapsUri || '',
  };
}

/** 取得した内容を店に反映する。ユーザー資産（評価・タグ・メモ・店名）は触らない */
function applyPlace(sh, np){
  if(!np) return sh;
  if(np.placeId)          sh.placeId    = np.placeId;
  if(np.lat != null){     sh.lat = np.lat; sh.lng = np.lng; }
  if(np.addr)             sh.addr       = np.addr;
  if(np.types.length)     sh.types      = np.types;
  if(np.primaryType)      sh.primaryType= np.primaryType;
  if(np.typeJa)           sh.typeJa     = np.typeJa;
  if(np.hours)            sh.hours      = np.hours;
  if(np.utcOffset != null)sh.utcOffset  = np.utcOffset;
  if(np.bizStatus)        sh.bizStatus  = np.bizStatus;
  if(np.gRating)          sh.gRating    = np.gRating;
  if(np.gCount)           sh.gCount     = np.gCount;
  if(np.priceLevel)       sh.priceLevel = np.priceLevel;
  if(np.mapsUri)          sh.mapsUri    = np.mapsUri;
  if(!sh.srcId && np.placeId) sh.srcId  = 'pid:' + np.placeId;

  /* 店名は上書きしません。ユーザーが Google マップで見て登録した名前のほうが
     本人にとって分かりやすいためです */
  if(!sh.genresManual) sh.genres = guessGenres(sh);

  sh.fetchedAt = today();
  sh.status = 'ok'; sh.err = ''; sh.cands = null;
  sh.updatedAt = today();
  delete sh._hay;
  return sh;
}

/** 候補から1つに決められるか判断する。決められなければ候補を返して人に選んでもらう */
function pickCandidate(name, places){
  const list = (places || []).map(normPlace).filter(Boolean);
  if(!list.length) return { pick: null, cands: [] };

  const key = normName(name);
  const alive = list.filter(p => p.bizStatus !== 'CLOSED_PERMANENTLY');
  const exact = alive.filter(p => normName(p.name) === key);
  if(exact.length === 1) return { pick: exact[0], cands: [] };

  /* 結果が1件だけで、名前がどちらかを含んでいれば同じ店とみなす
     （「麺屋こうじ」と「麺屋こうじ 本店」のような揺れを拾うため） */
  if(alive.length === 1){
    const k = normName(alive[0].name);
    if(k && key && (k.includes(key) || key.includes(k))) return { pick: alive[0], cands: [] };
  }
  return { pick: null, cands: list.slice(0, 3) };
}

/** 1軒を解決する。'ok' | 'ambiguous' | 'failed' を返す */
async function resolveShop(sh){
  if(sh.placeId){
    applyPlace(sh, normPlace(await getPlaceDetails(sh.placeId)));
    return 'ok';
  }
  const places = await searchPlace(sh.name, sh.addr, POS || DB.settings.lastPos);
  if(!places.length){
    sh.status = 'failed'; sh.err = 'ZERO_RESULTS'; sh.updatedAt = today();
    return 'failed';
  }
  const { pick, cands } = pickCandidate(sh.name, places);
  if(pick){ applyPlace(sh, pick); return 'ok'; }
  sh.status = 'ambiguous'; sh.cands = cands; sh.updatedAt = today();
  return 'ambiguous';
}

/* ------------------------------------------------------------
   キュー処理

   位置が未取得の店を1軒ずつ片づけます。
   途中で止めても、翌日でも、続きから再開できます。
   ------------------------------------------------------------ */
let QRUN = false;       // 実行中か
let QSTOP = false;      // 中断が押されたか
let QMSG  = '';         // 画面に出す状況
let QDONE = 0, QNG = 0, QAMB = 0;

const queueLeft = () => DB.queue.length;

function stopQueue(){ QSTOP = true; }

async function runQueue(){
  if(QRUN) return;
  if(!DB.settings.apiKey){ QMSG = 'APIキーが設定されていません。設定タブで入れてください。'; render(); return; }

  QRUN = true; QSTOP = false; QMSG = '';
  QDONE = 0; QNG = 0; QAMB = 0;
  const retry = {};                       // 店ID → 通信エラーの回数
  render();

  while(DB.queue.length){
    if(QSTOP){ QMSG = '中断しました。あとで続きから再開できます。'; break; }
    if(quotaLeft() <= 0){
      QMSG = `本日の上限（${fmt(DB.settings.dailyLimit)}回）に達しました。日付が変わればまた続けられます。`;
      break;
    }

    const id = DB.queue[0];
    const sh = shopOf(id);
    if(!sh){ DB.queue.shift(); continue; }
    if(sh.lat != null && sh.placeId){ DB.queue.shift(); continue; }   // すでに済んでいる

    try{
      const r = await resolveShop(sh);
      if(r === 'ok') QDONE++; else if(r === 'ambiguous') QAMB++; else QNG++;
      DB.queue.shift();
    }catch(e){
      const st = e.status;

      /* 403 は設定の誤りで、続けても全件同じ結果になります。無駄に叩かず止めます */
      if(st === 403 || st === 401 || st === 0){
        QMSG = apiErrorHint(e);
        break;
      }
      if(st === 429){
        QMSG = 'Google 側の上限に達しました。時間をおいてから再開してください。';
        break;
      }
      /* 通信の失敗だけは、その店を末尾へ回して先に進みます（同じ店で止まらないように）。
         3回続けて失敗したら諦めます。※自動で無限に叩き直すことはしません */
      retry[id] = (retry[id] || 0) + 1;
      if(retry[id] >= 3){
        sh.status = 'failed'; sh.err = String(e.message || '通信エラー');
        DB.queue.shift(); QNG++;
      }else{
        DB.queue.shift(); DB.queue.push(id);
      }
    }

    save();
    updateQueueProgress();
    if(API_GAP) await sleep(API_GAP);
  }

  QRUN = false;
  clearHay();
  save(); render();
  if(!QMSG) toast(`${QDONE} 軒の位置情報を取得しました`);
}

/** 403 のときに何を直せばよいか具体的に伝える（ここで一番つまずくため） */
function apiErrorHint(e){
  if(e.status === 0) return 'APIキーが設定されていません。設定タブで入れてください。';
  return 'APIキーが拒否されました（403）。次のどれかが原因です：\n'
       + '・キーの「アプリケーションの制限」に、いま開いている URL が入っていない\n'
       + '・キーの「API の制限」で Places API (New) が許可されていない\n'
       + '・Google Cloud で Places API (New) が有効になっていない\n'
       + '・請求先アカウントが紐づいていない\n'
       + `（Google からの返答: ${e.message}）`;
}

/** 進み具合だけを差し替える（全体を再描画すると重いため） */
function updateQueueProgress(){
  const el = $('#qprog');
  if(el) el.innerHTML = queueProgressHTML();
}
function queueProgressHTML(){
  const left = queueLeft();
  return `
    <div class="row between">
      <span>残り <b>${fmt(left)}</b> 軒</span>
      <span class="mini">本日 ${fmt(DB.settings.usage.n)} / ${fmt(DB.settings.dailyLimit)} 回</span>
    </div>
    ${QRUN ? `<p class="mini">取得中… 済 ${fmt(QDONE)}／要確認 ${fmt(QAMB)}／失敗 ${fmt(QNG)}</p>` : ''}`;
}

/* ------------------------------------------------------------
   候補が複数出た店を、人が選んで確定する
   ------------------------------------------------------------ */
function chooseCand(shopId, i){
  const sh = shopOf(shopId); if(!sh || !sh.cands) return;
  const c = sh.cands[num(i)]; if(!c) return;
  applyPlace(sh, c);
  clearHay(); save(); render();
  toast('確定しました');
}
/** どれでもない場合。手で位置を入れてもらう */
function rejectCands(shopId){
  const sh = shopOf(shopId); if(!sh) return;
  sh.status = 'failed'; sh.err = 'NO_MATCH'; sh.cands = null;
  save(); render();
}

/** 1軒だけ取り直す（店の詳細画面から） */
async function refetchShop(id){
  const sh = shopOf(id); if(!sh) return;
  if(!DB.settings.apiKey){ alert('APIキーが設定されていません。設定タブで入れてください。'); return; }
  if(quotaLeft() <= 0){ alert('本日の上限に達しました。'); return; }
  try{
    await resolveShop(sh);
    clearHay(); save(); render();
    toast(sh.status === 'ok' ? '取得しました' : sh.status === 'ambiguous' ? '候補が複数あります' : '見つかりませんでした');
  }catch(e){
    alert(apiErrorHint(e));
    save(); render();
  }
}

/** 設定画面の「接続テスト」。1回だけ叩いて、つながるか確かめる */
async function testApiKey(){
  const el = $('#api-test');
  if(!DB.settings.apiKey){ if(el) el.innerHTML = '<span class="ng">キーが空です</span>'; return; }
  if(el) el.innerHTML = '<span class="mini">確認中…</span>';
  try{
    const places = await searchPlace('東京駅', '', null);
    save();
    if(el) el.innerHTML = places.length
      ? '<span class="okmsg">つながりました</span>'
      : '<span class="ng">つながりましたが結果が空でした</span>';
  }catch(e){
    if(el) el.innerHTML = `<span class="ng">${esc(apiErrorHint(e))}</span>`;
    save();
  }
}
