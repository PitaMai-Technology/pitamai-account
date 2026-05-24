# 共通ベースステージ
FROM node:24-alpine AS base

RUN corepack enable && corepack prepare pnpm@10.33.4 --activate
WORKDIR /app

# 💡 修正: まず依存定義ファイルだけをコピーしてレイヤーキャッシュを効かせる
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma

# 依存関係のインストール（開発・ビルドに必要な全依存）
RUN pnpm install --frozen-lockfile
RUN pnpm exec prisma generate --schema ./prisma


# アプリケーションのビルド用ステージ
FROM base AS builder
# 💡 修正: ビルドの直前でソースコード全体をコピーする
COPY . .
RUN pnpm build

# 実行用ステージ
FROM node:24-alpine AS runner
RUN corepack enable && corepack prepare pnpm@10.33.4 --activate

WORKDIR /app
ENV NODE_ENV=production

# ビルド成果物とパッケージ定義、Prismaスキーマのコピー
COPY --from=builder /app/.output .output
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma

# 本番環境用の依存関係のみをインストール
RUN pnpm install --prod --frozen-lockfile

# グループ・ユーザーを作成し、アプリケーションディレクトリの所有権を付与
# 依存は root でインストールしたままにし、実行プロセスのみ非rootで動かす
RUN addgroup -S nodejs && adduser -S nuxt -G nodejs

USER nuxt
EXPOSE 3000
CMD ["sh", "-c", "pnpm exec prisma migrate deploy --schema ./prisma && node .output/server/index.mjs"]
