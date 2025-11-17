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
  project: ['create'],
});
const admin = ac.newRole({
  ...adminAc.statements,
  project: ['create', 'update'],
});
const owner = ac.newRole({
  ...ownerAc.statements,
  project: ['create', 'update', 'delete'],
});

export { ac, member, admin, owner };
