export const PROPOSAL_TYPE_ID = 1;
export const OBSERVER_ROLE_ID = 10;
/** The developer administers users, cycles, deletions and storage. */
export const DEVELOPER_ROLE_ID = 11;
export const isDeveloper = (user: { roleId: number }) => user.roleId === DEVELOPER_ROLE_ID;
/** President, secretary general and financial officer review proposals. */
export const REVIEWER_ROLE_IDS = [1, 3, 4];
/** President and secretary general manage vote sessions. */
export const VOTE_MANAGER_ROLE_IDS = [1, 3, DEVELOPER_ROLE_ID];
export const isCommitteeRole = (role: { roleId: number }) => role.roleId < OBSERVER_ROLE_ID;
