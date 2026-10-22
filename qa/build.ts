// Bundle web/ like the server does. A bundle error there shows an empty page and no message.
import tailwind from "bun-plugin-tailwind";

const r = await Bun.build({
  entrypoints: ["web/index.html"],
  outdir: "qa/.data/build",
  plugins: [tailwind],
  throw: false,
});
if (!r.success) {
  for (const l of r.logs) console.error(l);
  process.exit(1);
}
