import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Receipt } from './types'
import { formatDateTime, formatMobile, formatNumber } from './format'
import { formatDuration } from './pricing'
import { DIESEL_DISCLAIMER } from '../components/PriceBreakdown'

// The PDF uses jsPDF's built-in fonts, which have no ₹ glyph, so amounts read "Rs. 20,000.00".
const rs = (n: number) => `Rs. ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n))}`

const STATUS: Record<Receipt['status'], string> = { confirmed: 'Confirmed', ongoing: 'Ongoing', completed: 'Completed', cancelled: 'Cancelled' }

export function buildReceiptPdf(r: Receipt): jsPDF {
  const tz = r.business.time_zone
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const M = 44

  doc.setFillColor(31, 34, 38)
  doc.rect(0, 0, W, 92, 'F')
  doc.setFillColor(242, 162, 12)
  doc.rect(0, 92, W, 4, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(r.business.business_name, M, 44)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const contact = [r.business.contact_phone, r.business.contact_email].filter(Boolean).join('   ')
  if (contact) doc.text(contact, M, 64)
  if (r.business.contact_address) doc.text(r.business.contact_address.replace(/\n/g, ', '), M, 78, { maxWidth: W - 2 * M - 160 })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('BOOKING RECEIPT', W - M, 44, { align: 'right' })
  doc.setFontSize(14)
  doc.text(r.booking_reference, W - M, 64, { align: 'right' })

  doc.setTextColor(31, 34, 38)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Status: ${STATUS[r.status]}`, M, 122)
  doc.text(`Booked on ${formatDateTime(r.created_at, tz)}`, W - M, 122, { align: 'right' })

  const head = { fillColor: [236, 238, 240] as [number, number, number], textColor: [31, 34, 38] as [number, number, number], fontStyle: 'bold' as const }
  const opts = { theme: 'plain' as const, margin: { left: M, right: M }, styles: { fontSize: 10, cellPadding: 5 }, columnStyles: { 0: { cellWidth: 170, textColor: [107, 113, 122] as [number, number, number] } } }

  autoTable(doc, {
    ...opts,
    startY: 138,
    head: [['Customer and delivery', '']],
    headStyles: head,
    body: [
      ['Name', r.customer.full_name],
      ['Mobile', formatMobile(r.customer.mobile_number)],
      ...(r.customer.email ? [['Email', r.customer.email]] : []),
      ['Delivery location', r.rental_location],
      ...(r.landmark ? [['Landmark / instructions', r.landmark]] : []),
      ...(r.notes ? [['Notes', r.notes]] : []),
    ],
  })

  autoTable(doc, {
    ...opts,
    startY: (doc as any).lastAutoTable.finalY + 14,
    head: [['Rental', '']],
    headStyles: head,
    body: [
      ['Generator', `${formatNumber(r.generator.capacity_kva)} kVA${r.generator.name ? ` (${r.generator.name})` : ''}`],
      ['Rental start', formatDateTime(r.start_at, tz)],
      ['Rental end', formatDateTime(r.end_at, tz)],
      ['Total rental duration', formatDuration(r.duration_seconds)],
    ],
  })

  const charges: [string, string][] = [
    ['Hourly rental rate', `${rs(r.hourly_rate)} per hour`],
    ...(Number(r.billable_hours) !== Number(r.duration_hours) ? [['Billed hours', `${formatNumber(r.billable_hours)} hours`] as [string, string]] : []),
    ['Rental charge', rs(r.rental_charge)],
    ...(r.additional_charges > 0 ? [[r.pricing.delivery_charge_label, rs(r.additional_charges)] as [string, string]] : []),
    ...(r.discount > 0 ? [[`${r.pricing.discount_label} (${formatNumber(r.pricing.discount_percent)}%)`, `- ${rs(r.discount)}`] as [string, string]] : []),
    ...(r.tax > 0 ? [[`${r.pricing.tax_label} (${formatNumber(r.pricing.tax_percent)}%)`, rs(r.tax)] as [string, string]] : []),
  ]
  autoTable(doc, {
    ...opts,
    startY: (doc as any).lastAutoTable.finalY + 14,
    head: [['Charges', '']],
    headStyles: head,
    body: charges,
    foot: [['Final amount payable', rs(r.total_amount)]],
    footStyles: { fontStyle: 'bold', fontSize: 12, fillColor: [253, 231, 184], textColor: [31, 34, 38] },
    columnStyles: { ...opts.columnStyles, 1: { halign: 'right' } },
  })

  autoTable(doc, {
    ...opts,
    startY: (doc as any).lastAutoTable.finalY + 14,
    head: [['Diesel estimate', '']],
    headStyles: head,
    body: [
      ['Consumption per hour', `${formatNumber(r.diesel_consumption_lph)} litres`],
      ['Estimated total diesel', `${formatNumber(r.estimated_diesel_litres)} litres`],
    ],
    columnStyles: { ...opts.columnStyles, 1: { halign: 'right' } },
  })

  doc.setFontSize(8.5)
  doc.setTextColor(107, 113, 122)
  const y = (doc as any).lastAutoTable.finalY + 18
  doc.text(`Assumes continuous operation for the complete scheduled period. ${DIESEL_DISCLAIMER}`, M, y, { maxWidth: W - 2 * M })
  doc.text('Times are shown in ' + (tz === 'Asia/Kolkata' ? 'Indian Standard Time (IST).' : `${tz}.`), M, y + 34)
  return doc
}

export function downloadReceiptPdf(r: Receipt) {
  buildReceiptPdf(r).save(`booking-${r.booking_reference}.pdf`)
}
