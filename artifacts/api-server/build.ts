import path from "path";
import { fileURLToPath } from "url";
import { build as esbuild } from "esbuild";
import { rm, readFile } from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times without risking some
// packages that are not bundle compatible
//
// pdfkit is deliberately NOT bundled: it loads its .afm font metric files at
// runtime with a path resolved relative to its own module directory
// (node_modules/pdfkit/js/data/*.afm). Bundling inlines that lookup into
// dist/, where those data files don't exist, so PDF generation (and the host
// welcome email that attaches it) fails with ENOENT in production while
// working fine locally under tsx (unbundled). Keeping it external lets Node
// resolve it normally from node_modules, where the data files are actually
// shipped.
//
// pdf-parse is deliberately NOT bundled either: it's built on pdfjs-dist,
// which expects to run unbundled in Node (dynamic requires for its worker/
// canvas fallbacks). Bundling it breaks those lookups (missing DOMMatrix/
// ImageData/Path2D polyfills, broken `require`) and throws at runtime.
// Verified by reproducing the failure with the same esbuild config in
// isolation; marking it external fixes it, same as pdfkit above.
const allowlist = [
  "@supabase/supabase-js",
  "bcryptjs",
  "cookie-parser",
  "cors",
  "express",
  "helmet",
  "multer",
  "openai",
  "pino",
  "pino-http",
  "qrcode",
  "resend",
];

async function buildAll() {
  const distDir = path.resolve(__dirname, "dist");
  await rm(distDir, { recursive: true, force: true });

  console.log("building server...");
  const pkgPath = path.resolve(__dirname, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter(
    (dep) =>
      !allowlist.includes(dep) &&
      !(pkg.dependencies?.[dep]?.startsWith("workspace:")),
  );

  await esbuild({
    entryPoints: [path.resolve(__dirname, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: path.resolve(distDir, "index.cjs"),
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
