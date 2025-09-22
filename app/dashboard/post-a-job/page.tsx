// app/dashboard/post-a-job/page.tsx
import PostJobForm from "./post-job-form";

export const metadata = { title: "Post a job – OutbackConnections" };

export default function PostAJobPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Post a job</h1>
      <PostJobForm />
    </main>
  );
}
