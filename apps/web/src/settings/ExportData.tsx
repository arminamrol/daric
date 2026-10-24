import type { DownloadedFile } from '@daric/api-client';
import type { ExportFormat } from '@daric/core';
import { useMutation } from '@tanstack/react-query';
import { useId } from 'react';
import { Download } from 'lucide-react';
import { useApi } from '../api/api';
import { useI18n } from '../i18n/locale';
import { Button } from '../ui/Button';
import { Card, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { FormMessage } from '../ui/Field';

/** Hands a downloaded file to the browser to save. */
function save({ blob, fileName }: DownloadedFile) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Some browsers start the download only after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

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
    <Card aria-labelledby={titleId}>
      <CardHeader>
        <CardTitle id={titleId}>{t('settings.export.title')}</CardTitle>
        <CardDescription>{t('settings.export.hint')}</CardDescription>
      </CardHeader>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          disabled={download.isPending}
          onClick={() => download.mutate('csv')}
        >
          <Download aria-hidden />
          {t('settings.export.csv')}
        </Button>
        <Button
          variant="outline"
          disabled={download.isPending}
          onClick={() => download.mutate('json')}
        >
          <Download aria-hidden />
          {t('settings.export.json')}
        </Button>
      </div>
      {download.isSuccess && <FormMessage tone="status">{t('settings.export.done')}</FormMessage>}
      {download.isError && <FormMessage tone="alert">{t('settings.export.failed')}</FormMessage>}
    </Card>
  );
}
