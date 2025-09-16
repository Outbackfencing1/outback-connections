// app/api/jobs/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// --- Create a new job ---
export async function POST(req: Request) {
  try {
    const b = await req.json();

    const title = String(b.title || "").trim();
    const description = String(b.description || "").trim();
    const location = String(b.location || "").trim();

    const budget =
      b.budget === "" || b.budget === null || b.budget === undefined
        ? null
        : Number(b.budget);

    if (!title || !description || !location) {
      return NextResponse.json(
        { error: "Title, description and location are required." },
        { status: 400 }
      );
    }
    if (budget != null && (Number.isNaN(budget) || budget < 0)) {
      return NextResponse.json(
        { error: "Budget must be a positive number." },
        { status: 400 }
      );
    }

    const job = await prisma.job.create({
      data: {
        title,
        description,
        location,
        budget,
        category: b.category ? String(b.category).trim() : null,
        contactName: b.contactName ? String(b.contactName).trim() : null,
        contactEmail: b.contactEmail ? String(b.contactEmail).trim() : null,
      },
    });

    return NextResponse.json({ ok: true, job }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// --- Get jobs list (with optional filters) ---
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const location = (searchParams.get("location") || "").trim();
    const category = (searchParams.get("category") || "").trim();
    const take = Number(searchParams.get("take") || 100);

    const where = {
      AND: [
        q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                { location: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
        location
          ? { location: { contains: location, mode: "insensitive" } }
          : {},
        category
          ? { category: { contains: category, mode: "insensitive" } }
          : {},
      ],
    };

    const jobs = await prisma.job.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Number.isFinite(take) && take > 0 ? take : 100,
    });

    return NextResponse.json({ jobs }, { status: 200 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
