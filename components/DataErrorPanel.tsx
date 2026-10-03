import type { DataError } from "@/lib/types";

export default function DataErrorPanel({ errors }: { errors: DataError[] }) {
  return (
    <section role="alert" className="rounded-md border border-bad bg-canvas">
      <div className="border-b border-bad bg-bad px-4 py-3 text-white">
        <h1 className="font-semibold">Scenario data is invalid</h1>
        <p className="text-sm text-white/90">
          {errors.length} problem{errors.length === 1 ? "" : "s"} found in /data. Fix the JSON and reload; run{" "}
          <span className="font-semibold">npm run validate</span> for the same list.
        </p>
      </div>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-muted">
          <tr>
            <th className="px-4 py-2 font-semibold">File</th>
            <th className="px-4 py-2 font-semibold">Id</th>
            <th className="px-4 py-2 font-semibold">Rule</th>
          </tr>
        </thead>
        <tbody>
          {errors.map((e, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              <td className="px-4 py-2 whitespace-nowrap">{e.file}</td>
              <td className="num px-4 py-2 whitespace-nowrap">{e.id}</td>
              <td className="px-4 py-2">{e.rule}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
