import { createAccessControl } from 'better-auth/plugins/access';
import {
  defaultStatements as orgDefaultStatements,
  adminAc,
  ownerAc,
  memberAc,
} from 'better-auth/plugins/organization/access';

import {
  defaultStatements as adminDefaultStatements,
  adminAc as adminPluginAc,
} from 'better-auth/plugins/admin/access';

/**
 * アプリケーション独自の権限定義
 */
const statement = {
  ...orgDefaultStatements,
  ...adminDefaultStatements,
  // プロジェクト固有のリソース
  project: [
    'create',      // プロジェクト作成
    'update',      // プロジェクト更新
    'delete',      // プロジェクト削除
    'admin-share', // 管理者向け共有機能
    'owner',       // 所有者限定操作
  ],
  // 監査ログリソース
  auditLog: [
    'read',        // 閲覧（admins以上）
    'export',      // 書き出し（ownerのみ）
  ],
  // ユーザー管理リソース（adminプラグインの補完）
  userManagement: [
    'list',
    'create',
    'update',
    'delete',
    'set-role',
  ]
} as const;

const ac = createAccessControl(statement);

/**
 * 一般メンバー
 * - 自分の組織内での基本操作のみ
 */
const member = ac.newRole({
  ...memberAc.statements,
  project: ['create'],
});

/**
 * 組織管理者 (Admins)
 * - 組織内のメンバー管理、設定変更
 * - 監査ログの閲覧
 */
const admins = ac.newRole({
  ...adminAc.statements,
  ...adminPluginAc.statements,
  project: ['create', 'update', 'admin-share'],
  auditLog: ['read'],
  userManagement: ['list', 'update'],
});

/**
 * 組織所有者 (Owner)
 * - 全ての操作権限
 */
const owner = ac.newRole({
  ...ownerAc.statements,
  ...adminPluginAc.statements,
  project: ['create', 'update', 'admin-share', 'owner'],
  auditLog: ['read', 'export'],
  userManagement: ['list', 'create', 'update', 'delete', 'set-role'],
});

export { ac, member, admins, owner };
