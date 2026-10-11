/** The query key every Transaction query of a Workspace starts with. */
export const transactionsKey = (workspaceId: string) => ['transactions', workspaceId] as const;
