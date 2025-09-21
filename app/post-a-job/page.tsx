// app/post-a-job/page.tsx
import { redirect } from "next/navigation";

export default function PostAJobShortUrl() {
  // Short URL -> canonical dashboard route
  redirect("/dashboard/post-a-job");
}
