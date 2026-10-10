import type { Writable } from 'node:stream';
import { Global, Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuthGuard } from './modules/auth/auth.guard';
import { CsrfGuard } from './modules/auth/csrf.guard';
import { loggerOptions } from './common/logger';
import { CONFIG } from './common/di-tokens';
import type { Config } from './config';
import { DatabaseModule } from './db/database.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthController } from './modules/auth/auth.controller';
import { AuthModule } from './modules/auth/auth.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { LabelsModule } from './modules/labels/labels.module';
import { MeModule } from './modules/me/me.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';

export interface AppOptions {
  /** Where logs go instead of stdout (tests). */
  logStream?: Writable | undefined;
}

const MINUTE = 60_000;

@Global()
@Module({})
class ConfigModule {
  static forRoot(config: Config): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: CONFIG, useValue: config }],
      exports: [CONFIG],
    };
  }
}

@Module({})
export class AppModule {
  static forRoot(config: Config, options: AppOptions = {}): DynamicModule {
    const pinoOptions = loggerOptions(config.LOG_LEVEL);
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        DatabaseModule.forRoot(config.DATABASE_URL),
        LoggerModule.forRoot({
          pinoHttp: options.logStream ? [pinoOptions, options.logStream] : pinoOptions,
        }),
        ThrottlerModule.forRoot({
          throttlers: [
            { name: 'default', ttl: MINUTE, limit: config.RATE_LIMIT_PER_MINUTE },
            {
              // Login and registration get a tighter budget against password guessing.
              name: 'auth',
              ttl: MINUTE,
              limit: config.AUTH_RATE_LIMIT_PER_MINUTE,
              skipIf: (context) => context.getClass() !== AuthController,
            },
          ],
        }),
        AuditModule,
        AuthModule,
        WorkspacesModule,
        MeModule,
        AccountsModule,
        CategoriesModule,
        LabelsModule,
        TransactionsModule,
      ],
      providers: [
        // Order matters: rate limiting, then CSRF, then authentication.
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: CsrfGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    };
  }
}
