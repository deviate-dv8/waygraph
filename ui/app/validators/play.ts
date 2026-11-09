import vine from '@vinejs/vine'

/** Play a flow: how, whether to skip its expectations or replay a past run's mem, and whether a demo moves on by itself. */
export const playValidator = vine.create({
  flow: vine.string().trim().minLength(1),
  mode: vine.enum(['run', 'demo']),
  noExpect: vine.boolean().optional(),
  autoNext: vine.boolean().optional(),
  replay: vine
    .string()
    .regex(/^[\w.-]+$/)
    .optional(),
})
