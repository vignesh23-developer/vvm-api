import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PaymentOrder } from './entities/payment-orders.entity';
import { PaymentTransaction } from './entities/payment-transactions.entity';
import { PaymentReconciliation } from './entities/payment-reconciliations.entity';
import { UserWallet } from './entities/user-wallets.entity';
import { WalletTransaction } from './entities/wallet-transactions.entity';

import { PaymentOrdersService } from './payment-orders/services/payment-orders.service';
import { PaymentTransactionsService } from './payment-transactions/services/payment-transactions.service';
import { InvoiceGeneratorService } from './payment-transactions/services/invoice-generator.service';
import { PaymentReconciliationsService } from './payment-reconciliations/services/payment-reconciliations.service';
import { UserWalletsService } from './user-wallets/services/user-wallets.service';
import { WalletTransactionsService } from './wallet-transactions/services/wallet-transactions.service';

import { UserWalletsController } from './user-wallets/user-wallets.controller';
import { WalletTransactionsController } from './wallet-transactions/wallet-transactions.controller';
import { PaymentTransactionsController } from './payment-transactions/controllers/payment-transactions.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentOrder,
      PaymentTransaction,
      PaymentReconciliation,
      UserWallet,
      WalletTransaction,
    ]),
  ],

  controllers: [
    UserWalletsController,
    WalletTransactionsController,
    PaymentTransactionsController,
  ],

  providers: [
    PaymentOrdersService,
    PaymentTransactionsService,
    InvoiceGeneratorService,
    PaymentReconciliationsService,
    UserWalletsService,
    WalletTransactionsService,
  ],

  exports: [
    PaymentOrdersService,
    PaymentTransactionsService,
    PaymentReconciliationsService,
    UserWalletsService,
    WalletTransactionsService,
  ],
})
export class PaymentModule {}

