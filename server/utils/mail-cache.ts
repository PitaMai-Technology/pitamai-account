/**
 * server/utils/mail-cache.ts
 *
 * SQLite キャッシュ操作ユーティリティ
 *
 * IMAP サーバーから取得したメール一覧をローカル DB（SQLite）に保存し、
 * 差分同期やフォールバック時に活用するユーティリティです。
 *
 * 主な役割：
 * - メール一覧情報の CRUD（Create/Read/Update/Delete）操作
 * - 差分同期の基準点（最大 UID）の取得
 * - キャッシュサイズの管理（古いエントリ削除）
 * - from フィールドのパース・結合（"Name <address>" 形式相互変換）
 *
 * 設計思想：
 * - 差分同期：最新 UID を記録 → その後のメール情報だけ取得
 * - フォールバック：IMAP 通信失敗時は SQLite から最新キャッシュを返す
 * - 容量管理：フォルダごとに 500 件まで保持（古い順に削除）
 */

import prisma from '~~/lib/prisma';

/**
 * キャッシュから読み出したメール情報の公開型です。
 *
 * プロパティ：
 * - uid: IMAP UID（ユニークなメール識別子）
 * - subject: メール件名
 * - from: 差出人（"Name <address>" 形式の文字列）
 * - date: メール送信日時（ISO 8601 形式）
 * - messageId: メール Message-ID ヘッダ（スレッド化用）
 * - inReplyTo: In-Reply-To ヘッダ（親メール ID）
 * - references: References ヘッダ（スレッド関連メール ID 配列）
 * - hasAttachment: 添付ファイルの有無
 * - seen: メール既読状況（現在は常に false —— キャッシュ時点では不正確）
 */
export type CachedMailListItem = {
  uid: number;
  subject: string | null;
  from: string | null;
  date: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  hasAttachment: boolean;
  seen: boolean;
};

/**
 * キャッシュに書き込むメール情報の入力型です。
 *
 * プロパティ：
 * - uid: IMAP UID
 * - subject: 件名
 * - from: 差出人（"Name <address>" 形式）
 * - date: 送信日時（ISO 8601）
 * - messageId: Message-ID
 * - inReplyTo: In-Reply-To
 * - references: References パースされた ID 配列
 * - hasAttachment: 添付フラグ
 *
 * 注：この型は imap.ts の MessageListItem を変換して生成されます。
 */
type UpsertMessageInput = {
  uid: number;
  subject: string | null;
  from: string | null;
  date: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  hasAttachment: boolean;
};

/**
 * "Name <address>" 形式の from 文字列をパースして、
 * 名前とアドレスに分離します。
 *
 * 例：
 * - "Alice <alice@example.com" → { fromName: "Alice", fromAddress: "alice@example.com" }
 * - "alice@example.com" → { fromName: null, fromAddress: "alice@example.com" }
 * - null → { fromName: null, fromAddress: null }
 *
 * 用途：
 * - SQLite に保存する際、Name と Address を別カラムに分割
 * - join するときに元の形式に復元
 *
 * パラメータ:
 * - from: パース対象の from 文字列（null 可）
 *
 * 戻り値:
 * - fromName: 抽出名（あれば）
 * - fromAddress: アドレス部分（あれば）
 */
function splitFrom(from: string | null): {
  fromName: string | null;
  fromAddress: string | null;
} {
  if (!from) {
    return { fromName: null, fromAddress: null };
  }

  const matched = from.match(/^(.*)\s<([^>]+)>$/);
  if (!matched) {
    return { fromName: null, fromAddress: from };
  }

  return {
    fromName: matched[1]?.trim() || null,
    fromAddress: matched[2]?.trim() || null,
  };
}

/**
 * splitFrom で分離した Name と Address を再結合して、
 * 元の "Name <address>" 形式に戻します。
 *
 * 例：
 * - ("Alice", "alice@example.com") → "Alice <alice@example.com>"
 * - (null, "alice@example.com") → "alice@example.com"
 * - ("alice@example.com", null) → "alice@example.com"
 *
 * パラメータ:
 * - fromName: 名前部分（null 可）
 * - fromAddress: アドレス部分（null 可）
 *
 * 戻り値:
 * - 結合形式の from 文字列、または null
 */
function joinFrom(fromName: string | null, fromAddress: string | null) {
  if (fromName && fromAddress) {
    return `${fromName} <${fromAddress}>`;
  }
  return fromAddress ?? fromName ?? null;
}

/**
 * SQLite のキャッシュから、指定したアカウント＆フォルダのメール一覧を取得します。
 *
 * 役割：
 * - DB から該当レコードを日付新順（desc）でクエリ
 * - from フィールドを Name + Address から元の形式に復元
 * - date を ISO 8601 文字列に変換
 * - 呼び出し元が期待する CachedMailListItem[] を返却
 *
 * パラメータ:
 * - accountId: ユーザーのメールアカウント ID
 * - folder: フォルダ名（例："INBOX", "[Gmail]/送信済み"）
 * - limit: 取得件数上限
 *
 * 戻り値:
 * - CachedMailListItem の配列（日付新順）
 *
 * 注意：
 * - inReplyTo と references は常に null/[] を返す（キャッシュでは保有していないため）
 * - seen は常に false（キャッシュの `seen` フラグは未実装）
 */
