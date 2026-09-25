// Globals defined in-page by installShadowRoot (ui/shadow.ts). Used by overlay code in place of `document.*`.
declare function __wgById(id: string): HTMLElement | null;
declare function __wgQ<E extends Element = HTMLElement>(selector: string): E | null;
declare function __wgQA<E extends Element = HTMLElement>(selector: string): E[];
declare function __wgAdd<T extends Node>(node: T): T;
declare function __wgCss(css: string, key: string): void;
