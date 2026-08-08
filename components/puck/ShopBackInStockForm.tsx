import { BackInStockClient } from '@/modules/shop/components/public/BackInStockClient'

export type ShopBackInStockFormProps = { productId?: string; buttonLabel?: string; heading?: string; inStock?: boolean; prompt?: string; successText?: string; placeholder?: string }

// Registered as a SERVER component so Puck's RSC <Render> serialises only plain
// props (never its renderDropZone function bag, which a client-registered block
// chokes on). The interactive form is the BackInStockClient island. Hidden
// automatically when the product is in stock (addendum A.8) - the product
// detail page only passes inStock=false when it actually needs this.
export function ShopBackInStockForm(props: ShopBackInStockFormProps) {
  if (props.inStock) return null
  return <BackInStockClient productId={props.productId} buttonLabel={props.buttonLabel} heading={props.heading} prompt={props.prompt} successText={props.successText} placeholder={props.placeholder} />
}

export const shopBackInStockFormPuckComponent = {
  label: 'Shop: Back in Stock Form',
  fields: {
    productId: { type: 'text' as const, label: 'Product ID (injected on the product page)' },
    heading: { type: 'text' as const, label: 'Heading' },
    prompt: { type: 'text' as const, label: 'Invitation line above the email box' },
    placeholder: { type: 'text' as const, label: 'Email box placeholder' },
    buttonLabel: { type: 'text' as const, label: 'Button label' },
    successText: { type: 'text' as const, label: 'Thank-you line after signing up' },
  },
  defaultProps: { heading: 'Out of stock', buttonLabel: 'Notify me', prompt: 'Pop your email in and we’ll let you know when it’s back in stock.', placeholder: 'Your email', successText: 'Thanks - we’ll email you the moment it’s back.' },
  render: ShopBackInStockForm,
}

export const shopBackInStockFormPuckRscComponent = shopBackInStockFormPuckComponent
