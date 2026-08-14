/* ============================================================
   20. 起動
   ============================================================ */
load();
handleShare();      // 共有シートから開かれた場合はここで受け取る
render();

/* オフラインでも起動できるようにする。
   file:// で開いているときは登録できないので、その場合は黙って見送ります */
if(typeof navigator !== 'undefined' && navigator.serviceWorker
   && location.protocol !== 'file:'){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .catch(e => console.warn('Service Worker を登録できませんでした', e));
  });
}
