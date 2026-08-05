import { useState } from "react";
import { backend, claimHandle, describeError, isLive, keyFingerprint } from "../data/supabase";
import {
  cryptoAvailable, HANDLE_RE, InsecureContextError, newSecret, sanitizeHandle,
  saveIdentity, sha256Hex, type Identity,
} from "../data/identity";

export function Gate({ onClaimed }: { onClaimed: (id: Identity) => void }) {
  const [v, setV] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "taken" | "invalid" | "error" | "insecure">(
    cryptoAvailable() ? "idle" : "insecure",
  );
  const [why, setWhy] = useState("");

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
    } catch (e) {
      if (e instanceof InsecureContextError) return setState("insecure");
      console.error("[misere-desk] claim failed:", e);
      setWhy(describeError(e));
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
        onChange={(e) => {
          setV(sanitizeHandle(e.target.value));
          setState(cryptoAvailable() ? "idle" : "insecure");
        }}
        onKeyDown={(e) => e.key === "Enter" && claim()}
        placeholder="3-16 chars: letters, digits, _ -"
        data-testid="gate-input"
        className="w-full rounded-md border border-hair bg-paper px-3 py-3 font-mono text-base outline-none focus:border-ink"
        maxLength={16}
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        inputMode="text"
        enterKeyHint="go"
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
        <div data-testid="gate-error">
          <p className="font-mono text-xs uppercase tracking-widest text-red">
            The registry refused the claim.
          </p>
          {why && <p className="mt-1 break-words font-mono text-xs text-muted">{why}</p>}
        </div>
      )}
      {state === "insecure" && (
        <p data-testid="gate-error" className="text-xs leading-relaxed text-red">
          This page is served over plain http, so the browser withholds the crypto needed to
          mint your device secret. Open it over https, or on localhost.
        </p>
      )}
      <button
        onClick={claim}
        disabled={state === "busy" || state === "insecure"}
        data-testid="gate-claim"
        className="w-full rounded-full bg-ink py-3.5 font-mono text-sm uppercase tracking-widest text-paper disabled:opacity-50"
      >
        {state === "busy" ? "Checking the registry…" : "Claim it"}
      </button>
      <p className="text-xs leading-relaxed text-muted">
        Your claim lives in this browser's storage; clear it and the handle is gone for good.
      </p>
      <p data-testid="backend" className="font-mono text-[10px] uppercase tracking-widest text-muted">
        registry: {backend()}
        {!isLive && " (scores stay on this device)"}
        {isLive && ` · key ${keyFingerprint()}`}
      </p>
    </div>
  );
}
