import { beforeEach, describe, expect, it } from "vitest";
import { cleanDb, testDb } from "./setup";
import {
  createPendingTurn,
  deriveConversationTitle,
  getConversationThreadForUser,
  listConversationsForUser,
  saveAssistantReply,
} from "../lib/chat";
import { schema } from "../lib/db/schema";

describe("chat persistence helpers", () => {
  beforeEach(async () => {
    await cleanDb();
  });

  it("creates a new conversation with the first user message", async () => {
    const [user] = await testDb
      .insert(schema.users)
      .values({ email: "chat@test.local", role: "member" })
      .returning();

    const prompt = "  Outline the smallest safe next step for Phase 3 chat.  ";
    const created = await createPendingTurn(user.id, prompt);

    expect(created).not.toBeNull();
    expect(created?.conversation.userId).toBe(user.id);
    expect(created?.conversation.title).toBe(deriveConversationTitle(prompt));
    expect(created?.messages).toHaveLength(1);
    expect(created?.messages[0].role).toBe("user");
    expect(created?.messages[0].content).toBe(prompt);

    const listed = await listConversationsForUser(user.id);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(created?.conversation.id);
  });

  it("appends assistant replies and enforces conversation ownership", async () => {
    const [owner] = await testDb
      .insert(schema.users)
      .values({ email: "owner@test.local", role: "member" })
      .returning();
    const [otherUser] = await testDb
      .insert(schema.users)
      .values({ email: "other@test.local", role: "member" })
      .returning();

    const created = await createPendingTurn(owner.id, "First message");
    expect(created).not.toBeNull();

    await saveAssistantReply(
      created!.conversation.id,
      "First local model answer",
      "qwen2.5:7b-instruct-q4_K_M",
    );

    const continued = await createPendingTurn(
      owner.id,
      "Follow up with more detail",
      created!.conversation.id,
    );

    expect(continued?.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);

    const ownerThread = await getConversationThreadForUser(owner.id, created!.conversation.id);
    expect(ownerThread?.messages).toHaveLength(3);
    expect(ownerThread?.messages[1].model).toBe("qwen2.5:7b-instruct-q4_K_M");

    const unauthorizedThread = await getConversationThreadForUser(
      otherUser.id,
      created!.conversation.id,
    );
    expect(unauthorizedThread).toBeNull();
  });
});
