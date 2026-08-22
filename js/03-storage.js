/* ============================================================
   3. ストレージ

   データはブラウザの localStorage に入ります（サーバー通信なし）。
   端末ごとに独立しているので、機種変更のときは設定画面から
   JSONバックアップを書き出して移してください。
   ============================================================ */
let DB, MEM = null;

/** 空のデータベース。サンプル店は入れない（実データを取り込む前提のため） */
function seed(){
  return {
    shops: [],
    visits: [],
    genres: JSON.parse(JSON.stringify(GENRES)),
    queue: [],
    settings: {
      apiKey: '',              // Places API キー（リポジトリには絶対に置かない）
      fetchHours: true,        // 営業時間も取得するか（false なら安いSKU帯に落ちる）
      dailyLimit: 100,         // アプリ側の自主上限（暴走を止める最後の砦）
      usage: { date: today(), n: 0 },
      places: [],              // よく使う地点（現在地が取れないときの代わり）
      lastPos: null,           // 直近の測位結果 {lat,lng,at}
      unknownHours: true,      // 営業時間が不明な店も結果に出す
      lastRoulette: '',        // 直前のルーレット結果（連続で同じ店を出さないため）
    },
    _v: 1,
  };
}

/** 1軒ぶんの空データ。フィールドを増やすときは migrate() にも追記すること */
function newShop(o){
  return Object.assign({
    id: uid('S'), name: '', nameKey: '',
    /* --- Places 由来（一度取得したら再取得しない） --- */
    placeId: '', lat: null, lng: null, addr: '',
    types: [], primaryType: '', typeJa: '',
    hours: null, utcOffset: 540, bizStatus: '',
    gRating: 0, gCount: 0, priceLevel: '', mapsUri: '', fetchedAt: '',
    /* --- ユーザー資産（Places の再取得・CSV再取込で絶対に上書きしない） --- */
    genres: [], genresManual: false, tags: [], myRate: 0, memo: '', fav: false,
    lists: [],                 // 取り込み元のリスト名／アカウント（複数に属せる）
    tabelog: '',               // 食べログの店ページURL（貼っておくと直接開ける）
    /* --- 管理 --- */
    srcUrl: '', srcId: '', src: 'manual',
    status: 'manual',          // ok | pending | ambiguous | failed | manual
    err: '', cands: null,
    createdAt: today(), updatedAt: today(),
  }, o||{});
}

function load(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(raw){ DB = JSON.parse(raw); migrate(); return; }
  }catch(e){ console.warn('localStorage が使えないためメモリ動作に切り替えます', e); }
  DB = MEM || seed();
  migrate();
}

/** 旧バージョンのデータを新形式へ。フィールドを増やしたらここに既定値を追記する */
function migrate(){
  DB.shops   ||= [];
  DB.visits  ||= [];
  DB.queue   ||= [];
  DB.genres  ||= JSON.parse(JSON.stringify(GENRES));
  DB.settings ||= {};

  const s = DB.settings;
  if(s.apiKey      == null) s.apiKey = '';
  if(s.fetchHours  == null) s.fetchHours = true;
  if(s.dailyLimit  == null) s.dailyLimit = 100;
  if(s.usage       == null) s.usage = { date: today(), n: 0 };
  if(s.places      == null) s.places = [];
  if(s.lastPos     == null) s.lastPos = null;
  if(s.unknownHours== null) s.unknownHours = true;
  if(s.lastRoulette== null) s.lastRoulette = '';

  /* 日付が変わっていたら本日の使用回数をリセット */
  if(s.usage.date !== today()) s.usage = { date: today(), n: 0 };

  /* 店は newShop() の既定で穴埋めする（欠けたフィールドがあっても落ちないように） */
  DB.shops = DB.shops.map(x => {
    const sh = newShop(x);
    sh.nameKey = normName(sh.name);
    if(sh.lat != null) sh.lat = num(sh.lat);
    if(sh.lng != null) sh.lng = num(sh.lng);
    delete sh._hay;                     // 検索用キャッシュは保存対象外
    return sh;
  });

  /* 消えた店を参照している訪問記録・キューを掃除する */
  const ids = new Set(DB.shops.map(x => x.id));
  DB.visits = DB.visits.filter(v => ids.has(v.shop));
  DB.queue  = DB.queue.filter(id => ids.has(id));

  DB._v = 1;
}

