import { createAccessControl } from 'better-auth/plugins/access';
import {
  defaultStatements,
  adminAc,
  ownerAc,
  memberAc,
} from 'better-auth/plugins/organization/access';

const statement = {
  ...defaultStatements,
  project: ['create', 'share', 'update', 'delete'],
} as const;

const ac = createAccessControl(statement);

const member = ac.newRole({
  ...memberAc.statements,
  // member には project: "share" 権限を付与しない
  project: ['create'],
});
const admin = ac.newRole({
  ...adminAc.statements,
  // admin 以上だけが project: "share" を持つようにする
  project: ['create', 'update', 'share'],
});
const owner = ac.newRole({
  ...ownerAc.statements,
  project: ['create', 'update', 'delete', 'share'],
});

export { ac, member, admin, owner };
