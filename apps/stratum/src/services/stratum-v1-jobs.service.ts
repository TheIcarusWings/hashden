import { Injectable } from '@nestjs/common';
import * as bitcoinjs from 'bitcoinjs-lib';
import * as merkle from 'merkle-lib';
import * as merkleProof from 'merkle-lib/proof';
import { combineLatest, delay, filter, from, interval, map, Observable, shareReplay, startWith, switchMap, tap } from 'rxjs';

import { IBlockTemplate } from '../models/bitcoin-rpc/IBlockTemplate';
import { MiningJob } from '../models/MiningJob';
import { BitcoinRpcService } from './bitcoin-rpc.service';

export interface IJobTemplate {

    block: bitcoinjs.Block;
    merkle_branch: string[];
    blockData: {
        id: string,
        creation: number,
        coinbasevalue: number;
        networkDifficulty: number;
        height: number;
        clearJobs: boolean;
    };
}

@Injectable()
export class StratumV1JobsService {

    private lastIntervalCount: number;
    private skipNext: boolean = false;
    public newMiningJob$: Observable<IJobTemplate>;

    public latestJobId: number = 1;
    public latestJobTemplateId: number = 1;

    public jobs: { [jobId: string]: MiningJob } = {};

    public blocks: { [id: number]: IJobTemplate } = {};

    // offset the interval so that all the cluster processes don't try and refresh at the same time.
    private delay = process.env.NODE_APP_INSTANCE == null ? 0 : parseInt(process.env.NODE_APP_INSTANCE) * 5000;

    constructor(
        private readonly bitcoinRpcService: BitcoinRpcService
    ) {

        this.newMiningJob$ = combineLatest([this.bitcoinRpcService.newBlock$, interval(60000).pipe(delay(this.delay), startWith(-1))]).pipe(
            switchMap(([miningInfo, interval]) => {
                return from(this.bitcoinRpcService.getBlockTemplate(miningInfo.blocks)).pipe(map((blockTemplate) => {
                    return {
                        blockTemplate,
                        interval
                    }
                }))
            }),
            map(({ blockTemplate, interval }) => {

                let clearJobs = false;
                if (this.lastIntervalCount === interval) {
                    clearJobs = true;
                    this.skipNext = true;
                    console.log('new block')
                }

                if (this.skipNext == true && clearJobs == false) {
                    this.skipNext = false;
                    return null;
                }

                this.lastIntervalCount = interval;

                return this.buildJobTemplate(blockTemplate, clearJobs);
            }),
            filter(next => next != null),
            tap((data) => {
                if (data.blockData.clearJobs) {
                    this.blocks = {};
                    this.jobs = {};
                }else{
                    const now = new Date().getTime();
                    // Delete old templates (5 minutes)
                    for(const templateId in this.blocks){
                        if(now - this.blocks[templateId].blockData.creation  > (1000 * 60 * 5)){
                            delete this.blocks[templateId];
                        }
                    }
                    // Delete old jobs (5 minutes)
                    for (const jobId in this.jobs) {
                        if(now - this.jobs[jobId].creation > (1000 * 60 * 5)){
                            delete this.jobs[jobId];
                        }
                    }
                }
                this.blocks[data.blockData.id] = data;
            }),
            shareReplay({ refCount: true, bufferSize: 1 })
        )
    }

    /**
     * Builds an IJobTemplate from a raw `getblocktemplate` RPC response.
     * Hashden additions: this is exposed publicly so HashdenService can
     * substitute operator-RPC templates per-group while reusing the same
     * coinbase + merkle + segwit-witness construction the upstream pipe
     * uses for the platform-default flow.
     *
     * Side effects: assigns a fresh templateId and writes to this.blocks
     * so submit-time `getJobTemplateById` finds it regardless of source.
     */
    public buildJobTemplate(blockTemplate: IBlockTemplate, clearJobs: boolean): IJobTemplate {
        const currentTime = Math.floor(new Date().getTime() / 1000);

        const version = blockTemplate.version;
        const bits = parseInt(blockTemplate.bits, 16);
        const prevHash = this.convertToLittleEndian(blockTemplate.previousblockhash);
        const transactions = blockTemplate.transactions.map(t => bitcoinjs.Transaction.fromHex(t.data));
        const coinbasevalue = blockTemplate.coinbasevalue;
        const timestamp = blockTemplate.mintime > currentTime ? blockTemplate.mintime : currentTime;
        const networkDifficulty = this.calculateNetworkDifficulty(parseInt(blockTemplate.bits, 16));
        const height = blockTemplate.height;

        const block = new bitcoinjs.Block();

        //create an empty coinbase tx
        const tempCoinbaseTx = new bitcoinjs.Transaction();
        tempCoinbaseTx.version = 2;
        tempCoinbaseTx.addInput(Buffer.alloc(32, 0), 0xffffffff, 0xffffffff);
        tempCoinbaseTx.ins[0].witness = [Buffer.alloc(32, 0)];
        transactions.unshift(tempCoinbaseTx);

        const transactionBuffers = transactions.map(tx => tx.getHash(false));

        const merkleTree = merkle(transactionBuffers, bitcoinjs.crypto.hash256);
        const merkleBranches: Buffer[] = merkleProof(merkleTree, transactionBuffers[0]).filter(h => h != null);
        block.merkleRoot = merkleBranches.pop();

        // remove the first (coinbase) and last (root) element from the branch
        const merkle_branch = merkleBranches.slice(1, merkleBranches.length).map(b => b.toString('hex'));

        block.prevHash = prevHash;
        block.version = version;
        block.bits = bits;
        block.timestamp = timestamp;

        block.transactions = transactions;
        block.witnessCommit = bitcoinjs.Block.calculateMerkleRoot(transactions, true);

        const id = this.getNextTemplateId();
        this.latestJobTemplateId++;

        const jobTemplate: IJobTemplate = {
            block,
            merkle_branch,
            blockData: {
                id,
                creation: new Date().getTime(),
                coinbasevalue,
                networkDifficulty,
                height,
                clearJobs
            }
        };

        this.blocks[id] = jobTemplate;
        return jobTemplate;
    }

    private calculateNetworkDifficulty(nBits: number) {
        const mantissa: number = nBits & 0x007fffff;       // Extract the mantissa from nBits
        const exponent: number = (nBits >> 24) & 0xff;       // Extract the exponent from nBits

        const target: number = mantissa * Math.pow(256, (exponent - 3));   // Calculate the target value

        const maxTarget = Math.pow(2, 208) * 65535; // Easiest target (max_target)
        const difficulty: number = maxTarget / target;    // Calculate the difficulty

        return difficulty;
    }

    private convertToLittleEndian(hash: string): Buffer {
        const bytes = Buffer.from(hash, 'hex');
        Array.prototype.reverse.call(bytes);
        return bytes;
    }

    public getJobTemplateById(jobTemplateId: string): IJobTemplate | null {
        return this.blocks[jobTemplateId];
    }

    public addJob(job: MiningJob) {
        this.jobs[job.jobId] = job;
        this.latestJobId++;
    }

    public getJobById(jobId: string) {
        return this.jobs[jobId];
    }

    public getNextTemplateId() {
        return this.latestJobTemplateId.toString(16);
    }
    public getNextId() {
        return this.latestJobId.toString(16);
    }


}
