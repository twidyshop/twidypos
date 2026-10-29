-- This function is used only by the workspace write trigger, not as a public RPC.
revoke all on function public.twidypos_enforce_plan_limits() from public, anon, authenticated, service_role;
