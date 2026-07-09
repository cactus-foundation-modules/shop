'use client'

import { useEffect, useState } from 'react'
import { useAdminPath } from '@/components/admin/AdminPathContext'

type CustomerDetail = {
  email: string; name: string; memberId: string | null
  orders: Array<{ id: string; orderNumber: string; status: string; total: string }>
  addresses: Array<{ id: string; label: string | null; address: { line1: string; city: string; postcode: string } }>
}

export function CustomerDetailScreen({ email }: { email: string }) {
  const adminPath = useAdminPath()
  const [data, setData] = useState<CustomerDetail | null>(null)

  useEffect(() => {
    fetch(`/api/m/shop/admin/customers/${encodeURIComponent(email)}`).then(async (r) => { if (r.ok) setData(await r.json()) })
  }, [email])

  if (!data) return null

  return (
    <div>
      <div className="page-header"><h1 className="page-title">{data.name}</h1></div>
      <p>{data.email} {data.memberId && '(member)'}</p>
      <h3 style={{ fontSize: '0.9375rem' }}>Orders</h3>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {data.orders.map((o) => <li key={o.id}><a href={`/${adminPath}/m/shop/orders/${o.id}`}>{o.orderNumber}</a> - {o.status} - {o.total}</li>)}
      </ul>
      {data.addresses.length > 0 && (
        <>
          <h3 style={{ fontSize: '0.9375rem' }}>Addresses</h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {data.addresses.map((a) => <li key={a.id}>{a.label || 'Address'}: {a.address.line1}, {a.address.city}, {a.address.postcode}</li>)}
          </ul>
        </>
      )}
    </div>
  )
}
