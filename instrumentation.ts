export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { resumeCanvassOnBoot } = await import("@/features/finder/live-run");
  resumeCanvassOnBoot();
}
