import { jsonLdScript } from "@/lib/seo";

type JsonLdProps = {
  data: Record<string, unknown> | Array<Record<string, unknown> | null | undefined>;
};

export default function JsonLd({ data }: JsonLdProps) {
  const blocks = (Array.isArray(data) ? data : [data]).filter(
    (d): d is Record<string, unknown> => Boolean(d)
  );
  if (blocks.length === 0) return null;

  return (
    <>
      {blocks.map((block, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(block) }}
        />
      ))}
    </>
  );
}
