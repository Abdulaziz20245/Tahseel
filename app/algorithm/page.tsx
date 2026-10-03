import PageIntro from "@/components/PageIntro";
import AlgorithmView from "@/components/AlgorithmView";

export default function AlgorithmPage() {
  return (
    <>
      <PageIntro
        title="Algorithm"
        purpose="What the optimiser does, and evidence that it is real: the model, live solver statistics and validator checks."
      />
      <AlgorithmView />
    </>
  );
}
