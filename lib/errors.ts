export function friendlyError(err: unknown): string {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : String(err);

  const lower = message.toLowerCase();

  // Network errors
  if (
    lower.includes("network request failed") ||
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("load failed")
  ) {
    return "No connection. Check your internet and try again.";
  }

  // Auth errors
  if (lower.includes("invalid login credentials")) {
    return "Incorrect email or password.";
  }
  if (lower.includes("email not confirmed")) {
    return "Please confirm your email before signing in.";
  }
  if (lower.includes("user already registered")) {
    return "An account with this email already exists.";
  }
  if (lower.includes("email rate limit exceeded")) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }

  // Not found (PostgREST)
  if (lower.includes("pgrst116") || lower.includes("no rows found")) {
    return "This moment could not be found.";
  }

  // Permission / RLS
  if (
    lower.includes("permission denied") ||
    lower.includes("row-level security") ||
    lower.includes("new row violates row-level security")
  ) {
    return "You don't have permission to do that.";
  }

  // Storage
  if (lower.includes("payload too large") || lower.includes("file too large")) {
    return "That file is too large. Please try a smaller one.";
  }

  return "Something went wrong. Please try again.";
}
