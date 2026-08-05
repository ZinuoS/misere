import { useState } from "react";
import { backend, claimHandle, describeError, isLive, keyFingerprint, verifyLogin } from "../data/supabase";
import {
  cryptoAvailable, derive, HANDLE_RE, InsecureContextError, MIN_PASSWORD,
  sanitizeHandle, saveIdentity, type Identity,
} from "../data/identity";

type State = "idle" | "busy" | "wrongpw" | "invalid" | "shortpw" | "error" | "insecure";

export function Gate({ onClaimed }: { onClaimed: (id: Identity) => void }) {
  const [handle, setHandle] = useState("");
  const [pw, setPw] = useState("");
  const [state, setState] = useState<State>(cryptoAvailable() ? "idle" : "insecure");
  const [why, setWhy] = useState("");
  const [created, setCreated] = useState(false);

  const reset = () => setState(cryptoAvailable() ? "idle" : "insecure");

  // One button, both paths: log in if the pair matches, otherwise claim the handle.
  const enter = async () => {
    if (!HANDLE_RE.test(handle)) return setState("invalid");
    if (pw.length < MIN_PASSWORD) return setState("shortpw");
    setState("busy");
    try {
      const secretHash = await derive(handle, pw);
      const id = { handle, secretHash };
      if (await verifyLogin(handle, secretHash)) {
        saveIdentity(id);
        return onClaimed(id);
      }
      if (await claimHandle(handle, secretHash)) {
        saveIdentity(id);
        setCreated(true);
        return onClaimed(id);
      }
      setState("wrongpw"); // handle exists, password does not match it
    } catch (e) {
      if (e instanceof InsecureContextError) return setState("insecure");
      console.error("[misere-desk] sign-in failed:", e);
      setWhy(describeError(e));
      setState("error");
    }
  };

  const err = (msg: string) => (
    <p data-testid="gate-error" className="font-mono text-xs uppercase tracking-widest text-red">
      {msg}
    </p>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="newsprint overflow-hidden rounded-lg border border-hair">
        <img src="/img/brokers-curb.jpg" alt="" width={800} height={624} />
      </div>
      <h2 className="font-display text-3xl font-black uppercase tracking-tight">Claim your desk</h2>
      <p className="text-sm leading-relaxed text-muted">
        A handle and a password. No email, ever. Use the same pair on any device and you are
        back at the same desk.
      </p>

      <input
        value={handle}
        onChange={(e) => { setHandle(sanitizeHandle(e.target.value)); reset(); }}
        placeholder="handle — 3-16 chars: letters, digits, _ -"
        data-testid="gate-input"
        className="w-full rounded-md border border-hair bg-paper px-3 py-3 font-mono text-base outline-none focus:border-ink"
        maxLength={16}
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="username"
        spellCheck={false}
      />
      <input
        value={pw}
        onChange={(e) => { setPw(e.target.value); reset(); }}
        onKeyDown={(e) => e.key === "Enter" && enter()}
        type="password"
        placeholder={`password — ${MIN_PASSWORD}+ characters`}
        data-testid="gate-password"
        className="w-full rounded-md border border-hair bg-paper px-3 py-3 font-mono text-base outline-none focus:border-ink"
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="current-password"
        spellCheck={false}
        enterKeyHint="go"
      />

      {state === "wrongpw" && err("That handle is taken and the password does not match it.")}
      {state === "invalid" && err("3-16 characters: letters, digits, underscore, hyphen.")}
      {state === "shortpw" && err(`Password needs at least ${MIN_PASSWORD} characters.`)}
      {state === "error" && (
        <div data-testid="gate-error">
          <p className="font-mono text-xs uppercase tracking-widest text-red">The registry refused the claim.</p>
          {why && <p className="mt-1 break-words font-mono text-xs text-muted">{why}</p>}
        </div>
      )}
      {state === "insecure" && (
        <p data-testid="gate-error" className="text-xs leading-relaxed text-red">
          This page is served over plain http, so the browser withholds the crypto needed to
          protect your password. Open it over https, or on localhost.
        </p>
      )}

      <button
        onClick={enter}
        disabled={state === "busy" || state === "insecure"}
        data-testid="gate-claim"
        className="w-full rounded-full bg-ink py-3.5 font-mono text-sm uppercase tracking-widest text-paper disabled:opacity-50"
      >
        {state === "busy" ? "Checking the registry…" : "Enter the desk"}
      </button>

      <p className="text-xs leading-relaxed text-muted">
        New handle? This claims it. Existing handle? The same password logs you straight back in.
        There is no recovery — nobody can reset a password we never see.
        {created && " Desk claimed."}
      </p>
      <p data-testid="backend" className="font-mono text-[10px] uppercase tracking-widest text-muted">
        registry: {backend()}
        {!isLive && " (scores stay on this device)"}
        {isLive && ` · key ${keyFingerprint()}`}
      </p>
    </div>
  );
}
