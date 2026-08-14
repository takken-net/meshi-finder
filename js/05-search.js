/* ============================================================
   5. 検索の中核ロジック

   距離・営業中判定・ジャンル判定・キーワード・絞り込み・ルーレット。
   このファイルの関数は画面に触りません（テストしやすくするため）。
   時刻を使う判定は必ず引数で受け取ります。中で new Date() を呼ばないこと。
   ============================================================ */

/* ------------------------------------------------------------
   ジャンルの自動判定

   Places は「japanese_restaurant」のような粗いカテゴリしか返さない店が
   多いため、カテゴリだけに頼らず店名のキーワードでも必ず判定します。
   （例: 種別が japanese_restaurant でも、店名に「麺屋」があればラーメン）
   ------------------------------------------------------------ */
function guessGenres(sh){
  const list = DB.genres || GENRES;
  const hit = new Set();

  // ① Places が「この店の代表カテゴリ」と判断したものを最優先
  if(sh.primaryType)
    for(const g of list) if((g.types||[]).includes(sh.primaryType)) hit.add(g.id);

  // ② 決まらなければカテゴリ全体を見る
  if(!hit.size)
    for(const g of list) if((sh.types||[]).some(t => (g.types||[]).includes(t))) hit.add(g.id);

  // ③ 店名・種別の和名・メモのキーワードは「常に追加で」走らせる
  const hay = normName([sh.name, sh.typeJa, sh.memo].join(' '));
  if(hay)
    for(const g of list) if((g.words||[]).some(w => hay.includes(normName(w)))) hit.add(g.id);

  return hit.size ? [...hit] : ['other'];
}

/** 全店のジャンルを付け直す。手で編集した店（genresManual）は触らない */
function reguessAll(){
  let n = 0;
  for(const s of DB.shops){
    if(s.genresManual) continue;
    const next = guessGenres(s);
    if(next.join(',') !== (s.genres||[]).join(',')){ s.genres = next; n++; }
  }
  return n;
}

/* ------------------------------------------------------------
   営業時間

   Places の periods は day(0=日曜) + hour + minute の形で返ります。
     ・中休みがある店は1日に複数の period
     ・日をまたぐ店は close.day が open.day の翌日
     ・24時間営業は close が無い
     ・定休日はその曜日の period が無いだけ（明示されない）

   これを「週の通し分の範囲リスト」に直して保存し、日またぎを解決します。
   ------------------------------------------------------------ */
function normHours(ro){
  if(!ro || !Array.isArray(ro.periods) || !ro.periods.length) return null;
  const text = Array.isArray(ro.weekdayDescriptions) ? ro.weekdayDescriptions.slice() : [];
  const ranges = [];

  for(const p of ro.periods){
    if(!p || !p.open) continue;
    const s = num(p.open.day)*1440 + num(p.open.hour)*60 + num(p.open.minute);

    // close が無い＝24時間営業
    if(!p.close) return { always:true, ranges:[{ s:0, e:WEEK_MIN }], text };

    let e = num(p.close.day)*1440 + num(p.close.hour)*60 + num(p.close.minute);
    if(e <= s) e += WEEK_MIN;                     // 土曜深夜→日曜のように週をまたぐ場合
    if(e > WEEK_MIN){                             // 週の境界で2本に割る
      ranges.push({ s, e: WEEK_MIN });
      ranges.push({ s: 0, e: e - WEEK_MIN });
    }else{
      ranges.push({ s, e });
    }
  }
  return ranges.length ? { always:false, ranges, text } : null;
}

/** 営業中か。true / false / null（営業時間が未取得で分からない） */
function isOpen(sh, at){
  if(!sh) return null;
  if(sh.bizStatus === 'CLOSED_PERMANENTLY') return false;
  if(!sh.hours) return null;
  if(sh.hours.always) return true;
  const m = (at != null) ? num(at) : shopWeekMin(sh);
  return (sh.hours.ranges||[]).some(r => m >= r.s && m < r.e);
}

/** 閉店まであと何分か。営業中でなければ null、24時間営業も null */
function minsToClose(sh, at){
  if(isOpen(sh, at) !== true) return null;
  if(!sh.hours || sh.hours.always) return null;
  const m = (at != null) ? num(at) : shopWeekMin(sh);
  let best = null;
  for(const r of (sh.hours.ranges||[])){
    if(m >= r.s && m < r.e){ const d = r.e - m; if(best == null || d < best) best = d; }
  }
  return best;
}

