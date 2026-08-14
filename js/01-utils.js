/* ============================================================
   1. 定数・ユーティリティ
   ============================================================ */
const LS_KEY = 'meshi_finder_v1';

/* [キー, ラベル, アイコン] */
const TABS = [
  ['find',   '探す', '🔍'],
  ['result', '結果', '📋'],
  ['shops',  'お店', '🏠'],
  ['data',   '取込', '📥'],
  ['set',    '設定', '⚙'],
];

const $  = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const num = v => { const n = Number(String(v??'').replace(/[, 　]/g,'')); return isFinite(n)?n:0; };
const fmt = n => (Math.round(num(n))).toLocaleString('ja-JP');
const fmt1 = n => num(n).toLocaleString('ja-JP',{maximumFractionDigits:1});
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = p => p + '-' + Math.random().toString(36).slice(2,8);

/* ------------------------------------------------------------
   日付（UTC基準）— 既存の受発注システムと同じ作法

   'YYYY-MM-DD' という「日付だけ」の値を、時刻やタイムゾーンの影響を
   受けずに足し引きするための仕組みです。
   new Date('2026-08-07') をローカル時刻で扱うと日本時間で1日ずれます。
   ------------------------------------------------------------ */
const ymd = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
const today = () => { const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const D = s => { const m=/^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(s||''));
  return m ? new Date(Date.UTC(+m[1],+m[2]-1,+m[3])) : null; };
const addDays = (s,n)=>{ const d=D(s); if(!d) return s; d.setUTCDate(d.getUTCDate()+num(n)); return ymd(d); };
const diffDays = (a,b)=>{ const x=D(a),y=D(b); if(!x||!y) return 0; return Math.round((y-x)/86400000); };
const md = s => s ? s.slice(5).replace('-','/') : '—';

/* ------------------------------------------------------------
   時刻（ローカル時刻）— 上の日付計算とは目的が違うので混ぜないこと

   営業中かどうかの判定には「その店の現地時刻」が必要です。
   Places API の営業時間は店舗の現地時刻で返るため、UTCへ換算してはいけません。

   ・ローカル時刻を使う関数はこの2つだけです。
     ほかの場所で getHours() / getDay() を直接呼ばないでください。
   ・テストで時刻を差し込めるよう、必ず日時を引数で受け取ります
     （関数の中で new Date() を暗黙に使わない）。
   ------------------------------------------------------------ */
const WEEK_MIN = 10080;                    // 7日 × 24時間 × 60分
const WDAY = ['日','月','火','水','木','金','土'];

/** 端末のローカル時刻を「週の通し分」で返す（日曜0:00 = 0、土曜23:59 = 10079） */
function nowWeekMin(d = new Date()){
  return d.getDay()*1440 + d.getHours()*60 + d.getMinutes();
}
/** 店の現地時刻での週通し分。utcOffset が無ければ日本時間（+540分）とみなす */
function shopWeekMin(shop, d = new Date()){
  const off = (shop && shop.utcOffset != null) ? num(shop.utcOffset) : 540;
  /* UTCミリ秒に店のオフセットを足し、UTC系のゲッタで読む。
     こうすると端末のタイムゾーンに一切影響されない */
  const t = new Date(d.getTime() + off*60000);
  return t.getUTCDay()*1440 + t.getUTCHours()*60 + t.getUTCMinutes();
}
/** 週通し分を「日 21:30」の形に */
function weekMinLabel(m){
  const x = ((num(m) % WEEK_MIN) + WEEK_MIN) % WEEK_MIN;
  const h = Math.floor(x%1440/60), mi = x%60;
  return `${WDAY[Math.floor(x/1440)]} ${String(h).padStart(2,'0')}:${String(mi).padStart(2,'0')}`;
}

/* ------------------------------------------------------------
   文字列の正規化

   検索・重複判定・ジャンル判定のすべてでこの関数を共通に使います。
   これで「ラーメン」「らーめん」「ﾗｰﾒﾝ」が同じものとして扱われます。
   ------------------------------------------------------------ */
function normName(s){
  return String(s??'')
    .normalize('NFKC')                     // 全角英数→半角、半角カナ→全角カナ
    .toLowerCase()
    .replace(/[\s　]/g,'')                 // 空白（全角含む）を除去
    .replace(/[・･,，.、。'"’”`\-ー－—_/＼\\（）()\[\]【】「」『』〈〉!！?？&＆+＋*＊:：;；#＃@＠~〜]/g,'')
    .replace(/[ぁ-ゖ]/g, c=>String.fromCharCode(c.charCodeAt(0)+0x60));  // ひらがな→カタカナ
}

/* ------------------------------------------------------------
   距離
   ------------------------------------------------------------ */
const R_EARTH = 6371000;                   // 地球の平均半径（メートル）
const toRad = d => num(d)*Math.PI/180;

/** 2地点の直線距離（メートル）。座標が欠けていれば null */
function haversine(a, b){
  if(!a || !b) return null;
  if(a.lat==null || a.lng==null || b.lat==null || b.lng==null) return null;
  const la1 = toRad(a.lat), la2 = toRad(b.lat);
  const dLa = la2 - la1, dLo = toRad(b.lng) - toRad(a.lng);
  const h = Math.sin(dLa/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLo/2)**2;
  return Math.round(2*R_EARTH*Math.asin(Math.min(1, Math.sqrt(h))));
}
/** 距離の表示（1km未満はm、それ以上はkm） */
const fmtDist = m => m==null ? '—'
  : m < 1000 ? `${m}m`
  : `${(m/1000).toFixed(m<10000?1:0)}km`;

/* 徒歩時間は時速5kmで換算する（ユーザー指定） */
const WALK_M_PER_MIN = 5000/60;
const walkMin = m => m==null ? null : Math.max(1, Math.round(num(m)/WALK_M_PER_MIN));
/** 結果に出す距離の表記。徒歩60分までは「徒歩◯分・650m」、それ以上は距離だけ */
function distLabel(m){
  if(m == null) return '—';
  const w = walkMin(m);
  return w <= 60 ? `徒歩${w}分・${fmtDist(m)}` : fmtDist(m);
}

/* ------------------------------------------------------------
   通知
   ------------------------------------------------------------ */
function toast(msg){
  let t = $('#toast');
  if(!t){ t = document.createElement('div'); t.id='toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(t._t); t._t = setTimeout(()=>t.classList.remove('on'), 2600);
}
