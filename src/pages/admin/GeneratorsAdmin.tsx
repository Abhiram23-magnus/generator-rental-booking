import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CalendarDays, ImageUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { adminApi } from '../../lib/api'
import { useAdmin, useAdminQuery } from '../../admin/AdminAuth'
import { ConfirmDialog, Drawer, PageHeader, Toast } from '../../admin/ui'
import { GeneratorPhoto } from '../../components/GeneratorCard'
import { ErrorNote, LoadingBlock, Spinner } from '../../components/Spinner'
import { formatINR, formatNumber } from '../../lib/format'
import type { AdminGenerator } from '../../lib/types'

const num = (label: string, min: number, max: number) =>
  z.coerce.number({ message: `Enter the ${label} as a number.` }).min(min, `${label[0].toUpperCase()}${label.slice(1)} must be at least ${min}.`).max(max, `That ${label} is too large.`)

const schema = z.object({
  name: z.string().trim().max(80).optional(),
  capacity_kva: num('capacity', 1, 5000),
  hourly_rental_rate: num('hourly rate', 0, 10_000_000),
  diesel_consumption_lph: num('diesel consumption', 0, 1000),
  description: z.string().trim().max(1000).optional(),
  image_url: z.union([z.literal(''), z.string().trim().url('Enter a full web address starting with https://')]).optional(),
  is_active: z.boolean(),
  under_maintenance: z.boolean(),
  sort_order: z.coerce.number().int().min(0).max(100000),
})
type FormIn = z.input<typeof schema>
type FormOut = z.output<typeof schema>

