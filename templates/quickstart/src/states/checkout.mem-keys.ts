import { keyGroup } from "waygraph";

export const LoginCreds = keyGroup<{ username: string; password: string }>("quickstart.credentials");
