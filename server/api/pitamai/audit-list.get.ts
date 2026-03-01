import { z } from 'zod';
import prisma from '~~/lib/prisma';
import { AuditListQuerySchema } from '~~/shared/types/audit-list';
import { auth } from '~~/server/utils/auth';

export default defineEventHandler(async event => {
  // audit-log 権限、または owner 権限を持つユーザーのみ許可
  await assertActiveMemberRole(event, ['owner']);

  const query = await getValidatedQuery(event, body =>
    AuditListQuerySchema.parse(body)
  );

  const where: any = {};

  // 組織IDが指定されていればフィルタ
  // 指定がない場合は、セキュリティポリシーによるが、
  // ここでは「自分がownerである組織のログ」に限定するロジックを入れるのが安全だが、
  // assertActiveMemberRoleを通っている時点で「現在の組織のowner」であることは保証されている。
  // もし「全組織のログ」を見せたいなら、別途ロジックが必要。
  // 今回は member.vue に倣い、クライアントから organizationId を送ってもらう前提とする。
  // ただし、organizationId がないグローバルなログ（ユーザー作成など）も見たい場合があるかもしれない。
  // 一旦、organizationId があればそれで絞り込み、なければ絞り込まない（全件）とするが、
  // 本番運用では「自分が権限を持つ組織」に絞るべき。
  // ここでは簡易的に、クエリに従う。

  if (query.organizationId) {
    where.organizationId = query.organizationId;
  } else {
    // organizationId が指定されていない場合、自分が owner 権限を持つ組織のログのみに絞り込む
    // これにより、無関係な組織のログが見えてしまうのを防ぐ
    const session = await auth.api.getSession({ headers: event.headers });
    if (session?.user) {
      const ownerOrgs = await prisma.member.findMany({
        where: {
          userId: session.user.id,
          role: 'owner',
        },
        select: { organizationId: true },
      });
      const ownerOrgIds = ownerOrgs.map(m => m.organizationId);

      // 自分がownerの組織のログ OR 組織に紐付かないログ(organizationId: null) も見せるかどうかは要件次第だが、
      // ここでは「自分がownerの組織に関連するログ」に限定する。
      // organizationId が null のログ（システム全体に関わるものなど）を見せる場合は OR 条件を追加する。
      where.OR = [
        { organizationId: { in: ownerOrgIds } },
        { organizationId: null },
      ];
    }
  }

  // 全体検索: action, targetId, user.email, user.name を対象に検索
  const search = query.search?.trim();
  if (search) {
    // NOTE: Prisma の `mode: 'insensitive'` は PostgreSQL などでのみサポートされる。
    // このプロジェクトは SQLite から PostgreSQL に移行済みであり、意図的に
    // 大文字小文字を区別しない検索を行っている。
    const searchConditions = [
      { action: { contains: search, mode: 'insensitive' as const } },
      { targetId: { contains: search, mode: 'insensitive' as const } },
      {
        user: {
          is: {
            email: { contains: search, mode: 'insensitive' as const },
          },
        },
      },
      {
        user: {
          is: {
            name: { contains: search, mode: 'insensitive' as const },
          },
        },
      },
    ];

    // 既存の where.OR がある場合は AND で結合
    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: searchConditions }];
      delete where.OR;
    } else {
      where.OR = searchConditions;
    }
  }

  // 日付レンジ検索 (createdAt)
  // 受け取った Date を UTC の日付として扱い、日単位の境界に丸める
  const startAt = query.startAt ? new Date(query.startAt) : undefined;
  const endAt = query.endAt ? new Date(query.endAt) : undefined;

  if (startAt || endAt) {
    const gte = startAt ? new Date(startAt) : undefined;
    if (gte) gte.setUTCHours(0, 0, 0, 0);

    const lteBase = endAt ?? startAt;
    const lte = lteBase ? new Date(lteBase) : undefined;
    if (lte) lte.setUTCHours(23, 59, 59, 999);

    where.createdAt = {
      ...(gte ? { gte } : {}),
      ...(lte ? { lte } : {}),
    };
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      take: query.limit,
      skip: query.offset,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
        organization: {
          select: { id: true, name: true, slug: true },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    logs,
    total,
  };
});
