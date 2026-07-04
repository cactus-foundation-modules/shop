import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveCartLines } from '@/modules/shop/lib/checkout'
import { getProductMedia } from '@/modules/shop/lib/db'

const Body = z.object({
  lines: z.array(z.object({ productId: z.string(), quantity: z.number().int().min(1) })),
})

// Revalidates client localStorage cart lines against live stock/price/status
// (spec 8.1 POST /cart/validate, Q9).
export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid cart' }, { status: 400 })

  const resolved = await resolveCartLines(parsed.data.lines)
  const lines = await Promise.all(resolved.map(async (line) => {
    const media = await getProductMedia(line.product.id)
    const primary = media.find((m) => m.isPrimary) ?? media[0]
    return {
      productId: line.product.id,
      name: line.product.name,
      slug: line.product.slug,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineSubtotal: line.lineSubtotal,
      available: line.available,
      availabilityReason: line.availabilityReason ?? null,
      isPreOrder: line.isPreOrder,
      preOrderDispatchDate: line.product.preOrderDispatchDate,
      imageUrl: primary?.url ?? null,
    }
  }))

  return NextResponse.json({ lines })
}
