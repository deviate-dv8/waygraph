import { account } from "waygraph";
import { loginFlow } from "../flows/login.flow.js";

/** The standard shopper. A flow `as` it starts signed in; the login runs once per run and its session is reused. */
export const StandardUser = account("standard-user", { signIn: loginFlow });
