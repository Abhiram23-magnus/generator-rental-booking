import type { Receipt } from './types'

/** Loads the PDF library only when someone asks for a PDF. */
export async function downloadReceipt(r: Receipt) {
  const { downloadReceiptPdf } = await import('./receipt-pdf')
  downloadReceiptPdf(r)
}
