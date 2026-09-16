import { keyGroup } from "waygraph";

export const LoginCreds = keyGroup<{ username: string; password: string }>("quickstart.credentials");
export const ViewerCreds = keyGroup<{ username: string; password: string }>("quickstart.viewer-credentials");
