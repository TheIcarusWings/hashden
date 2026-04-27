import { Module } from '@nestjs/common';
import { HashdenService } from './hashden.service';

@Module({
  providers: [HashdenService],
  exports: [HashdenService],
})
export class HashdenModule {}
