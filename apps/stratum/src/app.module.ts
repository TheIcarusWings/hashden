import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from './app.controller';
import { AddressController } from './controllers/address/address.controller';
import { ClientController } from './controllers/client/client.controller';
import { BitcoinAddressValidator } from './models/validators/bitcoin-address.validator';
import { AddressSettingsModule } from './ORM/address-settings/address-settings.module';
import { BlocksModule } from './ORM/blocks/blocks.module';
import { ClientStatisticsModule } from './ORM/client-statistics/client-statistics.module';
import { ClientModule } from './ORM/client/client.module';
import { RpcBlocksModule } from './ORM/rpc-block/rpc-block.module';
import { TelegramSubscriptionsModule } from './ORM/telegram-subscriptions/telegram-subscriptions.module';
import { AppService } from './services/app.service';
import { BitcoinRpcService } from './services/bitcoin-rpc.service';
import { BraiinsService } from './services/braiins.service';
import { BTCPayService } from './services/btc-pay.service';
import { DiscordService } from './services/discord.service';
import { NotificationService } from './services/notification.service';
import { StratumV1JobsService } from './services/stratum-v1-jobs.service';
import { StratumV1Service } from './services/stratum-v1.service';
import { TelegramService } from './services/telegram.service';
import { ExternalSharesService } from './services/external-shares.service';
import { ExternalShareController } from './controllers/external-share/external-share.controller';
import { ExternalSharesModule } from './ORM/external-shares/external-shares.module';
import { HashdenService } from './hashden/hashden.service';
import { OperatorCredsService } from './hashden/operator-creds.service';
import { OperatorTemplatesController } from './hashden/api/operator-templates.controller';
import { HashdenSharesController } from './hashden/api/shares.controller';
import { HashdenBlocksController } from './hashden/api/blocks.controller';
import { HashdenGroupsController } from './hashden/api/groups.controller';
import { HashdenMembersController } from './hashden/api/members.controller';
import { HashdenLnurlController } from './hashden/api/lnurl.controller';
import { HashdenPayoutsController } from './hashden/api/payouts.controller';
import { HashdenCoinbasePreviewController } from './hashden/api/coinbase-preview.controller';
import { HashdenHashrateController } from './hashden/api/hashrate.controller';

const ORMModules = [
    ClientStatisticsModule,
    ClientModule,
    AddressSettingsModule,
    TelegramSubscriptionsModule,
    BlocksModule,
    RpcBlocksModule,
    ExternalSharesModule
]

@Module({
    imports: [
        ConfigModule.forRoot(),
        TypeOrmModule.forRoot({
            type: 'sqlite',
            database: './DB/public-pool.sqlite',
            synchronize: true,
            autoLoadEntities: true,
            logging: false,
            enableWAL: true,
            busyTimeout: 30 * 1000,

        }),
        CacheModule.register(),
        ScheduleModule.forRoot(),
        HttpModule,
        // Global per-IP rate limit. Tighter overrides on hot POST endpoints
        // (group create, member join, etc.) live as @Throttle() decorators
        // on those controllers. Default: 300 requests/minute per IP across
        // all endpoints. The Next.js web container fans out ~5 fetches per
        // /g/[slug] server render from a single IP, so the previous 60/min
        // budget got eaten quickly during normal browsing and triggered
        // 429s that surfaced as intermittent 404s upstream.
        ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
        ...ORMModules
    ],
    controllers: [
        AppController,
        ClientController,
        AddressController,
        ExternalShareController,
        // Hashden controllers (registered here so they share AppModule's DI scope)
        OperatorTemplatesController,
        HashdenSharesController,
        HashdenBlocksController,
        HashdenGroupsController,
        HashdenMembersController,
        HashdenLnurlController,
        HashdenPayoutsController,
        HashdenCoinbasePreviewController,
        HashdenHashrateController,
    ],
    providers: [
        DiscordService,
        AppService,
        StratumV1Service,
        TelegramService,
        BitcoinRpcService,
        NotificationService,
        BitcoinAddressValidator,
        StratumV1JobsService,
        BTCPayService,
        BraiinsService,
        ExternalSharesService,
        // HashdenService promoted from HashdenModule so it can inject
        // StratumV1JobsService (via the same AppModule DI scope).
        HashdenService,
        OperatorCredsService,
        // Apply ThrottlerGuard globally so every HTTP route gets the default
        // bucket. Stratum's TCP listener (port 3333) doesn't go through
        // Nest's HTTP pipeline, so it's unaffected — that's fine, the TCP
        // path has its own connection-level rate limits inside StratumV1.
        { provide: APP_GUARD, useClass: ThrottlerGuard },
    ],
})
export class AppModule {
    constructor() {

    }
}
