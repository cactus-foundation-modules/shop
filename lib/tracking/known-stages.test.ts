import { describe, expect, it } from 'vitest'
import { AIT_STAGE_MEANING } from '@/modules/shop/lib/tracking/ait-stages'
import { FIELDLY_STAGE_MEANING } from '@/modules/shop/lib/tracking/fieldly-stages'
import { missingStageLists, SOURCE_STAGES, sourceStages, type StageListKey } from '@/modules/shop/lib/tracking/known-stages'
import { stageMeaning } from '@/modules/shop/lib/tracking/stage-meaning'

const MEANING_OF: Record<StageListKey, string> = {
  outForDeliveryStages: 'out-for-delivery',
  deliveredStages: 'delivered',
  failedStages: 'failed',
}

const empty = { outForDeliveryStages: [], deliveredStages: [], failedStages: [] }

describe('SOURCE_STAGES', () => {
  it('claims AIT reports all three only because its built-in table says so', () => {
    const meanings = new Set(Object.values(AIT_STAGE_MEANING))
    for (const [key, meaning] of Object.entries(MEANING_OF) as [StageListKey, string][]) {
      expect(SOURCE_STAGES.ait.reportsItself[key]).toBe(meanings.has(meaning as never))
    }
  })

  it('claims Fieldly reports delivered, as its built-in table does', () => {
    expect(Object.values(FIELDLY_STAGE_MEANING)).toContain('delivered')
    expect(SOURCE_STAGES.fieldly.reportsItself.deliveredStages).toBe(true)
  })

  it('suggests only words that, once listed, mean what their list says', () => {
    for (const [source, stages] of Object.entries(SOURCE_STAGES)) {
      for (const [key, words] of Object.entries(stages.known) as [StageListKey, readonly string[]][]) {
        for (const word of words) {
          const courier = { ...empty, trackingSource: source as never, [key]: [word] }
          expect(stageMeaning(courier, word), `${source} ${key} "${word}"`).toBe(MEANING_OF[key])
        }
      }
    }
  })

  it('knows nothing about a source that is not polled', () => {
    expect(sourceStages('none')).toBeNull()
    expect(sourceStages('constructor')).toBeNull()
  })
})

describe('missingStageLists', () => {
  it('names every empty list on a courier that reports nothing itself', () => {
    expect(missingStageLists({ ...empty, trackingSource: 'multidrop' }))
      .toEqual(['deliveredStages', 'outForDeliveryStages', 'failedStages'])
  })

  it('leaves out what the courier says for itself', () => {
    expect(missingStageLists({ ...empty, trackingSource: 'ait' })).toEqual([])
    expect(missingStageLists({ ...empty, trackingSource: 'dpd' })).toEqual(['failedStages'])
    expect(missingStageLists({ ...empty, trackingSource: 'fieldly' })).toEqual(['outForDeliveryStages', 'failedStages'])
  })

  it('is quiet for a filled-in courier and for one nobody follows', () => {
    expect(missingStageLists({
      trackingSource: 'palletways',
      outForDeliveryStages: ['OUT FOR DELIVERY'],
      deliveredStages: ['JOB COMPLETE'],
      failedStages: ['FAILED'],
    })).toEqual([])
    expect(missingStageLists({ ...empty, trackingSource: 'none' })).toEqual([])
  })
})
