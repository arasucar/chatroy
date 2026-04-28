import { requireSession } from "@/lib/auth";
import { getUserProviderKey } from "@/lib/user-provider-keys";
import { hasUserKeyEncryptionConfigured } from "@/lib/secrets";
import { OpenAISettingsForm } from "./openai-settings-form";

export default async function SettingsPage() {
  const { user } = await requireSession();
  const openaiKey = await getUserProviderKey(user.id, "openai");
  const canStoreSecrets = hasUserKeyEncryptionConfigured();

  return (
    <main className="tp-page">
      <h1 className="tp-page-title">System Configuration</h1>
      <p className="tp-page-sub">Interface & API bridge · Remote provider management</p>

      <section className="tp-section">
        <h2
          style={{
            margin: "0 0 16px",
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: "-0.01em",
          }}
        >
          OpenAI Bridge
        </h2>
        <OpenAISettingsForm
          keyHint={openaiKey?.keyHint ?? null}
          defaultModel={openaiKey?.defaultModel ?? "gpt-5-mini"}
          canStoreSecrets={canStoreSecrets}
        />
      </section>
    </main>
  );
}
