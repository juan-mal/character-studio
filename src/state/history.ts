import {
  cloneConfiguration,
  sameConfiguration,
} from "../character/configuration.ts";
import type { CharacterConfiguration } from "../types/studio.ts";

export interface HistoryState {
  past: CharacterConfiguration[];
  present: CharacterConfiguration;
  future: CharacterConfiguration[];
}

const HISTORY_LIMIT = 100;

export function createHistory(initial: CharacterConfiguration): HistoryState {
  return { past: [], present: cloneConfiguration(initial), future: [] };
}

export function commitHistory(
  history: HistoryState,
  configuration: CharacterConfiguration,
): HistoryState {
  if (sameConfiguration(history.present, configuration))
    return copyHistory(history);
  return {
    past: [...history.past, history.present]
      .slice(-HISTORY_LIMIT)
      .map(cloneConfiguration),
    present: cloneConfiguration(configuration),
    future: [],
  };
}

export function undoHistory(history: HistoryState): HistoryState {
  const previous = history.past.at(-1);
  if (!previous) return copyHistory(history);
  return {
    past: history.past.slice(0, -1).map(cloneConfiguration),
    present: cloneConfiguration(previous),
    future: [history.present, ...history.future]
      .slice(0, HISTORY_LIMIT)
      .map(cloneConfiguration),
  };
}

export function redoHistory(history: HistoryState): HistoryState {
  const next = history.future[0];
  if (!next) return copyHistory(history);
  return {
    past: [...history.past, history.present]
      .slice(-HISTORY_LIMIT)
      .map(cloneConfiguration),
    present: cloneConfiguration(next),
    future: history.future.slice(1).map(cloneConfiguration),
  };
}

function copyHistory(history: HistoryState): HistoryState {
  return {
    past: history.past.map(cloneConfiguration),
    present: cloneConfiguration(history.present),
    future: history.future.map(cloneConfiguration),
  };
}
