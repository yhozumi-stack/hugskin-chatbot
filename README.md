# hugskin-chatbot

HugSkin の ecforce LP に埋め込む新規獲得用チャットボット(自社実装・依存ゼロ・1ファイル完結)。

- **仕組み**: LP に `<script>` タグ2つ(ecforceタグ管理で配布)→ チャットで注文情報を収集 → ecforce `orders/new` へURLパラメータで受け渡し → 注文フォームに自動入力
- **LPごとの差分**(価格・オファー・起動方法)はタグ側の `window.HS_CHAT` で設定。push不要
- **配信**: GitHub Pages。`?v=` でLP単位のバージョン固定

運用手順・レシピは [CLAUDE.md](CLAUDE.md) を参照。
