import { Injectable } from '@nestjs/common';
import { PaymentTransaction } from '../../entities/payment-transactions.entity';
import { PaymentOrder } from '../../entities/payment-orders.entity';
import { User } from '../../../users/entities/user.entity';
import * as path from 'path';

const PDFDocument = require('pdfkit');

export interface InvoiceData {
  transaction: PaymentTransaction;
  paymentOrder: PaymentOrder;
  user: User;
}

@Injectable()
export class InvoiceGeneratorService {
  async generateInvoice(data: InvoiceData): Promise<Buffer> {
    const { transaction, paymentOrder, user } = data;

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50,
          info: {
            Title: 'Invoice',
            Author: 'Vazhgha Valamudan',
            Subject: 'Payment Transaction Invoice',
          },
        });

        /** -------------------------
         * FONT REGISTRATION (UNICODE)
         * ------------------------- */
        doc.registerFont(
          'NotoSans',
          path.join(process.cwd(), 'assets/fonts/NotoSans-Regular.ttf'),
        );
        doc.registerFont(
          'NotoSans-Bold',
          path.join(process.cwd(), 'assets/fonts/NotoSans-Bold.ttf'),
        );

        doc.font('NotoSans');

        /** -------------------------
         * BUFFER HANDLING
         * ------------------------- */
        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        /** -------------------------
         * HEADER
         * ------------------------- */
        const logoPath = path.join(
          process.cwd(),
          'assets/images/logo_tamil.png',
        );
        const logoWidth = 120;
        const logoY = 50;
        // Use only width to maintain aspect ratio, estimate height for spacing
        doc.image(logoPath, 50, logoY, { width: logoWidth });
        // Estimate logo height (assuming roughly square, add buffer)
        const estimatedLogoHeight = logoWidth + 10;

        /** -------------------------
         * INVOICE META
         * ------------------------- */
        // Start invoice details below the logo with proper spacing
        const invoiceDetailsStartY = logoY + estimatedLogoHeight + 20;
        doc
          .fontSize(10)
          .text(`Invoice Number: ${paymentOrder.order_number}`, 50, invoiceDetailsStartY)
          .text(
            `Transaction ID: ${transaction.id.substring(0, 8).toUpperCase()}...`,
            50,
            invoiceDetailsStartY + 15,
          )
          .text(
            `Date: ${new Date(transaction.created_at).toLocaleDateString(
              'en-IN',
              { year: 'numeric', month: 'long', day: 'numeric' },
            )}`,
            50,
            invoiceDetailsStartY + 30,
          )
          .text(`Payment Method: ${transaction.method || 'N/A'}`, 50, invoiceDetailsStartY + 45)
          .text(`Status: ${transaction.status}`, 50, invoiceDetailsStartY + 60);

        /** -------------------------
         * BILL TO
         * ------------------------- */
        const billToY = invoiceDetailsStartY;
        doc
          .font('NotoSans-Bold')
          .fontSize(12)
          .text('Bill To:', 350, billToY)
          .font('NotoSans')
          .fontSize(10)
          .text(
            user.firstName && user.lastName
              ? `${user.firstName} ${user.lastName}`
              : user.email,
            350,
            billToY + 15,
          )
          .text(user.email || '', 350, billToY + 30);

        if (user.phoneNumber) {
          doc.text(user.phoneNumber, 350, billToY + 45);
        }

        /** -------------------------
         * SEPARATOR
         * ------------------------- */
        const separatorY = invoiceDetailsStartY + 80;
        doc.moveTo(50, separatorY).lineTo(550, separatorY).stroke();

        /** -------------------------
         * TABLE HEADER
         * ------------------------- */
        const tableTop = separatorY + 20;
        doc
          .font('NotoSans-Bold')
          .fontSize(10)
          .text('Description', 50, tableTop)
          .text('Amount', 450, tableTop, { align: 'right' });

        doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

        /** -------------------------
         * AMOUNT CALCULATIONS
         * ------------------------- */
        const txnAmount = Number(transaction.amount) / 100;
        const subtotal = Number(paymentOrder.subtotal) / 100;
        const tax = Number(paymentOrder.tax_amount) / 100;
        const discount = Number(paymentOrder.discount_amount) / 100;
        const walletUsed = Number(paymentOrder.wallet_amount_used) / 100;

        /** -------------------------
         * LINE ITEM
         * ------------------------- */
        let currentY = tableTop + 25;

        doc
          .font('NotoSans')
          .fontSize(10)
          .text(paymentOrder.purpose || 'KYC', 50, currentY)
          .text(
            `${this.formatCurrency(txnAmount)} ${transaction.currency}`,
            450,
            currentY,
            { align: 'right' },
          );

        currentY += 25;

        /** -------------------------
         * BREAKDOWN
         * ------------------------- */
        if (Math.abs(subtotal - txnAmount) > 0.01) {
          this.renderRow(doc, 'Subtotal', subtotal, currentY);
          currentY += 15;
        }

        if (tax > 0) {
          this.renderRow(
            doc,
            `Tax (${paymentOrder.tax_percent}%)`,
            tax,
            currentY,
          );
          currentY += 15;
        }

        if (discount > 0) {
          this.renderRow(doc, 'Discount', -discount, currentY);
          currentY += 15;
        }

        if (walletUsed > 0) {
          this.renderRow(doc, 'Wallet Used', -walletUsed, currentY);
          currentY += 15;
        }

        /** -------------------------
         * TOTAL
         * ------------------------- */
        doc.moveTo(50, currentY).lineTo(550, currentY).stroke();

        currentY += 10;

        doc
          .font('NotoSans-Bold')
          .fontSize(12)
          .text('Total:', 350, currentY)
          .text(
            `${this.formatCurrency(txnAmount)} ${transaction.currency}`,
            450,
            currentY,
            { align: 'right' },
          );

        /** -------------------------
         * PAYMENT INFO
         * ------------------------- */
        currentY += 40;

        doc
          .font('NotoSans-Bold')
          .fontSize(10)
          .text('Payment Information:', 50, currentY)
          .font('NotoSans')
          .text(`Gateway: ${paymentOrder.gateway || 'N/A'}`, 50, currentY + 15)
          .text(
            `Gateway Payment ID: ${transaction.gateway_payment_id || 'N/A'}`,
            50,
            currentY + 30,
          )
          .text(
            `Attempt Number: ${transaction.attempt_number}`,
            50,
            currentY + 45,
          );

        if (transaction.verified_at) {
          doc.text(
            `Verified At: ${new Date(
              transaction.verified_at,
            ).toLocaleString('en-IN')}`,
            50,
            currentY + 60,
          );
        }

        /** -------------------------
         * FOOTER
         * ------------------------- */
        doc
          .fontSize(8)
          .text('Thank you for your payment!', 50, 750, {
            align: 'center',
          })
          .text(
            'This is a computer-generated invoice and does not require a signature.',
            50,
            765,
            { align: 'center' },
          );

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  private renderRow(
    doc: any,
    label: string,
    amount: number,
    y: number,
  ) {
    doc
      .font('NotoSans')
      .fontSize(10)
      .text(`${label}:`, 350, y)
      .text(
        this.formatCurrency(amount),
        450,
        y,
        { align: 'right' },
      );
  }

  private formatCurrency(amount: number): string {
    return `₹${amount.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}
