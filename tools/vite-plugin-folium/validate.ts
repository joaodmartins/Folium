import type { Issue } from './types.ts';

/** Allowed type of a metadata field: a primitive type name or a list of allowed string values. */
export type FieldSpec = 'string' | 'boolean' | 'number' | readonly string[];

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describe(spec: FieldSpec): string {
  return typeof spec === 'string' ? spec : spec.map((v) => `"${v}"`).join(' | ');
}

/**
 * Picks the known fields out of `raw`, checking their types.
 * - Wrong types are reported as errors and the field is dropped.
 * - `null` / missing values are treated as "not set".
 * - Unknown keys are reported as `unknownLevel` (errors for config files, warnings for frontmatter).
 */
export function readFields(
  raw: Record<string, unknown>,
  spec: Record<string, FieldSpec>,
  file: string,
  issues: Issue[],
  unknownLevel: 'error' | 'warning',
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw)) {
    const fieldSpec = spec[key];
    if (fieldSpec === undefined) {
      issues.push({
        level: unknownLevel,
        file,
        message: `Unknown field "${key}". Allowed fields: ${Object.keys(spec).join(', ')}.`,
      });
      continue;
    }
    if (value === null || value === undefined) continue;

    if (typeof fieldSpec !== 'string') {
      if (typeof value !== 'string' || !fieldSpec.includes(value)) {
        issues.push({
          level: 'error',
          file,
          message: `Field "${key}" must be ${describe(fieldSpec)}, got ${JSON.stringify(value)}.`,
        });
        continue;
      }
      out[key] = value;
    } else if (fieldSpec === 'string') {
      if (typeof value !== 'string' || value.trim() === '') {
        issues.push({
          level: 'error',
          file,
          message: `Field "${key}" must be a non-empty string, got ${JSON.stringify(value)}.`,
        });
        continue;
      }
      out[key] = value.trim();
    } else if (fieldSpec === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        issues.push({
          level: 'error',
          file,
          message: `Field "${key}" must be a number, got ${JSON.stringify(value)}.`,
        });
        continue;
      }
      out[key] = value;
    } else {
      if (typeof value !== 'boolean') {
        issues.push({
          level: 'error',
          file,
          message: `Field "${key}" must be true or false, got ${JSON.stringify(value)}.`,
        });
        continue;
      }
      out[key] = value;
    }
  }
  return out;
}

export function formatIssue(issue: Issue): string {
  return `[folium] ${issue.level === 'error' ? 'Error' : 'Warning'} in ${issue.file}: ${issue.message}`;
}
