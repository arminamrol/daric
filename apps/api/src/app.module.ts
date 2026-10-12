import type { Writable } from 'node:stream';
import { Global, Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuthGuard } from './modules/auth/auth.guard';
import { CsrfGuard } from './modules/auth/csrf.guard';
import { loggerOptions } from './common/logger';
import { CONFIG } from './common/di-tokens';
import { HOUR, MINUTE } from './common/time';
import type { Config } from './config';
import { DatabaseModule } from './db/database.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthController } from './modules/auth/auth.controller';
import { AuthModule } from './modules/auth/auth.module';
import { BudgetsModule } from './modules/budgets/budgets.module';
import { ExchangeRatesModule } from './modules/exchange-rates/exchange-rates.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { LabelsModule } from './modules/labels/labels.module';
import { MailerModule } from './modules/mailer/mailer.module';
import { sendsMail } from './modules/mailer/sends-mail';
import { MeModule } from './modules/me/me.module';
import { NetWorthModule } from './modules/net-worth/net-worth.module';
import { ProjectionModule } from './modules/projection/projection.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RecurringModule } from './modules/recurring/recurring.module';
import { ValuationsModule } from './modules/valuations/valuations.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';

export interface AppOptions {
  /** Where logs go instead of stdout (tests). */
  logStream?: Writable | undefined;
}

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
              // Login, registration and the mailed-link routes get a tighter budget against guessing.
              name: 'auth',
              ttl: MINUTE,
              limit: config.AUTH_RATE_LIMIT_PER_MINUTE,
              skipIf: (context) => context.getClass() !== AuthController,
            },
            {
              // Against using us to flood someone's inbox; each User also has a cap of their own.
              name: 'mail',
              ttl: HOUR,
              limit: config.MAIL_RATE_LIMIT_PER_HOUR,
              skipIf: (context) => !sendsMail(context),
            },
          ],
        }),
        AuditModule,
        MailerModule,
        AuthModule,
        WorkspacesModule,
        MeModule,
        AccountsModule,
        CategoriesModule,
        LabelsModule,
        TransactionsModule,
        BudgetsModule,
        ExchangeRatesModule,
        RecurringModule,
        ProjectionModule,
        ReportsModule,
        ValuationsModule,
        NetWorthModule,
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
