import { Router } from 'express';
import type { AppContext } from '../http/context.js';

/** Lookup data the UI needs for filters and forms: roles, document types, quarters and role permissions. */
export function catalogRoutes({ query }: AppContext) {
  const router = Router();
  router.get('/', async (_req, res) => {
    const [roles, types, quarters, permissions] = await Promise.all([
      query('SELECT "RoleId" AS "roleId","RoleName" AS "roleName" FROM "Roles" ORDER BY "RoleId"'),
      query('SELECT "DocTypeId" AS "docTypeId","TypeName" AS "typeName" FROM "DocumentTypes" ORDER BY "DocTypeId"'),
      query('SELECT "QuarterID" AS "quarterId","QuarterName" AS "quarterName" FROM "Quarters" ORDER BY "QuarterID"'),
      query('SELECT "RoleId" AS "roleId","DocTypeId" AS "docTypeId" FROM "RoleDocPerms"'),
    ]);
    res.json({ roles, types, quarters, permissions });
  });
  return router;
}
