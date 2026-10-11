import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  controllers: [TransactionsController],
  providers: [TransactionsService],
  // Recurring Rules record their occurrences through it.
  exports: [TransactionsService],
})
export class TransactionsModule {}
