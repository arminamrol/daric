import { displayFormatters } from '@daric/core';
import type { DisplayFormatters } from '@daric/core';
import { useMemo } from 'react';
import { useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';

/** Formatters for the signed-in User looking at their Workspace. */
export function useFormatters(): DisplayFormatters {
  const { locale } = useI18n();
  const { me, workspace } = useSignedIn();
  const { preferences } = me;
  return useMemo(
    () => displayFormatters({ locale, workspace, preferences }),
    [locale, workspace, preferences],
  );
}
