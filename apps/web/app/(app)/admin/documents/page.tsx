import { listDocuments } from "@/lib/retrieval";
import { CreateDocumentForm } from "./create-document-form";

export default async function AdminDocumentsPage() {
  const allDocuments = await listDocuments(100);

  return (
    <main style={{ padding: "2rem", maxWidth: 960 }}>
      <h1 style={{ marginBottom: "2rem" }}>Documents</h1>

      <section style={{ marginBottom: "2.5rem" }}>
        <h2 style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>Upload for retrieval</h2>
        <CreateDocumentForm />
      </section>

      <section>
        <h2 style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>Indexed documents</h2>
        {allDocuments.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No documents indexed yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "0.5rem" }}>Title</th>
                <th style={{ padding: "0.5rem" }}>Source</th>
                <th style={{ padding: "0.5rem" }}>Chunks</th>
                <th style={{ padding: "0.5rem" }}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {allDocuments.map((document) => (
                <tr key={document.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.5rem" }}>{document.title}</td>
                  <td style={{ padding: "0.5rem" }}>{document.sourceName ?? "—"}</td>
                  <td style={{ padding: "0.5rem" }}>{document.chunkCount}</td>
                  <td style={{ padding: "0.5rem" }}>{document.updatedAt.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
