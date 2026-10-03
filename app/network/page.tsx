import NetworkView from "@/components/NetworkView";

export default function NetworkPage() {
  return (
    <>
      {/* The tab already names the page; the graph gets the vertical space. */}
      <h1 className="sr-only">Network: who owes whom, and how each event changes the settlement plan</h1>
      <NetworkView />
    </>
  );
}
