import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule, type AppOptions } from './app.module';
import type { Config } from './config';

export function openApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Daric API')
    .setVersion('1')
    .addBearerAuth()
    .build();
  return cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
}

/** Builds the configured API application without starting to listen. */
export async function createApp(
  config: Config,
  options: AppOptions = {},
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config, options), {
    bufferLogs: true,
  });
  return configureApp(app, config);
}

/** HTTP-level setup shared by `createApp` and tests that build the module themselves. */
export function configureApp(app: NestExpressApplication, config: Config): NestExpressApplication {
  app.useLogger(app.get(Logger));
  app.set('trust proxy', config.TRUST_PROXY);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: config.CORS_ORIGINS, credentials: true });
  app.enableShutdownHooks();
  SwaggerModule.setup('v1/docs', app, () => openApiDocument(app), {
    jsonDocumentUrl: 'v1/openapi.json',
  });
  return app;
}
