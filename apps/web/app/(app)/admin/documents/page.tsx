import { listDocuments } from "@/lib/retrieval";
import { CreateDocumentForm } from "./create-document-form";

export default async function AdminDocumentsPage() {
  const allDocuments = await listDocuments(100);

  return (
    <main>
      <h1 className="tp-page-title">Document Index</h1>
      <p className="tp-page-sub">Retrieval corpus · Local embedding pipeline</p>

      <section className="tp-section" style={{ marginBottom: 32, maxWidth: 760 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>
          Upload For Retrieval
        </h2>
        <CreateDocumentForm />
      </section>

      <section className="tp-section" style={{ maxWidth: 960 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>
          Indexed Documents
        </h2>
        {allDocuments.length === 0 ? (
          <p className="tp-mono">No documents indexed yet.</p>
        ) : (
          <table className="tp-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Source</th>
                <th>Chunks</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {allDocuments.map((document) => (
                <tr key={document.id}>
                  <td style={{ color: "var(--tp-on-surface)" }}>{document.title}</td>
                  <td>{document.sourceName ?? "—"}</td>
                  <td>
                    <span className="tp-badge">{document.chunkCount}</span>
                  </td>
                  <td className="tp-mono">{document.updatedAt.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
