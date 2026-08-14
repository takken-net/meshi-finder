/* ============================================================
   13. お店の一覧・登録・編集
   ============================================================ */
let EDIT = null;                 // 編集中の店（保存するまで DB には入れない）
let SHOP_Q = { kw:'', sort:'name', only:'' };

/* ------------------------------------------------------------
   一覧
   ------------------------------------------------------------ */
VIEWS.shops = () => SEL.shop ? shopDetailHTML() : shopListHTML();

function shopListHTML(){
  const pend = pendingCount();
  return `
  <div class="pad">
    <div class="row between mb">
      <h2>お店 <span class="mini">${DB.shops.length} 軒</span></h2>
      <button class="pri" onclick="addShop()">＋ 追加</button>
    </div>

    ${pend ? `<div class="note warn">位置情報が未取得の店が ${pend} 軒あります。
       <a onclick="go('data')">取込タブ</a>でまとめて取得できます。</div>` : ''}

    <input id="shop-kw" class="fld" type="search" placeholder="店名・メモで絞り込む"
           value="${esc(SHOP_Q.kw)}" oninput="onShopKw(this.value)">

    <div class="row gap mt">
      <select class="fld sm" onchange="SHOP_Q.sort=this.value; renderShopList()">
        <option value="name"   ${SHOP_Q.sort==='name'  ?'selected':''}>名前順</option>
        <option value="new"    ${SHOP_Q.sort==='new'   ?'selected':''}>登録が新しい順</option>
        <option value="rate"   ${SHOP_Q.sort==='rate'  ?'selected':''}>自分の評価順</option>
      </select>
      <select class="fld sm" onchange="SHOP_Q.only=this.value; renderShopList()">
        <option value=""        ${SHOP_Q.only===''       ?'selected':''}>すべて</option>
        <option value="nopos"   ${SHOP_Q.only==='nopos'  ?'selected':''}>位置が未取得</option>
        <option value="fav"     ${SHOP_Q.only==='fav'    ?'selected':''}>ピン留めのみ</option>
      </select>
    </div>

    <div id="shop-list" class="mt">${shopListItemsHTML()}</div>
  </div>`;
}

/** 入力欄を作り直さずに一覧だけ差し替える（日本語変換を壊さないため） */
function onShopKw(v){ SHOP_Q.kw = v; renderShopList(); }
function renderShopList(){
  const el = $('#shop-list');
  if(el) el.innerHTML = shopListItemsHTML();
}

function shopListItemsHTML(){
  let list = DB.shops.slice();
  const kw = normName(SHOP_Q.kw);
  if(kw) list = list.filter(s => normName(`${s.name} ${s.memo} ${s.addr}`).includes(kw));
  if(SHOP_Q.only === 'nopos') list = list.filter(s => s.lat == null);
  if(SHOP_Q.only === 'fav')   list = list.filter(s => s.fav);

  if(SHOP_Q.sort === 'new')       list.sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''));
  else if(SHOP_Q.sort === 'rate') list.sort((a,b) => num(b.myRate) - num(a.myRate) || a.nameKey.localeCompare(b.nameKey));
  else                            list.sort((a,b) => a.nameKey.localeCompare(b.nameKey, 'ja'));

  if(!list.length) return emptyBox(
    DB.shops.length ? '条件に合う店がありません' : 'まだ店が登録されていません',
    DB.shops.length ? '' : '「＋ 追加」で登録するか、取込タブから Google マップの CSV を読み込んでください');

  return `<div class="cards">${list.map(s => `
    <div class="card" onclick="openShop('${s.id}')">
      <div class="row between">
        <b>${s.fav?'📌 ':''}${esc(s.name)}</b>
        ${s.myRate ? `<span class="mini">${stars(s.myRate)}</span>` : ''}
      </div>
      <div class="tags">${genreTags(s.genres)}
        ${s.lat==null ? '<span class="tag na">位置なし</span>' : ''}</div>
      ${s.memo ? `<p class="mini clip">${esc(s.memo)}</p>` : ''}
    </div>`).join('')}</div>`;
}

/* ------------------------------------------------------------
   詳細・編集
   ------------------------------------------------------------ */
function openShop(id){ SEL.shop = id; SEL.edit = false; EDIT = null; render(); }
function backToList(){ SEL.shop = null; SEL.edit = false; EDIT = null; render(); }

function addShop(){
  EDIT = newShop();
  SEL.shop = EDIT.id; SEL.edit = true;
  render();
}
function editShop(){
  const s = shopOf(SEL.shop); if(!s) return;
  EDIT = JSON.parse(JSON.stringify(s));
  SEL.edit = true; render();
}
function cancelEdit(){
  const exists = !!shopOf(SEL.shop);
  EDIT = null; SEL.edit = false;
  if(exists) render(); else backToList();      // 新規追加を取り消したら一覧へ戻る
}

