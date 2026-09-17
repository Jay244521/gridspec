"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase-browser";
import Logo from "./Logo";

export default function NavBar() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = getBrowserClient();
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    await getBrowserClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <Logo className="h-6 w-6" />
        GridSpec
      </Link>
      <div className="flex items-center gap-4 text-sm">
        <Link href="/search" className="hover:underline">Search</Link>
        <Link href="/bom" className="hover:underline">BOM</Link>
        {signedIn === null ? null : signedIn ? (
          <button onClick={handleSignOut} className="text-neutral-500 hover:underline">
            Sign out
          </button>
        ) : (
          <Link href="/login" className="text-neutral-500 hover:underline">Sign in</Link>
        )}
      </div>
    </nav>
  );
}
