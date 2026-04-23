import { requireSession } from "@/lib/auth";
import { getUserProviderKey } from "@/lib/user-provider-keys";
import { hasUserKeyEncryptionConfigured } from "@/lib/secrets";
import { OpenAISettingsForm } from "./openai-settings-form";

export default async function SettingsPage() {
  const { user } = await requireSession();
  const openaiKey = await getUserProviderKey(user.id, "openai");
  const canStoreSecrets = hasUserKeyEncryptionConfigured();

  return (
    <main style={{ padding: "2rem", maxWidth: 720 }}>
      <h1 style={{ marginBottom: "1rem" }}>Settings</h1>
      <p style={{ marginBottom: "2rem", color: "var(--muted)" }}>
        Configure optional remote providers. Local chat remains the default path; remote
        fallback is only used when the mediator decides a request should escalate.
      </p>

      <section>
        <h2 style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>OpenAI</h2>
        <OpenAISettingsForm
          keyHint={openaiKey?.keyHint ?? null}
          defaultModel={openaiKey?.defaultModel ?? "gpt-5-mini"}
          canStoreSecrets={canStoreSecrets}
        />
      </section>
    </main>
  );
}
