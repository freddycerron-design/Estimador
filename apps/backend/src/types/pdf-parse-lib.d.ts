/**
 * pdf-parse@1.1.1 root entry (`pdf-parse/index.js`) runs a broken self-test block when
 * `module.parent` is falsy — which happens reliably under Node ESM/NodeNext, throwing
 * ENOENT for a fixture file the npm package doesn't even ship. Importing the real
 * implementation directly (`lib/pdf-parse.js`, no self-test wrapper) avoids it. That subpath
 * has no shipped types, so it's declared here matching the root package's public d.ts.
 */
declare module "pdf-parse/lib/pdf-parse.js" {
  function pdfParse(
    dataBuffer: Buffer,
    options?: {
      pagerender?: ((pageData: unknown) => string | Promise<string>) | undefined;
      max?: number | undefined;
      version?: string | undefined;
    }
  ): Promise<{
    numpages: number;
    numrender: number;
    info: unknown;
    metadata: unknown;
    version: string;
    text: string;
  }>;
  export = pdfParse;
}
