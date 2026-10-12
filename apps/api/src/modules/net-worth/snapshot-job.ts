import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { CONFIG } from '../../common/di-tokens';
import type { Config } from '../../config';
import { NetWorthService } from './net-worth.service';

/**
 * Takes the automatic month-end Net Worth Snapshots: at startup, then every
 * `SNAPSHOT_JOB_INTERVAL_MINUTES` (0 turns it off). A month is snapshotted on
 * the first run after it ends in the Workspace's timezone, and months missed
 * while the API was down are caught up then.
 */
@Injectable()
export class SnapshotJob implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SnapshotJob.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    @Inject(NetWorthService) private readonly netWorth: NetWorthService,
  ) {}

  onApplicationBootstrap(): void {
    const minutes = this.config.SNAPSHOT_JOB_INTERVAL_MINUTES;
    if (minutes === 0) return;
    void this.run();
    this.timer = setInterval(() => void this.run(), minutes * 60_000);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.running;
  }

  /** One pass; a pass still running when the next is due is not overlapped. */
  run(): Promise<void> {
    this.running ??= this.netWorth
      .takeDueAutoSnapshots(new Date())
      .then((taken) => {
        if (taken > 0) this.logger.log(`Took ${taken} month-end Net Worth Snapshots`);
      })
      .catch((error: unknown) => this.logger.error(error, 'Month-end Net Worth Snapshots failed'))
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }
}
