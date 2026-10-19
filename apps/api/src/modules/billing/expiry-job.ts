import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { CONFIG } from '../../common/di-tokens';
import type { Config } from '../../config';
import { ExpiryService } from './expiry.service';

/**
 * Runs the Plus expiry steps (reminders, Grace Period notice, downgrade and
 * restoring Members): at startup, then every `EXPIRY_JOB_INTERVAL_MINUTES`
 * (0 turns it off). Steps missed while the API was down are taken on the next
 * run, except reminders whose time has passed.
 */
@Injectable()
export class ExpiryJob implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ExpiryJob.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    @Inject(ExpiryService) private readonly expiry: ExpiryService,
  ) {}

  onApplicationBootstrap(): void {
    const minutes = this.config.EXPIRY_JOB_INTERVAL_MINUTES;
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
    this.running ??= this.expiry
      .runDue(new Date())
      .then((done) => {
        if (Object.values(done).some((n) => n > 0))
          this.logger.log(done, 'Plus expiry steps taken');
      })
      .catch((error: unknown) => this.logger.error(error, 'Plus expiry steps failed'))
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }
}
