import { REQUIRED_COOKIE_NAMES } from '../constants.js';
import type { MimoCookieSet } from '../types.js';

export interface BrowserCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
}

export function parseCookieHeader(input: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const part of input.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }

    const separator = trimmed.indexOf('=');
    if (separator <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (key) {
      parsed[key] = value;
    }
  }

  return parsed;
}

export function normalizeCookieHeader(values: Record<string, string>): string {
  return Object.entries(values)
    .filter(([name, value]) => Boolean(name && value))
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

export function validateMimoCookieHeader(input: string): MimoCookieSet {
  const values = parseCookieHeader(input);
  return validateMimoCookieValues(values);
}

export function validateMimoCookieValues(values: Record<string, string>): MimoCookieSet {
  const missing = REQUIRED_COOKIE_NAMES.filter((name) => !values[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required cookie(s): ${missing.join(', ')}`);
  }

  return {
    cookieHeader: normalizeCookieHeader(values),
    userId: values.userId,
    values
  };
}

export function cookieValuesFromBrowserCookies(cookies: BrowserCookie[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const cookie of cookies) {
    if (cookie.name && cookie.value) {
      values[cookie.name] = cookie.value;
    }
  }
  return values;
}

export function cookieHeaderFromBrowserCookies(cookies: BrowserCookie[]): MimoCookieSet {
  const values = cookieValuesFromBrowserCookies(cookies);
  return validateMimoCookieValues(values);
}

export function redactCookieHeader(input: string): string {
  const values = parseCookieHeader(input);
  if (Object.keys(values).length === 0) {
    return '[empty cookie]';
  }

  return Object.entries(values)
    .map(([name, value]) => `${name}=${redactValue(value)}`)
    .join('; ');
}

function redactValue(value: string): string {
  if (!value) {
    return '[empty]';
  }
  if (value.length <= 6) {
    return '***';
  }
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}