/** 営業状態のバッジ。祝日・臨時休業は反映されないので注記も添える */
function openBadge(sh, at){
  const o = isOpen(sh, at);
  if(o === null) return '<span class="tag na">営業時間 不明</span>';
  if(o === false) return '<span class="tag closed">営業時間外</span>';
  const left = minsToClose(sh, at);
  if(left != null && left <= 60) return `<span class="tag soon">あと${left}分で閉店</span>`;
  return '<span class="tag open">営業中</span>';
}

/* ------------------------------------------------------------
   キーワード検索

   店名・種別・住所・メモ・タグ・ジャンル名を横断して、
   空白区切りのすべての語を含む店を返します（AND検索）。
   ------------------------------------------------------------ */
function haystack(sh){
  const gl = (sh.genres||[]).map(id => genreOf(id).label);
  return normName([sh.name, sh.typeJa, sh.addr, sh.memo,
                   ...(sh.tags||[]), ...(sh.lists||[]), ...gl].join(' '));
}
function kwMatch(sh, kw){
  if(!kw) return true;
  const terms = String(kw).split(/[\s　]+/).filter(Boolean).map(normName).filter(Boolean);
  if(!terms.length) return true;
  const hay = sh._hay || (sh._hay = haystack(sh));   // 保存には含めない（03-storage.js の save 参照）
  return terms.every(t => hay.includes(t));
}
/** 店を編集したら検索用キャッシュを捨てる */
function clearHay(){ for(const s of DB.shops) delete s._hay; }

/* ------------------------------------------------------------
   絞り込み

   q   … { genres:[], kw:'', openOnly:false, radius:0 }
   pos … { lat, lng } 現在地。無ければ null
   at  … 週の通し分（省略時は各店の現地時刻。テストではここに固定値を入れる）

   返り値は [{ s: 店, dist: 距離(m) または null }] の配列。
   ------------------------------------------------------------ */
function searchShops(q, pos, at){
  q = q || {};
  let list = DB.shops.filter(s => s.bizStatus !== 'CLOSED_PERMANENTLY');

  const gs = new Set(q.genres || []);
  if(gs.size) list = list.filter(s => (s.genres||[]).some(g => gs.has(g)));

  if(q.list) list = list.filter(s => (s.lists||[]).includes(q.list));

  if(q.rate) list = list.filter(s => num(s.myRate) >= num(q.rate));   // My評価（★の数）で絞る

  if(q.kw) list = list.filter(s => kwMatch(s, q.kw));

  if(q.openOnly) list = list.filter(s => {
    const o = isOpen(s, at);
    return o === true || (o === null && DB.settings.unknownHours);
  });

  let rows = list.map(s => ({ s, dist: pos ? haversine(pos, s) : null }));

  /* 距離で絞るときは、位置が分からない店は外す（「500m以内」に混ぜると紛らわしいため）。
     外した件数は画面側で「位置未取得の N 軒は除外」と伝えます */
  if(q.radius && pos) rows = rows.filter(r => r.dist != null && r.dist <= num(q.radius));

  rows.sort(cmpRow);
  return rows;
}

/** 距離が分かる店を近い順に。分からない店は末尾へ（評価の高い順） */
function cmpRow(a, b){
  if(a.dist != null && b.dist != null)
    return a.dist - b.dist || a.s.nameKey.localeCompare(b.s.nameKey, 'ja');
  if(a.dist != null) return -1;
  if(b.dist != null) return 1;
  return num(b.s.myRate) - num(a.s.myRate) || a.s.nameKey.localeCompare(b.s.nameKey, 'ja');
}

/* ------------------------------------------------------------
   ルーレット

   RAND はテストで固定値に差し替えられるよう、変数にしてあります。
   ------------------------------------------------------------ */
let RAND = Math.random;

/** 候補から1軒選ぶ。直前と同じ店はなるべく避ける。0件なら null */
function roulette(rows){
  if(!rows || !rows.length) return null;
  let pick = rows[0];
  for(let i = 0; i < 8; i++){
    pick = rows[Math.floor(RAND() * rows.length)] || rows[0];
    if(rows.length === 1 || pick.s.id !== DB.settings.lastRoulette) break;
  }
  DB.settings.lastRoulette = pick.s.id;   // 保存は呼び出し側で save() する
  return pick;
}
