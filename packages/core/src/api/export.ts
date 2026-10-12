import { z } from 'zod';

/** A JSON file with every entity, or a zip of one CSV file per entity. */
export const exportFormats = ['json', 'csv'] as const;
export type ExportFormat = (typeof exportFormats)[number];

/** The file each format downloads as: CSV files come zipped. */
export const exportFiles: Record<ExportFormat, { extension: string; contentType: string }> = {
  json: { extension: 'json', contentType: 'application/json; charset=utf-8' },
  csv: { extension: 'zip', contentType: 'application/zip' },
};

/** Which format to export a Workspace in; JSON by default. */
export const exportQuerySchema = z.object({
  format: z.enum(exportFormats).default('json'),
});
export type ExportQuery = z.infer<typeof exportQuerySchema>;
