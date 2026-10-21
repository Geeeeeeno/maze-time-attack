/*
 * Google AdSense のパブリッシャー ID は、このファイルだけに書く。
 * 空なら広告スクリプトは読み込まない。
 * ホスト名が github.io（GitHub Pages）のときは読み込まない。
 * 自動広告のみ。手動の広告枠は置かない。
 */
(function () {
  var PUBLISHER_ID = "ca-pub-9800194060735513";

  var id = PUBLISHER_ID == null ? "" : String(PUBLISHER_ID).replace(/^\s+|\s+$/g, "");
  if (!id) return;

  var host = "";
  try {
    host = String(location.hostname || "").toLowerCase();
  } catch (e) {
    host = "";
  }
  if (host.charAt(host.length - 1) === ".") host = host.slice(0, -1);
  if (host === "github.io" || host.slice(-10) === ".github.io") return;

  var script = document.createElement("script");
  script.async = true;
  script.src =
    "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" +
    encodeURIComponent(id);
  script.setAttribute("crossorigin", "anonymous");
  document.head.appendChild(script);
})();
