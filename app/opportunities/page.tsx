// app/opportunities/page.tsx
import { redirect } from "next/navigation";

export default function OpportunitiesShortUrl() {
  // Short URL -> canonical dashboard route
  redirect("/dashboard/opportunities");
}
