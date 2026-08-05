/**
 * Имена иконок отдельным модулем, а не в `icons.tsx`: на них ссылаются
 * ачивки и ранги, а те проверяются тестами в проекте без JSX — тянуть туда
 * ради одного типа целый компонент незачем.
 *
 * Список синхронизирован с PATHS: `Record<IconName, string[]>` не даст
 * добавить имя и забыть про путь.
 */

export type IconName =
  | 'git-pull-request'
  | 'award'
  | 'volume-2'
  | 'volume-x'
  | 'arrow-left'
  | 'arrow-right'
  | 'chevron-left'
  | 'chevron-right'
  | 'heart-pulse'
  | 'calendar-check'
  | 'infinity'
  | 'flame'
  | 'graduation-cap'
  | 'sprout'
  | 'hammer'
  | 'medal'
  | 'crown'
  | 'eye'
  | 'zap'
  | 'shield-check'
  | 'shuffle'
  | 'file-code'
  | 'trophy'
  | 'sparkles'
  | 'lock'
  | 'check-check'
  | 'bug'
  | 'circle-alert'
  | 'share-2'
  | 'timer'
  | 'alarm-clock'
  | 'target'
  | 'siren'
  | 'gavel'
  | 'music'
  | 'skip-forward'
  | 'circle-dot'
  | 'git-branch'
  | 'pencil'
  | 'settings'
  | 'terminal'
  | 'search'
  | 'x'
