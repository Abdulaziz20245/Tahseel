import PageIntro from "@/components/PageIntro";
import GovernmentView from "@/components/GovernmentView";

export default function GovernmentPage() {
  return (
    <>
      <PageIntro
        title="Government"
        purpose="Before and after for policy makers: the same open invoices at the same step, paid one by one vs. settled through Tahseel."
      />
      <GovernmentView />
    </>
  );
}
