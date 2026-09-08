// What a return costs the shop to take back, and how that comes off the refund.
//
// Some goods are only worth having back if somebody else pays for the van. A
// desk is two people and a tail lift; a chair that has to go back to the maker
// is a carriage charge either way. The shop can either refuse those returns
// outright or accept them and keep the collection cost back, and the second is
// the one that keeps the customer.
//
// Kept dependency-free and apart from lib/order-request-actions.ts so the
// arithmetic can be tested on its own. It is money, and money that goes wrong
// by a penny goes wrong in a way somebody writes in about.

export type RefundLine = { orderItemId: string; quantity: number; amount: number }

function round2(n: number): number {
  return Number(n.toFixed(2))
}

export type NetOffResult =
  | { ok: true; lines: RefundLine[]; total: number; charge: number }
  | { ok: false; error: string }

/**
 * Takes a return charge off a set of refund lines.
 *
 * Spread across the lines by value rather than parked on one of them, because
 * lib/db/refunds.ts caps every line against the units it covers and writes one
 * shp_refund_items row per line: a charge dumped on the cheapest line would
 * either breach that cap or quietly turn a £12 line into a £0 one on the credit
 * note. Pro rata, every line stays recognisably itself.
 *
 * The rounding remainder goes on the largest line, which is the only place a
 * penny can land without being visible. Without it the shares can sum to a
 * penny either side of the intended figure, and the refund the customer is
 * promised in the email would not be the refund that left the account.
 *
 * A charge that swallows the whole refund is refused rather than rounded down
 * to nothing: a refund of £0.00 is not a refund, and an owner who has typed a
 * figure that big has either mistyped it or means to keep the money, which is a
 * decision to take without the refund machinery in the way.
 */
export function netOffReturnCharge(lines: RefundLine[], charge: number): NetOffResult {
  const total = round2(lines.reduce((sum, line) => sum + line.amount, 0))
  if (!Number.isFinite(charge) || charge <= 0) return { ok: true, lines, total, charge: 0 }
  const kept = round2(charge)

  // Half a penny of slack, so a charge typed to exactly match the goods is
  // caught by this sentence rather than by a refund of one pence.
  if (kept + 0.005 >= total) {
    return {
      ok: false,
      error: 'The return charge is as much as the refund itself. Approve without the refund and settle it by hand.',
    }
  }

  const target = round2(total - kept)
  // Largest by value, and the first of any tie - a deterministic choice, so the
  // same approval twice cannot produce two different sets of line amounts.
  let largest = 0
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.amount > lines[largest]!.amount) largest = i
  }

  const shares = lines.map((line) => round2((line.amount * target) / total))
  const drift = round2(target - shares.reduce((sum, share) => sum + share, 0))
  shares[largest] = round2(shares[largest]! + drift)

  return {
    ok: true,
    lines: lines.map((line, i) => ({ ...line, amount: shares[i]! })),
    total: target,
    charge: kept,
  }
}
