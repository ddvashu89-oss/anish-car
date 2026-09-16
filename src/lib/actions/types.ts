export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
  /** Echo of what was submitted, so fields keep their input after React resets the form. */
  values?: Record<string, string>;
  /** Changes on every successful submit; lets forms clear themselves. */
  okAt?: number;
};

const SKIP_ECHO = /password/i;

export function formValues(formData: FormData) {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$") || SKIP_ECHO.test(key) || typeof value !== "string") continue;
    values[key] = key in values ? `${values[key]},${value}` : value;
  }
  return values;
}

export function fieldErrorsFrom(issues: Array<{ path: PropertyKey[]; message: string }>) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export function fail(
  formData: FormData | null,
  error: string,
  fieldErrors?: Record<string, string>,
): FormState {
  return { error, fieldErrors, values: formData ? formValues(formData) : undefined };
}

export function invalid(formData: FormData, issues: Array<{ path: PropertyKey[]; message: string }>): FormState {
  return fail(formData, "Check the highlighted fields.", fieldErrorsFrom(issues));
}

export function ok(success: string): FormState {
  return { success, okAt: Date.now() };
}
