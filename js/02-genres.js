/* ============================================================
   2. ジャンル定義

   types … Google Places API が返すカテゴリ（英語）との対応
   words … 店名・メモに含まれていたらこのジャンルとみなす言葉

   Places は「japanese_restaurant」のような粗いカテゴリしか返さない店が
   多いため、types と words の両方で判定します（05-search.js の guessGenres）。
   ユーザーは設定画面でこの一覧を編集できます（DB.genres が実体）。
   ============================================================ */
const GENRES = [
  { id:'ramen', label:'ラーメン', icon:'🍜',
    types:['ramen_restaurant','noodle_shop'],
    words:['ラーメン','らーめん','中華そば','つけ麺','家系','二郎','麺屋','麺処','製麺','担々麺','油そば','まぜそば'] },

  { id:'yakiniku', label:'焼肉', icon:'🥩',
    types:['barbecue_restaurant','korean_restaurant','brazilian_restaurant'],
    words:['焼肉','焼き肉','ホルモン','カルビ','牛角','大将軍','肉'] },

  { id:'sushi', label:'寿司', icon:'🍣',
    types:['sushi_restaurant','seafood_restaurant'],
    words:['寿司','鮨','すし','海鮮','魚','刺身'] },

  { id:'izakaya', label:'居酒屋', icon:'🍺',
    types:['bar','pub','bar_and_grill','wine_bar'],
    words:['居酒屋','酒場','串','おでん','立ち飲み','角打ち','ビール','日本酒','バル','バー'] },

  { id:'washoku', label:'和食', icon:'🍱',
    types:['japanese_restaurant','tonkatsu_restaurant','udon_restaurant',
           'unagi_restaurant','yakitori_restaurant','teppanyaki_restaurant','sukiyaki_restaurant',
           'shabu_shabu_restaurant','tempura_restaurant','soba_restaurant','japanese_curry_restaurant'],
    words:['定食','和食','天ぷら','てんぷら','とんかつ','トンカツ','うどん','そば','蕎麦',
           'うなぎ','鰻','焼鳥','焼き鳥','やきとり','しゃぶしゃぶ','すき焼き','丼','牛丼','弁当','食堂'] },

  { id:'chuka', label:'中華', icon:'🥟',
    types:['chinese_restaurant','asian_restaurant'],
    words:['中華','餃子','ぎょうざ','町中華','四川','広東','点心','麻婆'] },

  { id:'curry', label:'カレー', icon:'🍛',
    types:['indian_restaurant'],
    words:['カレー','スパイス','インド','ネパール','ナン','スープカレー'] },

  { id:'italian', label:'イタリアン', icon:'🍝',
    types:['italian_restaurant','pizza_restaurant'],
    words:['イタリア','ピザ','ピッツァ','パスタ','トラットリア','リストランテ','オステリア'] },

  { id:'yoshoku', label:'洋食', icon:'🍽',
    types:['french_restaurant','steak_house','hamburger_restaurant','american_restaurant',
           'spanish_restaurant','mediterranean_restaurant'],
    words:['洋食','ハンバーグ','ハンバーガー','ステーキ','ビストロ','フレンチ','グリル','オムライス'] },

  { id:'cafe', label:'カフェ', icon:'☕',
    types:['cafe','coffee_shop','bakery','dessert_shop','ice_cream_shop','tea_house','breakfast_restaurant'],
    words:['カフェ','珈琲','コーヒー','喫茶','パン','ベーカリー','ケーキ','スイーツ','パフェ'] },

  { id:'asian', label:'アジア', icon:'🍤',
    types:['thai_restaurant','vietnamese_restaurant','indonesian_restaurant','turkish_restaurant',
           'middle_eastern_restaurant','afghani_restaurant'],
    words:['タイ','ベトナム','アジア','エスニック','ガパオ','フォー','台湾','韓国','サムギョプサル'] },

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
