import { account, map } from "waygraph";
import { SignInAs } from "../map/app/app.block.js";
export const Planner = account("planner", { signIn: map().gotoPage(SignInAs("planner")) });
export const Admin = account("admin", { signIn: map().gotoPage(SignInAs("admin")) });
