import { useState } from "react";
import { claimHandle } from "../data/supabase";
import { HANDLE_RE, newSecret, saveIdentity, sha256Hex, type Identity } from "../data/identity";

export function Gate({ onClaimed }: { onClaimed: (id: Identity) => void }) {
  const [v, setV] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "taken" | "invalid" | "error">("idle");

  const claim = async () => {
    if (!HANDLE_RE.test(v)) return setState("invalid");
    setState("busy");
    try {
      const secret = newSecret();
      const ok = await claimHandle(v, await sha256Hex(secret));
      if (!ok) return setState("taken");
      const id = { handle: v, secret };
      saveIdentity(id);
      onClaimed(id);
    } catch {
      setState("error");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="newsprint overflow-hidden rounded-lg border border-hair">
        <img src="/img/brokers-curb.jpg" alt="" width={800} height={624} />
      </div>
      <h2 className="font-display text-3xl font-black uppercase tracking-tight">Claim your desk</h2>
      <p className="text-sm leading-relaxed text-muted">
        A handle is all you need — no email, no password. It goes on the leaderboard next to
        everything you destroy.
      </p>
      <input
        value={v}
        onChange={(e) => { setV(e.target.value); setState("idle"); }}
        onKeyDown={(e) => e.key === "Enter" && claim()}
        placeholder="3-16 chars: letters, digits, _ -"
        data-testid="gate-input"
        className="w-full rounded-md border border-hair bg-paper px-3 py-3 font-mono text-base outline-none focus:border-ink"
        maxLength={16}
        autoFocus
      />
      {state === "taken" && (
        <p data-testid="gate-error" className="font-mono text-xs uppercase tracking-widest text-red">
          Taken. Someone is already losing under that name.
        </p>
      )}
      {state === "invalid" && (
        <p data-testid="gate-error" className="font-mono text-xs uppercase tracking-widest text-red">
          3-16 characters: letters, digits, underscore, hyphen.
        </p>
      )}
      {state === "error" && (
        <p data-testid="gate-error" className="font-mono text-xs uppercase tracking-widest text-red">
          The registry is unreachable. Try again.
        </p>
      )}
      <button
        onClick={claim}
        disabled={state === "busy"}
        data-testid="gate-claim"
        className="w-full rounded-full bg-ink py-3.5 font-mono text-sm uppercase tracking-widest text-paper disabled:opacity-50"
      >
        {state === "busy" ? "Checking the registry…" : "Claim it"}
      </button>
      <p className="text-xs leading-relaxed text-muted">
        Your claim lives in this browser's storage; clear it and the handle is gone for good.
      </p>
    </div>
  );
}
