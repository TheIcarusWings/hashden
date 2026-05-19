import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import * as bitcoinjs from 'bitcoinjs-lib';
import { useContainer } from 'class-validator';
import { readFileSync } from 'fs';
import * as ecc from 'tiny-secp256k1';

import { AppModule } from './app.module';

async function bootstrap() {

  if (process.env.API_PORT == null) {
    console.error('It appears your environment is not configured, create and populate an .env file.');
    return;
  }

  // trustProxy lets Fastify (and ThrottlerGuard) read the real client IP
  // from X-Forwarded-For instead of Traefik's internal docker-network IP.
  // Without this, the rate limiter would see all requests as coming from
  // one IP (Traefik's) and would either let everything through or block
  // every legitimate user at once.
  let options: any = { trustProxy: true };
  const secure = process.env.API_SECURE?.toLowerCase() == 'true';
  if (secure) {
    const currentDirectory = process.cwd();
    options = {
      ...options,
      https: {
        key: readFileSync(`${currentDirectory}/secrets/key.pem`),
        cert: readFileSync(`${currentDirectory}/secrets/cert.pem`),
      }
    };
  }

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(options));
  // Upstream public-pool mounted everything under /api; hashden's controllers
  // declare their own /hashden/* paths to match web's fetch URLs and docs.
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      //forbidNonWhitelisted: true,
      //forbidUnknownValues: true
    }),
  );

  process.on('SIGINT', () => {
    console.log(`Stopping services`);
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log(`Stopping services`);
    process.exit(0);
  });

  app.enableCors();
  useContainer(app.select(AppModule), { fallbackOnErrors: true });

  //Taproot
  bitcoinjs.initEccLib(ecc);

  // Nest 10 removed the listen(port, host, callback) overload; await + getUrl()
  // is the supported way to log the bound address.
  await app.listen(process.env.API_PORT, '0.0.0.0');
  console.log(`API listening on ${await app.getUrl()}`);

}

bootstrap();
