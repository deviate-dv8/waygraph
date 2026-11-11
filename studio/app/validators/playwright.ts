import vine from '@vinejs/vine'

/** Open Playwright UI over every flow, or one: a flow's export name (an identifier). */
export const playwrightValidator = vine.create({
  flow: vine
    .string()
    .regex(/^[A-Za-z_$][\w$]*$/)
    .optional(),
})
