/* ============================================================
   食べ探 — 動作テスト

   tools/test.html をブラウザで開くと実行されます（Node.js は不要）。
   計算式や判定ロジックを触ったら、ここに検証も追加してください。
   ============================================================ */
(async function(){

let pass = 0, fail = 0;
const out = [];

function ok(name, cond, detail){
  if(cond){ pass++; out.push(`<div class="ok">✓ ${esc(name)}</div>`); }
  else{
    fail++;
    out.push(`<div class="ng">✗ ${esc(name)}</div>`
           + (detail ? `<div class="why">${esc(detail)}</div>` : ''));
  }
}
const eq = (name, got, want) =>
  ok(name, got === want, `期待 ${JSON.stringify(want)} / 実際 ${JSON.stringify(got)}`);
const near = (name, got, want, tol) =>
  ok(name, Math.abs(got - want) <= tol, `期待 ${want}±${tol} / 実際 ${got}`);
const section = t => out.push(`<div class="sec">${esc(t)}</div>`);
const noThrow = (name, fn) => {
  try{ fn(); ok(name, true); }
  catch(e){ ok(name, false, e.message); }
};

/* ============================================================
   1. 日付（UTC基準）
   ============================================================ */
section('日付');
eq('addDays 通常',              addDays('2026-08-14', 3),  '2026-08-17');
eq('addDays 月をまたぐ',        addDays('2026-08-30', 3),  '2026-09-02');
eq('addDays 年をまたぐ',        addDays('2026-12-30', 3),  '2027-01-02');
eq('addDays 負の日数',          addDays('2026-01-02', -3), '2025-12-30');
eq('addDays うるう年 2/28→3/1', addDays('2028-02-28', 2),  '2028-03-01');
eq('addDays 平年 2/28→3/1',     addDays('2026-02-28', 1),  '2026-03-01');
eq('diffDays',                  diffDays('2026-08-14','2026-08-17'), 3);
eq('diffDays 逆向き',           diffDays('2026-08-17','2026-08-14'), -3);
eq('diffDays 不正な入力は0',    diffDays('', '2026-08-14'), 0);
ok('today が YYYY-MM-DD 形式',  /^\d{4}-\d{2}-\d{2}$/.test(today()), today());

/* ============================================================
   2. 時刻 — 営業中判定の土台
      日本時間の深夜に前日へずれないことが最重要
   ============================================================ */
section('時刻');
const FRI_0030 = new Date('2026-08-14T00:30:00+09:00');   // 2026-08-14 は金曜
const FRI = 5;
eq('JST深夜0:30が金曜のまま',   shopWeekMin({ utcOffset: 540 }, FRI_0030), FRI*1440 + 30);
eq('utcOffset 未指定はJST扱い', shopWeekMin({}, FRI_0030),                 FRI*1440 + 30);
eq('shop が null でもJST扱い',  shopWeekMin(null, FRI_0030),               FRI*1440 + 30);
eq('UTCの店なら木曜15:30',      shopWeekMin({ utcOffset: 0 }, FRI_0030),   4*1440 + 15*60 + 30);
eq('nowWeekMin は端末ローカル', nowWeekMin(FRI_0030),                      FRI*1440 + 30);
eq('週の先頭 日曜0:00 = 0',
   shopWeekMin({ utcOffset: 540 }, new Date('2026-08-16T00:00:00+09:00')), 0);
eq('週の末尾 土曜23:59',
   shopWeekMin({ utcOffset: 540 }, new Date('2026-08-15T23:59:00+09:00')), WEEK_MIN - 1);
eq('weekMinLabel',              weekMinLabel(FRI*1440 + 30), '金 00:30');
eq('weekMinLabel は週を折り返す', weekMinLabel(WEEK_MIN + 90), '日 01:30');

/* ============================================================
   3. 文字列の正規化
   ============================================================ */
section('正規化');
eq('半角カナ→カタカナ',  normName('ﾗｰﾒﾝ'),          normName('ラーメン'));
eq('ひらがな→カタカナ',  normName('らーめん'),       normName('ラーメン'));
eq('空白を無視',         normName('麺屋 こうじ'),    normName('麺屋こうじ'));
eq('全角空白を無視',     normName('麺屋　こうじ'),   normName('麺屋こうじ'));
eq('英字の大小を無視',   normName('Ramen'),          normName('RAMEN'));
eq('全角英数→半角',     normName('ＲＡＭＥＮ'),     normName('ramen'));
eq('中黒を無視',         normName('串カツ・田中'),   normName('串カツ田中'));
eq('括弧を無視',         normName('日高屋（新宿店）'), normName('日高屋新宿店'));
eq('null は空文字',      normName(null), '');
ok('別の店は一致しない', normName('麺屋こうじ') !== normName('麺屋こうへい'));

/* ============================================================
   4. 距離
   ============================================================ */
section('距離');
const TOKYO     = { lat: 35.6812, lng: 139.7671 };   // 東京駅
const SHINAGAWA = { lat: 35.6285, lng: 139.7387 };   // 品川駅
near('東京駅↔品川駅 ≒6.4km', haversine(TOKYO, SHINAGAWA), 6400, 200);
eq('同じ地点は0',            haversine(TOKYO, TOKYO), 0);
eq('向きを変えても同じ',     haversine(TOKYO, SHINAGAWA), haversine(SHINAGAWA, TOKYO));
eq('座標が無ければ null',    haversine(TOKYO, { lat: null, lng: null }), null);
eq('片方が null でも null',  haversine(null, TOKYO), null);
eq('fmtDist メートル',       fmtDist(850),   '850m');
eq('fmtDist キロ',           fmtDist(6400),  '6.4km');
eq('fmtDist 10km以上は整数', fmtDist(12300), '12km');
eq('fmtDist null',           fmtDist(null),  '—');

/* ============================================================
   5. ジャンル定義
   ============================================================ */
section('ジャンル');
ok('既定ジャンルが11種以上',         GENRES.length >= 11, `${GENRES.length} 種`);
ok('IDが重複していない',             new Set(GENRES.map(g => g.id)).size === GENRES.length);
ok('「その他」がある',               GENRES.some(g => g.id === 'other'));
ok('全ジャンルに label と icon',     GENRES.every(g => g.label && g.icon));
ok('全ジャンルに types と words の配列', GENRES.every(g => Array.isArray(g.types) && Array.isArray(g.words)));

/* ============================================================
   6. ストレージ
   ============================================================ */
section('ストレージ');
ok('テスト用の localStorage に差し替わっている', window.__lsFake === true,
   '差し替えに失敗しました。実データが書き換わる恐れがあるためテストを中止してください');

load();
ok('load で DB ができる', !!DB);
eq('初期状態は0軒',       DB.shops.length, 0);
ok('初期ジャンルが入る',  DB.genres.length >= 11);
eq('データ形式のバージョン', DB._v, 1);
eq('本日の使用回数は0',   DB.settings.usage.n, 0);
eq('genreOf 既知のID',    genreOf('ramen').label, 'ラーメン');
eq('genreOf 未知のIDでも落ちない', genreOf('zzz').label, 'zzz');
eq('genreLabels',         genreLabels(['ramen','sushi']).join('/'), '🍜ラーメン/🍣寿司');

const s1 = putShop(newShop({ name: '麺屋 こうじ', genres: ['ramen'], lat: 35.68, lng: 139.76 }));
eq('putShop で1軒増える',      DB.shops.length, 1);
eq('putShop が nameKey を作る', s1.nameKey, normName('麺屋 こうじ'));
eq('shopOf で引ける',          shopOf(s1.id).name, '麺屋 こうじ');
s1.memo = 'つけ麺がうまい';
putShop(s1);
eq('同じIDなら上書き',         DB.shops.length, 1);
eq('中身が更新される',         shopOf(s1.id).memo, 'つけ麺がうまい');

const s2 = putShop(newShop({ name: '鮨 たなか', genres: ['sushi'] }));
eq('2軒目が入る',              DB.shops.length, 2);
eq('pendingCount は座標なしの数', pendingCount(), 1);

DB.visits.push({ id:'V-1', shop:s1.id, date:'2026-08-01', memo:'' });
DB.visits.push({ id:'V-2', shop:s1.id, date:'2026-08-10', memo:'' });
eq('visitsOf の件数',   visitsOf(s1.id).length, 2);
eq('visitsOf は新しい順', visitsOf(s1.id)[0].date, '2026-08-10');
eq('lastVisit',         lastVisit(s1.id), '2026-08-10');
eq('記録が無ければ空文字', lastVisit(s2.id), '');

/* 保存に検索キャッシュ _hay が混ざらないこと（混ざると保存が無駄に膨らむ） */
DB.shops[0]._hay = 'キャッシュ';
save();
const saved = window.__mem[LS_KEY] || '';
ok('save の中身が JSON として読める', (() => { try{ JSON.parse(saved); return true; }catch(e){ return false; } })());
ok('save に _hay が混ざらない', !saved.includes('_hay'), saved.slice(0, 160));

/* 削除で関連データも消えること */
DB.queue.push(s1.id);
delShop(s1.id);
eq('delShop で店が減る',         DB.shops.length, 1);
eq('delShop で訪問記録も消える', DB.visits.filter(v => v.shop === s1.id).length, 0);
eq('delShop でキューからも消える', DB.queue.includes(s1.id), false);

/* ============================================================
   7. 移行 — 欠けたフィールドがあっても落ちないこと
   ============================================================ */
section('移行');
DB = { shops: [{ id:'S-old', name:'古い店' }] };        // _v も settings も無い旧データ
noThrow('旧データを移行しても例外が出ない', () => migrate());
eq('店は残る',                 DB.shops.length, 1);
ok('欠けたフィールドが埋まる', Array.isArray(DB.shops[0].genres));
eq('nameKey が作られる',       DB.shops[0].nameKey, normName('古い店'));
eq('settings が埋まる',        DB.settings.dailyLimit, 100);
ok('genres が埋まる',          DB.genres.length >= 11);
eq('_v が上がる',              DB._v, 1);

DB = { shops: [], visits: [{ id:'V-x', shop:'S-missing', date:'2026-01-01' }], queue: ['S-missing'] };
migrate();
eq('消えた店の訪問記録は掃除される', DB.visits.length, 0);
eq('消えた店のキューは掃除される',   DB.queue.length, 0);

DB = seed();
DB.settings.usage = { date: '2020-01-01', n: 57 };
migrate();
eq('日付が変われば使用回数がリセット', DB.settings.usage.n, 0);
eq('使用回数の日付は本日',             DB.settings.usage.date, today());

/* ============================================================
   8. 画面の描画 — 空でも実データでも例外が出ないこと
   ============================================================ */
section('描画');
function renderAll(label){
  for(const [k, name] of TABS){
    if(!VIEWS[k]){ ok(`${label}${name} は未実装（準備中で表示）`, true); continue; }
    let html = '', err = '';
    try{ html = VIEWS[k](); }catch(e){ err = e.message; }
    ok(`${label}${name} が描画できる`, !err && typeof html === 'string' && html.length > 0, err);
  }
}
DB = seed(); migrate();
renderAll('空データ: ');

putShop(newShop({ name:'麺屋 こうじ', genres:['ramen'], lat:35.68, lng:139.76,
                  memo:'つけ麺がうまい', myRate:4, tags:['一人向き'], fav:true }));
putShop(newShop({ name:'鮨 たなか', genres:['sushi','washoku'], myRate:5 }));
putShop(newShop({ name:'<script>危険</scr'+'ipt>', memo:'エスケープの確認 & "引用符"' }));
renderAll('実データ: ');

/* 本物のDOMに対して render() が通ること */
for(const [k, name] of TABS){
  TAB = k;
  noThrow(`render() が通る: ${name}`, () => render());
}
TAB = 'shops';

/* 店の詳細・編集 */
SEL.shop = DB.shops[0].id; SEL.edit = false;
noThrow('店の詳細が描画できる', () => VIEWS.shops());
SEL.shop = 'S-notfound';
noThrow('存在しないIDでも落ちない', () => VIEWS.shops());
SEL.shop = DB.shops[0].id;
EDIT = JSON.parse(JSON.stringify(DB.shops[0])); SEL.edit = true;
noThrow('編集画面が描画できる', () => VIEWS.shops());
SEL.shop = null; SEL.edit = false; EDIT = null;

/* HTMLエスケープ — ここが漏れると壊れた店名で画面が崩れる */
const listHtml = shopListItemsHTML();
ok('店名の < > がエスケープされる', !listHtml.includes('<script>危険'), '危険なタグがそのまま出ています');
ok('& と " がエスケープされる',     listHtml.includes('&amp;') && listHtml.includes('&quot;'));
eq('一覧に3軒出る', (listHtml.match(/class="card"/g) || []).length, 3);

/* 絞り込み */
SHOP_Q = { kw:'こうじ', sort:'name', only:'' };
eq('キーワードで絞れる',   (shopListItemsHTML().match(/class="card"/g) || []).length, 1);
SHOP_Q = { kw:'コウジ', sort:'name', only:'' };
eq('カタカナでも同じ店が出る', (shopListItemsHTML().match(/class="card"/g) || []).length, 1);
SHOP_Q = { kw:'', sort:'name', only:'nopos' };
eq('位置が未取得だけに絞れる', (shopListItemsHTML().match(/class="card"/g) || []).length, 2);
SHOP_Q = { kw:'', sort:'name', only:'fav' };
eq('ピン留めだけに絞れる',     (shopListItemsHTML().match(/class="card"/g) || []).length, 1);
SHOP_Q = { kw:'', sort:'name', only:'' };

/* ============================================================
   9. リンク生成
   ============================================================ */
section('リンク');
const withPos = DB.shops.find(s => s.lat != null);
const noPos   = DB.shops.find(s => s.lat == null);
ok('mapsUrl が Google マップを指す', mapsUrl(withPos).startsWith('https://www.google.com/maps/'));
ok('座標があれば座標で開く',         mapsUrl(withPos).includes('35.68'));
ok('座標が無ければ店名で開く',       mapsUrl(noPos).includes(encodeURIComponent(noPos.name)));
ok('routeUrl が経路案内を指す',      routeUrl(withPos).includes('/maps/dir/'));

/* ============================================================
   10. ジャンルの自動判定
   ============================================================ */
section('ジャンルの自動判定');
DB = seed(); migrate();
const gg = o => guessGenres(newShop(o)).sort().join(',');
eq('primaryType を最優先',        gg({ primaryType:'ramen_restaurant', types:['restaurant'] }), 'ramen');
eq('primaryType が無ければ types', gg({ types:['sushi_restaurant'] }), 'sushi');
eq('店名のキーワードで補う',      gg({ name:'麺屋こうじ' }), 'ramen');
eq('粗いカテゴリでも店名で拾う',
   gg({ name:'中華そば 一番', primaryType:'japanese_restaurant' }).includes('ramen'), true);
eq('メモからも拾う',              gg({ name:'ABC', memo:'ここの寿司はうまい' }), 'sushi');
eq('該当が無ければ その他',       gg({ name:'ABC', primaryType:'zzz_restaurant' }), 'other');
ok('複数ジャンルを持てる',        guessGenres(newShop({ name:'焼肉ホルモン酒場' })).length >= 2);

DB.shops = [];
const auto = putShop(newShop({ name:'麺屋こうじ' }));
const manu = putShop(newShop({ name:'鮨たなか', genres:['ramen'], genresManual:true }));
eq('reguessAll が付け直す', reguessAll(), 1);
eq('自動の店は直る',        shopOf(auto.id).genres.join(','), 'ramen');
eq('手で直した店は触らない', shopOf(manu.id).genres.join(','), 'ramen');

/* ============================================================
   11. 営業時間の正規化と営業中判定

   ここが最も間違えやすい箇所です。日またぎ・週またぎ・境界値を必ず確認します。
   ============================================================ */
section('営業時間');
const wm = (day, h, m) => day*1440 + h*60 + (m||0);
const P  = (od,oh,om,cd,ch,cm) => ({ open:{day:od,hour:oh,minute:om||0},
                                     close:{day:cd,hour:ch,minute:cm||0} });
const mk = periods => newShop({ hours: normHours({ periods }) });

/* 月 11:00-14:30 と 18:00-翌2:00（中休みあり・日またぎあり） */
const lunch  = P(1,11,0, 1,14,30);
const dinner = P(1,18,0, 2,2,0);
const sh1 = mk([lunch, dinner]);

eq('通常の時間帯は営業中',        isOpen(sh1, wm(1,12,0)),  true);
eq('中休みは営業時間外',          isOpen(sh1, wm(1,16,0)),  false);
eq('日またぎ 当日側は営業中',     isOpen(sh1, wm(1,23,0)),  true);
eq('日またぎ 翌日側も営業中',     isOpen(sh1, wm(2,1,30)),  true);
eq('日またぎ 閉店後は営業時間外', isOpen(sh1, wm(2,2,30)),  false);
eq('開店ちょうどは営業中',        isOpen(sh1, wm(1,11,0)),  true);
eq('閉店ちょうどは営業時間外',    isOpen(sh1, wm(1,14,30)), false);
eq('定休日（periodが無い曜日）',  isOpen(sh1, wm(3,12,0)),  false);

/* 土 20:00 - 日 03:00（週の境界をまたぐ） */
const sh2 = mk([P(6,20,0, 0,3,0)]);
eq('週またぎ 土曜側は営業中',     isOpen(sh2, wm(6,22,0)), true);
eq('週またぎ 日曜側も営業中',     isOpen(sh2, wm(0,1,0)),  true);
eq('週またぎ 閉店後は営業時間外', isOpen(sh2, wm(0,4,0)),  false);
eq('週またぎで範囲が2本に割れる', sh2.hours.ranges.length, 2);

/* 24時間営業（close が無い） */
const sh24 = newShop({ hours: normHours({ periods:[{ open:{day:0,hour:0,minute:0} }] }) });
eq('24時間営業は always',      sh24.hours.always, true);
eq('24時間営業はいつでも営業中', isOpen(sh24, wm(3,4,0)), true);
eq('24時間営業は閉店時刻なし',   minsToClose(sh24, wm(3,4,0)), null);

/* 未取得・閉業 */
eq('営業時間が未取得なら null',  isOpen(newShop({}), wm(1,12,0)), null);
eq('periods が空なら null',      normHours({ periods:[] }), null);
eq('引数が無くても落ちない',     normHours(null), null);
eq('閉業した店は常に営業時間外',
   isOpen(newShop({ bizStatus:'CLOSED_PERMANENTLY', hours: normHours({ periods:[lunch] }) }), wm(1,12,0)), false);
eq('shop が null なら null',     isOpen(null, wm(1,12,0)), null);

/* 閉店までの残り時間 */
eq('閉店まで30分',      minsToClose(sh1, wm(1,14,0)), 30);
eq('閉店まで（日またぎ）', minsToClose(sh1, wm(2,1,0)), 60);
eq('営業時間外は null',  minsToClose(sh1, wm(1,16,0)), null);

/* バッジ */
ok('営業中バッジ',        openBadge(sh1, wm(1,12,0)).includes('営業中'));
ok('まもなく閉店バッジ',  openBadge(sh1, wm(1,14,0)).includes('あと30分'));
ok('営業時間外バッジ',    openBadge(sh1, wm(1,16,0)).includes('営業時間外'));
ok('不明バッジ',          openBadge(newShop({}), wm(1,12,0)).includes('不明'));

/* ============================================================
   12. キーワード検索
   ============================================================ */
section('キーワード検索');
const kwShop = newShop({ name:'麺屋 こうじ', memo:'つけ麺がうまい', tags:['一人向き'],
                         genres:['ramen'], addr:'東京都新宿区' });
ok('店名で当たる',       kwMatch(kwShop, '麺屋'));
ok('メモで当たる',       kwMatch(kwShop, 'つけ麺'));
ok('タグで当たる',       kwMatch(kwShop, '一人向き'));
ok('住所で当たる',       kwMatch(kwShop, '新宿'));
ok('ジャンル名で当たる', kwMatch(kwShop, 'ラーメン'));
ok('ひらがなでも当たる', kwMatch(kwShop, 'らーめん'));
ok('AND検索（両方含む）', kwMatch(kwShop, '麺屋 つけ麺'));
ok('AND検索（片方が無ければ外れる）', !kwMatch(kwShop, '麺屋 焼肉'));
ok('全角空白も区切りになる', kwMatch(kwShop, '麺屋　つけ麺'));
ok('空文字はすべて通す',  kwMatch(kwShop, ''));
ok('関係ない語は外れる',  !kwMatch(kwShop, '寿司'));

/* ============================================================
   13. 絞り込みパイプライン
   ============================================================ */
section('絞り込み');
DB = seed(); migrate();
const HERE = { lat: 35.6812, lng: 139.7671 };                       // 東京駅
const near1 = putShop(newShop({ name:'近いラーメン', genres:['ramen'],
                    lat:35.6820, lng:139.7680, hours: normHours({ periods:[lunch] }) }));
const far1  = putShop(newShop({ name:'遠い寿司',   genres:['sushi'],
                    lat:35.6285, lng:139.7387 }));                  // 品川駅 ≒6.4km
const nopos = putShop(newShop({ name:'位置不明の焼肉', genres:['yakiniku'], myRate:5 }));
const gone  = putShop(newShop({ name:'閉業した店', genres:['ramen'],
                    lat:35.6813, lng:139.7672, bizStatus:'CLOSED_PERMANENTLY' }));

let rows = searchShops({}, HERE, wm(1,12,0));
eq('閉業した店は出ない',   rows.some(r => r.s.id === gone.id), false);
eq('残り3軒',              rows.length, 3);
eq('近い順に並ぶ（1番目）', rows[0].s.id, near1.id);
eq('近い順に並ぶ（2番目）', rows[1].s.id, far1.id);
eq('位置不明は末尾',       rows[2].s.id, nopos.id);
eq('位置不明の距離は null', rows[2].dist, null);
near('距離が計算される',   rows[1].dist, 6400, 300);

eq('ジャンルで絞れる',
   searchShops({ genres:['sushi'] }, HERE, wm(1,12,0)).length, 1);
eq('複数ジャンルは OR',
   searchShops({ genres:['sushi','yakiniku'] }, HERE, wm(1,12,0)).length, 2);
eq('キーワードで絞れる',
   searchShops({ kw:'焼肉' }, HERE, wm(1,12,0)).length, 1);
eq('ジャンルとキーワードは AND',
   searchShops({ genres:['sushi'], kw:'焼肉' }, HERE, wm(1,12,0)).length, 0);

eq('距離で絞れる（1km以内）',
   searchShops({ radius:1000 }, HERE, wm(1,12,0)).length, 1);
eq('距離で絞ると位置不明は外れる',
   searchShops({ radius:1000 }, HERE, wm(1,12,0)).some(r => r.s.id === nopos.id), false);
eq('起点が無ければ距離の絞りは効かない',
   searchShops({ radius:1000 }, null, wm(1,12,0)).length, 3);
eq('起点が無ければ距離はすべて null',
   searchShops({}, null, wm(1,12,0)).every(r => r.dist === null), true);

/* 営業中フィルタ × 営業時間不明の扱い（4通り） */
DB.settings.unknownHours = true;
eq('営業中のみ＋不明も出す（営業時間内）', searchShops({ openOnly:true }, HERE, wm(1,12,0)).length, 3);
eq('営業中のみ＋不明も出す（営業時間外）', searchShops({ openOnly:true }, HERE, wm(1,16,0)).length, 2);
DB.settings.unknownHours = false;
eq('営業中のみ＋不明は隠す（営業時間内）', searchShops({ openOnly:true }, HERE, wm(1,12,0)).length, 1);
eq('営業中のみ＋不明は隠す（営業時間外）', searchShops({ openOnly:true }, HERE, wm(1,16,0)).length, 0);
DB.settings.unknownHours = true;

/* ============================================================
   14. ルーレット
   ============================================================ */
section('ルーレット');
rows = searchShops({}, HERE, wm(1,12,0));
const realRand = RAND;
RAND = () => 0;
eq('乱数を固定すれば1番目が出る', roulette(rows).s.id, rows[0].s.id);
RAND = () => 0.99;
eq('乱数を変えれば最後が出る',   roulette(rows).s.id, rows[rows.length-1].s.id);
eq('候補が0件なら null',          roulette([]), null);
eq('引数が無くても落ちない',      roulette(null), null);

/* 直前と同じ店を避ける（乱数が1番目を指し続けても2番目に逃げる） */
DB.settings.lastRoulette = rows[0].s.id;
let calls = 0;
RAND = () => { calls++; return calls <= 1 ? 0 : 0.5; };
ok('直前と同じ店は避ける', roulette(rows).s.id !== rows[0].s.id);

/* 候補が1軒しか無ければ、直前と同じでもそれを返す */
DB.settings.lastRoulette = rows[0].s.id;
RAND = () => 0;
eq('候補が1軒ならそれを返す', roulette([rows[0]]).s.id, rows[0].s.id);
RAND = realRand;

/* ============================================================
   15. 探す・結果の画面
   ============================================================ */
section('探す・結果');
DB = seed(); migrate();
putShop(newShop({ name:'麺屋こうじ', genres:['ramen'], lat:35.6820, lng:139.7680,
                  hours: normHours({ periods:[lunch] }) }));
putShop(newShop({ name:'鮨たなか', genres:['sushi'], lat:35.6285, lng:139.7387 }));
Q = { genres:[], kw:'', openOnly:false, radius:0 };
POS = null; PICK = null; SEL.sub = '';

noThrow('探す画面（起点なし）',   () => VIEWS.find());
POS = { lat:35.6812, lng:139.7671, acc:20, label:'現在地' };
GEO = 'ok';
noThrow('探す画面（起点あり）',   () => VIEWS.find());
GEO = 'deny'; GEOERR = '位置情報の利用が許可されていません';
noThrow('探す画面（位置を拒否）', () => VIEWS.find());
GEO = 'loading';
noThrow('探す画面（取得中）',     () => VIEWS.find());
GEO = 'ok';

noThrow('結果画面（リスト）', () => VIEWS.result());
SEL.sub = 'map';
noThrow('結果画面（地図）',   () => VIEWS.result());
SEL.sub = '';

ok('結果に2軒出る', (resultListHTML().match(/class="card"/g) || []).length === 2);
ok('結果に距離が出る', resultListHTML().includes('m<') || resultListHTML().includes('km<'));
Q.genres = ['ramen'];
eq('ジャンルを選ぶと絞られる', (resultListHTML().match(/class="card"/g) || []).length, 1);
Q.genres = []; Q.kw = 'ありえない語';
ok('該当0件でも落ちない', resultListHTML().length > 0);
Q.kw = '';

PICK = roulette(currentRows());
SEL.sub = 'pick';
noThrow('ルーレット結果の画面', () => VIEWS.result());
SEL.sub = ''; PICK = null;

/* 条件の要約 */
Q = { genres:['ramen'], kw:'つけ麺', openOnly:true, radius:1000 };
const cond = condHTML();
ok('条件に ジャンルが出る',   cond.includes('ラーメン'));
ok('条件に キーワードが出る', cond.includes('つけ麺'));
ok('条件に 営業中が出る',     cond.includes('今やってる'));
ok('条件に 距離が出る',       cond.includes('1km'));
Q = { genres:[], kw:'', openOnly:false, radius:0 };
POS = null; GEO = 'idle';

/* ============================================================
   16. CSV パーサ

   店名やメモにカンマ・改行・引用符が入っていても壊れないことを確認します。
   ============================================================ */
section('CSV パーサ');
const C = parseCSV;
eq('基本',              JSON.stringify(C('a,b\n1,2')),            '[["a","b"],["1","2"]]');
eq('引用符内のカンマ',   C('a,b\n"麺屋, 二号店",x')[1][0],         '麺屋, 二号店');
eq('引用符内の改行',     C('a,b\n"1行目\n2行目",x')[1][0],         '1行目\n2行目');
eq('"" はエスケープ',   C('a\n"彼は""うまい""と言った"')[1][0],   '彼は"うまい"と言った');
eq('BOM を取り除く',    C('﻿Title,URL\nA,B')[0][0],          'Title');
eq('CRLF',              C('a,b\r\n1,2\r\n')[1][1],                '2');
eq('最後に改行が無くても読める', C('a,b\n1,2')[1][1],             '2');
eq('空行は落とす',      C('a,b\n\n\n1,2\n\n').length,             2);
eq('カンマだけの行も落とす', C('a,b\n,,\n1,2').length,             2);
eq('空のセルは残る',    C('a,b,c\n1,,3')[1][1],                   '');
eq('列数が揃わなくても読む', C('a,b,c\n1,2')[1].length,           2);
eq('空文字なら0行',     C('').length,                             0);
eq('null でも落ちない', C(null).length,                           0);

/* ============================================================
   17. 列の割り当て
   ============================================================ */
section('列の割り当て');
eq('Takeout の標準的な並び', JSON.stringify(mapHeader(['Title','Note','URL','Comment'])),
   '{"title":0,"note":1,"url":2,"comment":3}');
eq('大小を問わない',   mapHeader(['title','url']).url, 1);
eq('並びが違っても引ける', mapHeader(['URL','Title']).title, 1);
eq('日本語の見出し',   mapHeader(['名前','リンク']).url, 1);
eq('Note 列が無い',    mapHeader(['Title','URL']).note, undefined);
eq('知らない見出しは無視', mapHeader(['なんとか','Title']).title, 1);

/* ============================================================
   18. Google マップ URL からの情報の取り出し
   ============================================================ */
section('URL の解析');
const U = parseMapsUrl;
const u1 = U('https://www.google.com/maps/search/?api=1&query=%E9%BA%BA%E5%B1%8B&query_place_id=ChIJN1t_tDeuEmsRUsoyG83frY4');
eq('place_id を取り出す', u1.placeId, 'ChIJN1t_tDeuEmsRUsoyG83frY4');
eq('place_id は srcId にもなる', u1.srcId, 'pid:ChIJN1t_tDeuEmsRUsoyG83frY4');
eq('query から店名',      u1.name, '麺屋');

const u2 = U('https://www.google.com/maps/place/%E9%BA%BA%E5%B1%8B%E3%81%93%E3%81%86%E3%81%98/@35.6812,139.7671,17z/data=!4m2!3m1!1s0x60188c0d02b0:0xabc123');
eq('パスから店名',        u2.name, '麺屋こうじ');
near('@ から緯度',        u2.lat, 35.6812, 0.0001);
near('@ から経度',        u2.lng, 139.7671, 0.0001);
eq('ftid を srcId に',    u2.srcId, 'ftid:0x60188c0d02b0:0xabc123');

const u3 = U('https://www.google.com/maps/place/X/@35.0,139.0,17z/data=!3m1!4b1!4m5!3m4!1s0x1:0x2!8m2!3d35.6812!4d139.7671');
near('!3d!4d を @ より優先', u3.lat, 35.6812, 0.0001);

eq('cid を取り出す',      U('https://maps.google.com/?cid=1234567890').srcId, 'cid:1234567890');
eq('+ は空白になる',      U('https://www.google.com/maps/place/Sushi+Tanaka/').name, 'Sushi Tanaka');
eq('?q=座標 は店名にしない', U('https://www.google.com/maps?q=35.68,139.76').name, '');
near('?q=座標 は座標として読む', U('https://www.google.com/maps?q=35.68,139.76').lat, 35.68, 0.001);

const uShort = U('https://maps.app.goo.gl/abcd1234');
ok('短縮URLからは何も取れない',
   !uShort.placeId && uShort.lat === null && !uShort.name && !uShort.srcId);
ok('空でも落ちない', U('').placeId === '' && U(null).lat === null);
eq('範囲外の座標は捨てる', U('https://www.google.com/maps/place/X/@999,999,17z/').lat, null);

/* ============================================================
   19. 重複判定
   ============================================================ */
section('重複判定');
DB = seed(); migrate();
const base = putShop(newShop({ name:'サイゼリヤ', placeId:'ChIJ_AAA', srcId:'pid:ChIJ_AAA',
                               lat:35.6812, lng:139.7671 }));
const mkC = o => { const c = newShop(o); c.nameKey = normName(c.name); return c; };

eq('placeId が一致 → 既存',
   findDup(mkC({ name:'違う名前', placeId:'ChIJ_AAA' }), DB.shops).why, 'placeId');
eq('srcId が一致 → 既存',
   findDup(mkC({ name:'違う名前', srcId:'pid:ChIJ_AAA' }), DB.shops).why, 'srcId');
eq('同名かつ100m以内 → 既存',
   findDup(mkC({ name:'サイゼリヤ', lat:35.6820, lng:139.7671 }), DB.shops).why, 'nearby');
ok('同名かつ100m以内は確認不要',
   findDup(mkC({ name:'サイゼリヤ', lat:35.6820, lng:139.7671 }), DB.shops).check === false);
ok('同名だが5km離れている → 要確認',
   findDup(mkC({ name:'サイゼリヤ', lat:35.6285, lng:139.7387 }), DB.shops).check === true);
ok('同名だが座標が分からない → 要確認',
   findDup(mkC({ name:'サイゼリヤ' }), DB.shops).check === true);
eq('表記ゆれも同名とみなす',
   findDup(mkC({ name:'さいぜりや' }), DB.shops).why, 'name');

/* 短縮URLは中身を展開できないが、URL がそのまま一致すれば同じ登録とみなす。
   これが無いと、同じCSVを取り込み直すたびに同名の店が増えてしまう */
const shortUrl = 'https://maps.app.goo.gl/zzz';
putShop(newShop({ name:'謎の店', srcUrl: shortUrl }));
eq('URL が一致 → 既存',
   findDup(mkC({ name:'謎の店', srcUrl: shortUrl }), DB.shops).why, 'url');
ok('URL 一致は確認不要',
   findDup(mkC({ name:'謎の店', srcUrl: shortUrl }), DB.shops).check === false);
eq('URL が違えば別扱い',
   findDup(mkC({ name:'謎の店', srcUrl:'https://maps.app.goo.gl/yyy' }), DB.shops).why, 'name');
eq('無関係な店 → 新規',
   findDup(mkC({ name:'麺屋こうじ' }), DB.shops).hit, null);

/* ============================================================
   20. 既存への重ね方 — ユーザー資産を壊さないこと
   ============================================================ */
section('取り込みの重ね方');
const mine = putShop(newShop({ name:'麺屋こうじ', myRate:5, tags:['一人向き'],
                               memo:'私のメモ', fav:true, genres:['ramen'], genresManual:true }));
mergeShop(mine, newShop({ name:'麺屋こうじ', placeId:'ChIJ_BBB', lat:35.68, lng:139.76,
                          memo:'CSVのメモ', addr:'東京都', srcUrl:'https://x' }));
eq('自分の評価は残る',   mine.myRate, 5);
eq('自分のタグは残る',   mine.tags.join(','), '一人向き');
eq('自分のメモは上書きされない', mine.memo, '私のメモ');
eq('ピン留めは残る',     mine.fav, true);
eq('手で決めたジャンルは残る', mine.genresManual, true);
eq('空だった placeId は埋まる', mine.placeId, 'ChIJ_BBB');
eq('空だった座標は埋まる', mine.lat, 35.68);
eq('空だった住所は埋まる', mine.addr, '東京都');

const blank = newShop({ name:'空の店' });
mergeShop(blank, newShop({ name:'空の店', memo:'CSVのメモ' }));
eq('メモが空なら CSV の内容が入る', blank.memo, 'CSVのメモ');

/* ============================================================
   21. 取り込みの通し確認
   ============================================================ */
section('取り込み（通し）');
function importCSV(text, label){
  const rows = parseCSV(text);
  const head = rows[0], body = rows.slice(1);
  const idx  = mapHeader(head);
  IMP = { head, body, idx, label: label || '', items: [], stats: null };
  refreshImport();
  const st = Object.assign({}, IMP.stats);
  runImport();
  return st;
}
const CSV1 =
  'Title,Note,URL,Comment\n' +
  '麺屋こうじ,つけ麺がうまい,"https://www.google.com/maps/place/X/@35.6812,139.7671,17z/data=!4m2!3m1!1s0x1:0xa",\n' +
  '鮨たなか,,https://www.google.com/maps/search/?api=1&query=%E9%AE%A8&query_place_id=ChIJ_SUSHI,また行く\n' +
  '位置不明の店,,https://maps.app.goo.gl/zzz,\n';

DB = seed(); migrate();
let st1 = importCSV(CSV1);
eq('3軒が新規',       st1.new, 3);
eq('3軒が登録される', DB.shops.length, 3);
eq('座標が入った店がある', DB.shops.filter(s => s.lat != null).length, 1);
eq('メモが入る',      DB.shops.find(s => s.name === '麺屋こうじ').memo, 'つけ麺がうまい');
eq('Comment もメモに入る', DB.shops.find(s => s.name === '鮨たなか').memo, 'また行く');
eq('ジャンルが自動で付く', DB.shops.find(s => s.name === '麺屋こうじ').genres.join(','), 'ramen');
eq('位置が無い店はキューに積まれる', DB.queue.length, 2);
eq('取り込み後は確認画面が閉じる', IMP, null);

/* 自分で評価・タグ・メモを付けてから、同じCSVをもう一度読む */
const koji = DB.shops.find(s => s.name === '麺屋こうじ');
koji.myRate = 5; koji.tags = ['一人向き']; koji.memo = '書き換えた私のメモ';
save();

const st2 = importCSV(CSV1);
eq('2回目は新規0件',   st2.new, 0);
eq('2回目は既存3件',   st2.exist, 3);
eq('店の数は増えない', DB.shops.length, 3);
const koji2 = DB.shops.find(s => s.name === '麺屋こうじ');
eq('再取込でも評価は残る', koji2.myRate, 5);
eq('再取込でもタグは残る', koji2.tags.join(','), '一人向き');
eq('再取込でもメモは上書きされない', koji2.memo, '書き換えた私のメモ');
eq('キューは二重に積まれない', DB.queue.length, 2);

/* 同じ CSV の中に同じ店が2回出てきても1軒にまとまる */
DB = seed(); migrate();
importCSV('Title,URL\nA店,https://maps.google.com/?cid=111\nA店,https://maps.google.com/?cid=111\n');
eq('CSV内の重複も1軒にまとまる', DB.shops.length, 1);

/* 同名のチェーン店は勝手にまとめない */
DB = seed(); migrate();
importCSV('Title,URL\nサイゼリヤ,https://www.google.com/maps/place/X/@35.6812,139.7671,17z/\n');
const st3 = (() => {
  const rows = parseCSV('Title,URL\nサイゼリヤ,https://www.google.com/maps/place/X/@35.6285,139.7387,17z/\n');
  IMP = { head: rows[0], body: rows.slice(1), idx: mapHeader(rows[0]), items: [], stats: null };
  refreshImport();
  return Object.assign({}, IMP.stats);
})();
eq('離れた同名店は要確認になる', st3.check, 1);
runImport();
eq('要確認は既定で別の店として追加', DB.shops.length, 2);

/* 名前が取れない行は捨てる */
DB = seed(); migrate();
importCSV('Title,URL\n,https://maps.google.com/?cid=1\n有効な店,https://maps.google.com/?cid=2\n');
eq('名前の無い行は取り込まない', DB.shops.length, 1);

/* ============================================================
   21b. Takeout の JSON（保存した場所.json）

   「マップ（マイプレイス）」で出てくるスター付きの場所。
   GeoJSON 形式で、座標が [経度, 緯度] の順に入っています。
   ============================================================ */
section('JSON の取り込み');
const SAVED_JSON = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    { type:'Feature',
      geometry: { type:'Point', coordinates: [139.7671, 35.6812] },
      properties: {
        date: '2026-01-01T00:00:00Z',
        google_maps_url: 'http://maps.google.com/?cid=555',
        location: { address: '東京都千代田区1-1', country_code:'JP', name: '麺屋こうじ' },
      } },
    { type:'Feature',
      geometry: { type:'Point', coordinates: [0, 0] },          // 座標が入っていないことがある
      properties: {
        google_maps_url: 'http://maps.google.com/?cid=556',
        location: { name: '座標なしの店' },
      } },
  ],
});
let recs = parseSavedJson(SAVED_JSON);
eq('件数',                    recs.length, 2);
eq('店名',                    recs[0].name, '麺屋こうじ');
near('緯度（順序を逆にしない）', recs[0].lat, 35.6812, 0.0001);
near('経度',                  recs[0].lng, 139.7671, 0.0001);
eq('住所',                    recs[0].addr, '東京都千代田区1-1');
eq('URL',                     recs[0].url, 'http://maps.google.com/?cid=555');
eq('[0,0] は座標なしとして扱う', recs[1].lat, null);
eq('壊れた JSON は null',     parseSavedJson('{こわれてる'), null);
eq('features が無ければ null', parseSavedJson('{"a":1}'), null);
eq('CSV を渡しても null',      parseSavedJson('Title,URL\nA,B'), null);

