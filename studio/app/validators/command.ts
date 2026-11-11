import vine from '@vinejs/vine'

/** Run one of the Project page's commands, by its name. */
export const commandValidator = vine.create({
  name: vine
    .string()
    .regex(/^[a-z-]+$/)
    .maxLength(40),
})
