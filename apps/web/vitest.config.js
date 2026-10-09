import preset from '@daric/config/vitest';
import { mergeConfig } from 'vitest/config';

export default mergeConfig(preset, {
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] },
});
