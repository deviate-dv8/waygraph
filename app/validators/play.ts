import vine from '@vinejs/vine'

/** Play a flow: how, and whether to skip its expectations or replay a past run's mem. */
export const playValidator = vine.create({
  flow: vine.string().trim().minLength(1),
  mode: vine.enum(['run', 'demo']),
  noExpect: vine.boolean().optional(),
  replay: vine
    .string()
    .regex(/^[\w.-]+$/)
    .optional(),
})
