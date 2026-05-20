import { ConfigService } from '@nestjs/config';
import * as bitcoinjs from 'bitcoinjs-lib';
import { plainToInstance } from 'class-transformer';
import { validate, ValidatorOptions } from 'class-validator';
import * as crypto from 'crypto';
import { Socket } from 'net';
import { firstValueFrom, Subscription } from 'rxjs';
import { clearInterval } from 'timers';

import { AddressSettingsService } from '../ORM/address-settings/address-settings.service';
import { BlocksService } from '../ORM/blocks/blocks.service';
import { ClientStatisticsService } from '../ORM/client-statistics/client-statistics.service';
import { ClientEntity } from '../ORM/client/client.entity';
import { ClientService } from '../ORM/client/client.service';
import { BitcoinRpcService } from '../services/bitcoin-rpc.service';
import { NotificationService } from '../services/notification.service';
import { IJobTemplate, StratumV1JobsService } from '../services/stratum-v1-jobs.service';
import { eRequestMethod } from './enums/eRequestMethod';
import { eResponseMethod } from './enums/eResponseMethod';
import { eStratumErrorCode } from './enums/eStratumErrorCode';
import { MiningJob } from './MiningJob';
import { AuthorizationMessage } from './stratum-messages/AuthorizationMessage';
import { ConfigurationMessage } from './stratum-messages/ConfigurationMessage';
import { MiningSubmitMessage } from './stratum-messages/MiningSubmitMessage';
import { StratumErrorMessage } from './stratum-messages/StratumErrorMessage';
import { SubscriptionMessage } from './stratum-messages/SubscriptionMessage';
import { getExtranonce2SizeBytes } from '../utils/extranonce.utils';
import { SuggestDifficulty } from './stratum-messages/SuggestDifficultyMessage';
import { StratumV1ClientStatistics } from './StratumV1ClientStatistics';
import { ExternalSharesService } from '../services/external-shares.service';
import { DifficultyUtils } from '../utils/difficulty.utils';


export class StratumV1Client {

    private clientSubscription: SubscriptionMessage;
    private clientConfiguration: ConfigurationMessage;
    private clientAuthorization: AuthorizationMessage;
    private clientSuggestedDifficulty: SuggestDifficulty;
    private stratumSubscription: Subscription;
    // Hashden: NodeJS.Timer → NodeJS.Timeout for @types/node ≥20 compatibility.
    private backgroundWork: NodeJS.Timeout[] = [];

    private statistics: StratumV1ClientStatistics;
    private stratumInitialized = false;
    private usedSuggestedDifficulty = false;
    private sessionDifficulty: number = 16384;

    private entity: ClientEntity;
    private creatingEntity: Promise<void>;

    public extraNonceAndSessionId: string;
    public sessionStart: Date;
    public noFee: boolean;
    public hashRate: number = 0;

    private buffer: string = '';

    private miningSubmissionHashes = new Set<string>()

    // Hashden: when authorization succeeds via Hashden routing, this
    // captures the resolved group/member context for use by the share-
    // accept and template-build paths.
    private hashdenContext: { groupId: string; memberPubkey: string; workerId: string | null } | null = null;

    constructor(
        public readonly socket: Socket,
        private readonly stratumV1JobsService: StratumV1JobsService,
        private readonly bitcoinRpcService: BitcoinRpcService,
        private readonly clientService: ClientService,
        private readonly clientStatisticsService: ClientStatisticsService,
        private readonly notificationService: NotificationService,
        private readonly blocksService: BlocksService,
        private readonly configService: ConfigService,
        private readonly addressSettingsService: AddressSettingsService,
        private readonly externalSharesService: ExternalSharesService,
        private readonly hashdenService: import('../hashden/hashden.service').HashdenService
    ) {

        this.socket.on('data', (data: Buffer) => {
            this.buffer += data.toString();
            let lines = this.buffer.split('\n');
            this.buffer = lines.pop() || ''; // Save the last part of the data (incomplete line) to the buffer

            lines
                .filter(m => m.length > 0)
                .forEach(async (m) => {
                    try {
                        await this.handleMessage(m);
                    } catch (e) {
                        await this.socket.end();
                        console.error(e);
                    }
                });
        });


    }

