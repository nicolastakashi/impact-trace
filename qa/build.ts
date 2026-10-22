// Bundle web/ like the server does. A bundle error there shows an empty page and no message.
import tailwind from "bun-plugin-tailwind";

const result = await Bun.build({
  entrypoints: ["web/index.html"],
  outdir: "qa/.data/build",
  plugins: [tailwind],
  throw: false,
});
if (!result.success) {
  for (const log of result.logs) console.error(log);

  process.exit(1);
}