function GeneratorForm({ initial, onSaved, onCancel }: { initial: AdminGenerator | null; onSaved: (msg: string) => void; onCancel: () => void }) {
  const { token } = useAdmin()
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial?.name ?? '',
      capacity_kva: initial?.capacity_kva ?? '',
      hourly_rental_rate: initial?.hourly_rental_rate ?? '',
      diesel_consumption_lph: initial?.diesel_consumption_lph ?? '',
      description: initial?.description ?? '',
      image_url: initial?.image_url ?? '',
      is_active: initial?.is_active ?? true,
      under_maintenance: initial?.under_maintenance ?? false,
      sort_order: initial?.sort_order ?? 0,
    },
  })
  const imageUrl = watch('image_url') as string
  const capacity = Number(watch('capacity_kva')) || 25

  const upload = async (file: File | undefined) => {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setError('Upload a JPG, PNG or WebP image.')
    if (file.size > 5 * 1024 * 1024) return setError('Images must be 5 MB or smaller.')
    setUploading(true); setError(null)
    try {
      setValue('image_url', await adminApi.uploadImage(token, file), { shouldDirty: true })
    } catch (e) { setError((e as Error).message) } finally { setUploading(false) }
  }

  const save = handleSubmit(async (v) => {
    setError(null)
    try {
      await adminApi.saveGenerator(token, { ...v, id: initial?.id, name: v.name || null, description: v.description || null, image_url: v.image_url || null })
      onSaved(initial ? 'Generator saved. New bookings use the new details.' : 'Generator added.')
    } catch (e) { setError((e as Error).message) }
  })

  const f = (name: keyof FormIn, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => (
    <div>
      <label htmlFor={`g-${name}`} className="field-label">{label}</label>
      <input id={`g-${name}`} className="input" aria-invalid={!!errors[name]} {...props} {...register(name)} />
      {errors[name] ? <p className="field-error">{String(errors[name]?.message)}</p> : hint && <p className="field-hint">{hint}</p>}
    </div>
  )

  return (
    <form onSubmit={save} className="space-y-5" noValidate>
      <div className="overflow-hidden rounded-[4px] border border-line bg-gradient-to-b from-[#f7f8f9] to-[#e3e6e9]">
        <div className="aspect-[5/3]"><GeneratorPhoto g={{ capacity_kva: capacity, image_url: imageUrl || null }} /></div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="btn-ghost btn-sm cursor-pointer">
          {uploading ? <Spinner label="Uploading" /> : <ImageUp size={16} aria-hidden />} {imageUrl ? 'Replace photo' : 'Upload photo'}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
        </label>
        {imageUrl && <button type="button" className="text-sm font-semibold text-busy" onClick={() => setValue('image_url', '')}>Remove photo</button>}
      </div>
      {f('image_url', 'Photo address', { placeholder: 'https://…' }, 'Filled in automatically when you upload. You can also paste an image link.')}
      <div className="grid gap-4 sm:grid-cols-3">
        {f('capacity_kva', 'Capacity (kVA)', { inputMode: 'decimal' })}
        {f('hourly_rental_rate', 'Rate per hour (₹)', { inputMode: 'decimal' })}
        {f('diesel_consumption_lph', 'Diesel (litres/hour)', { inputMode: 'decimal' })}
      </div>
      {f('name', 'Display name (optional)', { placeholder: 'For example: 25 kVA silent genset' })}
      <div>
        <label htmlFor="g-description" className="field-label">Short description (optional)</label>
        <textarea id="g-description" rows={3} className="input" {...register('description')} />
      </div>
      {f('sort_order', 'Position in list', { inputMode: 'numeric' }, 'Lower numbers appear first.')}
      <div className="space-y-3 rounded-[4px] border border-line p-4">
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-amber" {...register('is_active')} />
          <span><span className="font-semibold">Active</span><span className="block text-sm text-steel">Inactive generators are shown as Inactive and cannot be booked.</span></span>
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-amber" {...register('under_maintenance')} />
          <span><span className="font-semibold">Under maintenance</span><span className="block text-sm text-steel">Shown as Unavailable and cannot be booked until you clear this.</span></span>
        </label>
      </div>
      {initial && initial.total_bookings > 0 && (
        <p className="rounded-[4px] bg-amber-soft/60 px-3 py-2 text-sm text-ink">Existing bookings keep the price and diesel rate they were booked at. Changes apply to new bookings only.</p>
      )}
      {error && <ErrorNote message={error} />}
      <div className="flex gap-3">
        <button type="submit" className="btn-amber" disabled={isSubmitting || uploading}>{isSubmitting ? 'Saving…' : initial ? 'Save generator' : 'Add generator'}</button>
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

export default function GeneratorsAdmin() {
  const { token } = useAdmin()
  const { data, error, loading, reload } = useAdminQuery((t) => adminApi.generators(t), [])
  const [editing, setEditing] = useState<AdminGenerator | 'new' | null>(null)
  const [removing, setRemoving] = useState<AdminGenerator | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const toggle = async (g: AdminGenerator) => {
    setBusy(g.id); setActionError(null)
    try {
      await adminApi.setGeneratorActive(token, g.id, !g.is_active)
      setToast(g.is_active ? `${formatNumber(g.capacity_kva)} kVA deactivated. It can no longer be booked.` : `${formatNumber(g.capacity_kva)} kVA activated.`)
      reload()
    } catch (e) { setActionError((e as Error).message) } finally { setBusy(null) }
  }

  const remove = async () => {
    if (!removing) return
    setBusy(removing.id); setActionError(null)
    try {
      const r = await adminApi.removeGenerator(token, removing.id)
      setToast(r.action === 'archived' ? 'Generator archived. Its past bookings and receipts are kept.' : 'Generator deleted.')
      reload()
    } catch (e) { setActionError((e as Error).message) } finally { setBusy(null); setRemoving(null) }
  }

  const list = (data ?? []).filter((g) => showArchived || !g.is_archived)

  return (
    <div>
      <PageHeader title="Generators" description="Prices, diesel rates, photos and availability for each generator.">
        <button type="button" className="btn-amber" onClick={() => setEditing('new')}><Plus size={18} aria-hidden /> Add generator</button>
      </PageHeader>

      {error && <ErrorNote message={error} onRetry={reload} />}
      {actionError && <div className="mb-4"><ErrorNote message={actionError} /></div>}
      {!data && loading && <LoadingBlock label="Loading generators" />}

      {data && (
        <>
          <label className="mb-3 flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-amber" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived generators
          </label>
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {list.map((g) => (
              <li key={g.id} className={`panel overflow-hidden ${g.is_archived ? 'opacity-60' : ''}`}>
                <div className="flex gap-4 p-4">
                  <div className="h-20 w-28 shrink-0 overflow-hidden rounded-[4px] bg-gradient-to-b from-[#f7f8f9] to-[#e3e6e9]"><GeneratorPhoto g={g} /></div>
                  <div className="min-w-0">
                    <h2 className="font-wide text-2xl font-black">{formatNumber(g.capacity_kva)} kVA</h2>
                    <p className="tabular text-[15px]">{formatINR(g.hourly_rental_rate)}/hour</p>
                    <p className="tabular text-sm text-steel">{formatNumber(g.diesel_consumption_lph)} litres/hour diesel</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 text-sm">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${g.is_archived ? 'bg-concrete text-steel' : g.is_active ? (g.under_maintenance ? 'bg-hold-soft text-hold' : 'bg-ok-soft text-ok') : 'bg-concrete text-steel'}`}>
                    {g.is_archived ? 'Archived' : !g.is_active ? 'Inactive' : g.under_maintenance ? 'Under maintenance' : 'Active'}
                  </span>
                  <span className="text-steel">{g.upcoming_bookings} upcoming, {g.total_bookings} total bookings</span>
                </div>
                {!g.is_archived && (
                  <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
                    <button type="button" className="btn-ink btn-sm" onClick={() => setEditing(g)}><Pencil size={15} aria-hidden /> Edit</button>
                    <button type="button" className="btn-ghost btn-sm" disabled={busy === g.id} onClick={() => toggle(g)}>{g.is_active ? 'Deactivate' : 'Activate'}</button>
                    <Link to={`/admin/calendar?generator=${g.id}`} className="btn-ghost btn-sm"><CalendarDays size={15} aria-hidden /> Schedule</Link>
                    <button type="button" className="btn-ghost btn-sm text-busy" onClick={() => setRemoving(g)} aria-label={`Remove ${formatNumber(g.capacity_kva)} kVA`}><Trash2 size={15} aria-hidden /></button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <Drawer open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add generator' : editing ? `Edit ${formatNumber(editing.capacity_kva)} kVA` : ''}>
        {editing !== null && (
          <GeneratorForm
            key={editing === 'new' ? 'new' : editing.id}
            initial={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={(m) => { setEditing(null); setToast(m); reload() }}
          />
        )}
      </Drawer>

      <ConfirmDialog
        open={!!removing}
        title={`Remove the ${removing ? formatNumber(removing.capacity_kva) : ''} kVA generator?`}
        body={removing && removing.total_bookings > 0
          ? 'It has booking history, so it will be archived instead of deleted. Past bookings and receipts stay intact, and it disappears from the website.'
          : 'It has never been booked, so it will be deleted permanently.'}
        confirmLabel={removing && removing.total_bookings > 0 ? 'Archive generator' : 'Delete generator'}
        danger
        busy={!!busy}
        onCancel={() => setRemoving(null)}
        onConfirm={remove}
      />
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}