    public async destroy() {

        if (this.extraNonceAndSessionId) {
            await this.clientService.delete(this.extraNonceAndSessionId);
        }

        if (this.stratumSubscription != null) {
            this.stratumSubscription.unsubscribe();
        }

        this.backgroundWork.forEach(work => {
            clearInterval(work);
        });
    }

    private getRandomHexString() {
        const randomBytes = crypto.randomBytes(4); // 4 bytes = 32 bits
        const randomNumber = randomBytes.readUInt32BE(0); // Convert bytes to a 32-bit unsigned integer
        const hexString = randomNumber.toString(16).padStart(8, '0'); // Convert to hex and pad with zeros
        return hexString;
    }


    private async handleMessage(message: string) {
        //console.log(`Received from ${this.extraNonceAndSessionId}`, message);

        // Parse the message and check if it's the initial subscription message
        let parsedMessage = null;
        try {
            parsedMessage = JSON.parse(message);
        } catch (e) {
            //console.log("Invalid JSON");
            await this.socket.end();
            return;
        }



        switch (parsedMessage.method) {
            case eRequestMethod.SUBSCRIBE: {
                const subscriptionMessage = plainToInstance(
                    SubscriptionMessage,
                    parsedMessage,
                );

                const validatorOptions: ValidatorOptions = {
                    whitelist: true,
                    //forbidNonWhitelisted: true,
                };

                const errors = await validate(subscriptionMessage, validatorOptions);

                if (errors.length === 0) {

                    if (this.sessionStart == null) {
                        this.sessionStart = new Date();
                        this.statistics = new StratumV1ClientStatistics(this.clientStatisticsService);
                        this.extraNonceAndSessionId = this.getRandomHexString();
                        // Hashden: don't log remote IP. Session id is enough
                        // for diagnostics; IP would be a privacy leak to anyone
                        // with stdout/log access.
                        console.log(`New client ID: ${this.extraNonceAndSessionId}`);
                    }

                    this.clientSubscription = subscriptionMessage;
                    const success = await this.write(JSON.stringify(this.clientSubscription.response(this.extraNonceAndSessionId, getExtranonce2SizeBytes(this.configService))) + '\n');
                    if (!success) {
                        return;
                    }
                } else {
                    console.error('Subscription validation error');
                    const err = new StratumErrorMessage(
                        subscriptionMessage.id,
                        eStratumErrorCode.OtherUnknown,
                        'Subscription validation error',
                        errors).response();
                    console.error(err);
                    const success = await this.write(err);
                    if (!success) {
                        return;
                    }
                }

                break;
            }
            case eRequestMethod.CONFIGURE: {

                const configurationMessage = plainToInstance(
                    ConfigurationMessage,
                    parsedMessage,
                );

                const validatorOptions: ValidatorOptions = {
                    whitelist: true,
                    //forbidNonWhitelisted: true,
                };

                const errors = await validate(configurationMessage, validatorOptions);

                if (errors.length === 0) {
                    this.clientConfiguration = configurationMessage;
                    //const response = this.buildSubscriptionResponse(configurationMessage.id);
                    const success = await this.write(JSON.stringify(this.clientConfiguration.response()) + '\n');
                    if (!success) {
                        return;
                    }

                } else {
                    console.error('Configuration validation error');
                    const err = new StratumErrorMessage(
                        configurationMessage.id,
                        eStratumErrorCode.OtherUnknown,
                        'Configuration validation error',
                        errors).response();
                    console.error(err);
                    const success = await this.write(err);
                    if (!success) {
                        return;
                    }
                }

                break;
            }
            case eRequestMethod.AUTHORIZE: {

                const authorizationMessage = plainToInstance(
                    AuthorizationMessage,
                    parsedMessage,
                );

                // Hashden: try to route via group-router first. If the worker
                // name is `<slug>.<pubkey>[.<worker-id>]` and the group +
                // member are registered, swap the BTC address into the
                // authorization message so the upstream @IsBitcoinAddress
                // validator passes. Otherwise fall through to upstream's
                // single-address-per-miner path.
                const rawWorkerName = authorizationMessage.params?.[0];
                if (typeof rawWorkerName === 'string') {
                    // Cast handles strictNullChecks=false in this tsconfig —
                    // the runtime shape is guaranteed by HashdenService.route.
                    const decision: any = await this.hashdenService.route(rawWorkerName);
                    if (decision.ok) {
                        authorizationMessage.address = decision.btcAddress;
                        authorizationMessage.worker = decision.workerId ?? 'worker';
                        this.hashdenContext = {
                            groupId: decision.groupId,
                            memberPubkey: decision.memberPubkey,
                            workerId: decision.workerId,
                        };
                    } else if (decision.reason !== 'INVALID_NAME') {
                        // Hashden-format name was given but lookup failed —
                        // reject explicitly rather than letting the upstream
                        // validator give a cryptic "invalid Bitcoin address"
                        // for a slug.
                        const err = new StratumErrorMessage(
                            authorizationMessage.id,
                            eStratumErrorCode.OtherUnknown,
                            `Hashden auth failed: ${decision.reason}`,
                            []).response();
                        await this.write(err);
                        return;
                    }
                    // INVALID_NAME → not a hashden-format name; fall through
                    // to upstream path which expects raw `<address>.<worker>`.
                }

                const validatorOptions: ValidatorOptions = {
                    whitelist: true,
                    //forbidNonWhitelisted: true,
                };

                const errors = await validate(authorizationMessage, validatorOptions);

                if (errors.length === 0) {
                    this.clientAuthorization = authorizationMessage;
                    const success = await this.write(JSON.stringify(this.clientAuthorization.response()) + '\n');
                    if (!success) {
                        return;
                    }
                } else {
                    console.error('Authorization validation error');
                    const err = new StratumErrorMessage(
                        authorizationMessage.id,
                        eStratumErrorCode.OtherUnknown,
                        'Authorization validation error',
                        errors).response();
                    console.error(err);
                    const success = await this.write(err);
                    if (!success) {
                        return;
                    }
                }

                break;
            }
            case eRequestMethod.SUGGEST_DIFFICULTY: {
                if (this.usedSuggestedDifficulty == true) {
                    return;
                }

                const suggestDifficultyMessage = plainToInstance(
                    SuggestDifficulty,
                    parsedMessage
                );

                const validatorOptions: ValidatorOptions = {
                    whitelist: true,
                    //forbidNonWhitelisted: true,
                };

                const errors = await validate(suggestDifficultyMessage, validatorOptions);

                if (errors.length === 0) {

                    this.clientSuggestedDifficulty = suggestDifficultyMessage;
                    this.sessionDifficulty = suggestDifficultyMessage.suggestedDifficulty;
                    const success = await this.write(JSON.stringify(this.clientSuggestedDifficulty.response(this.sessionDifficulty)) + '\n');
                    if (!success) {
                        return;
                    }
                    this.usedSuggestedDifficulty = true;
                } else {
                    console.error('Suggest difficulty validation error');
                    const err = new StratumErrorMessage(
                        suggestDifficultyMessage.id,
                        eStratumErrorCode.OtherUnknown,
                        'Suggest difficulty validation error',
                        errors).response();
                    console.error(err);
                    const success = await this.write(err);
                    if (!success) {
                        return;
                    }
                }
                break;
            }
            case eRequestMethod.SUBMIT: {

                if (this.stratumInitialized == false) {
                    console.log('Submit before initalized');
                    await this.socket.end();
                    return;
                }


                const miningSubmitMessage = plainToInstance(
                    MiningSubmitMessage,
                    parsedMessage,
                );

                const validatorOptions: ValidatorOptions = {
                    whitelist: true,
                    //forbidNonWhitelisted: true,
                };

                const errors = await validate(miningSubmitMessage, validatorOptions);

                if (errors.length === 0 && this.stratumInitialized == true) {
                    const result = await this.handleMiningSubmission(miningSubmitMessage);
                    if (result == true) {
                        const success = await this.write(JSON.stringify(miningSubmitMessage.response()) + '\n');
                        if (!success) {
                            return;
                        }
                    }


                } else {
                    console.log('Mining Submit validation error');
                    const err = new StratumErrorMessage(
                        miningSubmitMessage.id,
                        eStratumErrorCode.OtherUnknown,
                        'Mining Submit validation error',
                        errors).response();
                    console.error(err);
                    const success = await this.write(err);
                    if (!success) {
                        return;
                    }
                }
                break;
            }
            // default: {
            //     console.log("Invalid message");
            //     console.log(parsedMessage);
            //     await this.socket.end();
            //     return;
            // }
        }


        if (this.clientSubscription != null
            && this.clientAuthorization != null
            && this.stratumInitialized == false) {

            await this.initStratum();

        }
    }

