import type { OrderStep } from '@/modules/shop/lib/order-progress'
import { formatOrderDateShort } from '@/modules/shop/lib/order-display'
import { Icon, ICON_TICK } from '@/modules/shop/components/public/OrderDetailChrome'

// Where the order has got to, in four steps.
//
// This is the answer to the only question most people open the page for, so it
// sits directly under the order number and above everything else - including,
// deliberately, the receipt. The old page put a status badge in the header and
// left "has it actually been sent" to be worked out from a parcels card four
// sections down.
//
// An ordered list rather than a row of divs: it is a sequence, and a screen
// reader should read it as one. The step in progress carries aria-current so it
// is announced as the one that matters without relying on the tint.

export function OrderProgressRail({ steps, timezone }: { steps: OrderStep[]; timezone: string }) {
  if (steps.length === 0) return null

  return (
    <ol className="sod-steps" aria-label="Progress of this order">
      {steps.map((step) => (
        <li
          key={step.key}
          className={`sod-step sod-step-${step.state}`}
          aria-current={step.state === 'now' ? 'step' : undefined}
        >
          {/* The dot is decoration - the state is already in the label's
              wording and in aria-current, so nothing is lost by hiding it. */}
          <span className="sod-dot" aria-hidden="true">
            {step.state === 'done' && <Icon>{ICON_TICK}</Icon>}
          </span>
          <span className="sod-step-label">{step.label}</span>
          {/* Rendered even when empty so all four labels sit on one line
              whether or not the step underneath has a date to show. */}
          <span className="sod-step-when">
            {step.note ?? (step.at ? formatOrderDateShort(step.at, timezone) : '')}
          </span>
        </li>
      ))}
    </ol>
  )
}