/* 通しで取り込む */
DB = seed(); migrate();
IMP = { kind:'json', recs: parseSavedJson(SAVED_JSON), label:'スター付き', items:[], stats:null };
refreshImport();
eq('2軒とも新規',          IMP.stats.new, 2);
noThrow('JSON の確認画面が描画できる', () => VIEWS.data());
ok('JSON では列の割り当てを出さない', !VIEWS.data().includes('列の割り当て'));
runImport();
eq('2軒が登録される',       DB.shops.length, 2);
const star1 = DB.shops.find(s => s.name === '麺屋こうじ');
near('座標がそのまま入る',   star1.lat, 35.6812, 0.0001);
eq('リスト名が付く',        star1.lists.join(','), 'スター付き');
eq('cid が重複キーになる',  star1.srcId, 'cid:555');
eq('座標入りはキューに積まれない', DB.queue.includes(star1.id), false);
eq('座標なしはキューに積まれる',   DB.queue.length, 1);

/* CSV 側（保存済み）と JSON 側（スター）に同じ店がいても合流する */
importCSV('Title,URL\n麺屋こうじ,http://maps.google.com/?cid=555\n', 'お気に入りの場所');
eq('cid が同じなら増えない', DB.shops.filter(s => s.name === '麺屋こうじ').length, 1);
eq('リストは両方に属する',   DB.shops.find(s => s.name === '麺屋こうじ').lists.length, 2);

