import { Module } from '@nestjs/common';
import { HashdenService } from './hashden.service';
import { OperatorTemplatesController } from './api/operator-templates.controller';
import { HashdenSharesController } from './api/shares.controller';
import { HashdenBlocksController } from './api/blocks.controller';

@Module({
  controllers: [
    OperatorTemplatesController,
    HashdenSharesController,
    HashdenBlocksController,
  ],
  providers: [HashdenService],
  exports: [HashdenService],
})
export class HashdenModule {}