function shopDetailHTML(){
  if(SEL.edit) return shopEditHTML();
  const s = shopOf(SEL.shop);
  if(!s) return emptyBox('店が見つかりません');
  const vs = visitsOf(s.id);

  return `
  <div class="pad">
    <div class="row between mb">
      <button class="ghost" onclick="backToList()">← 一覧</button>
      <button onclick="editShop()">編集</button>
    </div>

    <h2>${esc(s.name)}</h2>
    <div class="tags mb">${genreTags(s.genres)}
      ${(s.tags||[]).map(t=>`<span class="tag alt">${esc(t)}</span>`).join('')}
      ${(s.lists||[]).map(l=>`<span class="tag list">${esc(l)}</span>`).join('')}</div>

    <div class="kv">
      <div><span>自分の評価</span>${starPicker(s.myRate, 'rateShop')}</div>
      ${s.gRating ? `<div><span>Google</span>★${fmt1(s.gRating)}（${fmt(s.gCount)}件）</div>` : ''}
      ${s.addr    ? `<div><span>住所</span>${esc(s.addr)}</div>` : ''}
      <div><span>位置</span>${s.lat!=null ? `${fmt1(s.lat)}, ${fmt1(s.lng)}`
                                          : '<span class="na">未取得</span>'}</div>
      ${s.typeJa  ? `<div><span>種別</span>${esc(s.typeJa)}</div>` : ''}
      <div><span>登録</span>${esc(s.createdAt)}（${esc(srcLabel(s.src))}）</div>
    </div>

    ${s.memo ? `<div class="note mt">${esc(s.memo).replace(/\n/g,'<br>')}</div>` : ''}

    ${s.hours && s.hours.text && s.hours.text.length ? `
      <details class="mt">
        <summary class="mini">営業時間 ${openBadge(s)}</summary>
        <p class="mini">${s.hours.text.map(esc).join('<br>')}</p>
        <p class="mini na">※ 祝日・臨時休業は反映されません。念のため Google マップでも確認してください。</p>
      </details>` : ''}

    <div class="row gap mt">
      <a class="btn pri" href="${esc(mapsUrl(s))}" target="_blank" rel="noopener">Googleマップで見る</a>
      <a class="btn" href="${esc(routeUrl(s))}" target="_blank" rel="noopener">経路</a>
    </div>

    ${DB.settings.apiKey ? `
      <div class="mt">
        <button class="ghost sm" onclick="refetchShop('${s.id}')">
          ${s.lat == null ? 'Google から位置を取得する' : 'Google から取り直す'}</button>
      </div>` : ''}

    ${s.status === 'ambiguous' && (s.cands||[]).length ? `
      <div class="note warn mt">
        <b>どの店か決められませんでした</b>
        ${s.cands.map((c,i) => `
          <div class="cand" onclick="chooseCand('${s.id}', ${i})">
            <b>${esc(c.name)}</b><span class="mini">${esc(c.addr)}</span>
          </div>`).join('')}
      </div>` : ''}
    ${s.status === 'failed' ? `
      <p class="mini warnmsg mt">Google では見つかりませんでした（${esc(s.err||'')}）。
        店名を直して取り直すか、下の編集から位置を手で入れてください。</p>` : ''}

    <h3 class="mt">行った記録 <span class="mini">${vs.length} 回</span></h3>
    <div class="row gap">
      <input id="v-date" class="fld sm" type="date" value="${today()}">
      <input id="v-memo" class="fld" type="text" placeholder="何を食べた？（任意）">
      <button onclick="addVisit()">記録</button>
    </div>
    ${vs.length ? `<div class="cards mt">${vs.map(v=>`
      <div class="card row between">
        <span>${esc(v.date)} ${v.memo?`<span class="mini">${esc(v.memo)}</span>`:''}</span>
        <button class="ghost sm" onclick="delVisit('${v.id}')">削除</button>
      </div>`).join('')}</div>` : '<p class="mini mt">まだ記録がありません</p>'}

    <div class="mt2 right">
      <button class="danger ghost" onclick="removeShop()">この店を削除</button>
    </div>
  </div>`;
}

const srcLabel = s => ({ manual:'手入力', takeout:'CSV取込', share:'共有から' }[s] || s);

