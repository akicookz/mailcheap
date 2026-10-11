import { cloneElement, useId, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export { Button, Input, Textarea };
export function Field({ label, hint, children }) {
  const generatedId = useId();
  const id = children.props.id || generatedId;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, {
        id,
        "aria-describedby": hint
          ? `${id}-hint`
          : children.props["aria-describedby"],
      })}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function Select({ children, ...props }) {
  return (
    <select className="select" {...props}>
      {children}
    </select>
  );
}
export function Badge({ status, children }) {
  return (
    <span className={`badge ${status}`}>
      {children ||
        (status === "accepted"
          ? "Accepted by provider"
          : status === "uncertain"
            ? "Needs review"
            : status?.replace(/^./, (letter) => letter.toUpperCase()))}
    </span>
  );
}
export function Heading({ title, description, children }) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}
export function Empty({ title, description, children }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={20} /> Loading…
    </div>
  );
}
export function ErrorState({ error, retry }) {
  return (
    <div className="notice error" role="alert">
      <p>{error}</p>
      {retry && (
        <Button variant="secondary" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={wide ? "modal-wide" : "modal"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function AsyncButton({ onClick, children, ...props }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      {...props}
      disabled={props.disabled || busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onClick();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <LoaderCircle className="spin" size={16} /> : null}
      {children}
    </Button>
  );
}
export const number = (n) => Number(n || 0).toLocaleString();
export const date = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
export function Stats({ items }) {
  return (
    <div className="stats">
      {items.map(([label, value, detail]) => (
        <div key={label}>
          <p>{label}</p>
          <strong>{number(value)}</strong>
          {detail && <small>{detail}</small>}
        </div>
      ))}
    </div>
  );
}
