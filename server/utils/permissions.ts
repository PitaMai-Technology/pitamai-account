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
  project: ['create', 'share', 'update', 'delete'],
} as const;

const ac = createAccessControl(statement);

const member = ac.newRole({
  ...memberAc.statements,
  // member には project: "share" 権限を付与しない
  project: ['create'],
});
const admins = ac.newRole({
  ...adminAc.statements,
  ...adminPluginAc.statements, // adminプラグインの権限も統合
  // admin 以上だけが project: "share" を持つようにする
  project: ['create', 'update', 'share'],
});
const owner = ac.newRole({
  ...ownerAc.statements,
  ...adminPluginAc.statements, // adminプラグインの権限も統合
  project: ['create', 'update', 'delete', 'share'],
});

export { ac, member, admins, owner };
