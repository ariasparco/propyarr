// Renders JSON-LD structured data. Content is trusted (built server-side from
// our own constants/dictionaries), so dangerouslySetInnerHTML is safe here.
export function JsonLd({ data }: { data: object | object[] }) {
  const json = JSON.stringify(data);
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
