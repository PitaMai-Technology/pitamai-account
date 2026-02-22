# Mail Client 開発ロードマップ（Nuxt 4 / IMAP・SMTP）

## Phase 1: インフラと認証の基盤

- [x] メール利用者は Better Auth のログインユーザーをそのまま利用（別メールアカウント管理を作らない）
- [x] Prisma に `MailAccount` / `MailCache` を定義（`prisma/models/mail.prisma`）
- [x] メール認証情報の対称暗号化ユーティリティ（AES-256-GCM）を実装
- [x] IMAP 接続共通ユーティリティを実装
- [x] IMAP 接続テスト API（メールボックス一覧取得）を実装
- [ ] `MAIL_CREDENTIAL_SECRET` を運用環境に設定
- [ ] Prisma マイグレーション作成・適用

## Phase 2: コア機能（読み取り）

- [x] フォルダ内メール一覧 API（`Subject / From / Date / UID`）
- [x] UID 指定のメール詳細 API（`mailparser` で HTML/Text/添付解析）
- [x] Nuxt UI v4 による 3 カラム UI（フォルダ / リスト / 本文）
- [x] 本文表示時の HTML サニタイズ（`isomorphic-dompurify`）

## Phase 3: 操作と送信（書き込み）

- [x] SMTP 送信 API（`nodemailer`）
- [x] 既読フラグ更新 API
- [x] 削除（ゴミ箱移動）API
- [x] アーカイブ API
- [x] 送信時の添付アップロード対応

## Phase 4: リアルタイム性と最適化

- [x] SSE ストリーム API（新着通知）
- [x] imapflow IDLE 監視の常駐処理
- [x] `MailCache` へのメタデータ保存・再利用
- [x] 再同期戦略（初回フル同期 + 差分同期）

## 必須機能チェック

### セキュリティ

- [ ] HTML サニタイズをサーバー/クライアント双方で適用
- [ ] セーフ・プレビュー（外部画像の自動読み込みブロック）
- [ ] Better Auth によるログイン保護

### メール操作

- [ ] スレッド表示（同件名グルーピング）
- [ ] 検索（送信者・件名・本文）
- [ ] 添付ダウンロード（受信時）

### UX

- [x] メール画面状態管理ストア（`app/stores/mail.ts`）
- [ ] オフライン簡易対応（Pinia 状態の持続化）
- [ ] マルチアカウント切り替え UI
- [ ] モバイル向けレスポンシブ最適化
