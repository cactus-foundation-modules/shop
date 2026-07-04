'use client'

import { useEffect, useState } from 'react'

type Customer = { email: string; name: string; memberId: string | null; orderCount: number; totalSpent: string }

export function CustomersScreen() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    fetch(`/api/m/shop/admin/customers?${params}`).then(async (r) => { if (r.ok) setCustomers((await r.json()).customers) })
  }, [search])

  return (
    <div>
      <div className="page-header"><h1 className="page-title">Customers</h1></div>
      <input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)', marginBottom: '1rem', width: 300 }} />
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
            <th style={{ padding: '0.5rem' }}>Name</th><th>Email</th><th>Orders</th><th>Total spent</th><th>Member</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.email} style={{ borderBottom: '1px solid var(--color-border)' }}>
              <td style={{ padding: '0.5rem' }}><a href={`/cactus-admin/m/shop/customers/${encodeURIComponent(c.email)}`}>{c.name}</a></td>
              <td>{c.email}</td>
              <td>{c.orderCount}</td>
              <td>{c.totalSpent}</td>
              <td>{c.memberId ? 'Yes' : 'Guest'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
