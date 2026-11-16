import type { ErrorRequestHandler } from "express";

function isMalformedJsonError(
  error: unknown,
): error is SyntaxError & { type: string } {
  return (
    error instanceof SyntaxError &&
    "type" in error &&
    error.type === "entity.parse.failed"
  );
}

export const malformedJsonHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  next,
) => {
  if (!isMalformedJsonError(error)) {
    return next(error);
  }

  return res.status(400).json({
    error: {
      code: "BAD_REQUEST",
      message: "Malformed JSON",
    },
  });
};