    private async initStratum() {
        this.stratumInitialized = true;

        switch (this.clientSubscription.userAgent) {
            case 'cpuminer': {
                this.sessionDifficulty = 0.1;
            }
        }

        if (this.clientSuggestedDifficulty == null) {
            //console.log(`Setting difficulty to ${this.sessionDifficulty}`)
            const setDifficulty = JSON.stringify(new SuggestDifficulty().response(this.sessionDifficulty));
            const success = await this.write(setDifficulty + '\n');
            if (!success) {
                return;
            }
        }

        this.stratumSubscription = this.stratumV1JobsService.newMiningJob$.subscribe(async (jobTemplate) => {
            try {
                if(jobTemplate.blockData.clearJobs){
                    this.miningSubmissionHashes.clear();
                }
                await this.sendNewMiningJob(jobTemplate);
            } catch (e) {
                await this.socket.end();
                console.error(e);
            }
        });

        this.backgroundWork.push(
            setInterval(async () => {
                await this.checkDifficulty();
            }, 60 * 1000)
        );

    }

    private async sendNewMiningJob(jobTemplate: IJobTemplate) {

        // Hashden: when this client authorized via Hashden routing, ask
        // the bridge for the effective template for the group. Returns
        // the platform default for PLATFORM_DEFAULT groups; for
        // OPERATOR_RPC groups, fetches the operator's getblocktemplate
        // and builds an IJobTemplate (cached per-group with short TTL).
        if (this.hashdenContext != null) {
            try {
                jobTemplate = await this.hashdenService.getEffectiveJobTemplate(
                    this.hashdenContext.groupId,
                    jobTemplate,
                );
            } catch (e) {
                console.error('Hashden getEffectiveJobTemplate failed', e);
                // Continue with the platform default — better to ship a
                // valid template from platform than drop the connection.
            }
        }

        let payoutInformation;
        const devFeeAddress = this.configService.get('DEV_FEE_ADDRESS');
        //50Th/s
        this.noFee = false;
        if (this.entity) {
            this.hashRate = this.statistics.hashRate;
            this.noFee = this.hashRate != 0 && this.hashRate < 50000000000000;
        }

        // Hashden: when this client authorized via Hashden routing, the
        // marketplace's coinbase rules (SOLO_SHOWCASE / PPLNS + operator
        // and platform fees + dust bucket) replace upstream's hardcoded
        // single-address-plus-dev-fee split. hashdenContext was captured
        // in the AUTHORIZE handler.
        if (this.hashdenContext != null) {
            try {
                payoutInformation = await this.hashdenService.getUpstreamPayoutInformation(
                    this.hashdenContext.groupId,
                    BigInt(jobTemplate.blockData.coinbasevalue),
                    this.hashdenContext.memberPubkey,
                );
            } catch (e) {
                console.error('Hashden payout build failed', e);
                await this.socket.end();
                return;
            }
        } else if (this.noFee || devFeeAddress == null || devFeeAddress.length < 1) {
            payoutInformation = [
                { address: this.clientAuthorization.address, percent: 100 }
            ];

        } else {
            payoutInformation = [
                { address: devFeeAddress, percent: 1.5 },
                { address: this.clientAuthorization.address, percent: 98.5 }
            ];
        }

        const networkConfig = this.configService.get('NETWORK');
        let network;

        if (networkConfig === 'mainnet') {
            network = bitcoinjs.networks.bitcoin;
        } else if (networkConfig === 'testnet') {
            network = bitcoinjs.networks.testnet;
        } else if (networkConfig === 'regtest') {
            network = bitcoinjs.networks.regtest;
        } else {
            throw new Error('Invalid network configuration');
        }

        const job = new MiningJob(
            this.configService,
            network,
            this.stratumV1JobsService.getNextId(),
            payoutInformation,
            jobTemplate
        );

        this.stratumV1JobsService.addJob(job);


        const success = await this.write(job.response(jobTemplate));
        if (!success) {
            return;
        }


        //console.log(`Sent new job to ${this.clientAuthorization.worker}.${this.extraNonceAndSessionId}. (clearJobs: ${jobTemplate.blockData.clearJobs}, fee?: ${!this.noFee})`)

    }


