// npm run validate — fails the build (prebuild) if /data breaks any rule in lib/schema.ts.
import { dataResult } from "../lib/data";

if (dataResult.ok) {
  const { companies, invoices, constraints, events } = dataResult.data;
  console.log(
    `Data OK: ${companies.length} companies, ${invoices.length} invoices, ${constraints.length} constraints, ${events.length} events.`,
  );
} else {
  console.error(`Data validation failed (${dataResult.errors.length} problem(s)):`);
  for (const e of dataResult.errors) console.error(`  ${e.file}  ${e.id}  ${e.rule}`);
  process.exit(1);
}
