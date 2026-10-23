import type { Checkpoint } from "../src/engine/checkpoint/checkpoint.js";
import type { Instruction, Block } from "../src/engine/block/block.js";
import { connect } from "../src/engine/run/connect.js";
import { checkpoint } from "../src/engine/checkpoint/checkpoint.js";

type LoggedOut = Checkpoint<"LoggedOut">;
type Authed = Checkpoint<"Authed">;
type DocUploaded = Checkpoint<"DocUploaded">;

// resolve's parameter list is `(observed)` only - `page` and `mem` are simply not
// in scope, so referencing either inside resolve is a compile error, not a lint rule.
const _loginInstruction: Instruction<LoggedOut, Authed> = {
  async act(page, _input, mem) {
    await page.getByRole("button", { name: "Sign In" }).click();
    void mem;
  },
  resolve() {
    // @ts-expect-error - `page` is not a parameter of resolve, it is not in scope
    void page;
    return checkpoint("Authed");
  },
};
void _loginInstruction;

// connect() only compiles when A's output tag equals B's input tag.
declare const registerBlock: Block<Checkpoint<"__start__">, LoggedOut>;
declare const loginBlock: Block<LoggedOut, Authed>;
declare const uploadBlock: Block<DocUploaded, Checkpoint<"RequestReady">>;

const _validChain = connect(registerBlock, loginBlock);
void _validChain;

// @ts-expect-error - loginBlock's output "Authed" does not match uploadBlock's input "DocUploaded"
const _invalidChain = connect(loginBlock, uploadBlock);
void _invalidChain;