/* ============================================================
   22. 取り込み元のリスト・アカウント

   複数の Google アカウントや、「行きたい場所」「お気に入り」といった
   リストごとの CSV を、区別を保ったまま1つに合流できることを確認します。
   ============================================================ */
section('リスト・アカウント');
DB = seed(); migrate();
importCSV('Title,URL\n麺屋こうじ,https://maps.google.com/?cid=1\n' +
                    '鮨たなか,https://maps.google.com/?cid=2\n', '個人 / 行きたい場所');
eq('リスト名が店に付く', DB.shops[0].lists.join(','), '個人 / 行きたい場所');
eq('allLists が拾う',    allLists()[0].label, '個人 / 行きたい場所');
eq('allLists の件数',    allLists()[0].n, 2);

/* 別アカウントの CSV。1軒は同じ店（cid が同じ）、1軒は新しい店 */
importCSV('Title,URL\n麺屋こうじ,https://maps.google.com/?cid=1\n' +
                    '焼肉ホルモン,https://maps.google.com/?cid=3\n', '仕事用 / お気に入り');
eq('重なった店は増えない', DB.shops.length, 3);
const both = DB.shops.find(s => s.name === '麺屋こうじ');
eq('両方のリストに属する', both.lists.length, 2);
ok('片方のリスト名が残る', both.lists.includes('個人 / 行きたい場所'));
ok('もう片方も足される', both.lists.includes('仕事用 / お気に入り'));
eq('リストは2種類',       allLists().length, 2);

