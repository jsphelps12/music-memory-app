// Minimal Deno global surface these functions actually use, so tsc and eslint
// can check them outside the Deno runtime (see tsconfig.json alongside this
// file). Extend it as functions adopt more of the Deno API.
declare namespace Deno {
  function serve(
    handler: (req: Request) => Response | Promise<Response>
  ): void;

  const env: {
    get(name: string): string | undefined;
  };
}