export async function getCachedMessages(params: {
  accountId: string;
  folder: string;
  limit: number;
}): Promise<CachedMailListItem[]> {
  const rows = await prisma.mailCache.findMany({
    where: {
      accountId: params.accountId,
      folder: params.folder,
    },
    orderBy: [{ internalDate: 'desc' }, { uid: 'desc' }],
    take: params.limit,
  });

  return rows.map(row => ({
    uid: row.uid,
    subject: row.subject,
    from: joinFrom(row.fromName, row.fromAddress),
    date: row.internalDate ? row.internalDate.toISOString() : null,
    messageId: row.messageId,
    inReplyTo: null,
    references: [],
    hasAttachment: row.hasAttachment,
    seen: false,
  }));
}

/**
 * 指定したアカウント＆フォルダのキャッシュ内で、最大（最新）の UID を取得します。
 *
 * 役割：
 * - 差分同期の基準点として機能
 * - 前回の同期終了時の UID を確認
 * - その UID より後（新しい）メール情報だけを IMAP から取得する際に使用
 *
 * パラメータ:
 * - accountId: メールアカウント ID
 * - folder: フォルダ名
 *
 * 戻り値:
 * - 最大 UID（整数）、またはキャッシュが空の場合は null
 *
 * 使用シーン:
 * - mail-sync.ts の syncFolderMessages 内で「初回同期か差分同期か」の判定
 */
export async function getMaxCachedUid(params: {
  accountId: string;
  folder: string;
}) {
  const max = await prisma.mailCache.aggregate({
    where: {
      accountId: params.accountId,
      folder: params.folder,
    },
    _max: {
      uid: true,
    },
  });

  return max._max.uid ?? null;
}

/**
 * 指定したアカウント＆フォルダのキャッシュ内のメッセージ総数をカウントします。
 *
 * 役割：
 * - リモート数との比較（mail-sync.ts で「キャッシュのみで返すか」の判定用）
 * - キャッシュ整合性診断
 *
 * パラメータ:
 * - accountId: メールアカウント ID
 * - folder: フォルダ名
 *
 * 戻り値:
 * - キャッシュ内のメッセージ数（整数）
 */
export async function getCachedMessageCount(params: {
  accountId: string;
  folder: string;
}) {
  return prisma.mailCache.count({
    where: {
      accountId: params.accountId,
      folder: params.folder,
    },
  });
}

/**
 * 複数のメール情報をトランザクション処理でキャッシュに一括 UPSERT（INSERT または UPDATE）します。
 *
 * 役割：
 * - 複数メッセージを原子性（一括実行）で保存
 * - 差分同期時に新しいメール情報をキャッシュに追加
 * - 既存レコード（同じ accountId/folder/uid）は更新
 * - from を Name/Address に分割して格納
 *
 * パラメータ:
 * - accountId: メールアカウント ID
 * - folder: フォルダ名
 * - messages: UpsertMessageInput の配列（複数メール情報）
 *
 * 動作：
 * 1. 各メッセージについて splitFrom でパース
 * 2. Prisma.upsert で以下を実行：
 *    - 該当レコード（accountId/folder/uid の複合キー）があれば更新
 *    - なければ新規作成
 * 3. すべての操作をトランザクション内で実行（原子性保証）
 *
 * 注：messages が空の場合は何もしない（DB アクセスなし）
 */
export async function upsertMessagesToCache(params: {
  accountId: string;
  folder: string;
  messages: UpsertMessageInput[];
}) {
  if (params.messages.length === 0) return;

  await prisma.$transaction(
    params.messages.map(message => {
      const split = splitFrom(message.from);
      return prisma.mailCache.upsert({
        where: {
          accountId_folder_uid: {
            accountId: params.accountId,
            folder: params.folder,
            uid: message.uid,
          },
        },
        create: {
          accountId: params.accountId,
          folder: params.folder,
          uid: message.uid,
          messageId: message.messageId,
          subject: message.subject,
          fromName: split.fromName,
          fromAddress: split.fromAddress,
          hasAttachment: message.hasAttachment,
          internalDate: message.date ? new Date(message.date) : null,
          snippet: null,
        },
        update: {
          messageId: message.messageId,
          subject: message.subject,
          fromName: split.fromName,
          fromAddress: split.fromAddress,
          hasAttachment: message.hasAttachment,
          internalDate: message.date ? new Date(message.date) : null,
        },
      });
    })
  );
}

/**
 * 指定したアカウント＆フォルダのキャッシュから、古いエントリを削除して容量管理します。
 *
 * 役割：
 * - キャッシュサイズの上限管理（フォルダごとに keep 件数まで保持）
 * - 古いメール情報を自動削除（ディスク節約）
 *
 * 動作：
 * 1. UID 降順でソートして、keep 件目以降を抽出
 * 2. 最大 1000 件ずつ ID を取得
 * 3. それらのレコードを DELETE
 *
 * パラメータ:
 * - accountId: メールアカウント ID
 * - folder: フォルダ名
 * - keep: 保持する最大件数（例：500）
 *
 * 例：
 * - キャッシュに 600 件あり、keep=500 の場合
 * - UID が小さい（古い）100 件を削除
 */
export async function pruneCache(params: {
  accountId: string;
  folder: string;
  keep: number;
}) {
  const stale = await prisma.mailCache.findMany({
    where: {
      accountId: params.accountId,
      folder: params.folder,
    },
    orderBy: { uid: 'desc' },
    skip: params.keep,
    take: 1000,
    select: { id: true },
  });

  if (stale.length === 0) return;

  await prisma.mailCache.deleteMany({
    where: {
      id: {
        in: stale.map(item => item.id),
      },
    },
  });
}