    private async handleMiningSubmission(submission: MiningSubmitMessage) {

        if (this.entity == null) {
            if (this.creatingEntity == null) {
                this.creatingEntity = new Promise(async (resolve, reject) => {
                    try {
                        this.entity = await this.clientService.insert({
                            sessionId: this.extraNonceAndSessionId,
                            address: this.clientAuthorization.address,
                            clientName: this.clientAuthorization.worker,
                            // Hashden: don't store userAgent — it's a fingerprint
                            // that could be tied back to an address via direct DB
                            // access. Aggregate UA stats on /info will collapse
                            // into a single "unknown" bucket; acceptable trade.
                            userAgent: null,
                            startTime: new Date(),
                            bestDifficulty: 0
                        });
                    } catch (e) {
                        reject(e);
                    }
                    resolve();
                });
                await this.creatingEntity;

            } else {
                await this.creatingEntity;
            }
        }

        const submissionHash = submission.hash();
        if(this.miningSubmissionHashes.has(submissionHash)){
            const err = new StratumErrorMessage(
                submission.id,
                eStratumErrorCode.DuplicateShare,
                'Duplicate share').response();
            const success = await this.write(err);
            if (!success) {
                return false;
            }
            return false;
        }else{
            this.miningSubmissionHashes.add(submissionHash);
        }

        const job = this.stratumV1JobsService.getJobById(submission.jobId);

        // a miner may submit a job that doesn't exist anymore if it was removed by a new block notification (or expired, 5 min)
        if (job == null) {
            const err = new StratumErrorMessage(
                submission.id,
                eStratumErrorCode.JobNotFound,
                'Job not found').response();
            //console.log(err);
            const success = await this.write(err);
            if (!success) {
                return false;
            }
            return false;
        }
        const jobTemplate = this.stratumV1JobsService.getJobTemplateById(job.jobTemplateId);

        const updatedJobBlock = job.copyAndUpdateBlock(
            jobTemplate,
            parseInt(submission.versionMask, 16),
            parseInt(submission.nonce, 16),
            this.extraNonceAndSessionId,
            submission.extraNonce2,
            parseInt(submission.ntime, 16)
        );
        const header = updatedJobBlock.toBuffer(true);
        const { submissionDifficulty } = DifficultyUtils.calculateDifficulty(header);

        //console.log(`DIFF: ${submissionDifficulty} of ${this.sessionDifficulty} from ${this.clientAuthorization.worker + '.' + this.extraNonceAndSessionId}`);


        if (submissionDifficulty >= this.sessionDifficulty) {

            if (submissionDifficulty >= jobTemplate.blockData.networkDifficulty) {
                console.log('!!! BLOCK FOUND !!!');
                const blockHex = updatedJobBlock.toHex(false);
                const result = await this.bitcoinRpcService.SUBMIT_BLOCK(blockHex);
                await this.blocksService.save({
                    height: jobTemplate.blockData.height,
                    minerAddress: this.clientAuthorization.address,
                    worker: this.clientAuthorization.worker,
                    sessionId: this.extraNonceAndSessionId,
                    blockData: blockHex
                });

                await this.notificationService.notifySubscribersBlockFound(this.clientAuthorization.address, jobTemplate.blockData.height, updatedJobBlock, result);
                //success
                if (result == null) {
                    await this.addressSettingsService.resetBestDifficultyAndShares();
                }
            }
            try {
                await this.statistics.addShares(this.entity, this.sessionDifficulty);
                const now = new Date();
                // only update every minute
                if (this.entity.updatedAt == null || now.getTime() - this.entity.updatedAt.getTime() > 1000 * 60) {
                    await this.clientService.heartbeat(this.entity.address, this.entity.clientName, this.entity.sessionId, this.hashRate, now);
                    this.entity.updatedAt = now;
                }

            } catch (e) {
                console.log(e);
            }

            // Hashden: append the share to the marketplace shares table.
            // Runs alongside upstream's TypeORM share record — we don't
            // disable upstream's data path, just record our own.
            if (this.hashdenContext != null) {
                try {
                    await this.hashdenService.recordShare(
                        this.hashdenContext.groupId,
                        this.hashdenContext.memberPubkey,
                        this.sessionDifficulty,
                        this.hashdenContext.workerId,
                    );
                } catch (e) {
                    console.error('Hashden recordShare failed', e);
                    // Non-fatal: the share still counts upstream; we just
                    // missed recording it for marketplace payout math.
                    // Operator's PPLNS window will be slightly skewed but
                    // self-corrects as new shares come in.
                }
            }

            if (submissionDifficulty > this.entity.bestDifficulty) {
                await this.clientService.updateBestDifficulty(this.extraNonceAndSessionId, submissionDifficulty);
                this.entity.bestDifficulty = submissionDifficulty;
                if (submissionDifficulty > (await this.addressSettingsService.getSettings(this.clientAuthorization.address, true)).bestDifficulty) {
                    // Hashden: pass null for the UA so we stop tying user-agent
                    // strings to BTC addresses in address_settings.
                    await this.addressSettingsService.updateBestDifficulty(this.clientAuthorization.address, submissionDifficulty, null);
                }
            }


            const externalShareSubmissionEnabled: boolean = this.configService.get('EXTERNAL_SHARE_SUBMISSION_ENABLED')?.toLowerCase() == 'true';
            const minimumDifficulty: number = parseFloat(this.configService.get('MINIMUM_DIFFICULTY')) || 1000000000000.0; // 1T
            if (externalShareSubmissionEnabled && submissionDifficulty >= minimumDifficulty) {
                // Submit share to API if enabled
                this.externalSharesService.submitShare({
                    worker: this.clientAuthorization.worker,
                    address: this.clientAuthorization.address,
                    userAgent: this.clientSubscription.userAgent,
                    header: header.toString('hex'),
                    externalPoolName: this.configService.get('POOL_IDENTIFIER') || 'Public-Pool'
                });
            }

        } else {
            const err = new StratumErrorMessage(
                submission.id,
                eStratumErrorCode.LowDifficultyShare,
                'Difficulty too low').response();

            const success = await this.write(err);
            if (!success) {
                return false;
            }

            return false;
        }

        //await this.checkDifficulty();
        return true;

    }

