import { AlertCircle } from "lucide-react";

// One error look everywhere: our own message, and a way to try again unless waiting is the fix (429) or
// trying again can't help (404).
export function ErrorNotice({ error, retry, className = "" }) {
  const canRetry = retry && error.status !== 429 && error.status !== 404;
  return (
    <div className={`notice error ${className}`} role="alert">
      <AlertCircle size={20} aria-hidden="true" />
      <div>
        <p>{error.message}</p>
        {canRetry && <button type="button" className="btn ghost small retry" onClick={retry}>Try again</button>}
      </div>
    </div>
  );
}
