/* ============================================================
   2. ジャンル定義

   types … Google Places API が返すカテゴリ（英語）との対応
   words … 店名・メモに含まれていたらこのジャンルとみなす言葉

   Places は「japanese_restaurant」のような粗いカテゴリしか返さない店が
   多いため、types と words の両方で判定します（05-search.js の guessGenres）。

   この一覧を編集したら、既存ユーザーの DB.genres（初回に複製したもの）は
   自動では変わらない。03-storage.js の migrate() が、GENRES と DB.genres の
   ID構成を比べて食い違っていたら同期し、非手動の店のジャンルも付け直す。
   ============================================================ */
const GENRES = [
  { id:'sushi', label:'寿司', icon:'🍣',
    types:['sushi_restaurant','seafood_restaurant'],
    words:['寿司','鮨','すし','海鮮','魚','刺身'] },

  { id:'izakaya', label:'居酒屋', icon:'🍺',
    types:[],   // Places に「居酒屋」専用の種別が無いため、店名などの言葉だけで判定する
    words:['居酒屋','酒場','串','おでん','立ち飲み','角打ち','ビール','日本酒'] },

  { id:'bar', label:'BAR', icon:'🍸',
    types:['bar','pub','bar_and_grill','wine_bar','night_club'],
    words:['バー','バル','カクテル','ウイスキー','ワインバー','スナック','bar'] },

  { id:'washoku', label:'和食', icon:'🍱',
    types:['japanese_restaurant','tonkatsu_restaurant','udon_restaurant',
           'unagi_restaurant','yakitori_restaurant','teppanyaki_restaurant','sukiyaki_restaurant',
           'shabu_shabu_restaurant','tempura_restaurant','soba_restaurant','japanese_curry_restaurant'],
    words:['定食','和食','天ぷら','てんぷら','とんかつ','トンカツ','うどん','そば','蕎麦',
           'うなぎ','鰻','焼鳥','焼き鳥','やきとり','しゃぶしゃぶ','すき焼き','丼','牛丼','弁当','食堂'] },

  { id:'chuka', label:'中華', icon:'🥟',
    types:['chinese_restaurant','asian_restaurant'],
    words:['中華','餃子','ぎょうざ','町中華','四川','広東','点心','麻婆'] },

  { id:'other', label:'その他', icon:'🍴',
    types:[], words:[] },
];

/** ジャンルIDから定義を引く（DB.genres が正。GENRES は初期値） */
function genreOf(id){
  const list = (typeof DB !== 'undefined' && DB && DB.genres) ? DB.genres : GENRES;
  return list.find(g => g.id === id) || { id, label:id, icon:'🍴', types:[], words:[] };
}
/** ジャンルIDの配列 → 「🍜ラーメン ・ 🍺居酒屋」 */
function genreLabels(ids){
  return (ids||[]).map(id => { const g = genreOf(id); return `${g.icon}${g.label}`; });
}
