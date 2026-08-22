import { ZH } from './i18n/zh'
import { ZH_HOME } from './i18n/zhHome'

/**
 * The lightest translation layer that could work: English strings ARE the
 * keys. `t('My binder')` returns the Chinese entry when the app is in Chinese
 * and the string itself otherwise — so an untranslated string is never an
 * error, it is just still English, and translation can proceed page by page
 * without a big-bang key rename.
 *
 * The active language is a module global written by StoreProvider DURING
 * render, before any child renders — every component re-renders through the
 * store context on a language change anyway, so a hook here would add
 * plumbing to every call site and change nothing about when text updates.
 */

export type Lang = 'en' | 'zh'

let current: Lang = 'en'

export function setLang(l: Lang) {
  current = l
}

export function lang(): Lang {
  return current
}

export function t(s: string): string {
  if (current === 'zh') return ZH[s] ?? ZH_HOME[s] ?? s
  return s
}