function shopEditHTML(){
  const e = EDIT || newShop();
  const isNew = !shopOf(e.id);
  return `
  <div class="pad">
    <div class="row between mb">
      <button class="ghost" onclick="cancelEdit()">← やめる</button>
      <button class="pri" onclick="saveShop()">保存</button>
    </div>
    <h2>${isNew ? '店を追加' : '編集'}</h2>

    <label class="lbl">店名 <span class="req">必須</span></label>
    <input id="e-name" class="fld" type="text" value="${esc(e.name)}" placeholder="例: 麺屋こうじ">

    <label class="lbl">ジャンル<span class="mini">（複数選べます）</span></label>
    <div id="e-genres" class="chips">${editGenreChips()}</div>

    <label class="lbl">タグ<span class="mini">（カンマ区切り。例: 一人向き, 駐車場あり）</span></label>
    <input id="e-tags" class="fld" type="text" value="${esc((e.tags||[]).join(', '))}">

    <label class="lbl">リスト<span class="mini">（取り込み元。カンマ区切り）</span></label>
    <input id="e-lists" class="fld" type="text" value="${esc((e.lists||[]).join(', '))}">

    <label class="lbl">自分の評価</label>
    <div id="e-rate">${starPicker(e.myRate, 'setEditRate')}</div>

    <label class="lbl">メモ</label>
    <textarea id="e-memo" class="fld" rows="3" placeholder="好きなメニュー、混む時間帯など">${esc(e.memo)}</textarea>

    <label class="lbl">位置<span class="mini">（分かる場合。取込タブから自動取得もできます）</span></label>
    <div class="row gap">
      <input id="e-lat" class="fld sm" type="number" step="0.000001" placeholder="緯度"  value="${e.lat??''}">
      <input id="e-lng" class="fld sm" type="number" step="0.000001" placeholder="経度"  value="${e.lng??''}">
    </div>

    <label class="lbl">住所</label>
    <input id="e-addr" class="fld" type="text" value="${esc(e.addr)}">

    <label class="row gap mt"><input id="e-fav" type="checkbox" ${e.fav?'checked':''}> ピン留めする</label>
  </div>`;
}

function editGenreChips(){
  const on = new Set((EDIT&&EDIT.genres)||[]);
  return DB.genres.map(g =>
    `<button class="chip ${on.has(g.id)?'on':''}" onclick="toggleEditGenre('${g.id}')">
       ${g.icon} ${esc(g.label)}</button>`).join('');
}

/** 画面の入力値を EDIT に取り込む。部分再描画や保存の前に必ず呼ぶ */
function syncEdit(){
  if(!EDIT) return;
  const g = id => { const el = $('#'+id); return el ? el.value : ''; };
  EDIT.name = g('e-name').trim();
  EDIT.tags  = g('e-tags').split(/[,、]/).map(t=>t.trim()).filter(Boolean);
  EDIT.lists = g('e-lists').split(/[,、]/).map(t=>t.trim()).filter(Boolean);
  EDIT.memo = g('e-memo');
  EDIT.addr = g('e-addr').trim();
  const la = g('e-lat'), lo = g('e-lng');
  EDIT.lat = la === '' ? null : num(la);
  EDIT.lng = lo === '' ? null : num(lo);
  const f = $('#e-fav'); if(f) EDIT.fav = !!f.checked;
}

function toggleEditGenre(id){
  if(!EDIT) return;
  syncEdit();
  const i = EDIT.genres.indexOf(id);
  if(i >= 0) EDIT.genres.splice(i,1); else EDIT.genres.push(id);
  EDIT.genresManual = true;               // 手で触った以上、自動判定で上書きしない
  const el = $('#e-genres'); if(el) el.innerHTML = editGenreChips();
}
function setEditRate(n){
  if(!EDIT) return;
  syncEdit();
  EDIT.myRate = num(n);
  const el = $('#e-rate'); if(el) el.innerHTML = starPicker(EDIT.myRate, 'setEditRate');
}

function saveShop(){
  syncEdit();
  if(!EDIT.name){ alert('店名を入力してください'); return; }
  if((EDIT.lat==null) !== (EDIT.lng==null)){ alert('緯度と経度は両方入れてください'); return; }
  if(EDIT.lat!=null && (Math.abs(EDIT.lat)>90 || Math.abs(EDIT.lng)>180)){
    alert('緯度は-90〜90、経度は-180〜180の範囲で入れてください'); return;
  }
  putShop(EDIT);
  SEL.shop = EDIT.id; SEL.edit = false; EDIT = null;
  save(); render();
  toast('保存しました');
}

function rateShop(n){
  const s = shopOf(SEL.shop); if(!s) return;
  s.myRate = num(n); s.updatedAt = today();
  save(); render();
}
function removeShop(){
  const s = shopOf(SEL.shop); if(!s) return;
  if(!confirm(`「${s.name}」を削除します。よろしいですか？`)) return;
  delShop(s.id); save(); backToList();
  toast('削除しました');
}

function addVisit(){
  const s = shopOf(SEL.shop); if(!s) return;
  const d = ($('#v-date')||{}).value || today();
  const m = (($('#v-memo')||{}).value || '').trim();
  DB.visits.push({ id: uid('V'), shop: s.id, date: d, memo: m });
  save(); render();
  toast('記録しました');
}
function delVisit(id){
  DB.visits = DB.visits.filter(v => v.id !== id);
  save(); render();
}
