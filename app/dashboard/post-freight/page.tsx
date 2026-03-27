import PostFreightForm from "./post-freight-form";

export const metadata = { title: "Post freight – Outback Connections" };

export default function PostFreightPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Post a freight listing</h1>
      <PostFreightForm />
    </main>
  );
}
