/* ============================================================
   16. 共有シートからの登録

   Google マップで店を見つけたら、★お気に入りを押すついでに
   「共有」→「食べ探」を選ぶだけで登録できるようにします。

   Android で PWA（ホーム画面に追加）にすると、manifest の share_target が効いて
   共有先の一覧にこのアプリが出ます。共有されると次の形で開きます。

     https://（このアプリのURL）/?title=...&text=...&url=...

   ■ 気をつけること
     ・受け取ったらすぐ history.replaceState でURLを消すこと。
       消さないと、再読み込みや PWA の再開のたびに同じ店が登録されてしまいます。
     ・Google マップが送ってくる中身は端末や状況で形が変わります。
       推測で決めつけず、必ず確認画面を出して人に直してもらいます。
   ============================================================ */
let SHARE = null;      // { name, addr, url } 共有されてきた内容

/** 起動時に1回だけ呼ぶ（20-boot.js）。共有で開かれたかを見る */
function handleShare(){
  if(typeof location === 'undefined') return;
  const q = new URLSearchParams(location.search || '');
  if(!q.has('title') && !q.has('text') && !q.has('url')) return;

  SHARE = parseShared(q.get('title') || '', q.get('text') || '', q.get('url') || '');

  /* URLからパラメータを消す。これを忘れると再読み込みで二重登録になる */
  try{ history.replaceState(null, '', location.pathname); }catch(e){}

  TAB = 'data'; SEL.sub = 'share';
}

/** 共有されたテキストから店名・住所・URLを取り出す */
function parseShared(title, text, url){
  const all = [title, text].filter(Boolean).join('\n');
  const urls = all.match(/https?:\/\/\S+/g) || [];
  const link = url || urls[0] || '';

  /* URLの行を取り除いた残りを上から見る。1行目を店名、次の行を住所の手がかりにする */
  const lines = all.split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => !/^https?:\/\//.test(s))
    .map(s => s.replace(/https?:\/\/\S+/g, '').trim())
    .filter(Boolean);

  /* URLからも店名や座標が取れることがあるので、足りない分を補う */
  const ex = parseMapsUrl(link);
  return {
    name: lines[0] || ex.name || '',
    addr: lines[1] || '',
    url:  link,
    lat:  ex.lat, lng: ex.lng,
    placeId: ex.placeId, srcId: ex.srcId,
  };
}

/* ------------------------------------------------------------
   確認して登録する
   ------------------------------------------------------------ */
function shareFormHTML(){
  if(!SHARE) return '';
  return `
    <h3 class="mt">共有された店</h3>
    <div class="note">
      <label class="lbl">店名</label>
      <input id="sh-name" class="fld" type="text" value="${esc(SHARE.name)}"
             placeholder="店名を入れてください">
      <label class="lbl">場所の手がかり<span class="mini">（住所や駅名。あると取り違えにくくなります）</span></label>
      <input id="sh-addr" class="fld" type="text" value="${esc(SHARE.addr)}">
      <label class="lbl">リスト<span class="mini">（任意）</span></label>
      <input id="sh-list" class="fld" type="text" value="${esc(shareDefaultList())}"
             placeholder="例: 共有から">
      ${SHARE.lat != null ? '<p class="mini mt">座標が読み取れました</p>' : ''}
      <div class="row gap mt">
        <button class="pri grow" onclick="saveShared()">この店を登録</button>
        <button onclick="cancelShared()">やめる</button>
      </div>
      <p class="mini">${DB.settings.apiKey
        ? '登録後、Google から座標・カテゴリ・営業時間を取りにいきます。'
        : '位置情報はあとでまとめて取得できます（設定タブでAPIキーを入れた場合）。'}</p>
    </div>`;
}
const shareDefaultList = () => (allLists().find(l => l.label === '共有から') ? '共有から' : '共有から');

function cancelShared(){ SHARE = null; SEL.sub = ''; render(); }

async function saveShared(){
  if(!SHARE) return;
  const name = (($('#sh-name')||{}).value || '').trim();
  if(!name){ alert('店名を入れてください'); return; }
  const addr = (($('#sh-addr')||{}).value || '').trim();
  const list = (($('#sh-list')||{}).value || '').trim();

  const cand = newShop({
    name, addr, srcUrl: SHARE.url, src: 'share',
    placeId: SHARE.placeId || '', srcId: SHARE.srcId || '',
    lat: SHARE.lat, lng: SHARE.lng,
    lists: list ? [list] : [],
    status: SHARE.lat != null ? 'ok' : 'pending',
  });
  cand.nameKey = normName(name);
  cand.genres  = guessGenres(cand);

  /* すでに登録済みなら重ねるだけ。同じ店が二重に増えないようにする */
  const dup = findDup(cand, DB.shops);
  let target;
  if(dup.hit && !dup.check){
    target = mergeShop(dup.hit, cand);
    toast('すでに登録済みの店でした');
  }else{
    target = putShop(cand);
    toast('登録しました');
  }

  SHARE = null; SEL.sub = '';

  /* 位置が無ければ、その場で取りにいく。取れなければキューに積んでおく */
  if(target.lat == null){
    if(!DB.queue.includes(target.id)) DB.queue.push(target.id);
    save(); render();
    if(DB.settings.apiKey && quotaLeft() > 0){
      try{ await resolveShop(target); clearHay(); }catch(e){ /* あとでまとめて取得する */ }
      save(); render();
    }
  }else{
    clearHay(); save(); render();
  }

  SEL.shop = target.id;
  TAB = 'shops';
  render();
}
