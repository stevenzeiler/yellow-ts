export { Client } from "./Client";
export type { ClientOptions, RequestObject, Json } from "./Client";

// Optional loader for @erc7824/nitrolite to avoid hard build-time coupling
export type NitroliteModule = any;
export async function loadNitrolite(): Promise<NitroliteModule> {
	return (await import("@erc7824/nitrolite")) as any;
}


