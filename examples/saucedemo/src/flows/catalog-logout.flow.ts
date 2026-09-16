import { Engine, start, end, withTitle } from "waygraph";
import { NavItemDetailBlock } from "../blocks/nav-item-detail.block.js";
import { NavBackToInventoryBlock } from "../blocks/nav-back-to-inventory.block.js";
import { SubmitLogoutBlock } from "../blocks/actions/submit-logout.action.block.js";

const engine = new Engine();

// Browse one product, return to inventory, log out - wires orphan catalog + logout Blocks.
export const catalogLogoutFlow = withTitle(
  engine.defineFlow([start, NavItemDetailBlock, NavBackToInventoryBlock, SubmitLogoutBlock, end]),
  "Catalog browse then logout",
);