function save(){
  /* _hay は検索を速くするためのメモリ上のキャッシュ。保存には含めない */
  const json = JSON.stringify(DB, (k, v) => k === '_hay' ? undefined : v);
  try{ localStorage.setItem(LS_KEY, json); }
  catch(e){ MEM = DB; console.warn('保存できませんでした（メモリ動作）', e); }
}

/* ------------------------------------------------------------
   参照ヘルパ
   ------------------------------------------------------------ */
/** 登録されているリスト名を、店数の多い順に返す */
function allLists(){
  const n = {};
  for(const s of DB.shops) for(const l of (s.lists||[])) n[l] = (n[l]||0) + 1;
  return Object.keys(n).map(label => ({ label, n: n[label] }))
                       .sort((a,b) => b.n - a.n || a.label.localeCompare(b.label,'ja'));
}

const shopOf   = id => DB.shops.find(s => s.id === id) || null;
const visitsOf = id => DB.visits.filter(v => v.shop === id)
                          .sort((a,b) => (b.date||'').localeCompare(a.date||''));
/** 最後に行った日（'YYYY-MM-DD'）。記録が無ければ '' */
const lastVisit = id => (visitsOf(id)[0] || {}).date || '';

/** 店を保存する。名前の正規化キーと更新日は必ずここで揃える */
function putShop(sh){
  sh.nameKey  = normName(sh.name);
  sh.updatedAt = today();
  delete sh._hay;
  const i = DB.shops.findIndex(x => x.id === sh.id);
  if(i >= 0) DB.shops[i] = sh; else DB.shops.push(sh);
  return sh;
}
function delShop(id){
  DB.shops  = DB.shops.filter(s => s.id !== id);
  DB.visits = DB.visits.filter(v => v.shop !== id);
  DB.queue  = DB.queue.filter(x => x !== id);
}

/* ------------------------------------------------------------
   バックアップ
   ------------------------------------------------------------ */
/** バックアップの中身を作る。
    APIキーは含めない（バックアップはメール等で端末間を運ぶ前提のファイルであり、
    「キーは端末の外に出さない」という方針を守るため）。復元先で入れ直してもらう */
function backupJSON(){
  return JSON.stringify(DB,
    (k, v) => k === '_hay' ? undefined : k === 'apiKey' ? '' : v, 2);
}
function exportJSON(){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([backupJSON()], { type:'application/json' }));
  a.download = `食べ探バックアップ_${today()}.json`;
  a.click();
  toast('バックアップを書き出しました（APIキーは含まれません）');
}
function importJSON(inp){
  const f = inp.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = e => {
    try{
      const next = JSON.parse(e.target.result);
      if(!next || !Array.isArray(next.shops)) throw new Error('形式が違います');
      if(!confirm(`${next.shops.length} 軒のデータで置き換えます。今のデータは消えます。よろしいですか？`)) return;
      const key = (DB && DB.settings && DB.settings.apiKey) || '';   // この端末のキーは残す
      DB = next; migrate();
      if(!DB.settings.apiKey) DB.settings.apiKey = key;
      save(); render();
      toast(`${DB.shops.length} 軒を復元しました`);
    }catch(err){ alert('読み込めませんでした: ' + err.message); }
  };
  r.readAsText(f, 'utf-8');
  inp.value = '';
}
function resetAll(){
  if(!confirm('登録した店をすべて消して初期状態に戻します。よろしいですか？')) return;
  if(!confirm('本当に消してよろしいですか？ この操作は取り消せません。')) return;
  const key = DB.settings.apiKey;              // APIキーだけは残す（入れ直す手間を省くため）
  DB = seed(); DB.settings.apiKey = key;
  save(); render();
  toast('初期化しました');
}
