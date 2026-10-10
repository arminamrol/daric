import {
  Global,
  Inject,
  Injectable,
  Module,
  type DynamicModule,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Pool } from 'pg';
import { DATABASE } from '../common/tokens';
import { createDatabase } from './client';

const POOL = Symbol('POOL');

@Injectable()
class PoolCloser implements OnApplicationShutdown {
  constructor(@Inject(POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Global()
@Module({})
export class DatabaseModule {
  static forRoot(url: string): DynamicModule {
    const { db, pool } = createDatabase(url);
    return {
      module: DatabaseModule,
      providers: [
        { provide: DATABASE, useValue: db },
        { provide: POOL, useValue: pool },
        PoolCloser,
      ],
      exports: [DATABASE],
    };
  }
}
