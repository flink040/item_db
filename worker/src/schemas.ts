import { z } from 'zod'

export const ItemInsertSchema = z.object({
  title: z.string().min(1),
  description: z.string().max(500).optional().nullable(),
  image_url: z.string().url().optional().nullable(),
  item_type_id: z.number().int().positive(),
  material_id: z.number().int().positive(),
  star_level: z.number().int().min(0).max(3).optional().default(0),
  rarity_id: z.number().int().positive(),
  is_published: z.boolean().optional().default(false),
  enchantments: z
    .array(
      z.object({
        enchantment_id: z.number().int().positive(),
        level: z.number().int().positive(),
      })
    )
    .optional()
    .default([]),
})

export type ItemInsert = z.infer<typeof ItemInsertSchema>

export const MetaRow = z
  .object({
    id: z.number(),
    slug: z.string(),
    label: z.string(),
  })
  .strict()

export const RarityRow = MetaRow.extend({
  sort: z.number().optional(),
})

export type TMetaRow = z.infer<typeof MetaRow>
export type TRarityRow = z.infer<typeof RarityRow>

export function coerceInts(record: any, keys: string[]) {
  if (!record || typeof record !== 'object') {
    return record
  }

  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && /^\d+$/.test(value)) {
      record[key] = Number.parseInt(value, 10)
    }
  }

  return record
}
