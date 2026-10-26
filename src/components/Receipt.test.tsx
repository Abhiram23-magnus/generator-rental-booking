import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ReceiptView } from './ReceiptView'
import { buildReceiptPdf } from '../lib/receipt-pdf'
import type { Receipt } from '../lib/types'

// A receipt exactly as the database returns it. Its prices differ from the
// current catalogue (25 kVA is ₹2,500 there) to prove the receipt uses the snapshot.
const receipt: Receipt = {
  booking_reference: 'GR261101-AB2CD',
  receipt_token: 'a'.repeat(36),
  status: 'confirmed',
  created_at: '2026-10-26T09:00:00Z',
  start_at: '2026-11-01T04:30:00Z',
  end_at: '2026-11-01T13:00:00Z',
  customer: { full_name: 'Ravi Kumar', mobile_number: '9876543210', email: 'ravi@example.com' },
  generator: { name: '25 kVA silent genset', capacity_kva: 25 },
  rental_location: '12 MG Road, Bengaluru',
  landmark: 'Opposite metro',
  notes: null,
  duration_seconds: 30600,
  duration_hours: 8.5,
  billable_hours: 9,
  hourly_rate: 2200,
  rental_charge: 19800,
  additional_charges: 500,
  discount: 0,
  tax: 3654,
  total_amount: 23954,
  diesel_consumption_lph: 2.4,
  estimated_diesel_litres: 20.4,
  pricing: { billing_mode: 'round_up_hour', minimum_billable_hours: 0, delivery_charge: 500, delivery_charge_label: 'Delivery and pickup', discount_percent: 0, discount_label: 'Discount', tax_percent: 18, tax_label: 'GST', time_zone: 'Asia/Kolkata' },
  business: { business_name: 'Sri Power Rentals', contact_phone: '+91 90000 11111', contact_email: null, contact_address: null, time_zone: 'Asia/Kolkata' },
}

describe('receipt', () => {
  it('shows the saved booking figures', () => {
    render(<ReceiptView r={receipt} />)
    const r = screen.getByRole('article')
    expect(within(r).getByText('GR261101-AB2CD')).toBeInTheDocument()
    expect(within(r).getByText('Ravi Kumar')).toBeInTheDocument()
    expect(within(r).getByText('+91 98765 43210')).toBeInTheDocument()
    expect(within(r).getByText('25 kVA')).toBeInTheDocument()
    expect(within(r).getByText('8 hours 30 minutes')).toBeInTheDocument()
    expect(within(r).getByText('₹2,200/hour')).toBeInTheDocument()
    expect(within(r).getByText('9 hours')).toBeInTheDocument()
    expect(within(r).getByText('₹19,800')).toBeInTheDocument()
    expect(within(r).getByText('Delivery and pickup')).toBeInTheDocument()
    expect(within(r).getByText('GST (18%)')).toBeInTheDocument()
    expect(within(r).getByText('₹23,954')).toBeInTheDocument()
    expect(within(r).getByText('2.4 litres')).toBeInTheDocument()
    expect(within(r).getByText('20.4 litres')).toBeInTheDocument()
    expect(within(r).getByText('Confirmed')).toBeInTheDocument()
    expect(within(r).getByText(/1 Nov 2026, 10:00 am/i)).toBeInTheDocument()
    expect(within(r).queryByText(/Discount/)).not.toBeInTheDocument()
  })

  it('builds a PDF containing the saved figures', () => {
    const doc = buildReceiptPdf(receipt)
    const raw = doc.output()
    expect(raw.startsWith('%PDF-')).toBe(true)
    for (const text of ['GR261101-AB2CD', 'Ravi Kumar', 'Rs. 23,954.00', 'Rs. 2,200.00 per hour', '20.4 litres', '8 hours 30 minutes', 'GST \\(18%\\)']) {
      expect(raw).toContain(text)
    }
  })
})
