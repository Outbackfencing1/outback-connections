// app/dashboard/post-a-job/page.tsx
import { requireRole } from "@/lib/requireRole";
import PostJobForm from "./post-job-form";

export default async function PostAJobPage() {
  await requireRole("customer");
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Post a Job</h1>
      <PostJobForm />
    </main>
  );
}
