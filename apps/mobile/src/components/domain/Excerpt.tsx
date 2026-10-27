import type { ReactNode } from 'react';

/** A sentence with the matched wording highlighted. Offsets are relative to the sentence. */
export function Excerpt({ sentence, from, to }: { sentence: string; from: number; to: number }) {
  if (from < 0 || to > sentence.length || from >= to) return <>{sentence}</>;
  return (
    <>
      {sentence.slice(0, from)}
      <mark className="jr-mark-hit">{sentence.slice(from, to)}</mark>
      {sentence.slice(to)}
    </>
  );
}

export function Quote({ children }: { children: ReactNode }) {
  return <blockquote className="jr-quote">{children}</blockquote>;
}
