import PageIntro from "@/components/PageIntro";
import CompaniesView from "@/components/CompaniesView";

export default function CompaniesPage() {
  return (
    <>
      <PageIntro
        title="Companies"
        purpose="One company's view, as that company would see it: what it is owed, what it owes and how each invoice settles."
      />
      <CompaniesView />
    </>
  );
}