/* 同じリストを取り込み直しても、リスト名は重複しない */
importCSV('Title,URL\n麺屋こうじ,https://maps.google.com/?cid=1\n', '個人 / 行きたい場所');
eq('リスト名は二重に付かない', DB.shops.find(s => s.name === '麺屋こうじ').lists.length, 2);

/* リストで絞り込める */
eq('リストで絞れる（個人）', searchShops({ list:'個人 / 行きたい場所' }, null, 0).length, 2);
eq('リストで絞れる（仕事）', searchShops({ list:'仕事用 / お気に入り' }, null, 0).length, 2);
eq('リスト指定なしは全部',   searchShops({}, null, 0).length, 3);
eq('存在しないリストは0件',  searchShops({ list:'ないリスト' }, null, 0).length, 0);
eq('リストとジャンルは AND',
   searchShops({ list:'仕事用 / お気に入り', genres:['ramen'] }, null, 0).length, 1);
ok('リスト名でキーワード検索もできる', kwMatch(both, '仕事用'));

/* 手で編集してもリストは壊れない */
const keep = DB.shops.find(s => s.name === '麺屋こうじ');
keep.myRate = 5;
importCSV('Title,URL\n麺屋こうじ,https://maps.google.com/?cid=1\n', '三つ目のリスト');
eq('再取込でリストが増える', DB.shops.find(s => s.name === '麺屋こうじ').lists.length, 3);
eq('再取込でも評価は残る',   DB.shops.find(s => s.name === '麺屋こうじ').myRate, 5);

