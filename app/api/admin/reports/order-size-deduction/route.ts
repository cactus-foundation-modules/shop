import { NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { listOrderSizeDeductionChecks } from '@/modules/shop/lib/db/suppliers'
import { isPriceTypeEnabled } from '@/modules/shop/lib/pricing'

// Two catalogue checks on the order-size deduction, for Shop > Reports.
//
// Neither is an error the build could have caught: both are about what the
// catalogue SAYS, and a catalogue is filled by imports and scripts rather than
// by anything a typecheck can see. See listOrderSizeDeductionChecks for what
// each list means.
export async function GET() {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error

  const config = await getShopConfigCached()
  // Switched off, or the shop does not run sale prices at all: there is nothing
  // for either check to be about, and an empty report is the honest answer.
  if (!config.orderSizeDeductionEnabled || !isPriceTypeEnabled(config.enabledPriceTypes, 'sale')) {
    return NextResponse.json({ enabled: false, impossible: [], missing: [] })
  }

  const checks = await listOrderSizeDeductionChecks()
  return NextResponse.json({ enabled: true, ...checks })
}
