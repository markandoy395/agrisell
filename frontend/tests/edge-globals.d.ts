// Minimal host declaration for checking the Edge Function with the local compiler.
declare const Deno: {
  env: { get(name: string): string | undefined }
  readFile(path: URL): Promise<Uint8Array>
  serve(handler: (request: Request) => Response | Promise<Response>): void
}
