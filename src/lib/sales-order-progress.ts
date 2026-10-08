import type {DocumentEventRecord,LourexDocument,PaymentRecord} from '../types.js';
import type {AcceptedSalesOrder} from './sales-order-flow.js';
import {confirmedSalesDeliveries,isConfirmedSalesDeliveryEvent,salesDeliveryBalances} from './sales-delivery-flow.js';
import {invoiceSourceDelivery,isDeliveryLinkedInvoice} from './sales-delivery-invoice.js';
import {decimalToScaled} from './money.js';
import {invoicePaymentSummary} from './payments.js';

export interface SalesOrderInvoiceProgress {
  lines:ReturnType<typeof salesDeliveryBalances>;
  confirmedDeliveries:number;
  unbilledDeliveries:number;
  invoiceDrafts:number;
  invoicesIssued:number;
  netIssued:string;
  collected:string;
  outstanding:string;
  credits:string;
  currency:string;
}

function moneySum(amounts:string[]):string{
  const cents=amounts.reduce((sum,amount)=>sum+decimalToScaled(amount,2),0n);
  const positive=cents>=0n?cents:-cents;
  return `${cents<0n?'-':''}${positive/100n}.${(positive%100n).toString().padStart(2,'0')}`;
}

/**
 * Read-only operational view of an accepted Sales Order. A draft is never AR.
 * Values are from actual issued invoices and canonical customer payments;
 * never sum unlike currencies or silently equate quoted and invoiced totals.
 */
export function salesOrderInvoiceProgress(order:AcceptedSalesOrder,documents:LourexDocument[],
  events:DocumentEventRecord[],payments:PaymentRecord[]):SalesOrderInvoiceProgress{
  const proofs=events.filter(isConfirmedSalesDeliveryEvent)
    .flatMap(event=>confirmedSalesDeliveries(event.documentId,[event]))
    .filter(proof=>proof.quotationId===order.quotationId
      &&proof.salesOrderNumber===order.salesOrderNumber
      &&proof.currency===order.currency);
  const proofIds=new Set(proofs.map(proof=>proof.deliveryNoteId));
  const linked=documents.filter(doc=>doc.kind==='invoice'&&doc.role==='standard'
    &&doc.convertedFromId===order.quotationId&&doc.currency===order.currency
    &&doc.lifecycleStatus!=='voided'&&isDeliveryLinkedInvoice(doc.id,events)
    &&proofIds.has(invoiceSourceDelivery(doc.id,documents,events)?.id||''));
  const linkedDeliveryIds=new Set(linked.map(doc=>invoiceSourceDelivery(doc.id,documents,events)?.id).filter(Boolean));
  const final=linked.filter(doc=>doc.status==='final');
  const summaries=final.map(invoice=>invoicePaymentSummary(invoice,payments,undefined,documents));
  return {
    lines:salesDeliveryBalances(order,events),
    confirmedDeliveries:proofIds.size,
    unbilledDeliveries:Math.max(0,proofIds.size-linkedDeliveryIds.size),
    invoiceDrafts:linked.filter(doc=>doc.status==='draft').length,
    invoicesIssued:final.length,
    netIssued:moneySum(summaries.map(s=>s.netTotal)),
    collected:moneySum(summaries.map(s=>s.paid)),
    outstanding:moneySum(summaries.map(s=>s.remaining)),
    credits:moneySum(summaries.map(s=>s.credits)),
    currency:order.currency
  };
}
