import type { CreateInvitationInput, Member, UpdateMemberInput } from '@daric/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../api/api';
import { ME_QUERY_KEY, useSignedIn } from '../auth/session';

export const membersKey = (workspaceId: string) => ['members', workspaceId] as const;
export const invitationsKey = (workspaceId: string) => ['invitations', workspaceId] as const;
export const CONSENTS_QUERY_KEY = ['consents'] as const;

export function useMembers() {
  const api = useApi();
  const { workspace } = useSignedIn();
  return useQuery({
    queryKey: membersKey(workspace.id),
    queryFn: () => api.listMembers(workspace.id),
  });
}

/** Owner or Admin: the Invitations and whether the Owner's Plan lets the Workspace send more. */
export function useInvitations() {
  const api = useApi();
  const { workspace } = useSignedIn();
  return useQuery({
    queryKey: invitationsKey(workspace.id),
    queryFn: () => api.listInvitations(workspace.id),
  });
}

export function useCreateInvitation() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { workspace } = useSignedIn();
  return useMutation({
    mutationFn: (input: CreateInvitationInput) => api.createInvitation(workspace.id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invitationsKey(workspace.id) }),
  });
}

export function useRevokeInvitation() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { workspace } = useSignedIn();
  return useMutation({
    mutationFn: (invitationId: string) => api.revokeInvitation(workspace.id, invitationId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: invitationsKey(workspace.id) }),
  });
}

export function useUpdateMember() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { workspace } = useSignedIn();
  return useMutation({
    mutationFn: ({ memberId, ...input }: UpdateMemberInput & { memberId: string }) =>
      api.updateMember(workspace.id, memberId, input),
    onSuccess: (saved) =>
      queryClient.setQueryData<Member[]>(membersKey(workspace.id), (members) =>
        members?.map((m) => (m.id === saved.id ? saved : m)),
      ),
    onError: () => queryClient.invalidateQueries({ queryKey: membersKey(workspace.id) }),
  });
}

/**
 * Removes a Member, or leaves the Workspace when it is the User's own
 * membership; then the User's Workspaces and Consents are read again.
 */
export function useRemoveMember() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { workspace } = useSignedIn();
  return useMutation({
    mutationFn: (memberId: string) => api.removeMember(workspace.id, memberId),
    onSuccess: async (_, memberId) => {
      queryClient.setQueryData<Member[]>(membersKey(workspace.id), (members) =>
        members?.filter((m) => m.id !== memberId),
      );
      await queryClient.invalidateQueries({ queryKey: CONSENTS_QUERY_KEY });
    },
  });
}

/** Owner only: hands the Workspace to a Member; the User's own Role is read again. */
export function useTransferOwnership() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { workspace } = useSignedIn();
  return useMutation({
    mutationFn: (memberId: string) => api.transferOwnership(workspace.id, memberId),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: membersKey(workspace.id) }),
        queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
      ]),
  });
}

export function useConsents() {
  const api = useApi();
  return useQuery({ queryKey: CONSENTS_QUERY_KEY, queryFn: () => api.listConsents() });
}

/** Takes a Consent back; taking back sharing leaves that Workspace, so the Workspaces are read again. */
export function useRevokeConsent() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (consentId: string) => api.revokeConsent(consentId),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: CONSENTS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
      ]),
  });
}
