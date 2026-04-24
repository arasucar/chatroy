export async function register() {
  if (process.env.NEXT_RUNTIME !== "edge") {
    const { registerNodeInstrumentation } = await import("./instrumentation-node");
    await registerNodeInstrumentation();
  }
}
