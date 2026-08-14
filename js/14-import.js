/* ============================================================
   14. Takeout CSV の取り込み

   Google Takeout →「マップ（自分のプレイス）」でお気に入りリストを
   CSV に書き出したものを読み込みます。列は概ね Title / Note / URL / Comment ですが、
   エクスポートした時期やリストの種類で構成が変わるため、
   **位置ではなくヘッダ名で列を引き当て**、外れたら画面で割り当て直せるようにしています。

   Takeout はその時点のスナップショットです。あとから追加したお気に入りは
   入っていないため、再取り込みしたときに重複を作らないことが要になります。
   ============================================================ */

/* ------------------------------------------------------------
   CSV パーサ（RFC4180）

   店名やメモにカンマ・改行・引用符が入っていても壊れないよう、
   split(',') ではなく1文字ずつ読みます。
   ------------------------------------------------------------ */
function parseCSV(text){
  const s = String(text ?? '').replace(/^﻿/, '');   // 先頭のBOMを除去
  const rows = [];
  let row = [], cur = '', inQ = false;

  for(let i = 0; i < s.length; i++){
    const c = s[i];
    if(inQ){
      if(c === '"'){
        if(s[i+1] === '"'){ cur += '"'; i++; }          // "" はエスケープされた引用符
        else inQ = false;
      }else cur += c;                                    // 引用符の中では改行もそのまま
    }else{
      if(c === '"')      inQ = true;
      else if(c === ',') { row.push(cur); cur = ''; }
      else if(c === '\r'){ /* CRLF の CR は捨てる */ }
      else if(c === '\n'){ row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
  }
  if(cur !== '' || row.length){ row.push(cur); rows.push(row); }

  return rows.filter(r => r.some(x => String(x).trim() !== ''));   // 空行を落とす
}

/* 列の見出し候補。normName で比べるので大小・全半角は問いません */
const CSV_COLS = [
  ['title',   ['title','name','名前','タイトル','店名']],
  ['url',     ['url','link','リンク','urL']],
  ['note',    ['note','memo','メモ','備考']],
  ['comment', ['comment','コメント']],
];

/** ヘッダ行から「どの列が何か」を推測する */
function mapHeader(head){
  const idx = {};
  (head||[]).forEach((h, i) => {
    const k = normName(h);
    if(!k) return;
    for(const [field, names] of CSV_COLS)
      if(idx[field] == null && names.some(n => normName(n) === k)) idx[field] = i;
  });
  return idx;
}

/* ------------------------------------------------------------
   Google マップの URL から取れるものを取る

   ・query_place_id … そのまま使える。これがあれば店の特定は確実
   ・@35.68,139.76  … 座標。Places を叩かなくても距離検索が効くようになる
   ・/maps/place/店名/ … 検索に使う店名
   ・cid / ftid     … place_id には変換できない。重複判定のキーとしてだけ使う
   ・maps.app.goo.gl（短縮URL）… ブラウザからは展開できないので何も取れない
   ------------------------------------------------------------ */
function parseMapsUrl(url){
  const u = String(url ?? '');
  const r = { placeId:'', lat:null, lng:null, name:'', srcId:'' };
  if(!u) return r;
  let m;

  if((m = /[?&](?:query_place_id|place_id)=([A-Za-z0-9_-]+)/.exec(u))) r.placeId = m[1];

  /* 座標。よくある3つの形を順に見る */
  const setPos = (a, b) => {
    const la = Number(a), ln = Number(b);
    if(isFinite(la) && isFinite(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180){
      r.lat = la; r.lng = ln;
    }
  };
  if((m = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(u)))            setPos(m[1], m[2]);
  if(r.lat == null && (m = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(u))) setPos(m[1], m[2]);
  if(r.lat == null && (m = /[?&](?:q|query|ll|center|daddr)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(u)))
    setPos(m[1], m[2]);

  const dec = v => { try{ return decodeURIComponent(String(v).replace(/\+/g,' ')).trim(); }
                     catch(e){ return String(v).replace(/\+/g,' ').trim(); } };
  if((m = /\/maps\/place\/([^/@?#]+)/.exec(u))) r.name = dec(m[1]);
  if(!r.name && (m = /[?&](?:q|query)=([^&#]+)/.exec(u))){
    const v = dec(m[1]);
    if(!/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(v)) r.name = v;   // 座標なら店名ではない
  }

  if((m = /[?&]cid=(\d+)/.exec(u)))                            r.srcId = 'cid:' + m[1];
  if(!r.srcId && (m = /!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i.exec(u))) r.srcId = 'ftid:' + m[1].toLowerCase();
  if(!r.srcId && (m = /[?&]ftid=(0x[0-9a-f]+:0x[0-9a-f]+)/i.exec(u))) r.srcId = 'ftid:' + m[1].toLowerCase();
  if(!r.srcId && r.placeId)                                     r.srcId = 'pid:' + r.placeId;

  return r;
}

/* ------------------------------------------------------------
   重複判定

   ⚠️ 「サイゼリヤ」「日高屋」のように同名の店が何十軒もあります。
      名前が一致しただけで自動的にまとめると、別の店を潰してしまいます。
      そのため名前一致は「座標が近い」ことまで確かめ、確かめられない場合は
      勝手に決めず「要確認」として人に判断してもらいます。
   ------------------------------------------------------------ */
const DUP_METERS = 200;

function findDup(cand, list){
  if(cand.placeId){
    const h = list.find(s => s.placeId && s.placeId === cand.placeId);
    if(h) return { hit:h, why:'placeId', check:false };
  }
  if(cand.srcId){
    const h = list.find(s => s.srcId && s.srcId === cand.srcId);
    if(h) return { hit:h, why:'srcId', check:false };
  }
  /* 同じ保存済みリストを書き出し直すと URL は同じものが出てきます。
     短縮URL（maps.app.goo.gl）のように中身を展開できない場合でも、
     URL がそのまま一致すれば同じ登録とみなせます。
     これが無いと、再取り込みのたびに同名の店が増えてしまいます */
  if(cand.srcUrl){
    const h = list.find(s => s.srcUrl && s.srcUrl === cand.srcUrl);
    if(h) return { hit:h, why:'url', check:false };
  }
  const same = cand.nameKey ? list.filter(s => s.nameKey === cand.nameKey) : [];
  if(same.length){
    if(cand.lat != null){
      const near = same.find(s => s.lat != null && haversine(s, cand) <= DUP_METERS);
      if(near) return { hit:near, why:'nearby', check:false };
    }
    return { hit:same[0], why:'name', check:true };      // 同名だが確証がない
  }
  return { hit:null, why:'', check:false };
}

/** 既存の店に取り込み分を重ねる。ユーザー資産（評価・タグ・メモ）は絶対に触らない。
    ただし取り込み元のリスト名だけは「足し算」で増やす（同じ店が複数のリストに入るため） */
function mergeShop(dst, src){
  for(const l of (src.lists||[]))
    if(l && !(dst.lists||[]).includes(l)) (dst.lists ||= []).push(l);

  if(!dst.placeId && src.placeId){ dst.placeId = src.placeId; }
  if(!dst.srcId   && src.srcId)    dst.srcId   = src.srcId;
  if(!dst.srcUrl  && src.srcUrl)   dst.srcUrl  = src.srcUrl;
  if(!dst.addr    && src.addr)     dst.addr    = src.addr;
  if(dst.lat == null && src.lat != null){ dst.lat = src.lat; dst.lng = src.lng; }
  if(!dst.memo    && src.memo)     dst.memo    = src.memo;   // 既にメモがあれば上書きしない
  dst.updatedAt = today();
  return dst;
}

/* ------------------------------------------------------------
   Takeout の JSON（保存した場所.json）

   「マップ（マイプレイス）」で書き出すと、スター付きの場所が
   GeoJSON 形式で入っています。座標がそのまま入っているのが利点です。
   ※ お気に入り・行きたい場所などのリストは、Takeout の別サービス
     「保存済み」から CSV で出てきます（取込画面の案内文にも書いてあります）。
   ------------------------------------------------------------ */
function parseSavedJson(text){
  let j;
  try{ j = JSON.parse(String(text ?? '').replace(/^﻿/, '')); }
  catch(e){ return null; }
  const feats = (j && Array.isArray(j.features)) ? j.features : null;
  if(!feats) return null;

  const recs = [];
  for(const f of feats){
    const p   = (f && f.properties) || {};
    const loc = p.location || {};
    const c   = (f && f.geometry && Array.isArray(f.geometry.coordinates))
              ? f.geometry.coordinates : [];
    /* GeoJSON の座標は [経度, 緯度] の順。逆に読むと全世界にばらまかれる */
    let lat = Number(c[1]), lng = Number(c[0]);
    if(!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)
       || Math.abs(lat) > 90 || Math.abs(lng) > 180){ lat = null; lng = null; }

    const rec = {
      name: String(loc.name || p.Title || '').trim(),
      addr: String(loc.address || '').trim(),
      url:  String(p.google_maps_url || '').trim(),
      memo: String(p.Comment || p.comment || '').trim(),
      lat, lng,
    };
    if(rec.name || rec.url) recs.push(rec);
  }
  return recs;
}

/* ------------------------------------------------------------
   取り込みの下ごしらえ
   ------------------------------------------------------------ */
let IMP = null;      // { kind:'csv'|'json', head, body, idx, recs, label, items, stats }

/** 共通の候補づくり。recs = [{ name, addr, url, memo, lat, lng }] の配列 */
function buildImportRecs(recs, label){
  const items = [];
  const lists = label ? [String(label).trim()].filter(Boolean) : [];
  const seen = DB.shops.slice();       // 取り込み中に増えた分も重複判定に含める

  for(const rec of recs){
    const ex   = parseMapsUrl(rec.url);
    const name = rec.name || ex.name;
    if(!name) continue;                                   // 名前が取れない行は捨てる

    const cand = newShop({
      name, memo: rec.memo || '', addr: rec.addr || '',
      srcUrl: rec.url, src:'takeout',
      placeId: ex.placeId, srcId: ex.srcId,
      lat: rec.lat != null ? rec.lat : ex.lat,            // 本文の座標を優先、無ければURLから
      lng: rec.lat != null ? rec.lng : ex.lng,
      lists: lists.slice(),
    });
    cand.status  = cand.lat != null ? 'ok' : 'pending';
    cand.nameKey = normName(name);
    cand.genres  = guessGenres(cand);

    const dup = findDup(cand, seen);
    const state = !dup.hit ? 'new' : dup.check ? 'check' : 'exist';
    if(state === 'new') seen.push(cand);                  // 同じファイル内の重複も拾えるように

    items.push({ id: uid('I'), cand, dupId: dup.hit ? dup.hit.id : '',
                 why: dup.why, state, on: true, merge: false });
  }
  return items;
}

/** CSV の本文と列の割り当てから候補を作る（共通処理への橋渡し） */
function buildImport(body, idx, label){
  const recs = (body || []).map(row => {
    const pick = f => idx[f] != null ? String(row[idx[f]] ?? '').trim() : '';
    return { name: pick('title'), url: pick('url'), addr: '',
             memo: [pick('note'), pick('comment')].filter(Boolean).join(' / '),
             lat: null, lng: null };
  });
  return buildImportRecs(recs, label);
}

const impStats = items => ({
  all:   items.length,
  new:   items.filter(i => i.state === 'new').length,
  exist: items.filter(i => i.state === 'exist').length,
  check: items.filter(i => i.state === 'check').length,
});

/* ------------------------------------------------------------
   画面
   ------------------------------------------------------------ */
VIEWS.data = () => IMP ? importPreviewHTML() : importStartHTML();

function importStartHTML(){
  const pend = pendingCount();
  return `
  <div class="pad">
    <h2>取込</h2>

    ${typeof shareFormHTML === 'function' ? shareFormHTML() : ''}

    <h3 class="mt">Google マップのお気に入り</h3>
    <p class="mini"><a href="https://takeout.google.com/" target="_blank" rel="noopener">Google Takeout</a>
      で書き出した zip を展開して、中のファイルをここで選びます。
      Takeout では次の<b>2つのサービス</b>にお店の記録が分かれています。</p>
    <ol class="steps">
      <li><b>保存済み</b> … お気に入り・行きたい場所などのリスト（<b>CSV</b>。リストごとに1つ）</li>
      <li><b>マップ（マイプレイス）</b> … スター付きの場所（<b>保存した場所.json</b>。座標入り）</li>
    </ol>
    <div class="mt">
      <button class="pri" onclick="document.getElementById('impcsv').click()">CSV / JSON を選ぶ</button>
      <input type="file" id="impcsv" accept=".csv,.json,text/csv,application/json"
             hidden onchange="readImportFile(this)">
    </div>
    <p class="mini">同じファイルを何度読み込んでも重複しません。
      すでにある店は、あなたが付けた評価・タグ・メモをそのまま残します。</p>

    ${allLists().length ? `
      <h3 class="mt2">取り込み済みのリスト</h3>
      <div class="tags">${allLists().map(l =>
        `<span class="tag alt">${esc(l.label)} ${fmt(l.n)}</span>`).join('')}</div>
      <p class="mini">別のアカウントのお気に入りも、そのアカウントで Takeout して
        同じようにここへ読み込めば合流します。同じ店は重複しません。</p>` : ''}

    <h3 class="mt2">位置情報の取得</h3>
    ${queuePanelHTML(pend)}

    ${ambiguousPanelHTML()}
  </div>`;
}

/** 位置が未取得の店をまとめて片づけるパネル */
function queuePanelHTML(pend){
  if(!pend && !queueLeft()) return '<p class="mini">未取得の店はありません。</p>';

  if(!DB.settings.apiKey) return `<div class="note warn">
    位置が未取得の店が ${fmt(pend)} 軒あります。<br>
    自動で埋めるには<a onclick="go('set')">設定タブ</a>で Google の APIキーを入れてください。
    <span class="mini">キーが無くても、お店タブで1軒ずつ手入力できます。</span></div>`;

  const days = Math.ceil(queueLeft() / Math.max(1, num(DB.settings.dailyLimit)));
  return `
    <div class="note">
      <div id="qprog">${queueProgressHTML()}</div>
      ${QMSG ? `<p class="mini warnmsg">${esc(QMSG).replace(/\n/g,'<br>')}</p>` : ''}
      ${(!QRUN && queueLeft() && days > 1)
        ? `<p class="mini">1日の上限があるため、全部埋まるまで ${days} 日ほどかかります。
             急ぐときは設定で上限を上げてください。</p>` : ''}
      <div class="row gap mt">
        ${QRUN
          ? `<button class="danger grow" onclick="stopQueue()">中断する</button>`
          : `<button class="pri grow" ${queueLeft()?'':'disabled'} onclick="runQueue()">
               ${queueLeft() ? 'まとめて取得する' : '取得するものがありません'}</button>`}
      </div>
    </div>`;
}

/** 候補が複数出て決められなかった店を、人に選んでもらう */
function ambiguousPanelHTML(){
  const list = DB.shops.filter(s => s.status === 'ambiguous' && (s.cands||[]).length);
  const bad  = DB.shops.filter(s => s.status === 'failed');
  if(!list.length && !bad.length) return '';

  return `
    ${list.length ? `
      <h3 class="mt2">どの店か選んでください <span class="mini">${fmt(list.length)} 軒</span></h3>
      <div class="cards">${list.slice(0,50).map(s => `
        <div class="card">
          <b>${esc(s.name)}</b>
          <p class="mini">候補から選ぶと、座標や営業時間が入ります。</p>
          ${(s.cands||[]).map((c,i) => `
            <div class="cand" onclick="chooseCand('${s.id}', ${i})">
              <b>${esc(c.name)}</b>
              <span class="mini">${esc(c.addr)}</span>
              ${c.gRating ? `<span class="mini">★${fmt1(c.gRating)}</span>` : ''}
            </div>`).join('')}
          <button class="ghost sm mt" onclick="rejectCands('${s.id}')">どれでもない</button>
        </div>`).join('')}</div>` : ''}

    ${bad.length ? `
      <h3 class="mt2">見つからなかった店 <span class="mini">${fmt(bad.length)} 軒</span></h3>
      <p class="mini">お店タブから位置を手で入れるか、店名を直して取り直してください。</p>
      <div class="cards">${bad.slice(0,50).map(s => `
        <div class="card" onclick="openFromResult('${s.id}')">
          <b>${esc(s.name)}</b> <span class="mini">${esc(s.err||'')}</span>
        </div>`).join('')}</div>` : ''}`;
}

function importPreviewHTML(){
  const st = IMP.stats;
  const shown = IMP.items.slice(0, 300);
  return `
  <div class="pad">
    <div class="row between mb">
      <h2>取り込みの確認</h2>
      <button class="ghost" onclick="cancelImport()">やめる</button>
    </div>

    <div class="cond">
      <span class="tag new">新しい店 ${fmt(st.new)}</span>
      <span class="tag alt">すでにある ${fmt(st.exist)}</span>
      ${st.check ? `<span class="tag soon">要確認 ${fmt(st.check)}</span>` : ''}
    </div>

    ${st.check ? `<div class="note warn mt">
      <b>要確認</b> は、同じ店名だけれど同じ店かどうか確かめられなかったものです
      （チェーン店など）。既定では<b>別の店として追加</b>します。
      同じ店なら行の選択を「まとめる」に変えてください。</div>` : ''}

    <label class="lbl">このリストの名前<span class="mini">（あとで絞り込みに使えます）</span></label>
    <input id="imp-label" class="fld" type="text" value="${esc(IMP.label||'')}"
           placeholder="例: 行きたい場所／仕事用アカウント" oninput="setImpLabel(this.value)">
    <p class="mini">複数のアカウントから取り込むときは、
      「仕事用 / 行きたい場所」のようにアカウントが分かる名前にしておくと後で辿れます。</p>

    ${colPickerHTML()}

    <div class="row gap mt">
      <button class="pri grow" onclick="runImport()">${fmt(IMP.items.filter(i=>i.on).length)} 件を取り込む</button>
    </div>

    <div class="cards mt">${shown.map(impRowHTML).join('')}</div>
    ${IMP.items.length > shown.length
      ? `<p class="mini mt">ほか ${fmt(IMP.items.length - shown.length)} 件（画面には出していませんが取り込まれます）</p>` : ''}
  </div>`;
}

/** 列の割り当てを直せるようにする（ヘッダ名が想定と違った場合の逃げ道）。CSV のときだけ */
function colPickerHTML(){
  if(IMP.kind === 'json') return '';                      // JSON は列という概念が無い
  const opts = f => `<select class="fld sm" onchange="setCol('${f}', this.value)">
      <option value="">（使わない）</option>
      ${IMP.head.map((h,i) =>
        `<option value="${i}" ${IMP.idx[f]===i?'selected':''}>${i+1}: ${esc(h||'（無題）')}</option>`).join('')}
    </select>`;
  return `
    <details class="mt">
      <summary class="mini">列の割り当てを直す</summary>
      <div class="kv mt">
        <div><span>店名</span>${opts('title')}</div>
        <div><span>URL</span>${opts('url')}</div>
        <div><span>メモ</span>${opts('note')}</div>
        <div><span>コメント</span>${opts('comment')}</div>
      </div>
    </details>`;
}

function impRowHTML(it){
  const c = it.cand;
  const dup = it.dupId ? shopOf(it.dupId) : null;
  const badge = it.state === 'new'   ? '<span class="tag new">新しい店</span>'
              : it.state === 'exist' ? '<span class="tag alt">すでにある</span>'
              :                        '<span class="tag soon">要確認</span>';
  return `
  <div class="card ${it.on?'':'off'}">
    <div class="row between">
      <label class="sw"><input type="checkbox" ${it.on?'checked':''}
        onchange="toggleImp('${it.id}', this.checked)"><b>${esc(c.name)}</b></label>
      ${badge}
    </div>
    <div class="tags">
      ${genreTags(c.genres)}
      ${c.lat != null ? '<span class="tag">座標あり</span>' : '<span class="tag na">位置なし</span>'}
      ${c.placeId ? '<span class="tag">ID あり</span>' : ''}
    </div>
    ${c.memo ? `<p class="mini clip">${esc(c.memo)}</p>` : ''}
    ${it.state === 'check' && dup ? `
      <select class="fld sm mt" onchange="setMerge('${it.id}', this.value)">
        <option value="">別の店として追加する</option>
        <option value="1" ${it.merge?'selected':''}>「${esc(dup.name)}」と同じ店にまとめる</option>
      </select>` : ''}
  </div>`;
}

/* ------------------------------------------------------------
   操作
   ------------------------------------------------------------ */
function readImportFile(inp){
  const f = inp.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = e => {
    try{
      const text = String(e.target.result ?? '');
      /* 取り込み元のラベルはファイル名から作る（「行きたい場所.csv」→「行きたい場所」）。
         複数アカウントを扱うときは、確認画面で「仕事用 / 行きたい場所」のように書き換えてもらう */
      const label = String(f.name || '').replace(/\.(csv|json)$/i, '').trim();

      /* JSON（保存した場所.json）か CSV かを、拡張子と中身の両方で見分ける */
      const looksJson = /\.json$/i.test(f.name || '')
                     || /^\s*[\[{]/.test(text.replace(/^﻿/, ''));
      if(looksJson){
        const recs = parseSavedJson(text);
        if(recs === null) throw new Error('JSON の形式を読み取れませんでした');
        if(!recs.length)  throw new Error('店の記録が入っていないようです');
        IMP = { kind:'json', recs, label, items: [], stats: null };
      }else{
        const rows = parseCSV(text);
        if(rows.length < 2) throw new Error('中身が空のようです');
        const head = rows[0], body = rows.slice(1);
        const idx  = mapHeader(head);
        if(idx.title == null && idx.url == null){
          /* ヘッダを読み取れなかった場合は、1列目を店名・2列目をURLと仮置きする */
          idx.title = 0; if(head.length > 1) idx.url = 1;
        }
        IMP = { kind:'csv', head, body, idx, label, items: [], stats: null };
      }
      refreshImport();
      render();
    }catch(err){ alert('読み込めませんでした: ' + err.message); }
  };
  r.onerror = () => alert('ファイルを読めませんでした');
  r.readAsText(f, 'utf-8');
  inp.value = '';
}

function refreshImport(){
  IMP.items = (IMP.kind === 'json')
    ? buildImportRecs(IMP.recs, IMP.label)
    : buildImport(IMP.body, IMP.idx, IMP.label);
  IMP.stats = impStats(IMP.items);
}
/** 取り込み元のラベルを変える（入力欄は作り直さないので変換が途切れない） */
function setImpLabel(v){
  if(!IMP) return;
  IMP.label = String(v || '').trim();
  IMP.items.forEach(it => { it.cand.lists = IMP.label ? [IMP.label] : []; });
}
function setCol(field, v){
  IMP.idx[field] = (v === '') ? null : num(v);
  refreshImport(); render();
}
function toggleImp(id, on){
  const it = IMP.items.find(x => x.id === id); if(!it) return;
  it.on = !!on;
  render();
}
function setMerge(id, v){
  const it = IMP.items.find(x => x.id === id); if(!it) return;
  it.merge = !!v;
}
function cancelImport(){ IMP = null; render(); }

function runImport(){
  if(!IMP) return;
  let added = 0, merged = 0;

  for(const it of IMP.items){
    if(!it.on) continue;
    const dup = it.dupId ? shopOf(it.dupId) : null;

    /* すでにある店、または「まとめる」を選んだ要確認は、既存に重ねる */
    if(dup && (it.state === 'exist' || (it.state === 'check' && it.merge))){
      mergeShop(dup, it.cand);
      if(dup.lat == null && !DB.queue.includes(dup.id)) DB.queue.push(dup.id);
      merged++;
      continue;
    }
    putShop(it.cand);
    if(it.cand.lat == null && !DB.queue.includes(it.cand.id)) DB.queue.push(it.cand.id);
    added++;
  }

  clearHay();
  IMP = null;
  save(); render();
  toast(`${added} 軒を追加、${merged} 軒を更新しました`);
}
