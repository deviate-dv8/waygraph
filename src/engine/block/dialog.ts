// withDialog(): a Block that answers the browser dialog its action opens.
import type { MemKey } from "../mem/mem.js";
import { rebuild } from "./block.js";
import type { SomeBlock } from "./some-block.js";


/**
 * Answers the browser's own dialog (`confirm`, `alert`, `prompt`, `beforeunload`) that this Block's action
 * triggers. A dialog freezes the page until it is answered, so the answer has to be armed before the click -
 * this does that without folding it into the Block's own `act`. The dialog's text can be kept in mem.
 * @example withDialog(CancelBlock, { accept: true, into: LeaveWarning })
 */


export function withDialog<B extends SomeBlock>(
  block: B,
  options: { accept?: boolean; into?: MemKey<string>; promptText?: string; } = {}
): B {
  const ins = block.instruction;
  return rebuild(block, {
    ...ins,
    async act(page, input, mem) {
      const answer = async (dialog: import("@playwright/test").Dialog): Promise<void> => {
        if (options.into) mem.set(options.into, dialog.message());
        if (options.accept === false) await dialog.dismiss();
        else await dialog.accept(options.promptText);
      };
      page.once("dialog", answer);
      try {
        await ins.act(page, input, mem);
      } finally {
        page.off("dialog", answer);
      }
    },
  });
}
