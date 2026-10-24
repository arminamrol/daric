import type { Translate } from '@daric/i18n';
import type { UiLabels } from '../ui/UiProvider';

/** The words the UI primitives say themselves, in the language of `t`. */
export function uiLabels(t: Translate): UiLabels {
  return {
    close: t('ui.close'),
    notifications: t('ui.notifications'),
    loading: t('ui.loading'),
    loadFailed: t('ui.loadFailed'),
    retry: t('ui.retry'),
    cancel: t('ui.cancel'),
    password: t('ui.password'),
  };
}
