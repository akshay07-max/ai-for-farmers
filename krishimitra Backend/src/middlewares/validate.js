const { ZodError } = require("zod");

/**
 * Wraps a Zod schema into an Express middleware that validates `req.body`.
 * If validation fails, responds with 400 and a standardized error payload.
 */
function validate(schema) {
  return (req, res, next) => {
    try {
      const result = schema.safeParse(req.body);

      if (!result.success) {
        const formattedErrors = result.error.errors.map((err) => ({
          path: err.path.join("."),
          message: err.message,
        }));

        return res.status(400).json({
          success: false,
          errorCode: "ERR_VALIDATION_FAILED",
          message: "Request body validation failed.",
          errors: formattedErrors,
        });
      }

      // Use the parsed, type-safe data going forward
      req.body = result.data;
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          success: false,
          errorCode: "ERR_VALIDATION_FAILED",
          message: "Request body validation failed.",
          errors: err.errors,
        });
      }

      return next(err);
    }
  };
}

module.exports = validate;

