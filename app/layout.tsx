import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import Header from "@/components/Header";
import TabBar from "@/components/TabBar";
import TimelineStrip from "@/components/TimelineStrip";
import AssistantButton from "@/components/AssistantButton";
import DataErrorPanel from "@/components/DataErrorPanel";
import { dataResult } from "@/lib/data";
import { ScenarioProvider } from "@/lib/ScenarioProvider";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "Tahseel — Invoice settlement network",
  description:
    "Concept prototype of a government invoice settlement network. Synthetic data.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: extensions such as Grammarly add attributes to <html>/<body>
    // before React loads. It only covers these two elements' own attributes, not their children.
    <html lang="en" className={`${plexSans.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col font-sans" suppressHydrationWarning>
        <Header />
        <TabBar />
        {dataResult.ok ? (
          <ScenarioProvider data={dataResult.data}>
            <TimelineStrip />
            <main className="mx-auto w-full max-w-[1920px] flex-1 px-6 pt-6 pb-20">{children}</main>
            <AssistantButton />
          </ScenarioProvider>
        ) : (
          <main className="mx-auto w-full max-w-[1920px] flex-1 px-6 py-6">
            <DataErrorPanel errors={dataResult.errors} />
          </main>
        )}
      </body>
    </html>
  );
}
