/* ============================================================
   15. 設定

   ※ Places API まわり（APIキー・取得の設定）は Phase 3 でここに足します。
   ============================================================ */
let API_SHOW = false;      // APIキーを画面に見せるか

function toggleApiShow(){ API_SHOW = !API_SHOW; render(); }
function setApiKey(v){ DB.settings.apiKey = String(v||'').trim(); }
function saveApiKey(){
  const el = $('#api-key'); if(el) DB.settings.apiKey = String(el.value||'').trim();
  save(); render();
  toast(DB.settings.apiKey ? 'キーを保存しました' : 'キーを消しました');
}
function setDailyLimit(v){
  DB.settings.dailyLimit = Math.max(1, Math.min(5000, num(v)||1));
  save();
}

VIEWS.set = () => `
  <div class="pad">
    <h2>設定</h2>

    <h3 class="mt">Google Places API</h3>
    <p class="mini">店名から座標・カテゴリ・営業時間を自動で取ってくるために使います。
      入れなくてもアプリは動きます（位置を手で入れる形になります）。</p>

    <label class="lbl">APIキー</label>
    <div class="row gap">
      <input id="api-key" class="fld sm" type="${API_SHOW?'text':'password'}"
             autocomplete="off" spellcheck="false" placeholder="AIza..."
             value="${esc(DB.settings.apiKey)}" onchange="setApiKey(this.value)">
      <button class="sm" onclick="toggleApiShow()">${API_SHOW?'隠す':'表示'}</button>
    </div>
    <div class="row gap mt">
      <button onclick="saveApiKey()">保存</button>
      <button onclick="testApiKey()">接続テスト</button>
    </div>
    <div id="api-test" class="mt"></div>
    <p class="mini">キーはこの端末の中だけに保存され、どこにも送られません
      （Google への問い合わせを除く）。他の端末で使うときは、その端末でも入れてください。</p>

    <label class="sw mt"><input type="checkbox" ${DB.settings.fetchHours?'checked':''}
      onchange="DB.settings.fetchHours=this.checked; save(); render(); toast('保存しました')">
      <span>営業時間と評価も取得する</span></label>
    <p class="mini">${DB.settings.fetchHours
      ? '取得しています。この項目は上位の料金帯（無料枠 月1,000回ほど）になります。'
      : '取得していません。安いほうの帯（無料枠 月5,000回ほど）で動いています。営業中かどうかの判定はできません。'}</p>

    <label class="lbl">1日に叩く上限<span class="mini">（暴走を止めるための自主規制）</span></label>
    <div class="row gap">
      <input id="api-limit" class="fld sm" type="number" min="1" max="5000"
             value="${num(DB.settings.dailyLimit)}" onchange="setDailyLimit(this.value)">
      <span class="mini">本日 ${fmt(DB.settings.usage.n)} 回</span>
    </div>
    <p class="mini">Google Cloud 側でも「1日あたりの割り当て」を必ず設定してください。
      そちらが唯一の確実な歯止めです。</p>

    <h3 class="mt2">検索</h3>
    <label class="sw"><input type="checkbox" ${DB.settings.unknownHours?'checked':''}
      onchange="DB.settings.unknownHours=this.checked; save(); toast('保存しました')">
      <span>営業時間が分からない店も結果に出す</span></label>
    <p class="mini">切ると、営業時間を取得できていない店は「今やってる店だけ」で除外されます。</p>

    <h3 class="mt2">よく使う地点</h3>
    <p class="mini">現在地が取れないときの検索の起点にします。自宅や職場を入れておくと便利です。</p>
    ${(DB.settings.places||[]).length ? `<div class="cards mt">
      ${DB.settings.places.map(p => `
        <div class="card row between">
          <span>${esc(p.label)}<span class="mini"> ${fmt1(p.lat)}, ${fmt1(p.lng)}</span></span>
          <button class="ghost sm" onclick="delPlace('${esc(p.id)}')">削除</button>
        </div>`).join('')}</div>` : '<p class="mini">まだ登録がありません</p>'}

    <div class="mt">
      ${POS ? `<button onclick="addPlaceFromPos()">いまの位置を登録する</button>` : ''}
    </div>
    <div class="row gap mt">
      <input id="p-label" class="fld sm" type="text" placeholder="名前（例: 自宅）">
      <input id="p-lat"   class="fld sm" type="number" step="0.000001" placeholder="緯度">
      <input id="p-lng"   class="fld sm" type="number" step="0.000001" placeholder="経度">
      <button onclick="addPlaceManual()">追加</button>
    </div>
    <p class="mini">緯度・経度は Google マップで場所を長押しすると表示され、タップでコピーできます。</p>

    <h3 class="mt2">ジャンル</h3>
    <p class="mini">店名やカテゴリからジャンルを付け直します。
      自分で手直しした店はそのままにします。</p>
    <div class="mt"><button onclick="doReguess()">全部のジャンルを付け直す</button></div>

    <h3 class="mt2">データ</h3>
    <p class="mini">データはこの端末のブラウザ内にだけ保存されています。
      機種変更やブラウザのデータ消去で消えるため、ときどき書き出しておいてください。</p>
    <div class="row gap mt">
      <button class="pri" onclick="exportJSON()">バックアップを書き出す</button>
      <button onclick="document.getElementById('impjson').click()">復元する</button>
    </div>
    <input type="file" id="impjson" accept=".json" hidden onchange="importJSON(this)">

    <h3 class="mt2">この端末の状況</h3>
    <div class="kv">
      <div><span>登録した店</span>${fmt(DB.shops.length)} 軒</div>
      <div><span>位置が未取得</span>${fmt(pendingCount())} 軒</div>
      <div><span>行った記録</span>${fmt(DB.visits.length)} 件</div>
      <div><span>データ形式</span>v${DB._v}</div>
    </div>

    <h3 class="mt2">アプリ</h3>
    <p class="mini">スマホでは、ブラウザのメニューから「ホーム画面に追加」すると
      アプリのように使えます。追加すると Google マップの「共有」からも登録できるようになります。</p>
    <p class="mini">直したはずの内容が古いままのときは、こちらを押してください。</p>
    <div class="mt"><button onclick="clearCaches()">保存された表示を消して読み込み直す</button></div>

    <h3 class="mt2">初期化</h3>
    <p class="mini">登録した店をすべて消します。先にバックアップを取ってください。</p>
    <div class="mt right">
      <button class="danger ghost" onclick="resetAll()">すべて消して初期化</button>
    </div>
  </div>`;

