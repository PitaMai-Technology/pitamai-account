# Docker / Prisma 構成メモ

## 目的

Docker Compose で Nuxt アプリと PostgreSQL を立ち上げるときに、Prisma migration の扱いを再現性高く、かつ気持ち悪さが少ない形に整理する。

## 現在の方針

- `db-account` は常駐サービスとして起動する。
- migration は `dev` では DB 起動後に別ジョブで実行し、本番は CI/CD の migration job として 1 回だけ実行する。
- `app` は `db-account` の healthy を待って起動する。
- Komodo は今回の判断材料から外す。
- Prisma v6 前提のため `prisma.config.ts` は追加しない。

## 補足: 案A の更新

- `prisma-migrate` を Compose から分離する案は維持する。
- dev では DB 起動後に別ジョブで migration を実行する。
- 本番は CI/CD の migration job に寄せる。
- ローカル開発では DB と app の起動に集中し、スキーマ反映は dev の別ジョブかパイプライン側で担保する。
- つまり「手元で手打ち」ではなく「dev の別ジョブ / CI/CD で明示実行」に読み替える。

### CI/CD での実行イメージ

- build job でアプリのイメージを作ってレジストリへ push する。
- deploy job で DB に接続できる状態を確認してから `pnpm db:deploy` を 1 回だけ実行する。
- migration 成功後に app を新しいイメージへ切り替える。
- migration が失敗したら deploy を止める。

### dev での実行イメージ

- `db-account` を起動する。
- その後に migration 専用ジョブを 1 回だけ実行する。
- migration 完了後に app を起動する。

## いま入っている変更

### Dockerfile

- `base` ステージを追加して共通の pnpm install をまとめた。
- `builder` ステージで `pnpm build` を実行する。
- `migrate` ステージを追加し、`pnpm run db:deploy` を実行する。
- `runner` ステージは本番アプリ起動用として分離した。

### package.json

- `db:deploy` スクリプトを追加した。
- 役割は `pnpm exec prisma migrate deploy` を 1 行にまとめること。
- `build` は従来どおり `pnpm exec prisma generate && nuxt build` のまま。

### compose.dev.yml

- `prisma-migrate` サービスは削除した。
- `app` は `db-account` の healthy のみを待つ。
- `db-account` には `PGDATA=/var/lib/postgresql/data/pgdata` を設定して Postgres の初期化失敗を避けている。

## 実際に起きた問題と対応

### 1. pnpm v11 由来の build script エラー

- `ERR_PNPM_IGNORED_BUILDS` が出た。
- 原因は pnpm v11 の設定互換性だった。
- 対応として `packageManager` と Dockerfile の corepack を pnpm v10.33.4 に固定した。

### 2. Prisma Client 生成物のコピー失敗

- `node_modules/.prisma` を明示コピーしようとして失敗した。
- そのコピーは削除し、runner 側で `pnpm install --prod --frozen-lockfile` するだけにした。

### 3. Postgres 初期化失敗

- `/var/lib/postgresql/data` が非空で `initdb` が失敗した。
- `PGDATA` をサブディレクトリに切り替えて回避した。

### 4. マイグレーション未適用による `public.user` 不在

- `PrismaClientKnownRequestError: P2021` が `public.user` 不在で出た。
- これは migration が未適用の状態を示す。

## 採用しなかった案

- `package.json` の `start-dev.mjs` に起動ロジックを寄せる案
  - Docker 内で完結しないため却下。
- `docker compose down` で後始末する案
  - 常駐サービスまで落ちるので不採用。
- Dockerfile の `RUN` で migration を実行する案
  - ビルド時に DB 接続が必要になり、再現性が落ちるため不採用。
- `prisma.config.ts` を v6 前提で追加する案
  - Prisma v6 なので今回は不要として見送った。

## 現在の評価

- 仕組みとしては動く。
- ただし `prisma-migrate` を Compose に残すと `Exited (0)` が残り続けるため、ローカル Compose では不自然。
- dev の別ジョブか CI/CD で `pnpm db:deploy` を 1 回実行する形の方が、ローカルの見通しと本番の再現性を両立しやすい。

## 他の AI に渡すときの要点

1. このリポジトリは Nuxt 4 + Prisma v6 + pnpm v10 前提。
2. Dockerfile は `base / builder / migrate / runner` の多段構成。
3. `db:deploy` は `pnpm exec prisma migrate deploy` のラッパー。
4. `prisma-migrate` は Compose から外し、CI/CD の migration job として使う前提。
5. dev では DB 起動後に migration の別ジョブを走らせる。
6. `app` は `db-account` の healthy のみを待つ構成。
7. 再現性の観点では Docker 内完結を優先しており、手元の起動スクリプトは採用しない。
8. 案A を採るなら、migration 実行は dev の別ジョブまたは CI/CD に寄せる。
