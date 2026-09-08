import type { ShpConfig } from '@/modules/shop/lib/config'

// What the customer wants the driver to know: the gate code, the side entrance,
// the neighbour who takes parcels in, the lift that is out and the three floors
// of stairs behind it. Asked for on the delivery step, where the address it
// belongs beside is.
//
// Two rules and no database of its own - the value is a column on shp_orders,
// and this file is only the wording and the ceiling. Shared by the box that
// collects it, the route that accepts it and the admin screen that prints it,
// so a hand-rolled POST is held to exactly what the box would have allowed.
//
// Why it matters beyond the shop's own picking list: on a shop that drop-ships,
// the person who needs this never works here. The purchase order raised against
// the customer's order carries the instruction onto the delivery label the
// supplier's driver reads (see the Purchase Orders module's
// `shipToFromShopOrder`), which is the only way it reaches the lorry at all.

/** What this shop calls the box, falling back to the wording most shops mean. */
export function deliveryInstructionsLabel(config: Pick<ShpConfig, 'deliveryInstructionsLabel'>): string {
  return config.deliveryInstructionsLabel.trim() || 'Delivery instructions'
}

/** Whether the box is offered at all. Its own function rather than a bare read
 *  of the flag so every surface asks the question the same way, and so the
 *  answer has somewhere to grow if it ever needs to depend on more than one
 *  setting. */
export function deliveryInstructionsOffered(config: Pick<ShpConfig, 'deliveryInstructionsEnabled'>): boolean {
  return config.deliveryInstructionsEnabled
}

/** As long as an instruction is allowed to be.
 *
 *  Generous enough for the genuinely awkward delivery - a gate code, a lorry
 *  restriction and where to go if nobody answers - and short of the 2000 the
 *  purchase order's own instructions field allows, so whatever a customer
 *  writes always fits through onto the supplier's paperwork with room to spare.
 *  Enforced on the route and matched on the box, because a maxLength attribute
 *  is a courtesy to the shopper rather than a rule. */
export const DELIVERY_INSTRUCTIONS_MAX_LENGTH = 500
