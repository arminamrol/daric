import type { DownloadedFile } from '@daric/api-client';
import type { ExportFormat } from '@daric/core';
import { useMutation } from '@tanstack/react-query';
import { useId } from 'react';
import { useApi } from '../api/api';
import { useI18n } from '../i18n/locale';

/** Hands a downloaded file to the browser to save. */
function save({ blob, fileName }: DownloadedFile) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

const buttonClass =
  'w-fit rounded-md border border-border px-4 py-2 font-medium text-foreground disabled:opacity-60';

/** Downloads every entity of the Workspace: Owner and Admin only, on every Plan. */
export function ExportData({ workspaceId }: { workspaceId: string }) {
  const { t } = useI18n();
  const api = useApi();
  const titleId = useId();
  const download = useMutation({
    mutationFn: (format: ExportFormat) => api.exportWorkspace(workspaceId, format),
    onSuccess: save,
  });

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface px-6 py-6"
    >
      <h2 id={titleId} className="text-xl font-bold">
        {t('settings.export.title')}
      </h2>
      <p className="text-sm text-foreground-muted">{t('settings.export.hint')}</p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={download.isPending}
          onClick={() => download.mutate('csv')}
          className={buttonClass}
        >
          {t('settings.export.csv')}
        </button>
        <button
          type="button"
          disabled={download.isPending}
          onClick={() => download.mutate('json')}
          className={buttonClass}
        >
          {t('settings.export.json')}
        </button>
      </div>
      {download.isSuccess && (
        <p role="status" className="text-sm text-foreground-muted">
          {t('settings.export.done')}
        </p>
      )}
      {download.isError && (
        <p role="alert" className="rounded-md bg-surface-muted px-3 py-2 text-sm text-danger">
          {t('settings.export.failed')}
        </p>
      )}
    </section>
  );
}
