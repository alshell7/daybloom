// Types for tinydecide.js, load.js and corrections.js.

export type QuestionType = "choice" | "noul" | "score" | "span";

export interface Question {
  type: QuestionType;
  /** The question or statement, in plain English. */
  text: string;
  /** choice: 2-32 options. score: the levels, lowest first. noul and span take none (an error otherwise). */
  options?: string[];
}

export interface Request {
  /** The message. The model reads its first 127 tokens. */
  state: string;
  questions: Question[];
}

export interface ChoiceAnswer {
  type: "choice" | "score";
  probs: number[];
  pick: number;
  /** 1 - normalised entropy */
  confidence: number;
  /** score only: expected level, 0 = first, 1 = last */
  score?: number;
  /** store with a correction */
  qvec: number[];
  z0: number[];
  proj: boolean;
}

export interface NoulAnswer {
  type: "noul";
  /** P(the statement is true) */
  p: number;
  qvec: number[];
  z0: [number, number];
  proj: boolean;
}

export interface SpanAnswer {
  type: "span";
  /** the extracted text, "" when nothing was found */
  text: string;
  /** P(the message contains an answer) */
  p_present: number;
  p_span: number;
  /** first and last state token */
  tok: [number, number];
  /** [start, end) in the state string (UTF-16 indices), or null */
  char: [number, number] | null;
}

export type Answer = ChoiceAnswer | NoulAnswer | SpanAnswer;

export interface Result {
  answers: Answer[];
  tokens: { state: number; questions: number; total: number };
  /** the state was longer than 127 tokens and was cut */
  truncated: boolean;
  ms: number;
  ids: number[];
}

/** Corrections for one question, from makeProtos(). */
export interface Protos {
  vec: Float32Array;
  cnt: Int32Array;
  /** Mean qvec to centre the cosines on. null: the count-weighted mean of the prototypes. */
  center: Float32Array | null;
  lam?: number;
}

export interface Meta {
  name: string;
  cfg: Record<string, unknown>;
  beta: number[];
  temp: number[];
  [key: string]: unknown;
}

export class TinyDecide {
  constructor(meta: Meta, buf: ArrayBuffer);
  meta: Meta;
  answer(req: Request, protos?: (Protos | null | undefined)[]): Result;
}

export class WordPiece {
  constructor(tokenizer: unknown);
  encode(text: string): { ids: number[]; offsets: [number, number][] };
  /** Like encode(), but stops once there are more than `limit` ids; the ids are a prefix of encode(text).ids. */
  encodeUntil(text: string, limit: number): { ids: number[]; offsets: [number, number][] };
}
