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

const statement = {
  ...orgDefaultStatements,
  ...adminDefaultStatements, // adminプラグインのdefaultStatementsも追加
  project: ['create', 'admin-share', 'owner', 'update', 'audit-log'], // プロジェクト関連の権限を定義
} as const;

const ac = createAccessControl(statement);

const member = ac.newRole({
  ...memberAc.statements,
  // member には project: "admin-share" 権限を付与しない
  project: ['create'],
});
const admins = ac.newRole({
  ...adminAc.statements,
  ...adminPluginAc.statements, // adminプラグインの権限も統合
  // admin 以上だけが project: "admin-share" を持つようにする
  project: ['create', 'update', 'admin-share'],
});
const owner = ac.newRole({
  ...ownerAc.statements,
  ...adminPluginAc.statements, // adminプラグインの権限も統合
  project: ['create', 'update', 'admin-share', 'audit-log', 'owner'],
});

export { ac, member, admins, owner };