    private async checkDifficulty() {
        const targetDiff = this.statistics.getSuggestedDifficulty(this.sessionDifficulty);
        if (targetDiff == null) {
            return;
        }

        if (targetDiff != this.sessionDifficulty) {
            //console.log(`Adjusting ${this.extraNonceAndSessionId} difficulty from ${this.sessionDifficulty} to ${targetDiff}`);
            this.sessionDifficulty = targetDiff;

            const data = JSON.stringify({
                id: null,
                method: eResponseMethod.SET_DIFFICULTY,
                params: [targetDiff]
            }) + '\n';


            await this.socket.write(data);

            const jobTemplate = await firstValueFrom(this.stratumV1JobsService.newMiningJob$);
            // we need to clear the jobs so that the difficulty set takes effect. Otherwise the different miner implementations can cause issues
            jobTemplate.blockData.clearJobs = true;
            await this.sendNewMiningJob(jobTemplate);

        }
    }

    private async write(message: string): Promise<boolean> {
        try {
            if (!this.socket.destroyed && !this.socket.writableEnded) {

                await new Promise((resolve, reject) => {
                    this.socket.write(message, (error) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve(true);
                        }
                    });
                });

                return true;
            } else {
                console.error(`Error: Cannot write to closed or ended socket. ${this.extraNonceAndSessionId} ${message}`);
                this.destroy();
                if (!this.socket.destroyed) {
                    this.socket.destroy();
                }
                return false;
            }
        } catch (error) {
            this.destroy();
            if (!this.socket.writableEnded) {
                await this.socket.end();
            } else if (!this.socket.destroyed) {
                this.socket.destroy();
            }
            console.error(`Error occurred while writing to socket: ${this.extraNonceAndSessionId}`, error);
            return false;
        }
    }

}
