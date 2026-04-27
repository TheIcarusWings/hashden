// Operator-facing REST endpoint for testing their RPC config before save.
// Used by the web app's group settings "Test connection" button.

import { Body, Controller, HttpException, HttpStatus, Post } from '@nestjs/common';
import { HashdenService } from '../hashden.service';

interface TestRpcBody {
  url: string;
  auth: string;
}

@Controller('hashden/operator-templates')
export class OperatorTemplatesController {
  constructor(private readonly hashden: HashdenService) {}

  @Post('test')
  async testConnection(@Body() body: TestRpcBody) {
    if (!body || typeof body.url !== 'string' || typeof body.auth !== 'string') {
      throw new HttpException(
        'body must include { url, auth }',
        HttpStatus.BAD_REQUEST,
      );
    }
    const result = await this.hashden.testOperatorRpc(body.url, body.auth);
    return result;
  }
}
