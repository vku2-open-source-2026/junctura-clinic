// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
// Input checks for everything staff type in. Messages are shown to staff as they are, so they are
// plain Vietnamese and name the field. Nothing here trusts the browser.

/** Thrown with one message per field; the API answers 422 with `fields`. */
export class ValidationError extends Error {
  constructor(fields) {
    super("invalid input");
    this.name = "ValidationError";
    this.fields = fields;
  }
}

const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const clean = value => String(value).normalize("NFC").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();

/** Collects errors so a form can show all of them at once. */
export function check(input, rules) {
  if (!isObject(input)) throw new ValidationError({ _: "Dữ liệu gửi lên không hợp lệ." });
  const fields = {};
  const out = {};
  for (const [name, rule] of Object.entries(rules)) {
    try {
      const value = rule(input[name]);
      if (value !== undefined) out[name] = value;
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      fields[name] = error.message;
    }
  }
  if (Object.keys(fields).length) throw new ValidationError(fields);
  return out;
}

const empty = value => value === undefined || value === null || value === "";

export const text = (label, { min = 1, max = 200, required = true } = {}) => value => {
  if (empty(value)) {
    if (required) throw new RangeError(`${label} không được để trống.`);
    return undefined;
  }
  if (typeof value !== "string") throw new RangeError(`${label} phải là chữ.`);
  const result = clean(value);
  if (result.length < min) throw new RangeError(required && min <= 1 ? `${label} không được để trống.` : `${label} cần ít nhất ${min} ký tự.`);
  if (result.length > max) throw new RangeError(`${label} tối đa ${max} ký tự.`);
  return result;
};

export const oneOf = (label, values, { required = true } = {}) => value => {
  if (empty(value)) {
    if (required) throw new RangeError(`Chọn ${label}.`);
    return undefined;
  }
  if (!values.includes(value)) throw new RangeError(`${label} không hợp lệ.`);
  return value;
};

export const integer = (label, min, max, { required = true } = {}) => value => {
  if (empty(value)) {
    if (required) throw new RangeError(`${label} không được để trống.`);
    return undefined;
  }
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (!Number.isInteger(number) || number < min || number > max) throw new RangeError(`${label} phải là số nguyên từ ${min} đến ${max}.`);
  return number;
};

export const decimal = (label, min, max) => value => {
  if (empty(value)) return undefined;
  const number = typeof value === "string" ? Number(value.replace(",", ".")) : value;
  if (typeof number !== "number" || !Number.isFinite(number) || number < min || number > max) throw new RangeError(`${label} phải từ ${min} đến ${max}.`);
  return number;
};

export const bool = value => value === true;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** A real calendar date (YYYY-MM-DD) between `min` and `max` (both inclusive, optional). */
export const date = (label, { min, max, required = true } = {}) => value => {
  if (empty(value)) {
    if (required) throw new RangeError(`${label} không được để trống.`);
    return undefined;
  }
  if (typeof value !== "string" || !DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new RangeError(`${label} không phải ngày hợp lệ.`);
  }
  if (min && value < min) throw new RangeError(`${label} không được trước ${min.split("-").reverse().join("/")}.`);
  if (max && value > max) throw new RangeError(`${label} không được sau ${max.split("-").reverse().join("/")}.`);
  return value;
};

/** An optional nested object checked with its own rules. */
export const object = rules => value => {
  if (empty(value)) return undefined;
  try {
    return check(value, rules);
  } catch (error) {
    if (error instanceof ValidationError) throw new RangeError(Object.values(error.fields)[0]);
    throw error;
  }
};

/** A list of objects, each checked with the same rules. */
export const list = (label, rules, { max = 20 } = {}) => value => {
  if (empty(value)) return [];
  if (!Array.isArray(value)) throw new RangeError(`${label} không hợp lệ.`);
  if (value.length > max) throw new RangeError(`${label} tối đa ${max} mục.`);
  return value.map((item, index) => {
    try {
      return check(item, rules);
    } catch (error) {
      if (error instanceof ValidationError) throw new RangeError(`${label} (mục ${index + 1}): ${Object.values(error.fields)[0]}`);
      throw error;
    }
  });
};
