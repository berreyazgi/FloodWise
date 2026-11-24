import { Suspense } from "react";
import { LoadingBlock } from "@/components/app/common";
import { ReportView } from "./report-view";

export default function ReportPage({ params }: PageProps<"/reports/[id]">) {
  return <Suspense fallback={<LoadingBlock rows={8} />}><ReportView params={params} /></Suspense>;
}
