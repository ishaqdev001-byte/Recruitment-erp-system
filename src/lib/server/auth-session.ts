import { createSupabaseServerClient } from "@/lib/supabase/server"

export function isAuthSessionMissing(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "AuthSessionMissingError" ||
      error.message === "Auth session missing!")
  )
}

export async function getSupabaseServerUser(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
) {
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    return error ? null : user
  } catch (error) {
    if (isAuthSessionMissing(error)) return null
    throw error
  }
}