/* ============================================================
   23. 取込画面
   ============================================================ */
section('取込画面');
DB = seed(); migrate();
IMP = null;
noThrow('取込画面（最初）', () => VIEWS.data());
const rowsP = parseCSV(CSV1);
IMP = { head: rowsP[0], body: rowsP.slice(1), idx: mapHeader(rowsP[0]),
        label: 'お気に入りの場所', items: [], stats: null };
refreshImport();
ok('確認画面にリスト名の欄が出る', VIEWS.data().includes('imp-label'));
ok('リスト名が初期表示される',     VIEWS.data().includes('お気に入りの場所'));
noThrow('取込画面（確認）', () => VIEWS.data());
ok('確認画面に3件出る', (VIEWS.data().match(/class="card /g) || []).length === 3);
ok('新規のしるしが出る', VIEWS.data().includes('新しい店'));
IMP.items[0].on = false;
ok('選択を外しても描画できる', VIEWS.data().length > 0);
IMP = null;

/* ============================================================
   24. Places API 連携

   本物の API は叩きません。fetch を差し替えて応答を作り、
   「送っている中身」と「受けたあとの処理」を確かめます。
   ============================================================ */
section('Places API');
API_GAP = 0;                          // テストでは待たない

let FETCH_LOG = [], FETCH_PLAN = [];
const realFetch = window.fetch;
window.fetch = (url, init) => {
  FETCH_LOG.push({ url: String(url), init: init || {} });
  const r = FETCH_PLAN.length ? FETCH_PLAN.shift() : { body: { places: [] } };
  if(r.net) return Promise.reject(new Error('network down'));
  return Promise.resolve({
    ok: r.ok !== false,
    status: r.status || (r.ok === false ? 400 : 200),
    json: () => Promise.resolve(r.body || {}),
  });
};
const plan = (...rs) => { FETCH_PLAN = rs; FETCH_LOG = []; };

/** Places のレスポンス1件ぶんの見本 */
const PJ = o => Object.assign({
  id: 'ChIJ_KOJI',
  displayName: { text: '麺屋こうじ' },
  formattedAddress: '東京都新宿区1-1',
  location: { latitude: 35.6812, longitude: 139.7671 },
  types: ['ramen_restaurant','restaurant'],
  primaryType: 'ramen_restaurant',
  primaryTypeDisplayName: { text: 'ラーメン店' },
  googleMapsUri: 'https://maps.google.com/?cid=99',
  businessStatus: 'OPERATIONAL',
  utcOffsetMinutes: 540,
  rating: 4.2, userRatingCount: 120,
  regularOpeningHours: {
    periods: [{ open:{day:1,hour:11,minute:0}, close:{day:1,hour:14,minute:30} }],
    weekdayDescriptions: ['月曜日: 11:00～14:30'],
  },
}, o || {});

/* --- フィールドマスク（料金の帯に直結するので必ず確かめる） --- */
DB = seed(); migrate();
DB.settings.apiKey = 'TEST-KEY';
DB.settings.fetchHours = true;
ok('営業時間ありのマスクに regularOpeningHours が入る', fieldMask().includes('regularOpeningHours'));
ok('マスクに写真は入れない（別料金のため）',            !fieldMask().includes('photos'));
DB.settings.fetchHours = false;
ok('営業時間を切ると regularOpeningHours が消える',    !fieldMask().includes('regularOpeningHours'));
ok('営業時間を切っても座標は残る',                      fieldMask().includes('places.location'));
ok('営業時間を切ると評価も消える',                      !fieldMask().includes('places.rating'));
DB.settings.fetchHours = true;
ok('詳細用のマスクには places. が付かない',             !detailMask().includes('places.'));
ok('詳細用のマスクにも項目が入っている',                detailMask().includes('location'));

/* --- レスポンスの読み取り --- */
const np = normPlace(PJ());
eq('place_id',      np.placeId, 'ChIJ_KOJI');
eq('店名',          np.name, '麺屋こうじ');
eq('緯度',          np.lat, 35.6812);
eq('住所',          np.addr, '東京都新宿区1-1');
eq('代表カテゴリ',  np.primaryType, 'ramen_restaurant');
eq('カテゴリの和名', np.typeJa, 'ラーメン店');
eq('営業時間が正規化される', np.hours.ranges.length, 1);
eq('タイムゾーン',  np.utcOffset, 540);
eq('Google の評価', np.gRating, 4.2);
eq('中身が無くても落ちない', normPlace(null), null);
eq('営業時間が無ければ null', normPlace({ id:'X' }).hours, null);

/* --- 店への反映：ユーザー資産を壊さないこと --- */
const target = putShop(newShop({ name:'私が付けた名前', myRate:5, tags:['一人向き'],
                                 memo:'私のメモ', fav:true }));
applyPlace(target, normPlace(PJ()));
eq('座標が入る',           target.lat, 35.6812);
eq('営業時間が入る',       target.hours.ranges.length, 1);
eq('ジャンルが自動で付く', target.genres.join(','), 'ramen');
eq('状態が ok になる',     target.status, 'ok');
eq('取得日が入る',         target.fetchedAt, today());
eq('店名は上書きしない',   target.name, '私が付けた名前');
eq('評価は残る',           target.myRate, 5);
eq('タグは残る',           target.tags.join(','), '一人向き');
eq('メモは残る',           target.memo, '私のメモ');
eq('ピン留めは残る',       target.fav, true);

const manual2 = putShop(newShop({ name:'手で決めた店', genres:['sushi'], genresManual:true }));
applyPlace(manual2, normPlace(PJ()));
eq('手で決めたジャンルは変えない', manual2.genres.join(','), 'sushi');

/* --- 候補の選び方 --- */
eq('名前が一致する候補が1件なら自動で決まる',
   pickCandidate('麺屋こうじ', [PJ()]).pick.placeId, 'ChIJ_KOJI');
eq('同名の候補が2件あれば決めない',
   pickCandidate('麺屋こうじ', [PJ(), PJ({ id:'ChIJ_B' })]).pick, null);
eq('決めないときは候補を返す',
   pickCandidate('麺屋こうじ', [PJ(), PJ({ id:'ChIJ_B' })]).cands.length, 2);
eq('候補は3件までにする',
   pickCandidate('X', [PJ({id:'1'}),PJ({id:'2'}),PJ({id:'3'}),PJ({id:'4'})]).cands.length, 3);
eq('1件だけで名前が含む関係なら決める',
   pickCandidate('麺屋こうじ', [PJ({ displayName:{text:'麺屋こうじ 本店'} })]).pick.placeId, 'ChIJ_KOJI');
eq('1件でも名前が無関係なら決めない',
   pickCandidate('麺屋こうじ', [PJ({ displayName:{text:'鮨たなか'} })]).pick, null);
eq('候補が空なら決めない',   pickCandidate('X', []).pick, null);
eq('閉業した店は選ばない',
   pickCandidate('麺屋こうじ', [PJ({ businessStatus:'CLOSED_PERMANENTLY' })]).pick, null);

/* --- 送信内容 --- */
DB = seed(); migrate(); DB.settings.apiKey = 'TEST-KEY';
plan({ body:{ places:[PJ()] } });
await searchPlace('麺屋こうじ', '新宿', { lat:35.68, lng:139.76 });
const req = FETCH_LOG[0];
ok('検索の宛先が正しい',      req.url.startsWith('https://places.googleapis.com/v1/places:searchText'));
eq('POST で送る',             req.init.method, 'POST');
eq('APIキーをヘッダに入れる', req.init.headers['X-Goog-Api-Key'], 'TEST-KEY');
ok('マスクをヘッダに入れる',  !!req.init.headers['X-Goog-FieldMask']);
const sent = JSON.parse(req.init.body);
eq('店名と住所を合わせて送る', sent.textQuery, '麺屋こうじ 新宿');
eq('日本語で問い合わせる',     sent.languageCode, 'ja');
ok('近くを優先する指定が入る', !!sent.locationBias);
eq('1回で使用回数が1増える',   DB.settings.usage.n, 1);

DB.settings.fetchHours = false;
plan({ body:{ places:[] } });
await searchPlace('X', '', null);
ok('営業時間を切ると送るマスクからも消える',
   !FETCH_LOG[0].init.headers['X-Goog-FieldMask'].includes('regularOpeningHours'));
DB.settings.fetchHours = true;

/* place_id が分かっていれば詳細を直接取りにいく（候補が出ないので確実） */
DB = seed(); migrate(); DB.settings.apiKey = 'TEST-KEY';
const known = putShop(newShop({ name:'既知の店', placeId:'ChIJ_KNOWN' }));
plan({ body: PJ({ id:'ChIJ_KNOWN' }) });
eq('詳細取得で解決する', await resolveShop(known), 'ok');
ok('詳細のURLを叩く', FETCH_LOG[0].url.includes('/v1/places/ChIJ_KNOWN'));
eq('詳細は GET で叩く', FETCH_LOG[0].init.method, undefined);

/* 結果が0件なら「見つからない」として記録する */
const zero = putShop(newShop({ name:'存在しない店' }));
plan({ body:{ places:[] } });
eq('0件なら failed',  await resolveShop(zero), 'failed');
eq('理由が残る',      zero.err, 'ZERO_RESULTS');

/* 候補が複数なら人に選んでもらう */
const amb = putShop(newShop({ name:'サイゼリヤ' }));
plan({ body:{ places:[PJ({ id:'A', displayName:{text:'サイゼリヤ'} }),
                      PJ({ id:'B', displayName:{text:'サイゼリヤ'} })] } });
eq('候補が複数なら ambiguous', await resolveShop(amb), 'ambiguous');
eq('候補が保存される',         amb.cands.length, 2);
chooseCand(amb.id, 1);
eq('選んだ候補で確定する',     shopOf(amb.id).placeId, 'B');
eq('確定すると ok になる',     shopOf(amb.id).status, 'ok');
eq('確定すると候補は消える',   shopOf(amb.id).cands, null);

/* --- 使用回数と上限 --- */
DB = seed(); migrate(); DB.settings.apiKey = 'TEST-KEY';
DB.settings.dailyLimit = 3;
eq('最初は上限まで使える', quotaLeft(), 3);
bumpUsage(); bumpUsage();
eq('使うと減る',           quotaLeft(), 1);
DB.settings.usage = { date:'2020-01-01', n: 999 };
eq('日付が変われば戻る',   quotaLeft(), 3);

/* --- キュー処理 --- */
DB = seed(); migrate(); DB.settings.apiKey = 'TEST-KEY'; DB.settings.dailyLimit = 100;
const q1 = putShop(newShop({ name:'A店' }));
const q2 = putShop(newShop({ name:'B店' }));
DB.queue = [q1.id, q2.id];
plan({ body:{ places:[PJ({ displayName:{text:'A店'} })] } },
     { body:{ places:[PJ({ id:'ChIJ_B', displayName:{text:'B店'} })] } });
await runQueue();
eq('キューが空になる',       DB.queue.length, 0);
eq('2軒とも座標が入る',      DB.shops.filter(s => s.lat != null).length, 2);
eq('2回だけ叩いた',          FETCH_LOG.length, 2);
eq('使用回数も2',            DB.settings.usage.n, 2);

/* 済んだ店は二度と叩かない */
DB.queue = [q1.id];
plan({ body:{ places:[PJ()] } });
await runQueue();
eq('取得済みの店は叩かない', FETCH_LOG.length, 0);
eq('キューからは消える',     DB.queue.length, 0);

/* 上限に達したら止まり、キューは残る（翌日そのまま再開できる） */
DB = seed(); migrate(); DB.settings.apiKey = 'TEST-KEY'; DB.settings.dailyLimit = 2;
const ids = [1,2,3,4].map(i => putShop(newShop({ name:'店'+i })).id);
DB.queue = ids.slice();
plan(...ids.map(() => ({ body:{ places:[] } })));
await runQueue();
eq('上限のぶんだけ叩く',   DB.settings.usage.n, 2);
eq('残りはキューに残る',   DB.queue.length, 2);
ok('上限に達したと伝える', QMSG.includes('上限'));

/* 403 は設定の誤りなので、全件叩かずその場で止める */
DB = seed(); migrate(); DB.settings.apiKey = 'BAD-KEY'; DB.settings.dailyLimit = 100;
const b1 = putShop(newShop({ name:'A' })), b2 = putShop(newShop({ name:'B' }));
DB.queue = [b1.id, b2.id];
plan({ ok:false, status:403, body:{ error:{ message:'API keys with referer restrictions...' } } },
     { body:{ places:[PJ()] } });
await runQueue();
eq('403 で1回だけ叩いて止まる', FETCH_LOG.length, 1);
eq('キューは減らさない',        DB.queue.length, 2);
ok('原因の見当を伝える',        QMSG.includes('403'));
ok('直し方も伝える',            QMSG.includes('制限'));

/* 通信エラーは末尾に回して先へ進む。3回失敗したら諦める（無限に叩き直さない） */
DB = seed(); migrate(); DB.settings.apiKey = 'TEST-KEY'; DB.settings.dailyLimit = 100;
const n1 = putShop(newShop({ name:'つながらない店' }));
DB.queue = [n1.id];
plan({ net:true }, { net:true }, { net:true });
await runQueue();
eq('3回で諦める',       FETCH_LOG.length, 3);
eq('キューから外れる',  DB.queue.length, 0);
eq('失敗として記録する', shopOf(n1.id).status, 'failed');

/* キーが無ければ叩かない */
DB = seed(); migrate(); DB.settings.apiKey = '';
DB.queue = [putShop(newShop({ name:'X' })).id];
FETCH_LOG = [];
await runQueue();
eq('キーが無ければ通信しない', FETCH_LOG.length, 0);
ok('キーが無いと伝える',       QMSG.includes('APIキー'));

/* --- 画面 --- */
DB = seed(); migrate();
IMP = null; QMSG = '';
noThrow('取込画面（キー未設定）', () => VIEWS.data());
DB.settings.apiKey = 'TEST-KEY';
DB.queue = [putShop(newShop({ name:'待ち店' })).id];
noThrow('取込画面（キューあり）', () => VIEWS.data());
ok('まとめて取得のボタンが出る', VIEWS.data().includes('まとめて取得'));
QRUN = true;
ok('実行中は中断ボタンが出る',   VIEWS.data().includes('中断'));
QRUN = false;

const ambShop = putShop(newShop({ name:'迷う店', status:'ambiguous',
  cands:[normPlace(PJ()), normPlace(PJ({ id:'B', displayName:{text:'別の店'} }))] }));
ok('候補の選択欄が出る', VIEWS.data().includes('どの店か選んで'));
SEL.shop = ambShop.id;
noThrow('店の詳細（候補あり）', () => VIEWS.shops());
SEL.shop = null;

noThrow('設定画面（APIキー欄）', () => VIEWS.set());
ok('設定に接続テストがある',     VIEWS.set().includes('接続テスト'));
ok('APIキーは伏せ字で出る',      VIEWS.set().includes('type="password"'));
API_SHOW = true;
ok('表示に切り替えられる',       VIEWS.set().includes('type="text"'));
API_SHOW = false;

window.fetch = realFetch;
DB = seed(); migrate();

/* ============================================================
   25. 地図

   本物の Leaflet を読み込んで、地図が実際に組み立てられることを見ます。
   タイル画像は通信が要るので届きませんが、地図の生成と後始末は確認できます。
   ============================================================ */
section('地図');
ok('Leaflet が読み込まれている', typeof L !== 'undefined');

DB = seed(); migrate();
/* ピンの色は「いま営業中か」で変わります。テストを実時刻に左右されないよう、
   常に営業中になる24時間営業の店で確かめます */
putShop(newShop({ name:'近い店', genres:['ramen'], lat:35.6820, lng:139.7680,
                  hours: normHours({ periods:[{ open:{day:0,hour:0,minute:0} }] }) }));
putShop(newShop({ name:'遠い店', genres:['sushi'], lat:35.6285, lng:139.7387 }));
putShop(newShop({ name:'位置なしの店', genres:['cafe'] }));
Q = { genres:[], kw:'', openOnly:false, radius:0, list:'' };
POS = { lat:35.6812, lng:139.7671, acc:20, label:'現在地' };
GEO = 'ok';

/* 地図タブを開く → render() が AFTER で地図を作る */
TAB = 'result'; SEL.sub = 'map';
noThrow('地図タブを描画できる', () => render());
ok('地図が作られる', MAP !== null);
ok('地図の入れ物にタイル層が入る', $('#map').innerHTML.includes('leaflet'));
const pinCount = ($('#map').innerHTML.match(/class="pin/g) || []).length;
eq('座標のある店ぶんのピン＋現在地', pinCount, 3);
ok('24時間営業は営業中のピンになる', $('#map').innerHTML.includes('pin open'));
ok('営業時間が不明な店は別のピン',   $('#map').innerHTML.includes('pin unknown'));
ok('現在地のピンがある',             $('#map').innerHTML.includes('pin here'));
ok('ピンにジャンルの絵文字が出る',   $('#map').innerHTML.includes('🍜'));

/* タブを移ると必ず後始末される（残すとイベントが宙に浮いて後で落ちる） */
TAB = 'find';
noThrow('別のタブへ移れる', () => render());
eq('地図は破棄される', MAP, null);

/* 座標のある店が1軒もないとき */
DB = seed(); migrate();
putShop(newShop({ name:'位置なしだけ' }));
POS = null; GEO = 'idle';
TAB = 'result'; SEL.sub = 'map';
noThrow('出せる店が無くても落ちない', () => render());
ok('その旨を伝える', $('#map').innerHTML.includes('地図に出せる店がありません'));
eq('地図は作らない', MAP, null);

/* 起点だけあって店が無い場合は地図を出す */
POS = { lat:35.6812, lng:139.7671, acc:0, label:'現在地' };
noThrow('起点だけでも描画できる', () => render());
ok('起点だけでも地図は出る', MAP !== null);

TAB = 'find'; render();
SEL.sub = ''; POS = null; GEO = 'idle';
Q = { genres:[], kw:'', openOnly:false, radius:0, list:'' };
DB = seed(); migrate();

/* ============================================================
   26. 共有シートからの登録

   Google マップが送ってくる中身は端末や状況で形が変わります。
   よくある形をひととおり読めることを確かめます。
   ============================================================ */
section('共有からの登録');
let sp = parseShared('', '麺屋こうじ\nhttps://maps.app.goo.gl/abc', '');
eq('店名＋URL（改行区切り）の店名', sp.name, '麺屋こうじ');
eq('店名＋URL（改行区切り）のURL',  sp.url, 'https://maps.app.goo.gl/abc');

sp = parseShared('麺屋こうじ', 'https://maps.app.goo.gl/abc', '');
eq('題名が店名、本文がURL', sp.name, '麺屋こうじ');
eq('URLも取れる',           sp.url, 'https://maps.app.goo.gl/abc');

sp = parseShared('麺屋こうじ', '', 'https://maps.app.goo.gl/abc');
eq('URLが別枠で来る場合',   sp.url, 'https://maps.app.goo.gl/abc');

sp = parseShared('', '麺屋こうじ\n東京都新宿区1-1\nhttps://maps.app.goo.gl/abc', '');
eq('住所も拾う（1行目が店名）', sp.name, '麺屋こうじ');
eq('2行目を場所の手がかりに',   sp.addr, '東京都新宿区1-1');

sp = parseShared('', '', 'https://www.google.com/maps/place/%E9%BA%BA%E5%B1%8B/@35.68,139.76,17z/');
eq('本文が無ければURLから店名', sp.name, '麺屋');
near('URLから座標も取る',       sp.lat, 35.68, 0.01);

sp = parseShared('店名 https://maps.app.goo.gl/x', '', '');
eq('同じ行にURLが混ざっても外す', sp.name, '店名');
eq('何も来なくても落ちない',      parseShared('', '', '').name, '');

/* 共有で開かれたときの入口の判定 */
DB = seed(); migrate();
SHARE = null;
handleShare();
eq('ふつうに開いたら何もしない', SHARE, null);

/* 実際に登録する（location は触れないので SHARE を直接組み立てる） */
SHARE = parseShared('', '麺屋こうじ\nhttps://maps.app.goo.gl/abc', '');
SEL.sub = 'share'; TAB = 'data';
noThrow('共有の確認画面が描画できる', () => VIEWS.data());
ok('店名が初期表示される', VIEWS.data().includes('麺屋こうじ'));
ok('登録ボタンが出る',     VIEWS.data().includes('この店を登録'));

DB.settings.apiKey = '';
$('#view').innerHTML = VIEWS.data();          // 入力欄を本物のDOMに出してから保存する
await saveShared();
eq('1軒登録される',        DB.shops.length, 1);
eq('出所が共有になる',     DB.shops[0].src, 'share');
eq('ジャンルが自動で付く', DB.shops[0].genres.join(','), 'ramen');
eq('位置が無いのでキューに入る', DB.queue.length, 1);
eq('確認画面は閉じる',     SHARE, null);

/* 同じ店をもう一度共有しても増えない */
SHARE = parseShared('', '麺屋こうじ\nhttps://maps.app.goo.gl/abc', '');
TAB = 'data'; SEL.sub = 'share';
$('#view').innerHTML = VIEWS.data();
await saveShared();
eq('同じ店は二重に登録されない', DB.shops.length, 1);
eq('キューも二重にならない',     DB.queue.length, 1);

TAB = 'find'; SEL.sub = ''; SEL.shop = null;
DB = seed(); migrate();

/* ============================================================
   結果の表示
   ============================================================ */
document.getElementById('out').innerHTML = out.join('');
const sum = document.getElementById('sum');
sum.className = fail === 0 ? 'ok' : 'ng';
sum.textContent = `RESULT ${fail === 0 ? 'PASS' : 'FAIL'}  成功 ${pass} / 失敗 ${fail}`;
document.title = `${fail === 0 ? 'PASS' : 'FAIL'} ${pass}/${pass + fail} — 食べ探 テスト`;

})();