function addPlaceFromPos(){
  if(!POS){ toast('現在地がありません'); return; }
  const label = prompt('この地点の名前は？', '自宅');
  if(!label) return;
  DB.settings.places.push({ id: uid('P'), label: label.trim(), lat: POS.lat, lng: POS.lng });
  save(); render(); toast('登録しました');
}
function addPlaceManual(){
  const label = (($('#p-label')||{}).value || '').trim();
  const lat = ($('#p-lat')||{}).value, lng = ($('#p-lng')||{}).value;
  if(!label){ alert('名前を入れてください'); return; }
  if(lat === '' || lng === ''){ alert('緯度と経度を両方入れてください'); return; }
  if(Math.abs(num(lat)) > 90 || Math.abs(num(lng)) > 180){
    alert('緯度は-90〜90、経度は-180〜180の範囲で入れてください'); return;
  }
  DB.settings.places.push({ id: uid('P'), label, lat: num(lat), lng: num(lng) });
  save(); render(); toast('登録しました');
}
function delPlace(id){
  DB.settings.places = (DB.settings.places||[]).filter(p => p.id !== id);
  save(); render();
}
/** 表示用のキャッシュだけを消す。登録した店のデータには触らない */
async function clearCaches(){
  try{
    if(typeof caches !== 'undefined'){
      const ks = await caches.keys();
      await Promise.all(ks.map(k => caches.delete(k)));
    }
    if(navigator.serviceWorker){
      const rs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(rs.map(r => r.unregister()));
    }
    toast('消しました。読み込み直します');
    setTimeout(() => location.reload(), 600);
  }catch(e){ alert('消せませんでした: ' + e.message); }
}

function doReguess(){
  const n = reguessAll();
  clearHay();
  save(); render();
  toast(n ? `${n} 軒のジャンルを付け直しました` : '変更はありませんでした');
}
